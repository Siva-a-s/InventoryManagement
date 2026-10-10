const mongoose = require('mongoose');

const Bill = require('../models/Bill');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');
const Counter = require('../models/Counter');
const Discount = require('../models/Discount');
const Return = require('../models/Return');
const RazorpayOrder = require('../models/RazorpayOrder');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const findBillByRef = (ref) => {
  const value = String(ref).trim();
  return /^BILL-/i.test(value)
    ? Bill.findOne({ billNumber: value.toUpperCase() })
    : Bill.findById(value);
};//so that in frontend we can we bill number not id

const fail = (status, message) => {
  throw { status, message };
};

const handleError = (res, err) => {
  if (err.status) return res.status(err.status).json({ message: err.message });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
  console.error(err);
  res.status(500).json({ message: err.message });
};

// BILL-000001, BILL-000002, ...
async function nextBillNumber() {
  const c = await Counter.findOneAndUpdate(
    { _id: 'bill' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `BILL-${String(c.seq).padStart(6, '0')}`;
}

// Sellable batches: not expired, has stock, earliest expiry first
async function getSellableBatches(productId, session) {
  const now = new Date();
  const query = StockBatch.find({
    product: productId,
    remainingQuantity: { $gt: 0 },
    $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
  });
  if (session) query.session(session);
  const batches = await query;

  batches.sort((a, b) => {
    const ea = a.expiryDate ? a.expiryDate.getTime() : Infinity;
    const eb = b.expiryDate ? b.expiryDate.getTime() : Infinity;
    return ea - eb;
  });
  return batches;
}

// Pick the best running offer for a product (offers are not stacked:
// if two apply, the bigger saving per unit wins)
function bestOffer(product, offers) {
  let best = null;
  for (const o of offers) {
    if (!o.products.some((id) => String(id) === String(product._id))) continue;

    const perUnit =
      o.type === 'percent'
        ? round2((product.price * o.value) / 100)
        : Math.min(o.value, product.price);

    if (!best || perUnit > best.perUnit) best = { name: o.name, perUnit };
  }
  return best;
}

// Used by both preview and checkout, so the numbers always match.
// Prices and discounts come from the database, never from the client.
async function calculateBill(items) {
  if (!Array.isArray(items) || items.length === 0) fail(400, 'Cart is empty');

  // merge the same product added twice
  const merged = {};
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!item.productId || !(quantity > 0)) {
      fail(400, 'Each item needs a productId and a quantity above 0');
    }
    merged[item.productId] = (merged[item.productId] || 0) + quantity;
  }

  // offers that are running right now for these products
  const productIds = Object.keys(merged);
  const now = new Date();
  const offers = await Discount.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    products: { $in: productIds },
  });

  const lines = [];
  let subtotal = 0;
  let discount = 0;

  for (const productId of productIds) {
    const product = await Product.findOne({ _id: productId, isActive: { $ne: false } });
    if (!product) fail(404, 'Product not found or inactive');

    const quantity = merged[productId];
    const gross = round2(product.price * quantity);

    const offer = bestOffer(product, offers);
    const lineDiscount = offer ? round2(offer.perUnit * quantity) : 0;

    subtotal += gross;
    discount += lineDiscount;

    lines.push({
      product: product._id,
      name: product.name,
      unit: product.unit,
      price: product.price,
      quantity,
      discountAmount: lineDiscount,
      offerName: offer ? offer.name : undefined,
      lineTotal: round2(gross - lineDiscount),
      batches: [],
    });
  }

  subtotal = round2(subtotal);
  discount = round2(discount);
  return { lines, subtotal, discount, total: round2(subtotal - discount) };
}

const getRazorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) fail(503, 'Razorpay is not configured on the server');
  return { client: new Razorpay({ key_id: keyId, key_secret: keySecret }), keyId, keySecret };
};

