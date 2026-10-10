const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const getUserId = (req) => req.user._id || req.user.id || req.user.userId;

// Validate + build one batch document from request data
const buildBatch = async (data, userId, userName) => {
  const { product, quantity, expiryDate, purchaseDate, supplier } = data;

  if (!isValidId(product)) throw { status: 400, message: 'Invalid product id' };

  const productExists = await Product.exists({ _id: product });
  if (!productExists) throw { status: 404, message: 'Product not found' };

  if (supplier) {
    if (!isValidId(supplier)) throw { status: 400, message: 'Invalid supplier id' };
    const supplierExists = await Supplier.exists({ _id: supplier, isActive: true });
    if (!supplierExists) throw { status: 404, message: 'Supplier not found or inactive' };
  }//got from module6

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) {
    throw { status: 400, message: 'Quantity must be a whole number of at least 1' };
  }

  if (expiryDate) {
    const exp = new Date(expiryDate);
    if (isNaN(exp)) throw { status: 400, message: 'Invalid expiry date' };
    const purchased = purchaseDate ? new Date(purchaseDate) : new Date();
    if (exp <= purchased) {
      throw { status: 400, message: 'Expiry date must be after the purchase date' };
    }
  }

return {
  product,
  quantity: qty,
  batchNumber: data.batchNumber,
  costPrice: data.costPrice,
  expiryDate: expiryDate || null,
  purchaseDate: purchaseDate || undefined,
  supplier: supplier || undefined,
  invoiceNumber: data.invoiceNumber,
  notes: data.notes,
  receivedBy: userId,
  receivedByName: userName,

  // This endpoint represents manual stock entry
  sourceType: 'manual',
  purchaseOrder: null,
};
};

const handleError = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  if (err.code === 11000) {
    return res
      .status(409)
      .json({ success: false, message: 'This product already has a batch with that batch number' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ success: false, message: 'Server error' });
};

// @desc    Add a stock batch (purchase entry for one product)
// @route   POST /api/stock
// @access  Owner, Staff
exports.addBatch = async (req, res) => {
  try {
    const data = await buildBatch(req.body, getUserId(req), req.user.name);
    const batch = await StockBatch.create(data);
    await batch.populate('product', 'name barcode unit');
    res.status(201).json({ success: true, data: batch });
  } catch (err) {
    handleError(res, err);
  }
};

