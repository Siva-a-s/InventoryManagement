const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Product = require('../models/Product');
const Return = require('../models/Return');
const StockBatch = require('../models/StockBatch');
const Wastage = require('../models/Wastage');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

// ---------- CREATE a return (Owner + Staff) ----------
// body: {
//   billId, refundMethod, note,
//   items: [{ productId, quantity, reason, restock }]
// }
// CREATE RETURN
// Owner + Staff
exports.createReturn = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { billId, items, refundMethod, note } = req.body;

    // -----------------------------
    // 1. BASIC VALIDATION
    // -----------------------------

    if (!mongoose.isValidObjectId(billId)) {
      return res.status(400).json({
        message: 'Valid billId is required'
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: 'Select at least one item to return'
      });
    }

    const validRefundMethods = [
      'cash',
      'upi',
      'card',
      'store_credit',
      'razorpay'
    ];

    if (
      refundMethod !== undefined &&
      !validRefundMethods.includes(refundMethod)
    ) {
      return res.status(400).json({
        message: 'Invalid refund method'
      });
    }

    // -----------------------------
    // 2. FIND BILL
    // -----------------------------

    const bill = await Bill.findById(billId).session(session);

    if (!bill) {
      return res.status(404).json({
        message: 'Bill not found'
      });
    }

    // Cancelled bills cannot be returned
    if (bill.status === 'cancelled') {
      return res.status(400).json({
        message: 'Cancelled bills cannot be returned'
      });
    }

    // -----------------------------
    // 3. FIND PREVIOUS RETURNS
    // -----------------------------

    const previousReturns = await Return.find({
      bill: bill._id
    }).session(session);

    const alreadyReturned = {};

    for (const oldReturn of previousReturns) {
      for (const oldItem of oldReturn.items) {
        const productId = String(oldItem.product);

        alreadyReturned[productId] =
          (alreadyReturned[productId] || 0) + oldItem.quantity;
      }
    }

    // -----------------------------
    // 4. COMBINE DUPLICATE PRODUCTS
    // -----------------------------

    const requestedItems = {};

    for (const item of items) {
      if (!mongoose.isValidObjectId(item.productId)) {
        return res.status(400).json({
          message: 'Invalid productId'
        });
      }

      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          message: 'Return quantity must be a whole number greater than 0'
        });
      }

      const productId = String(item.productId);

      if (!requestedItems[productId]) {
        requestedItems[productId] = {
          productId,
          quantity,
          reason: item.reason || 'other',
          restock: item.restock === true
        };
      } else {
        requestedItems[productId].quantity += quantity;
      }
    }

    // -----------------------------
    // 5. VALIDATE EACH PRODUCT
    // -----------------------------

    const lines = [];
    let totalRefund = 0;

    for (const productId of Object.keys(requestedItems)) {
      const requested = requestedItems[productId];

      const billItem = bill.items.find(
        (item) => String(item.product) === productId
      );

      if (!billItem) {
        return res.status(400).json({
          message: 'Product is not present on this bill'
        });
      }

      const previousQuantity =
        alreadyReturned[productId] || 0;

      const remainingReturnable =
        billItem.quantity - previousQuantity;

      if (requested.quantity > remainingReturnable) {
        return res.status(400).json({
          message: `Only ${remainingReturnable} of "${billItem.name}" can still be returned`
        });
      }

      // Validate reason
      if (!Return.REASONS.includes(requested.reason)) {
        return res.status(400).json({
          message: `Invalid return reason: ${requested.reason}`
        });
      }

      // Damaged and expired products cannot be restocked
      let restock = requested.restock;

      if (
        requested.reason === 'damaged' ||
        requested.reason === 'expired'
      ) {
        restock = false;
      }

      // -----------------------------
      // 6. CALCULATE ACTUAL REFUND
      // -----------------------------

      const lineTotal = Number(billItem.lineTotal);

      if (!Number.isFinite(lineTotal)) {
        return res.status(400).json({
          message: `Invalid bill amount for "${billItem.name}"`
        });
      }

      const unitPrice =
        Math.round((lineTotal / billItem.quantity) * 100) / 100;

      const refundAmount =
        Math.round(unitPrice * requested.quantity * 100) / 100;

      // -----------------------------
      // 7. FIND BATCH FOR RESTOCK
      // -----------------------------

      let restockedBatch = null;
      let restockAllocations = [];

      if (restock) {
        const billLineBatches = billItem.batches || [];
        const recordedQuantity = billLineBatches.reduce(
          (sum, allocation) => sum + Number(allocation.quantity || 0), 0
        );
        if (!billLineBatches.length || !Number.isFinite(recordedQuantity) ||
          Math.abs(recordedQuantity - Number(billItem.quantity)) > 1e-9 ||
          billLineBatches.some((allocation) => !mongoose.isValidObjectId(allocation.batch) ||
            !Number.isFinite(Number(allocation.quantity)) || Number(allocation.quantity) <= 0)) {
          return res.status(409).json({
            message: `Original batch allocations are unavailable or incomplete for "${billItem.name}". Process this return without restocking.`
          });
        }

        const activeProduct = await Product.exists({ _id: productId, isActive: { $ne: false } }).session(session);
        if (!activeProduct) {
          return res.status(400).json({
            message: `Product "${billItem.name}" is inactive and cannot be returned to sellable stock.`
          });
        }

        const returnedByBatch = new Map();
        const soldBatchIds = new Set(billLineBatches.map((allocation) => String(allocation.batch)));
        let earlierReturnUntraceable = false;
        for (const previousReturn of previousReturns) {
          for (const previousItem of previousReturn.items) {
            if (String(previousItem.product) !== productId) continue;
            const priorAllocations = previousItem.originalBatches || [];
            if (priorAllocations.length) {
              const allocated = priorAllocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
              if (!Number.isFinite(allocated) || Math.abs(allocated - Number(previousItem.quantity)) > 1e-9 ||
                priorAllocations.some((allocation) => !mongoose.isValidObjectId(allocation.batch) ||
                  !soldBatchIds.has(String(allocation.batch)) || !Number.isFinite(Number(allocation.quantity)) || Number(allocation.quantity) <= 0)) {
                earlierReturnUntraceable = true;
              }
              for (const allocation of priorAllocations) {
                const key = String(allocation.batch);
                returnedByBatch.set(key, (returnedByBatch.get(key) || 0) + Number(allocation.quantity || 0));
              }
            } else if (previousItem.restocked && previousItem.restockedBatch) {
              const key = String(previousItem.restockedBatch);
              if (!soldBatchIds.has(key)) earlierReturnUntraceable = true;
              returnedByBatch.set(key, (returnedByBatch.get(key) || 0) + Number(previousItem.quantity || 0));
            } else {
              earlierReturnUntraceable = true;
            }
          }
        }
        if (earlierReturnUntraceable) {
          return res.status(409).json({
            message: `An earlier return for "${billItem.name}" has no reliable batch allocation. Process this return without restocking.`
          });
        }

        let unallocated = requested.quantity;
        for (const soldBatch of billLineBatches) {
          if (unallocated <= 0) break;
          const soldQuantity = Number(soldBatch.quantity || 0);
          if (!mongoose.isValidObjectId(soldBatch.batch) || !Number.isFinite(soldQuantity) || soldQuantity <= 0) continue;
          const availableFromSale = Math.max(soldQuantity - (returnedByBatch.get(String(soldBatch.batch)) || 0), 0);
          if (!availableFromSale) continue;

          const batch = await StockBatch.findById(soldBatch.batch).session(session);
          if (!batch || String(batch.product) !== productId ||
            (batch.expiryDate && batch.expiryDate <= new Date())) {
            return res.status(400).json({
              message: `An original batch for "${billItem.name}" is unavailable or expired. Process this return without restocking.`
            });
          }

          const physicalCapacity = Math.max(Number(batch.quantity) - Number(batch.remainingQuantity), 0);
          const allocatedQuantity = Math.min(availableFromSale, unallocated);
          if (physicalCapacity < allocatedQuantity) {
            return res.status(400).json({
              message: `The original batch for "${billItem.name}" cannot accept the returned quantity. Process this return without restocking.`
            });
          }

          const recordedCost = Number(soldBatch.costPrice);
          const currentCost = Number(batch.costPrice);
          restockAllocations.push({
            batch: batch._id,
            quantity: allocatedQuantity,
            unitCost: Number.isFinite(recordedCost) ? recordedCost : (Number.isFinite(currentCost) ? currentCost : 0),
          });
          unallocated -= allocatedQuantity;
        }

        if (unallocated > 0) {
          return res.status(400).json({
            message: `The original batches for "${billItem.name}" cannot accept the full returned quantity because some are expired, unavailable, or at capacity. Process this return without restocking.`
          });
        }
        restockedBatch = await StockBatch.findById(restockAllocations[0].batch).session(session);
      }

      // Keep the bill's original stock allocation with the return. This does not
      // change inventory for non-restocked items; it supplies traceable cost/batch
      // data if an owner later explicitly writes that return off as wastage.
      let originalBatches = [];
      const hasUntraceableEarlierReturn = previousReturns.some((previousReturn) =>
        previousReturn.items.some((previousItem) =>
          String(previousItem.product) === productId &&
          !previousItem.restocked &&
          (!previousItem.originalBatches ||
            previousItem.originalBatches.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0) !== Number(previousItem.quantity))
        )
      );

      if (restock && restockedBatch) {
        originalBatches = restockAllocations;
      } else if (!hasUntraceableEarlierReturn) {
        let unallocated = requested.quantity;
        for (const soldBatch of (billItem.batches || [])) {
          if (unallocated <= 0) break;
          const usedEarlier = previousReturns.reduce((sum, previousReturn) =>
            sum + previousReturn.items.reduce((itemSum, previousItem) => {
              if (String(previousItem.product) !== productId) return itemSum;
              const traced = (previousItem.originalBatches || []).reduce((batchSum, allocation) =>
                batchSum + (String(allocation.batch) === String(soldBatch.batch) ? Number(allocation.quantity || 0) : 0), 0);
              const legacyRestock = previousItem.originalBatches === undefined && previousItem.restocked &&
                String(previousItem.restockedBatch) === String(soldBatch.batch) ? Number(previousItem.quantity || 0) : 0;
              return itemSum + traced + legacyRestock;
            }, 0), 0);
          const available = Math.max(Number(soldBatch.quantity || 0) - usedEarlier, 0);
          if (!available) continue;
          const sourceBatch = await StockBatch.findById(soldBatch.batch).session(session);
          if (!sourceBatch || String(sourceBatch.product) !== productId) continue;
          const allocatedQuantity = Math.min(available, unallocated);
          const billCost = Number(soldBatch.costPrice);
          const batchCost = Number(sourceBatch.costPrice);
          const unitCost = Number.isFinite(billCost) && billCost > 0 ? billCost : batchCost;
          originalBatches.push({
            batch: sourceBatch._id,
            quantity: allocatedQuantity,
            unitCost: Number.isFinite(unitCost) ? unitCost : 0,
          });
          unallocated -= allocatedQuantity;
        }
      }

      lines.push({
        product: billItem.product,
        name: billItem.name,
        quantity: requested.quantity,
        unitPrice,
        refundAmount,
        reason: requested.reason,
        restocked: restock,
        restockedBatch: restockedBatch ? restockedBatch._id : undefined,
        originalBatches
      });

      totalRefund += refundAmount;
    }

    // -----------------------------
    // 8. RESTORE STOCK
    // -----------------------------

    for (const line of lines) {
      if (!line.restocked) {
        continue;
      }

      for (const allocation of line.originalBatches || []) {
        const originalBatch = await StockBatch.findById(allocation.batch).session(session);
        const batch = originalBatch && await StockBatch.findOneAndUpdate(
          {
            _id: allocation.batch,
            remainingQuantity: { $lte: originalBatch.quantity - allocation.quantity },
            $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }],
          },
          { $inc: { remainingQuantity: allocation.quantity } },
          { new: true, session }
        );

        if (!batch) {
          throw Object.assign(
            new Error('An original stock batch no longer exists, is expired, or cannot accept the returned quantity'),
            { status: 400 }
          );
        }
      }
    }

    // -----------------------------
    // 9. CREATE RETURN RECORD
    // -----------------------------

    const newReturnRecords = await Return.create([{
      bill: bill._id,
      items: lines,
      totalRefund: Math.round(totalRefund * 100) / 100,
      refundMethod: refundMethod || 'cash',
      note,
      processedBy: req.user._id,
      processedByName: req.user.name
    }], { session });

    await session.commitTransaction();

    // -----------------------------
    // 10. SEND RESPONSE
    // -----------------------------

    res.status(201).json({
      message: 'Return processed successfully',
      return: newReturnRecords[0]
    });

  } catch (err) {
    await session.abortTransaction();
    res.status(err.status || 500).json({
      message: err.message
    });
  } finally {
    await session.endSession();
  }
};