const validateRazorpaySignature = (orderId, paymentId, signature, secret) => {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  let supplied;
  try {
    supplied = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
};

async function allocateStock(lines, session, insufficientStockStatus = 409) {
  const batchesPerLine = [];

  for (const line of lines) {
    const batches = await getSellableBatches(line.product, session);

    const available = batches.reduce((sum, batch) => sum + batch.remainingQuantity, 0);
    if (available < line.quantity) {
      fail(insufficientStockStatus, `Not enough stock for ${line.name}. Available: ${available}, requested: ${line.quantity}`);
    }
    batchesPerLine.push(batches);
  }

  for (let i = 0; i < lines.length; i++) {
    let remaining = lines[i].quantity;
    lines[i].batches = [];

    for (const batch of batchesPerLine[i]) {
      if (remaining <= 0) break;
      const take = Math.min(batch.remainingQuantity, remaining);
      const result = await StockBatch.updateOne(
        { _id: batch._id, remainingQuantity: { $gte: take } },
        { $inc: { remainingQuantity: -take } },
        { session }
      );
      if (result.modifiedCount !== 1) {
        fail(409, `Stock changed while billing ${lines[i].name}. Please retry.`);
      }
      lines[i].batches.push({
        batch: batch._id,
        quantity: take,
        costPrice: Number(batch.costPrice) || 0,
      });
      remaining -= take;
    }

    if (remaining > 0) fail(409, `Stock changed while billing ${lines[i].name}. Please retry.`);
  }
}

// POST /api/bills/razorpay/order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { items, customerName, customerPhone } = req.body;
    const { lines, subtotal, discount, total } = await calculateBill(items);
    const amountPaise = Math.round(total * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
      fail(400, 'Razorpay orders must total at least INR 1.00');
    }

    // Check current sellable stock without reserving or deducting it.
    for (const line of lines) {
      const batches = await getSellableBatches(line.product);
      const available = batches.reduce((sum, batch) => sum + batch.remainingQuantity, 0);
      if (available < line.quantity) {
        fail(400, `Not enough stock for ${line.name}. Available: ${available}, requested: ${line.quantity}`);
      }
    }

    const { client, keyId } = getRazorpayClient();
    const razorpayOrder = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `sf_${crypto.randomBytes(12).toString('hex')}`,
    });

    await RazorpayOrder.create({
      razorpayOrderId: razorpayOrder.id,
      user: req.user._id,
      items: lines.map(({ batches: _batches, ...line }) => line),
      subtotal,
      discount,
      total,
      amountPaise,
      customerName,
      customerPhone,
    });

    res.status(201).json({
      orderId: razorpayOrder.id,
      amount: amountPaise,
      currency: 'INR',
      keyId,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    // Do not return or log Razorpay request details or credentials.
    return res.status(502).json({ message: 'Unable to create Razorpay order. Please retry.' });
  }
};