// @desc    List batches with filters
// @route   GET /api/stock?product=&status=&expiringInDays=&page=&limit=
//          status: active (default) | expired | depleted | all
// @access  Owner, Staff
exports.getBatches = async (req, res) => {
  try {
    const { product, status = 'active', expiringInDays } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const now = new Date();

    const filter = {};
    if (product) {
      if (!isValidId(product)) return res.status(400).json({ success: false, message: 'Invalid product id' });
      filter.product = product;
    }

    if (status === 'active') {
      filter.remainingQuantity = { $gt: 0 };
      filter.$or = [{ expiryDate: null }, { expiryDate: { $gt: now } }];
      const activeProductIds = await Product.distinct('_id', { isActive: { $ne: false } });
      const eligibleProductIds = product
        ? activeProductIds.filter((id) => String(id) === String(product))
        : activeProductIds;
      filter.product = { $in: eligibleProductIds };
    } else if (status === 'expired') {
      filter.expiryDate = { $lte: now };
      filter.remainingQuantity = { $gt: 0 };
    } else if (status === 'depleted') {
      filter.remainingQuantity = 0;
    }

    if (expiringInDays) {
      const days = parseInt(expiringInDays);
      if (isNaN(days) || days < 0) {
        return res.status(400).json({ success: false, message: 'expiringInDays must be a positive number' });
      }
      const limitDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      filter.expiryDate = { $gt: now, $lte: limitDate };
      filter.remainingQuantity = { $gt: 0 };
    }

    const [batches, total] = await Promise.all([
      StockBatch.find(filter)
        .populate('product', 'name barcode unit category isActive')
        .populate('supplier', 'name')
        .populate('receivedBy', 'name')
        .populate('purchaseOrder', 'poNumber')
        .sort({ expiryDate: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      StockBatch.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: batches,
    });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStockSummary = async (req, res) => {
  try {
    const now = new Date();
    const [rows, totalBatches, products] = await Promise.all([
      StockBatch.aggregate([
        { $match: { remainingQuantity: { $gt: 0 } } },
        { $lookup: { from: Product.collection.name, localField: 'product', foreignField: '_id', as: 'productDoc' } },
        { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            availableBatches: {
              $sum: {
                $cond: [
                  { $and: [
                    { $ne: ['$productDoc._id', null] },
                    { $ne: ['$productDoc.isActive', false] },
                    { $or: [{ $eq: ['$expiryDate', null] }, { $gt: ['$expiryDate', now] }] },
                  ] },
                  1,
                  0,
                ],
              },
            },
            availableStock: {
              $sum: {
                $cond: [
                  { $and: [
                    { $ne: ['$productDoc._id', null] },
                    { $ne: ['$productDoc.isActive', false] },
                    { $or: [{ $eq: ['$expiryDate', null] }, { $gt: ['$expiryDate', now] }] },
                  ] },
                  '$remainingQuantity',
                  0,
                ],
              },
            },
            expiredStock: {
              $sum: {
                $cond: [
                  { $and: [{ $ne: ['$expiryDate', null] }, { $lte: ['$expiryDate', now] }] },
                  '$remainingQuantity',
                  0,
                ],
              },
            },
            inventoryValue: {
              $sum: {
                $cond: [
                  { $and: [
                    { $ne: ['$productDoc._id', null] },
                    { $ne: ['$productDoc.isActive', false] },
                    { $or: [{ $eq: ['$expiryDate', null] }, { $gt: ['$expiryDate', now] }] },
                  ] },
                  { $multiply: ['$remainingQuantity', '$costPrice'] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      StockBatch.countDocuments(),
      Product.find({ isActive: { $ne: false } }).select('_id reorderLevel').lean(),
    ]);

    const stockByProduct = await StockBatch.aggregate([
      { $match: { remainingQuantity: { $gt: 0 }, $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }] } },
      { $group: { _id: '$product', stock: { $sum: '$remainingQuantity' } } },
    ]);
    const stockMap = new Map(stockByProduct.map((row) => [String(row._id), row.stock]));
    const lowStockProducts = products.filter((product) =>
      (stockMap.get(String(product._id)) || 0) <= (product.reorderLevel ?? 0)
    ).length;
    const summary = rows[0] || { availableBatches: 0, availableStock: 0, expiredStock: 0, inventoryValue: 0 };

    res.json({
      success: true,
      totalBatches,
      availableBatches: summary.availableBatches,
      availableStock: summary.availableStock,
      expiredStock: summary.expiredStock,
      lowStockProducts,
      inventoryValue: summary.inventoryValue,
    });
  } catch (err) {
    handleError(res, err);
  }
};

// @desc    All sellable batches for one product (earliest expiry first) + total stock
// @route   GET /api/stock/product/:productId
// @access  Owner, Staff
exports.getProductStock = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ success: false, message: 'Invalid product id' });

    const product = await Product.findById(productId).select('name barcode unit isActive');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const now = new Date();
    const batches = await StockBatch.find({
      product: productId,
      remainingQuantity: { $gt: 0 },
    }).sort({ expiryDate: 1, purchaseDate: 1 }); // nulls sort first in Mongo, so fix below

    // Put no-expiry batches last (FEFO: soonest expiry sells first)
    batches.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return a.purchaseDate - b.purchaseDate;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate - b.expiryDate;
    });

    const sellable = product.isActive === false
      ? []
      : batches.filter((b) => !b.expiryDate || b.expiryDate > now);
    const expired = batches.filter((b) => b.expiryDate && b.expiryDate <= now);

    res.json({
      success: true,
      product,
      totalAvailable: sellable.reduce((sum, b) => sum + b.remainingQuantity, 0),
      totalExpired: expired.reduce((sum, b) => sum + b.remainingQuantity, 0),
      batches,
    });
  } catch (err) {
    handleError(res, err);
  }
};

// @desc    Get single batch
// @route   GET /api/stock/:id
// @access  Owner, Staff
exports.getBatch = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid batch id' });
    const batch = await StockBatch.findById(req.params.id)
      .populate('product', 'name barcode unit category')
      .populate('receivedBy', 'name');
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
    res.json({ success: true, data: batch });
  } catch (err) {
    handleError(res, err);
  }
};

// @desc    Correct a batch entry (typo fixes)
// @route   PUT /api/stock/:id
// @access  Owner only
exports.updateBatch = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid batch id' });
    const batch = await StockBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    const { quantity, expiryDate, costPrice, supplier, invoiceNumber, notes, batchNumber } = req.body;

    if (quantity !== undefined) {
      const newQty = Number(quantity);
      if (!Number.isInteger(newQty) || newQty < 1) {
        return res.status(400).json({ success: false, message: 'Quantity must be a whole number of at least 1' });
      }
      // Keep "already sold" the same: sold = quantity - remaining
      const sold = batch.quantity - batch.remainingQuantity;
      if (newQty < sold) {
        return res.status(400).json({
          success: false,
          message: `Cannot set quantity below ${sold}; that many units are already sold from this batch`,
        });
      }
      batch.quantity = newQty;
      batch.remainingQuantity = newQty - sold;
    }

    if (expiryDate !== undefined) {
      if (expiryDate === null || expiryDate === '') {
        batch.expiryDate = null;
      } else {
        const exp = new Date(expiryDate);
        if (isNaN(exp)) return res.status(400).json({ success: false, message: 'Invalid expiry date' });
        if (exp <= batch.purchaseDate) {
          return res.status(400).json({ success: false, message: 'Expiry date must be after the purchase date' });
        }
        batch.expiryDate = exp;
      }
    }

    if (costPrice !== undefined) batch.costPrice = costPrice;
    if (supplier !== undefined) batch.supplier = supplier;
    if (invoiceNumber !== undefined) batch.invoiceNumber = invoiceNumber;
    if (notes !== undefined) batch.notes = notes;
    if (batchNumber !== undefined) batch.batchNumber = batchNumber;

    await batch.save();
    await batch.populate('product', 'name barcode unit');
    res.json({ success: true, data: batch });
  } catch (err) {
    handleError(res, err);
  }
};

// @desc    Delete a batch (only if nothing has been sold from it)
// @route   DELETE /api/stock/:id
// @access  Owner only
exports.deleteBatch = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid batch id' });
    const batch = await StockBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });

    if (batch.remainingQuantity !== batch.quantity) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a batch that has sales against it',
      });
    }

    await batch.deleteOne();
    res.json({ success: true, message: 'Batch deleted' });
  } catch (err) {
    handleError(res, err);
  }
};
