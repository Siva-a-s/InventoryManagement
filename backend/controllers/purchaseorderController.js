const mongoose = require('mongoose');
const PurchaseOrder = require('../models/Purchaseorder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService')

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

exports.getPurchaseOrderSummary = async (req, res) => {
  try {
    const pendingOrders = await PurchaseOrder.countDocuments({ status: 'pending' });
    res.json({ pendingOrders });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      throw Object.assign(new Error(`This order is already ${order.status}`), { status: 400 });
    }

    const { items } = req.body;

    if (!Array.isArray(items) || items.length !== order.items.length) {
      throw Object.assign(new Error('Please provide receiving details for all items'), { status: 400 });
    }

    const receivedByOrderItem = new Map();
    for (const item of order.items) {
      const receivedItem = items.find((entry) =>
        entry.itemId && String(entry.itemId) === String(item._id)
      );

      if (!receivedItem) {
        throw Object.assign(new Error('Receiving details missing for an item'), { status: 400 });
      }

      const receivedQuantity = Number(receivedItem.receivedQuantity);
      if (!Number.isInteger(receivedQuantity) || receivedQuantity <= 0) {
        throw Object.assign(new Error('Received quantity must be a positive whole number'), { status: 400 });
      }
      if (receivedQuantity !== item.quantity) {
        throw Object.assign(new Error(`Received quantity for each item must equal the ordered quantity (${item.quantity})`), { status: 400 });
      }
      if (!receivedItem.batchNumber) {
        throw Object.assign(new Error('Batch number is required'), { status: 400 });
      }
      if (!receivedItem.expiryDate || isNaN(new Date(receivedItem.expiryDate))) {
        throw Object.assign(new Error('A valid expiry date is required'), { status: 400 });
      }
      receivedByOrderItem.set(String(item._id), receivedItem);
    }

    // Create stock batch for every item
    for (const item of order.items) {
      const receivedItem = receivedByOrderItem.get(String(item._id));

      const batch = await StockBatch.create(
        [
          {
            product: item.product,
            supplier: order.supplier,
            quantity: Number(receivedItem.receivedQuantity),
            costPrice: item.unitCost,
            batchNumber: receivedItem.batchNumber,
            expiryDate: receivedItem.expiryDate,
            purchaseDate: new Date(),
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
    await order.populate('items.product', 'name unit');

    await session.commitTransaction();

const owner = await User.findOne({ role: 'owner' }).select('email name');
const supplier = await Supplier.findById(order.supplier).select('name');

if (owner?.email) {
  const itemDetails = order.items
    .map((item) => {
      const receivedItem = receivedByOrderItem.get(String(item._id));

      const receivedQuantity = receivedItem
        ? Number(receivedItem.receivedQuantity)
        : 0;

      return `${item.product?.name || 'Product'} - Ordered: ${item.quantity}, Received: ${receivedQuantity}, Unit Cost: ₹${item.unitCost}`;
    })
    .join('\n');

  await sendEmail(
    owner.email,
    `Purchase Order Received - ${order.poNumber}`,
    `Hello ${owner.name || 'Owner'},

Purchase Order ${order.poNumber} has been received successfully.

Supplier: ${supplier?.name || 'Supplier'}
Received Date: ${new Date().toLocaleDateString('en-IN')}

Items:
${itemDetails}

Total PO Amount: ₹${Number(order.totalAmount || 0).toLocaleString('en-IN')}

The received stock has been added to inventory.

Thank you,
Smart Inventory Management`
  );
}
    res.json({
      message: 'Purchase order received and stock added',
      order
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