// POST /api/bills/razorpay/verify
exports.verifyRazorpayPayment = async (req, res) => {
  const { orderId, paymentId, signature } = req.body || {};
  if (![orderId, paymentId, signature].every((value) => typeof value === 'string' && value.length > 0)) {
    return res.status(400).json({ message: 'orderId, paymentId and signature are required' });
  }

  let pending;
  let session;
  try {
    pending = await RazorpayOrder.findOne({ razorpayOrderId: orderId, user: req.user._id });
    if (!pending) fail(404, 'Pending Razorpay order not found for this user');

    const { client, keySecret } = getRazorpayClient();
    if (!validateRazorpaySignature(pending.razorpayOrderId, paymentId, signature, keySecret)) {
      fail(400, 'Razorpay payment signature is invalid');
    }
    if (pending.razorpayPaymentId && pending.razorpayPaymentId !== paymentId) {
      fail(409, 'A different payment is already associated with this order');
    }

    if (pending.status !== 'paid') {
      const [gatewayOrder, payment] = await Promise.all([
        client.orders.fetch(pending.razorpayOrderId),
        client.payments.fetch(paymentId),
      ]);
      if (
        gatewayOrder.id !== pending.razorpayOrderId ||
        gatewayOrder.amount !== pending.amountPaise ||
        gatewayOrder.currency !== 'INR' ||
        payment.order_id !== pending.razorpayOrderId ||
        payment.amount !== pending.amountPaise ||
        payment.currency !== 'INR' ||
        payment.status !== 'captured' ||
        gatewayOrder.status !== 'paid'
      ) {
        fail(400, 'Razorpay payment is not captured for the expected order and amount');
      }

      if (pending.status === 'pending') {
        const updated = await RazorpayOrder.findOneAndUpdate(
          { _id: pending._id, status: 'pending' },
          { $set: { status: 'payment_verified', razorpayPaymentId: paymentId, paymentVerifiedAt: new Date() } },
          { new: true }
        );
        if (!updated) {
          pending = await RazorpayOrder.findById(pending._id);
          if (pending?.razorpayPaymentId !== paymentId) fail(409, 'This order is being verified with another payment');
        } else {
          pending = updated;
        }
      }

      if (pending.status === 'payment_verified') {
        session = await mongoose.startSession();
        let completedBill;
        await session.withTransaction(async () => {
          const current = await RazorpayOrder.findOne({
            _id: pending._id,
            user: req.user._id,
            status: 'payment_verified',
            razorpayPaymentId: paymentId,
          }).session(session);

          if (!current) {
            const alreadyPaid = await RazorpayOrder.findById(pending._id).session(session);
            if (alreadyPaid?.status === 'paid' && String(alreadyPaid.razorpayPaymentId) === paymentId) {
              completedBill = await Bill.findById(alreadyPaid.bill).session(session);
              return;
            }
            fail(409, 'Payment order is already being completed or is not payable');
          }

          const billItems = current.items.map((item) => ({ ...item.toObject(), batches: [] }));
          await allocateStock(billItems, session);
          const billNumber = await nextBillNumber();
          const [bill] = await Bill.create([{
            billNumber,
            items: billItems,
            subtotal: current.subtotal,
            discount: current.discount,
            total: current.total,
            paymentMethod: 'razorpay',
            amountPaid: current.total,
            changeGiven: 0,
            customerName: current.customerName,
            customerPhone: current.customerPhone,
            cashier: req.user._id,
            cashierName: req.user.name,
            razorpayOrderId: current.razorpayOrderId,
            razorpayPaymentId: paymentId,
          }], { session });

          current.status = 'paid';
          current.bill = bill._id;
          await current.save({ session });
          completedBill = bill;
        });

        if (completedBill) {
          return res.status(200).json({ message: 'Payment verified and bill generated', bill: completedBill });
        }
      }
    }

    if (pending.status === 'paid' && pending.bill) {
      const bill = await Bill.findById(pending.bill);
      return res.json({ message: 'Payment was already verified', bill });
    }
    return res.status(409).json({ message: 'Payment is verified; bill completion is pending. Retry verification or contact the owner.' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    // A captured payment remains retryable if stock allocation or the database fails.
    return res.status(500).json({ message: 'Unable to verify or complete the Razorpay payment. Retry verification or contact the owner.' });
  } finally {
    if (session) await session.endSession();
  }
};

// POST /api/bills/preview   (nothing is saved, stock is not changed)
exports.previewBill = async (req, res) => {
  try {
    const { items } = req.body;
    const { lines, subtotal, discount, total } = await calculateBill(items);

    res.json({
      items: lines.map(({ batches, ...rest }) => rest),
      subtotal,
      discount,
      total,
    });
  } catch (err) {
    handleError(res, err);
  }
};

// POST /api/bills   (generate the bill, reduce stock)
exports.createBill = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      items,
      paymentMethod = 'cash',
      amountPaid,
      customerName,
      customerPhone
    } = req.body;

    if (!['cash', 'upi', 'card'].includes(paymentMethod)) {
      fail(400, 'paymentMethod must be cash, upi or card');
    }

    const {
      lines,
      subtotal,
      discount: disc,
      total
    } = await calculateBill(items);

    // Payment calculation
    let paid = total;
    let changeGiven = 0;

    if (paymentMethod === 'cash') {
      paid = Number(amountPaid);

      if (!(paid >= total)) {
        fail(400, `Amount paid is less than the total (${total})`);
      }

      changeGiven = round2(paid - total);
    }

    // Reduce stock using the same transactional FEFO allocator as Razorpay billing.
    await allocateStock(lines, session, 400);

    // Create bill inside the same transaction
    const billNumber = await nextBillNumber();

    const bill = await Bill.create(
      [
        {
          billNumber,
          items: lines,
          subtotal,
          discount: disc,
          total,
          paymentMethod,
          amountPaid: paid,
          changeGiven,
          customerName,
          customerPhone,
          cashier: req.user._id,
          cashierName: req.user.name
        }
      ],
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      message: 'Bill generated',
      bill: bill[0]
    });

  } catch (err) {
    await session.abortTransaction();
    handleError(res, err);

  } finally {
    await session.endSession();
  }
};
// GET /api/bills?billNumber=BILL-000012&from=2026-09-01&to=2026-09-30&status=completed
exports.getBills = async (req, res) => {
  try {
    const { billNumber, from, to, status } = req.query;
    const filter = {};

    if (billNumber) filter.billNumber = billNumber.toUpperCase();
    if (status) filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    // staff see only their own bills
    if (req.user.role !== 'owner') filter.cashier = req.user._id;

    const bills = await Bill.find(filter)
      .populate('cashier', 'name')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(bills);
  } catch (err) {
    handleError(res, err);
  }
};