// ---------- GET all returns ----------
// examples: /api/returns?bill=<billId>&page=1&limit=20
exports.getReturns = async (req, res) => {
  try {
    const filter = {};
    if (req.query.bill) filter.bill = req.query.bill;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const returns = await Return.find(filter)
      .select('-razorpayRefund.idempotencyKey')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('processedBy', 'name')
      .populate('bill', 'billNumber status paymentMethod total')
      .populate('items.product', 'name unit')
      .populate('items.originalBatches.batch', 'batchNumber expiryDate costPrice')
      .populate('items.wastageWrittenOffBy', 'name');

    const count = await Return.countDocuments(filter);

    res.json({ returns, page, pages: Math.ceil(count / limit), count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- GET one return ----------
exports.getReturn = async (req, res) => {
  try {
    const found = await Return.findById(req.params.id)
      .select('-razorpayRefund.idempotencyKey')
      .populate('processedBy', 'name')
      .populate('bill', 'billNumber status paymentMethod total')
      .populate('items.product', 'name unit')
      .populate('items.originalBatches.batch', 'batchNumber expiryDate costPrice')
      .populate('items.wastageWrittenOffBy', 'name');
    if (!found) {
      return res.status(404).json({ message: 'Return not found' });
    }
    res.json(found);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Owner initiated refund. The operation key and exact amount are persisted before
// contacting Razorpay so retries after a timeout reuse the same request.
exports.refundReturnWithRazorpay = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid return reference' });
    }
    const returnRecord = await Return.findById(req.params.id);
    if (!returnRecord) return res.status(404).json({ message: 'Return not found' });
    if (returnRecord.refundMethod !== 'razorpay') {
      return res.status(400).json({ message: 'This return was not recorded for a Razorpay refund' });
    }
    const bill = await Bill.findById(returnRecord.bill);
    if (!bill || bill.status !== 'completed' || bill.paymentMethod !== 'razorpay' || !bill.razorpayPaymentId) {
      return res.status(409).json({ message: 'This return is not linked to a completed Razorpay payment' });
    }

    const calculatedAmount = round2(returnRecord.items.reduce((sum, returnedItem) => {
      const billItem = bill.items.find((item) => String(item.product) === String(returnedItem.product));
      if (!billItem || !Number.isFinite(Number(billItem.lineTotal)) || Number(billItem.quantity) <= 0 ||
        returnedItem.quantity <= 0 || returnedItem.quantity > billItem.quantity) return NaN;
      const unit = round2(Number(billItem.lineTotal) / Number(billItem.quantity));
      const expectedLineRefund = round2(unit * Number(returnedItem.quantity));
      if (Math.abs(expectedLineRefund - Number(returnedItem.refundAmount)) > 0.01) return NaN;
      return sum + expectedLineRefund;
    }, 0));
    if (!Number.isFinite(calculatedAmount) || calculatedAmount <= 0 ||
      Math.abs(calculatedAmount - Number(returnRecord.totalRefund)) > 0.01) {
      return res.status(409).json({ message: 'The recorded return amount could not be verified against the bill' });
    }

    const previousReturns = await Return.find({ bill: bill._id, _id: { $ne: returnRecord._id } });
    const otherRefunds = round2(previousReturns.reduce((sum, previous) => sum + Number(previous.totalRefund || 0), 0));
    const refundableBalance = round2(Number(bill.total) - otherRefunds);
    if (calculatedAmount > refundableBalance + 0.001) {
      return res.status(409).json({ message: "This return exceeds the bill's remaining refundable balance" });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return res.status(503).json({ message: 'Razorpay is not configured on the server' });
    const gateway = new Razorpay({ key_id: keyId, key_secret: keySecret });
    let payment;
    try {
      payment = await gateway.payments.fetch(bill.razorpayPaymentId);
    } catch {
      return res.status(502).json({ message: 'Could not confirm the original Razorpay payment. Try again shortly.' });
    }
    const billAmountPaise = Math.round(Number(bill.total) * 100);
    if (payment.id !== bill.razorpayPaymentId || payment.status !== 'captured' ||
      payment.currency !== 'INR' || payment.amount !== billAmountPaise) {
      return res.status(409).json({ message: 'The original Razorpay payment is not captured or does not match this bill' });
    }
    let operation = returnRecord.razorpayRefund;
    if (operation?.status === 'processed' || operation?.status === 'failed') {
      const safeReturn = returnRecord.toObject();
      delete safeReturn.razorpayRefund?.idempotencyKey;
      return res.json({ message: operation.status === 'processed' ? 'Refund already processed' : 'This refund failed and requires review', return: safeReturn });
    }
    if (!operation) {
      if (Number(payment.amount_refunded || 0) + Math.round(calculatedAmount * 100) > payment.amount) {
        return res.status(409).json({ message: 'The original payment has insufficient refundable balance' });
      }
      const now = new Date();
      const candidate = {
        idempotencyKey: crypto.randomUUID(),
        amount: Math.round(calculatedAmount * 100),
        status: 'pending',
        requestedAt: now,
        updatedAt: now,
      };
      const claimed = await Return.findOneAndUpdate(
        { _id: returnRecord._id, razorpayRefund: { $exists: false } },
        { $set: { razorpayRefund: candidate } },
        { new: true }
      );
      if (!claimed) {
        const latest = await Return.findById(returnRecord._id);
        if (!latest?.razorpayRefund) return res.status(409).json({ message: 'Refund request is already being prepared. Refresh the return and retry.' });
        operation = latest.razorpayRefund;
      } else {
        operation = claimed.razorpayRefund;
      }
    }
    if (operation.amount !== Math.round(calculatedAmount * 100)) {
      return res.status(409).json({ message: 'The stored refund request does not match the verified return amount' });
    }

    let gatewayRefund;
    if (operation.refundId) {
      try {
        gatewayRefund = await gateway.payments.fetchRefund(bill.razorpayPaymentId, operation.refundId);
      } catch {
        return res.status(202).json({ message: 'Refund status is still uncertain. Retry this same return to check again.', uncertain: true });
      }
    } else {
      try {
        const existingRefunds = await gateway.payments.fetchMultipleRefund(bill.razorpayPaymentId, { count: 100 });
        const refundList = existingRefunds.items || existingRefunds.data || [];
        gatewayRefund = refundList.find((refund) => refund.receipt === returnRecord.returnNumber ||
          refund.notes?.returnNumber === returnRecord.returnNumber);
      } catch {
        return res.status(202).json({ message: 'Refund status is still uncertain. Retry this same return to check again.', uncertain: true });
      }
    }
    if (!gatewayRefund) try {
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
      const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(bill.razorpayPaymentId)}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
          'X-Refund-Idempotency': operation.idempotencyKey,
        },
        body: JSON.stringify({
          amount: operation.amount,
          receipt: returnRecord.returnNumber,
          notes: { returnNumber: returnRecord.returnNumber, billNumber: bill.billNumber },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Keep ambiguous/in-flight requests pending with the same key. Definite
        // validation failures are terminal and require an owner to review them.
        if (response.status !== 409 && response.status < 500) {
          await Return.updateOne({ _id: returnRecord._id, 'razorpayRefund.status': 'pending' }, {
            $set: { 'razorpayRefund.status': 'failed', 'razorpayRefund.updatedAt': new Date() },
          });
          return res.status(502).json({ message: 'Razorpay rejected this refund request. Review it in the Razorpay dashboard.' });
        }
        return res.status(202).json({ message: 'Refund status is uncertain or still processing. Retry this same return to safely check again.', uncertain: true });
      }
      gatewayRefund = payload;
    } catch {
      return res.status(202).json({ message: 'Razorpay may have received the refund request. Its status is uncertain; retry this same return to safely check again.', uncertain: true });
    }

    if (gatewayRefund.payment_id !== bill.razorpayPaymentId || gatewayRefund.amount !== operation.amount || !gatewayRefund.id) {
      return res.status(202).json({ message: 'Razorpay returned an unexpected refund response. Review the payment in the Razorpay dashboard.', uncertain: true });
    }

    const status = ['pending', 'processed', 'failed'].includes(gatewayRefund.status) ? gatewayRefund.status : 'pending';
    await Return.updateOne({ _id: returnRecord._id, 'razorpayRefund.idempotencyKey': operation.idempotencyKey }, {
      $set: {
        'razorpayRefund.refundId': gatewayRefund.id,
        'razorpayRefund.status': status,
        'razorpayRefund.updatedAt': new Date(),
      },
    });
    const updated = await Return.findById(returnRecord._id).select('-razorpayRefund.idempotencyKey');
    return res.status(status === 'pending' ? 202 : 200).json({
      message: status === 'processed' ? 'Razorpay refund processed' : status === 'failed' ? 'Razorpay refund failed' : 'Razorpay accepted the refund; processing is pending',
      return: updated,
    });
  } catch (err) {
    console.error('Razorpay return refund failed', { name: err.name, status: err.status });
    return res.status(500).json({ message: 'Could not process the Razorpay refund. Check the return and Razorpay dashboard before retrying.' });
  }
};

// Owner explicitly writes off each eligible, non-restocked return line once.
// No StockBatch quantity is modified: the goods were never added back to stock.
exports.writeOffReturnAsWastage = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const returnRecord = await Return.findById(req.params.id).session(session);
    if (!returnRecord) throw Object.assign(new Error('Return not found'), { status: 404 });

    let writtenOffItems = 0;
    let writtenOffUnits = 0;
    for (let itemIndex = 0; itemIndex < returnRecord.items.length; itemIndex += 1) {
      const item = returnRecord.items[itemIndex];
      if (item.restocked || item.wastageWrittenOff) continue;
      const allocations = item.originalBatches || [];
      const allocatedQuantity = allocations.reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
      if (allocations.length === 0 || allocatedQuantity !== Number(item.quantity)) continue;
      if (allocations.some((allocation) => !mongoose.isValidObjectId(allocation.batch) ||
        !Number.isFinite(Number(allocation.unitCost)) || Number(allocation.unitCost) <= 0)) continue;

      for (const allocation of allocations) {
        const sourceBatch = await StockBatch.findById(allocation.batch).session(session);
        if (!sourceBatch || String(sourceBatch.product) !== String(item.product)) {
          throw Object.assign(new Error('Original stock batch could not be verified; no wastage was recorded'), { status: 409 });
        }
        const quantity = Number(allocation.quantity);
        const unitCost = Number(allocation.unitCost);
        await Wastage.create([{
          product: item.product,
          batch: sourceBatch._id,
          quantity,
          reason: item.reason === 'expired' ? 'expired' : item.reason === 'damaged' ? 'damaged' : item.reason === 'quality_issue' ? 'spoiled' : 'other',
          unitCost,
          totalCost: Math.round(unitCost * quantity * 100) / 100,
          notes: `Return ${returnRecord.returnNumber} from bill ${returnRecord.bill}; ${item.reason || 'other'}`,
          automatic: false,
          sourceType: 'return',
          sourceReturn: returnRecord._id,
          sourceReturnItem: itemIndex,
          recordedBy: req.user._id,
          recordedByName: req.user.name,
        }], { session });
        writtenOffUnits += quantity;
      }
      item.wastageWrittenOff = true;
      item.wastageWrittenOffAt = new Date();
      item.wastageWrittenOffBy = req.user._id;
      writtenOffItems += 1;
    }

    if (!writtenOffItems) {
      throw Object.assign(new Error('No eligible return items have traceable batch and cost data, or they were already written off'), { status: 400 });
    }
    await returnRecord.save({ session });
    await session.commitTransaction();
    res.json({ message: 'Return item(s) recorded as wastage', writtenOffItems, writtenOffUnits });
  } catch (err) {
    await session.abortTransaction();
    res.status(err.status || (err.code === 11000 ? 409 : 500)).json({
      message: err.code === 11000 ? 'These return items have already been recorded as wastage' : err.message,
    });
  } finally {
    await session.endSession();
  }
};
