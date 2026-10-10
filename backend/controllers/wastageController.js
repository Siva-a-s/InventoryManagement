const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');
const Product = require('../models/Product');
const Wastage = require('../models/Wastage');

// ---------- RECORD wastage for one batch (Owner) ----------
// body: { batchId, quantity, reason, notes }
exports.recordWastage = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { batchId, quantity, reason, notes } = req.body;
    const qty = Number(quantity);

    if (!mongoose.isValidObjectId(batchId)) {
      throw Object.assign(new Error('Valid batchId is required'), { status: 400 });
    }

    if (!Number.isInteger(qty) || qty <= 0) {
      throw Object.assign(
        new Error('Quantity must be a positive whole number'),
        { status: 400 }
      );
    }

    if (!Wastage.REASONS.includes(reason)) {
      throw Object.assign(
        new Error(
          'Reason must be one of: ' + Wastage.REASONS.join(', ')
        ),
        { status: 400 }
      );
    }

    // Reduce stock only when enough stock is available.
    const batch = await StockBatch.findOneAndUpdate(
      {
        _id: batchId,
        remainingQuantity: { $gte: qty },
      },
      {
        $inc: { remainingQuantity: -qty },
      },
      {
        new: true,
        session,
      }
    );

    if (!batch) {
      throw Object.assign(
        new Error('Batch not found or not enough stock left in it'),
        { status: 400 }
      );
    }

    const unitCost = Number(batch.costPrice) || 0;
    const totalCost = Math.round(unitCost * qty * 100) / 100;

    const entry = await Wastage.create(
      [
        {
          product: batch.product,
          batch: batch._id,
          quantity: qty,
          reason,
          unitCost,
          totalCost,
          notes,
          automatic: false,
          sourceType: 'manual',
          recordedBy: req.user._id,
          recordedByName: req.user.name,
        },
      ],
      { session }
    );

    await session.commitTransaction();

    res.status(201).json(entry[0]);
  } catch (err) {
    await session.abortTransaction();

    const status = err.status || 500;

    res.status(status).json({
      message: err.message,
    });
  } finally {
    await session.endSession();
  }
};


// ---------- WRITE OFF all expired stock in one go (Owner) ----------
exports.writeOffExpired = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // Find all expired batches that still contain stock.
    const expiredBatches = await StockBatch.find({
      expiryDate: { $lt: new Date() },
      remainingQuantity: { $gt: 0 },
    }).session(session);

    let batchesWrittenOff = 0;
    let unitsWrittenOff = 0;
    let totalLoss = 0;

    for (const batch of expiredBatches) {
      const qty = batch.remainingQuantity;

      if (qty <= 0) {
        continue;
      }

      const unitCost = Number(batch.costPrice) || 0;
      const totalCost = Math.round(unitCost * qty * 100) / 100;

      // Set stock to zero.
      batch.remainingQuantity = 0;
      await batch.save({ session });

      // Record the loss.
      await Wastage.create(
        [
          {
            product: batch.product,
            batch: batch._id,
            quantity: qty,
            reason: 'expired',
            unitCost,
            totalCost,
            notes: 'Auto write-off of expired stock',
            automatic: true,
            sourceType: 'expired',
            recordedBy: req.user._id,
            recordedByName: req.user.name,
          },
        ],
        { session }
      );

      batchesWrittenOff += 1;
      unitsWrittenOff += qty;
      totalLoss += totalCost;
    }

    await session.commitTransaction();

    res.json({
      batchesWrittenOff,
      unitsWrittenOff,
      totalLoss: Math.round(totalLoss * 100) / 100,
    });
  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      message: err.message,
    });
  } finally {
    await session.endSession();
  }
};


// ---------- GET wastage list ----------
// examples:
// /api/wastage?reason=expired
// /api/wastage?from=2026-10-01&to=2026-10-31
exports.getWastage = async (req, res) => {
  try {
    const filter = {};

    if (req.query.reason) {
      if (!Wastage.REASONS.includes(req.query.reason)) {
        return res.status(400).json({
          message:
            'Reason must be one of: ' + Wastage.REASONS.join(', '),
        });
      }

      filter.reason = req.query.reason;
    }

    if (req.query.product) {
      if (!mongoose.isValidObjectId(req.query.product)) {
        return res.status(400).json({
          message: 'Invalid product ID',
        });
      }

      filter.product = req.query.product;
    }

    // Optional date filter using Indian time.
    if (req.query.from || req.query.to) {
      filter.createdAt = {};

      if (req.query.from) {
        const from = new Date(
          req.query.from + 'T00:00:00+05:30'
        );

        if (isNaN(from)) {
          return res.status(400).json({
            message: 'Invalid from date. Use YYYY-MM-DD',
          });
        }

        filter.createdAt.$gte = from;
      }

      if (req.query.to) {
        const to = new Date(
          req.query.to + 'T23:59:59.999+05:30'
        );

        if (isNaN(to)) {
          return res.status(400).json({
            message: 'Invalid to date. Use YYYY-MM-DD',
          });
        }

        filter.createdAt.$lte = to;
      }
    }

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit) || 20, 1),
      100
    );

    const entries = await Wastage.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('product', 'name unit')
      .populate('batch', 'batchNumber expiryDate costPrice')
      .populate('recordedBy', 'name')
      .populate('sourceReturn', 'returnNumber');

    const count = await Wastage.countDocuments(filter);

    res.json({
      entries,
      page,
      pages: Math.ceil(count / limit),
      count,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


// ---------- WASTAGE SUMMARY ----------
// example:
// /api/wastage/summary?from=2026-10-01&to=2026-10-31
exports.getWastageSummary = async (req, res) => {
  try {
    const to = req.query.to
      ? new Date(req.query.to + 'T23:59:59.999+05:30')
      : new Date();

    const from = req.query.from
      ? new Date(req.query.from + 'T00:00:00+05:30')
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (isNaN(from) || isNaN(to)) {
      return res.status(400).json({
        message: 'Use dates like 2026-10-01',
      });
    }

    if (from > to) {
      return res.status(400).json({
        message: 'From date cannot be after to date',
      });
    }

    const match = {
      $match: {
        createdAt: {
          $gte: from,
          $lte: to,
        },
      },
    };

    // ---------- LOSS BY REASON ----------
    const byReason = await Wastage.aggregate([
      match,
      {
        $group: {
          _id: '$reason',
          entries: { $sum: 1 },
          units: { $sum: '$quantity' },
          loss: { $sum: '$totalCost' },
        },
      },
      {
        $sort: {
          loss: -1,
        },
      },
    ]);

    // ---------- TOP 10 PRODUCTS BY LOSS ----------
    const topProducts = await Wastage.aggregate([
      match,
      {
        $group: {
          _id: '$product',
          units: { $sum: '$quantity' },
          loss: { $sum: '$totalCost' },
        },
      },
      {
        $sort: {
          loss: -1,
        },
      },
      {
        $limit: 10,
      },
      {
        $lookup: {
          from: Product.collection.name,
          localField: '_id',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      {
        $unwind: {
          path: '$productInfo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          product: '$_id',
          name: '$productInfo.name',
          units: 1,
          loss: 1,
        },
      },
    ]);

    // ---------- TOTALS ----------
    let totalLoss = 0;
    let totalUnits = 0;

    for (const row of byReason) {
      totalLoss += Number(row.loss) || 0;
      totalUnits += Number(row.units) || 0;
    }

    res.json({
      from,
      to,
      totalUnits,
      totalLoss: Math.round(totalLoss * 100) / 100,
      byReason,
      topWastedProducts: topProducts,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};
