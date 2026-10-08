const Product = require("../models/Product");
const StockBatch = require('../models/StockBatch');
const Bill = require('../models/Bill');
const PurchaseOrder = require('../models/Purchaseorder');
const Return = require('../models/Return');
const Discount = require('../models/Discount');

// @desc Add new product (Owner only)
exports.addProduct = async (req, res) => {
  try {
    const { name, category, unit, price, barcode, reorderLevel, expiryAlertDays } = req.body;

    const existing = barcode ? await Product.findOne({ barcode }) : null;
    if (existing) {
      return res.status(400).json({ message: "Barcode already exists" });
    }

    const product = await Product.create({
      name,
      category,
      unit,
      price,
      barcode,
      reorderLevel, 
      expiryAlertDays,
      createdBy: req.user.id,
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) {
      filter.category = req.query.category;
    }
    const products = await Product.find(filter)
      .populate("category", "name")
      .sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc Update product (Owner only)
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc Delete product (Owner only)
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const [stockHistory, billHistory, purchaseHistory, returnHistory, discountHistory] = await Promise.all([
      StockBatch.exists({ product: product._id }),
      Bill.exists({ 'items.product': product._id }),
      PurchaseOrder.exists({ 'items.product': product._id }),
      Return.exists({ 'items.product': product._id }),
      Discount.exists({ products: product._id }),
    ]);

    if (stockHistory || billHistory || purchaseHistory || returnHistory || discountHistory) {
      product.isActive = false;
      await product.save();
      return res.json({ message: 'Product has transaction history and was deactivated instead of deleted', product });
    }

    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
