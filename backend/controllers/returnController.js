const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Return = require('../models/Return');
const StockBatch = require('../models/StockBatch');

// ---------- CREATE a return (Owner + Staff) ----------
// body: {
//   billId, refundMethod, note,
//   items: [{ productId, quantity, reason, restock }]
// }
// CREATE RETURN
// Owner + Staff
exports.createReturn = async (req, res) => {
  try {
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
      'store_credit'
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

    const bill = await Bill.findById(billId);

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
    });

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

      if (restock) {
        /*
          Try to restore the product to a batch that was
          actually used by this bill.
        */

        const billLineBatches = billItem.batches || [];

        for (const soldBatch of billLineBatches) {
          const batch = await StockBatch.findById(
            soldBatch.batch
          );

          if (!batch) {
            continue;
          }

          // Don't put stock back into an expired batch
          if (
            batch.expiryDate &&
            batch.expiryDate <= new Date()
          ) {
            continue;
          }

          // Make sure the batch has room
          if (
            batch.remainingQuantity + requested.quantity <=
            batch.quantity
          ) {
            restockedBatch = batch;
            break;
          }
        }

        if (!restockedBatch) {
          return res.status(400).json({
            message: `No suitable original stock batch found for "${billItem.name}". Return it without restocking.`
          });
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
        restockedBatch: restockedBatch
          ? restockedBatch._id
          : undefined
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

      const batch = await StockBatch.findById(
        line.restockedBatch
      );

      if (!batch) {
        return res.status(400).json({
          message: 'Stock batch no longer exists'
        });
      }

      // Final safety check
      if (
        batch.remainingQuantity + line.quantity >
        batch.quantity
      ) {
        return res.status(400).json({
          message: 'Cannot restore more stock than the batch originally contained'
        });
      }

      batch.remainingQuantity += line.quantity;

      await batch.save();
    }

    // -----------------------------
    // 9. CREATE RETURN RECORD
    // -----------------------------

    const newReturn = await Return.create({
      bill: bill._id,
      items: lines,
      totalRefund: Math.round(totalRefund * 100) / 100,
      refundMethod: refundMethod || 'cash',
      note,
      processedBy: req.user._id
    });

    // -----------------------------
    // 10. SEND RESPONSE
    // -----------------------------

    res.status(201).json({
      message: 'Return processed successfully',
      return: newReturn
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
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
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('processedBy', 'name');

    const count = await Return.countDocuments(filter);

    res.json({ returns, page, pages: Math.ceil(count / limit), count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ---------- GET one return ----------
exports.getReturn = async (req, res) => {
  try {
    const found = await Return.findById(req.params.id).populate('processedBy', 'name');
    if (!found) {
      return res.status(404).json({ message: 'Return not found' });
    }
    res.json(found);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};