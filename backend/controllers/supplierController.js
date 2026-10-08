const mongoose = require('mongoose');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fail = (status, message) => {
  throw { status, message };
};

const handleError = (res, err) => {
  if (err.status) return res.status(err.status).json({ message: err.message });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
  console.error(err);
  res.status(500).json({ message: err.message });
};

/* ---------- helpers ---------- */

function checkContact(phone, email) {
  if (phone && !/^[0-9+\-\s]{7,15}$/.test(phone)) {
    fail(400, 'Phone number must be 7-15 digits (you can use + - and spaces)');
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    fail(400, 'Invalid email address');
  }
}

// two suppliers cannot have the same name (ignoring upper/lower case)
async function ensureUniqueName(name, excludeId) {
  const query = { name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } };
  if (excludeId) query._id = { $ne: excludeId };
  if (await Supplier.exists(query)) fail(400, 'A supplier with this name already exists');
}

// make sure every product id is valid and really exists
async function checkProducts(products) {
  if (!Array.isArray(products)) fail(400, 'products must be an array of product ids');
  const ids = [...new Set(products.map(String))]; // remove duplicates
  if (ids.some((id) => !isValidId(id))) fail(400, 'Invalid product id in products');
  const count = await Product.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) fail(404, 'One or more products not found');
  return ids;
}

/* ---------- controllers ---------- */

// POST /api/suppliers   (owner only)
exports.createSupplier = async (req, res) => {
  try {
    const { name, phone, email, address, products = [] } = req.body;

    if (!name || !name.trim()) fail(400, 'Supplier name is required');
    checkContact(phone, email);
    await ensureUniqueName(name.trim());
    const productIds = await checkProducts(products);

    const supplier = await Supplier.create({
      name: name.trim(),
      phone,
      email,
      address,
      products: productIds,
      createdBy: req.user._id || req.user.id,
    });

    await supplier.populate('products', 'name unit');
    res.status(201).json(supplier);
  } catch (err) {
    handleError(res, err);
  }
};

// GET /api/suppliers?active=true&search=abc&product=<productId>   (owner, staff)
// active=true is what the stock-entry dropdown should use
exports.getSuppliers = async (req, res) => {
  try {
    const { active, search, product } = req.query;
    const filter = {};

    if (active === 'true') filter.isActive = true;
    if (active === 'false') filter.isActive = false;
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' };
    if (product) {
      if (!isValidId(product)) fail(400, 'Invalid product id');
      filter.products = product; // suppliers who supply this product
    }

    const suppliers = await Supplier.find(filter)
      .populate('products', 'name unit')
      .sort({ name: 1 });

    res.json(suppliers);
  } catch (err) {
    handleError(res, err);
  }
};

// PUT /api/suppliers/:id   (owner only)
// products, if sent, REPLACES the whole list of supplied products
exports.updateSupplier = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) fail(400, 'Invalid supplier id');

    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) fail(404, 'Supplier not found');

    const { name, phone, email, address, products, isActive } = req.body;

    if (name !== undefined) {
      if (!name.trim()) fail(400, 'Supplier name cannot be empty');
      await ensureUniqueName(name.trim(), supplier._id);
      supplier.name = name.trim();
    }

    checkContact(phone, email);
    if (phone !== undefined) supplier.phone = phone;
    if (email !== undefined) supplier.email = email;
    if (address !== undefined) supplier.address = address;
    if (isActive !== undefined) supplier.isActive = Boolean(isActive);
    if (products !== undefined) supplier.products = await checkProducts(products);

    await supplier.save();
    await supplier.populate('products', 'name unit');
    res.json(supplier);
  } catch (err) {
    handleError(res, err);
  }
};

// DELETE /api/suppliers/:id   (owner only)
// A supplier that already has stock recorded cannot be deleted - deactivate it instead
exports.deleteSupplier = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) fail(400, 'Invalid supplier id');

    const batchCount = await StockBatch.countDocuments({ supplier: req.params.id });
    if (batchCount > 0) {
      fail(
        400,
        `Cannot delete - ${batchCount} stock batch(es) were bought from this supplier. Set isActive to false instead.`
      );
    }

    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) fail(404, 'Supplier not found');

    res.json({ message: 'Supplier deleted' });
  } catch (err) {
    handleError(res, err);
  }
};