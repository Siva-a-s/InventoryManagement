const mongoose = require('mongoose');
const PurchaseOrder = require('../models/Purchaseorder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');

// CREATE PURCHASE ORDER
// This only creates the order.
// It does NOT add stock.
exports.createPurchaseOrder = async (req, res) => {
  try {
    const { supplier, items, expectedDate, notes } = req.body;

    // Validate supplier ID
    if (!mongoose.isValidObjectId(supplier)) {
      return res.status(400).json({
        message: 'Valid supplier is required'
      });
    }

    // Check supplier exists
    const supplierExists = await Supplier.findById(supplier);

    if (!supplierExists) {
      return res.status(404).json({
        message: 'Supplier not found'
      });
    }

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: 'Add at least one item'
      });
    }

    let totalAmount = 0;

    // Validate every item
    for (const item of items) {
      if (!mongoose.isValidObjectId(item.product)) {
        return res.status(400).json({
          message: 'Invalid product'
        });
      }

      const productExists = await Product.findById(item.product);

      if (!productExists) {
        return res.status(400).json({
          message: 'Product not found'
        });
      }

      const quantity = Number(item.quantity);
      const unitCost = Number(item.unitCost);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          message: 'Quantity must be a whole number greater than 0'
        });
      }

      if (!Number.isFinite(unitCost) || unitCost < 0) {
        return res.status(400).json({
          message: 'Unit cost must be 0 or greater'
        });
      }

      totalAmount += quantity * unitCost;
    }

    // Create purchase order
    const order = await PurchaseOrder.create({
      supplier,
      items,
      totalAmount: Math.round(totalAmount * 100) / 100,
      expectedDate,
      notes,
      orderedBy: req.user._id
    });

    res.status(201).json(order);

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};


// GET ALL PURCHASE ORDERS
exports.getPurchaseOrders = async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.supplier) {
      filter.supplier = req.query.supplier;
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const orders = await PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('supplier', 'name phone')
      .populate('items.product', 'name unit');

    const count = await PurchaseOrder.countDocuments(filter);

    res.json({
      orders,
      page,
      pages: Math.ceil(count / limit),
      count
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};


// GET SINGLE PURCHASE ORDER
exports.getPurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id)
      .populate('supplier', 'name phone')
      .populate('items.product', 'name unit');

    if (!order) {
      return res.status(404).json({
        message: 'Purchase order not found'
      });
    }

    res.json(order);

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};


// UPDATE PURCHASE ORDER
// Only pending orders can be edited.
exports.updatePurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: 'Purchase order not found'
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        message: 'Only pending orders can be edited'
      });
    }

    const { supplier, items, expectedDate, notes } = req.body;

    // Update supplier
    if (supplier !== undefined) {
      if (!mongoose.isValidObjectId(supplier)) {
        return res.status(400).json({
          message: 'Invalid supplier'
        });
      }

      const supplierExists = await Supplier.findById(supplier);

      if (!supplierExists) {
        return res.status(404).json({
          message: 'Supplier not found'
        });
      }

      order.supplier = supplier;
    }

    // Update items
    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          message: 'Add at least one item'
        });
      }

      let totalAmount = 0;

      for (const item of items) {
        if (!mongoose.isValidObjectId(item.product)) {
          return res.status(400).json({
            message: 'Invalid product'
          });
        }

        const productExists = await Product.findById(item.product);

        if (!productExists) {
          return res.status(400).json({
            message: 'Product not found'
          });
        }

        const quantity = Number(item.quantity);
        const unitCost = Number(item.unitCost);

        if (!Number.isInteger(quantity) || quantity <= 0) {
          return res.status(400).json({
            message: 'Quantity must be a whole number greater than 0'
          });
        }

        if (!Number.isFinite(unitCost) || unitCost < 0) {
          return res.status(400).json({
            message: 'Unit cost must be 0 or greater'
          });
        }

        totalAmount += quantity * unitCost;
      }

      order.items = items;
      order.totalAmount = Math.round(totalAmount * 100) / 100;
    }

    // Update expected date
    if (expectedDate !== undefined) {
      order.expectedDate = expectedDate;
    }

    // Update notes
    if (notes !== undefined) {
      order.notes = notes;
    }

    await order.save();

    res.json(order);

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};


// RECEIVE PURCHASE ORDER
// This is where stock is added.
exports.receivePurchaseOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const order = await PurchaseOrder.findById(req.params.id).session(session);

    if (!order) {
      return res.status(404).json({
        message: 'Purchase order not found'
      });
    }

    // Only pending orders can be received
    if (order.status !== 'pending') {
      return res.status(400).json({
        message: `This order is already ${order.status}`
      });
    }

    // Create stock batch for every item
    for (const item of order.items) {
      const batch = await StockBatch.create(
        [
          {
            product: item.product,
            supplier: order.supplier,
            quantity: item.quantity,
            costPrice: item.unitCost,
            expiryDate: item.expiryDate,
            sourceType: 'purchase_order',
            purchaseOrder: order._id,
            receivedBy: req.user._id,
            notes: `Received from purchase order ${order.poNumber}`
          }
        ],
        { session }
      );

      // Store created batch ID in the PO item
      item.batch = batch[0]._id;
    }

    // Mark PO as received
    order.status = 'received';
    order.receivedAt = new Date();
    order.receivedBy = req.user._id;

    await order.save({ session });

    await session.commitTransaction();

    res.json({
      message: 'Purchase order received and stock added',
      order
    });

  } catch (err) {
    await session.abortTransaction();

    res.status(500).json({
      message: err.message
    });

  } finally {
    session.endSession();
  }
};

// CANCEL PURCHASE ORDER
exports.cancelPurchaseOrder = async (req, res) => {
  try {
    const order = await PurchaseOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: 'Purchase order not found'
      });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        message: 'Only pending orders can be cancelled'
      });
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = req.body.reason || '';

    await order.save();

    res.json({
      message: 'Purchase order cancelled',
      order
    });

  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

