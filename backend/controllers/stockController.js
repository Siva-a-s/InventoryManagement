const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const getUserId = (req) => req.user._id || req.user.id || req.user.userId;
// const getUserId = (req) => req.user._id 

// Validate + build one batch document from request data
const buildBatch = async (data, userId) => {
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
    // const data = await buildBatch(req.body, req.user._id);
    const data = await buildBatch(req.body, getUserId(req));
    const batch = await StockBatch.create(data);
    await batch.populate('product', 'name barcode unit');
    res.status(201).json({ success: true, data: batch });
  } catch (err) {
    handleError(res, err);
  }
};

// // @desc    Add many batches from one purchase (shared supplier/invoice)
// // @route   POST /api/stock/bulk
// // @body    { supplier, invoiceNumber, purchaseDate, items: [{ product, quantity, expiryDate, ... }] }
// // @access  Owner, Staff
// exports.addBulk = async (req, res) => {
//   try {
//     const { items, supplier, invoiceNumber, purchaseDate } = req.body;
//     if (!Array.isArray(items) || items.length === 0) {
//       return res.status(400).json({ success: false, message: 'items must be a non-empty array' });
//     }

//     // Validate everything first so we don't save half a purchase
//     const docs = [];
//     for (let i = 0; i < items.length; i++) {
//       try {
//         docs.push(
//           await buildBatch(
//             {
//               supplier,
//               invoiceNumber,
//               purchaseDate,
//               ...items[i], // item-level values override purchase-level ones
//             },
//             getUserId(req)
//           )
//         );
//       } catch (err) {
//         err.message = `Item ${i + 1}: ${err.message}`;
//         throw err;
//       }
//     }

//     // create() (not insertMany) so the pre-validate hook runs for each doc
//     const created = await StockBatch.create(docs);
//     res.status(201).json({ success: true, count: created.length, data: created });
//   } catch (err) {
//     handleError(res, err);
//   }
// };

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
      filter.$or = [{ expiryDate: null }, { expiryDate: { $gte: now } }];
    } else if (status === 'expired') {
      filter.expiryDate = { $lt: now };
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
      filter.expiryDate = { $gte: now, $lte: limitDate };
      filter.remainingQuantity = { $gt: 0 };
    }

    const [batches, total] = await Promise.all([
      StockBatch.find(filter)
        .populate('product', 'name barcode unit category')
        .populate('supplier', 'name')
        .populate('receivedBy', 'name')
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

// @desc    All sellable batches for one product (earliest expiry first) + total stock
// @route   GET /api/stock/product/:productId
// @access  Owner, Staff
exports.getProductStock = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isValidId(productId)) return res.status(400).json({ success: false, message: 'Invalid product id' });

    const product = await Product.findById(productId).select('name barcode unit');
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

    const sellable = batches.filter((b) => !b.expiryDate || b.expiryDate >= now);
    const expired = batches.filter((b) => b.expiryDate && b.expiryDate < now);

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

// // @desc    Stock summary per product (total available, expired, nearest expiry)
// // @route   GET /api/stock/summary
// // @access  Owner, Staff
// exports.getStockSummary = async (req, res) => {
//   try {
//     const now = new Date();
//     const summary = await StockBatch.aggregate([
//       { $match: { remainingQuantity: { $gt: 0 } } },
//       {
//         $group: {
//           _id: '$product',
//           totalAvailable: {
//             $sum: {
//               $cond: [
//                 { $or: [{ $eq: ['$expiryDate', null] }, { $gte: ['$expiryDate', now] }] },
//                 '$remainingQuantity',
//                 0,
//               ],
//             },
//           },
//           totalExpired: {
//             $sum: {
//               $cond: [
//                 { $and: [{ $ne: ['$expiryDate', null] }, { $lt: ['$expiryDate', now] }] },
//                 '$remainingQuantity',
//                 0,
//               ],
//             },
//           },
//           batchCount: { $sum: 1 },
//           nearestExpiry: { $min: '$expiryDate' },
//         },
//       },
//       {
//         $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' },
//       },
//       { $unwind: '$product' },
//       {
//         $project: {
//           _id: 0,
//           productId: '$_id',
//           name: '$product.name',
//           barcode: '$product.barcode',
//           unit: '$product.unit',
//           totalAvailable: 1,
//           totalExpired: 1,
//           batchCount: 1,
//           nearestExpiry: 1,
//         },
//       },
//       { $sort: { name: 1 } },
//     ]);

//     res.json({ success: true, count: summary.length, data: summary });
//   } catch (err) {
//     handleError(res, err);
//   }
// };

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

// // @desc    Purchase / stock-in history
// // @route   GET /api/stock/history?from=&to=&product=&supplier=&invoiceNumber=&receivedBy=&page=&limit=
// // @access  Owner, Staff
// exports.getPurchaseHistory = async (req, res) => {
//   try {
//     const { from, to, product, supplier, invoiceNumber, receivedBy } = req.query;
//     const page = Math.max(parseInt(req.query.page) || 1, 1);
//     const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

//     const filter = {};

//     if (product) {
//       if (!isValidId(product)) return res.status(400).json({ success: false, message: 'Invalid product id' });
//       filter.product = new mongoose.Types.ObjectId(product);
//     }
//     if (receivedBy) {
//       if (!isValidId(receivedBy)) return res.status(400).json({ success: false, message: 'Invalid user id' });
//       filter.receivedBy = new mongoose.Types.ObjectId(receivedBy);
//     }
//     if (supplier) {
//       const safe = supplier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//       filter.supplier = new RegExp(safe, 'i');//supplier is string here change to id
//     }
//     if (invoiceNumber) filter.invoiceNumber = invoiceNumber;

//     if (from || to) {
//       filter.purchaseDate = {};
//       if (from) {
//         const f = new Date(from);
//         if (isNaN(f)) return res.status(400).json({ success: false, message: 'Invalid from date' });
//         filter.purchaseDate.$gte = f;
//       }
//       if (to) {
//         const t = new Date(to);
//         if (isNaN(t)) return res.status(400).json({ success: false, message: 'Invalid to date' });
//         t.setHours(23, 59, 59, 999); // include the whole "to" day
//         filter.purchaseDate.$lte = t;
//       }
//     }

//     const [batches, total, totals] = await Promise.all([
//       StockBatch.find(filter)
//         .populate('product', 'name barcode unit')
//         .populate('receivedBy', 'name')
//         .sort({ purchaseDate: -1, createdAt: -1 })
//         .skip((page - 1) * limit)
//         .limit(limit),
//       StockBatch.countDocuments(filter),
//       StockBatch.aggregate([
//         { $match: filter },
//         {
//           $group: {
//             _id: null,
//             totalUnits: { $sum: '$quantity' },
//             totalCost: { $sum: { $multiply: ['$quantity', '$costPrice'] } },
//           },
//         },
//       ]),
//     ]);

//     res.json({
//       success: true,
//       total,
//       page,
//       pages: Math.ceil(total / limit),
//       totalUnitsPurchased: totals[0]?.totalUnits || 0,
//       totalPurchaseCost: totals[0]?.totalCost || 0,
//       data: batches,
//     });
//   } catch (err) {
//     handleError(res, err);
//   }
// };