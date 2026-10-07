const mongoose = require('mongoose');

const Bill = require('../models/Bill');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');
const Counter = require('../models/Counter');
const Discount = require('../models/Discount');

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
async function getSellableBatches(productId) {
  const now = new Date();
  const batches = await StockBatch.find({
    product: productId,
    remainingQuantity: { $gt: 0 },
    $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
  });

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
    const product = await Product.findById(productId);
    if (!product) fail(404, 'Product not found');

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

    // Check stock for ALL products before changing anything
    const batchesPerLine = [];

    for (const line of lines) {
      const batches = await getSellableBatches(line.product);

      const available = batches.reduce(
        (sum, batch) => sum + batch.remainingQuantity,
        0
      );

      if (available < line.quantity) {
        fail(
          400,
          `Not enough stock for ${line.name}. Available: ${available}, requested: ${line.quantity}`
        );
      }

      batchesPerLine.push(batches);
    }

    // Reduce stock using FEFO
    for (let i = 0; i < lines.length; i++) {
      let remaining = lines[i].quantity;

      for (const batch of batchesPerLine[i]) {
        if (remaining <= 0) break;

        const take = Math.min(
          batch.remainingQuantity,
          remaining
        );

        await StockBatch.updateOne(
          {
            _id: batch._id,
            remainingQuantity: { $gte: take }
          },
          {
            $inc: { remainingQuantity: -take }
          },
          { session }
        );

        lines[i].batches.push({
          batch: batch._id,
          quantity: take
        });

        remaining -= take;
      }
    }

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
          cashier: req.user._id
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
    session.endSession();
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
    const { id } = req.params;
    const query = id.toUpperCase().startsWith('BILL-')
      ? { billNumber: id.toUpperCase() }
      : { _id: id };

    const bill = await findBillByRef(req.params.id).populate('cashier', 'name');

    // const bill = await Bill.findOne(query).populate('cashier', 'name');
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
    session.endSession();
  }
};

// GET /api/bills/summary?from=2026-09-01&to=2026-09-30   (owner only)
exports.getSalesSummary = async (req, res) => {
  try {
    const { from, to } = req.query;

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