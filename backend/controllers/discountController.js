const mongoose = require('mongoose');
const Discount = require('../models/Discount');
const Product = require('../models/Product');

const isValidDate = (date) => !isNaN(date.getTime());

const normalizeProducts = (products) => {
  if (!Array.isArray(products)) {
    return null;
  }

  return [...new Set(products.map(String))];
};

const validateProducts = async (products) => {
  if (!Array.isArray(products) || products.length === 0) {
    return {
      valid: false,
      status: 400,
      message: 'Select at least one product',
    };
  }

  if (products.some((id) => !mongoose.isValidObjectId(id))) {
    return {
      valid: false,
      status: 400,
      message: 'One or more product IDs are invalid',
    };
  }

  const uniqueProducts = [...new Set(products.map(String))];

  const found = await Product.find({
    _id: { $in: uniqueProducts },
  });

  if (found.length !== uniqueProducts.length) {
    return {
      valid: false,
      status: 404,
      message: 'One or more products not found',
    };
  }

  return {
    valid: true,
    products: uniqueProducts,
    found,
  };
};


// POST /api/discounts
// Owner only
exports.createDiscount = async (req, res) => {
  try {
    const {
      name,
      type,
      value,
      products,
      startDate,
      endDate,
    } = req.body;

    const numericValue = Number(value);

    if (
      !name ||
      typeof name !== 'string' ||
      !name.trim() ||
      !['percent', 'amount'].includes(type) ||
      !Number.isFinite(numericValue) ||
      numericValue <= 0
    ) {
      return res.status(400).json({
        message:
          'name, type (percent/amount) and a value above 0 are required',
      });
    }

    if (type === 'percent' && numericValue > 100) {
      return res.status(400).json({
        message: 'Percent cannot be more than 100',
      });
    }

    const productResult = await validateProducts(products);

    if (!productResult.valid) {
      return res.status(productResult.status).json({
        message: productResult.message,
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (!isValidDate(start) || !isValidDate(end)) {
      return res.status(400).json({
        message: 'Invalid start or end date',
      });
    }

    end.setHours(23, 59, 59, 999);

    if (end <= start) {
      return res.status(400).json({
        message: 'End date must be after the start date',
      });
    }

    // Amount discount must not make any product price zero or negative.
    if (
      type === 'amount' &&
      productResult.found.some(
        (product) => numericValue >= Number(product.price)
      )
    ) {
      return res.status(400).json({
        message:
          'Amount off must be less than the price of every selected product',
      });
    }

    const discount = await Discount.create({
      name: name.trim(),
      type,
      value: numericValue,
      products: productResult.products,
      startDate: start,
      endDate: end,
      createdBy: req.user._id,
    });

    res.status(201).json(discount);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


// GET /api/discounts?active=true
// Owner only
exports.getDiscounts = async (req, res) => {
  try {
    const filter = {};

    if (req.query.active === 'true') {
      const now = new Date();

      filter.isActive = true;
      filter.startDate = { $lte: now };
      filter.endDate = { $gte: now };
    }

    const discounts = await Discount.find(filter)
      .populate('products', 'name price')
      .sort({ createdAt: -1 });

    res.json(discounts);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


// PUT /api/discounts/:id
// Owner only
exports.updateDiscount = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid discount ID',
      });
    }

    const discount = await Discount.findById(req.params.id);

    if (!discount) {
      return res.status(404).json({
        message: 'Discount not found',
      });
    }

    const {
      name,
      value,
      products,
      endDate,
      isActive,
    } = req.body;

    // ---------- NAME ----------
    if (name !== undefined) {
      if (
        typeof name !== 'string' ||
        !name.trim()
      ) {
        return res.status(400).json({
          message: 'Discount name cannot be empty',
        });
      }

      discount.name = name.trim();
    }

    // ---------- VALUE ----------
    if (value !== undefined) {
      const numericValue = Number(value);

      if (
        !Number.isFinite(numericValue) ||
        numericValue <= 0
      ) {
        return res.status(400).json({
          message: 'Discount value must be greater than 0',
        });
      }

      if (
        discount.type === 'percent' &&
        numericValue > 100
      ) {
        return res.status(400).json({
          message: 'Percent cannot be more than 100',
        });
      }

      discount.value = numericValue;
    }

    // ---------- PRODUCTS ----------
    if (products !== undefined) {
      const productResult = await validateProducts(products);

      if (!productResult.valid) {
        return res.status(productResult.status).json({
          message: productResult.message,
        });
      }

      discount.products = productResult.products;
    }

    // ---------- CHECK AMOUNT DISCOUNT ----------
    // We need the final product list and final value.
    const finalProducts = discount.products.map(String);
    const finalValue = Number(discount.value);

    const productResult = await validateProducts(finalProducts);

    if (!productResult.valid) {
      return res.status(productResult.status).json({
        message: productResult.message,
      });
    }

    if (
      discount.type === 'amount' &&
      productResult.found.some(
        (product) => finalValue >= Number(product.price)
      )
    ) {
      return res.status(400).json({
        message:
          'Amount off must be less than the price of every selected product',
      });
    }

    // ---------- END DATE ----------
    if (endDate !== undefined) {
      const end = new Date(endDate);

      if (!isValidDate(end)) {
        return res.status(400).json({
          message: 'Invalid end date',
        });
      }

      end.setHours(23, 59, 59, 999);

      if (end <= discount.startDate) {
        return res.status(400).json({
          message: 'End date must be after the start date',
        });
      }

      discount.endDate = end;
    }

    // ---------- ACTIVE STATUS ----------
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          message: 'isActive must be true or false',
        });
      }

      discount.isActive = isActive;
    }

    await discount.save();

    res.json(discount);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};


// DELETE /api/discounts/:id
// Owner only
exports.deleteDiscount = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid discount ID',
      });
    }

    const discount = await Discount.findByIdAndDelete(req.params.id);

    if (!discount) {
      return res.status(404).json({
        message: 'Discount not found',
      });
    }

    res.json({
      message: 'Discount deleted',
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};