// GET /api/bills/:id   (id can be the database id OR a bill number like BILL-000012)
exports.getBillById = async (req, res) => {
  try {
    const bill = await findBillByRef(req.params.id).populate('cashier', 'name');
    if (!bill) fail(404, 'Bill not found');

    if (req.user.role !== 'owner' && String(bill.cashier._id) !== String(req.user._id)) {
      fail(403, 'Not allowed to view this bill');
    }

    res.json(bill);
  } catch (err) {
    handleError(res, err);
  }
};

// PATCH /api/bills/:id/cancel   (owner only)
exports.cancelBill = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const bill = await findBillByRef(req.params.id);

    if (!bill) {
      fail(404, 'Bill not found');
    }

    if (bill.status === 'cancelled') {
      fail(400, 'Bill is already cancelled');
    }

    if (bill.paymentMethod === 'razorpay') {
      fail(409, 'Razorpay bills cannot be cancelled until a refund has been completed.');
    }

    if (await Return.exists({ bill: bill._id }).session(session)) {
      fail(400, 'This bill has returns and cannot be cancelled.');
    }

    // Restore stock to the same batches used by the bill
    for (const item of bill.items) {
      for (const b of item.batches) {
        const result = await StockBatch.updateOne(
          { _id: b.batch },
          { $inc: { remainingQuantity: b.quantity } },
          { session }
        );

        if (result.matchedCount === 0) {
          fail(404, 'Stock batch not found');
        }
      }
    }

    // Mark bill as cancelled
    bill.status = 'cancelled';
    bill.cancelledBy = req.user._id;
    bill.cancelledAt = new Date();
    bill.cancelReason = req.body.reason || '';

    await bill.save({ session });

    await session.commitTransaction();

    res.json({
      message: 'Bill cancelled and stock restored',
      bill
    });

  } catch (err) {
    await session.abortTransaction();
    handleError(res, err);

  } finally {
    await session.endSession();
  }
};

// GET /api/bills/summary?from=2026-09-01&to=2026-09-30   (owner only)
exports.getSalesSummary = async (req, res) => {
  try {
    let { from, to } = req.query;

    if (!from && !to) {
      const now = new Date();
      const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      istNow.setUTCHours(0, 0, 0, 0);
      from = new Date(istNow.getTime() - 5.5 * 60 * 60 * 1000);
      to = now;
    }

    const match = {};
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }
    const completed = { ...match, status: 'completed' };

    const [totals, byPayment, byDay, cancelledBills] = await Promise.all([
      Bill.aggregate([
        { $match: completed },
        {
          $group: {
            _id: null,
            totalBills: { $sum: 1 },
            totalSales: { $sum: '$total' },
            totalDiscount: { $sum: '$discount' },
          },
        },
      ]),
      Bill.aggregate([
        { $match: completed },
        { $group: { _id: '$paymentMethod', bills: { $sum: 1 }, sales: { $sum: '$total' } } },
      ]),
      Bill.aggregate([
        { $match: completed },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' },
            },
            bills: { $sum: 1 },
            sales: { $sum: '$total' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Bill.countDocuments({ ...match, status: 'cancelled' }),
    ]);

    res.json({
      totalBills: totals[0]?.totalBills || 0,
      totalSales: round2(totals[0]?.totalSales || 0),
      totalDiscount: round2(totals[0]?.totalDiscount || 0),
      cancelledBills,
      byPaymentMethod: byPayment,
      salesByDay: byDay.map((d) => ({ date: d._id, bills: d.bills, sales: round2(d.sales) })),
    });
  } catch (err) {
    handleError(res, err);
  }
};
