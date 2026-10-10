const Category = require("../models/Category");
const Product = require("../models/Product");
const StockBatch = require("../models/StockBatch");

exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;

    const existing = await Category.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });

    if (existing) {
      return res.status(400).json({ message: "Category already exists" });
    }

    const category = await Category.create({ name });
    res.status(201).json(category);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Category already exists" });
    }
    res.status(500).json({ message: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    const productCount = await Product.countDocuments({ category: categoryId });

    if (productCount > 0) {
      return res.status(400).json({
        message: `Cannot delete category — ${productCount} product(s) are still assigned to it. Reassign or delete those products first.`,
      });
    }

    const category = await Category.findByIdAndDelete(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCategorySummary = async (req, res) => {
  try {
    const now = new Date();

    // 1. all categories and all products
    const categories = await Category.find().sort({ name: 1 });
    const products = await Product.find().select("category isActive");
    const activeProductIds = products.filter((product) => product.isActive !== false).map((product) => product._id);

    // 2. sellable stock per product, from the batches
    const stock = await StockBatch.aggregate([
      {
        $match: {
          remainingQuantity: { $gt: 0 },
          product: { $in: activeProductIds },
          $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
        },
      },
      { $group: { _id: "$product", qty: { $sum: "$remainingQuantity" } } },
    ]);

    // 3. quick lookup: productId -> quantity
    const qtyByProduct = {};
    stock.forEach((s) => {
      qtyByProduct[s._id.toString()] = s.qty;
    });

    // 4. build the summary for each category
    const summary = categories.map((cat) => {
      const catProducts = products.filter(
        (p) => p.category.toString() === cat._id.toString()
      );

      const totalQuantity = catProducts.reduce(
        (sum, p) => sum + (qtyByProduct[p._id.toString()] || 0),
        0
      );

      return {
        categoryId: cat._id,
        categoryName: cat.name,
        totalTypes: catProducts.length,
        totalQuantity,
      };
    });

    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
