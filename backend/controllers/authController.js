const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Bill = require('../models/Bill');
const Wastage = require('../models/Wastage');
const Return = require('../models/Return');
const StockBatch = require('../models/StockBatch');
const PurchaseOrder = require('../models/Purchaseorder');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Discount = require('../models/Discount');

const generateToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

// One-time Owner signup
exports.signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingOwner = await User.findOne({ role: 'owner' });
    if (existingOwner) {
      return res.status(400).json({ message: 'Owner already exists. Contact admin.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const owner = await User.create({ name, email, password: hashed, role: 'owner' });

    res.status(201).json({
      message: 'Owner account created',
      token: generateToken(owner),
      user: { id: owner._id, name: owner.name, email: owner.email, role: owner.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    res.json({
      token: generateToken(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// Owner creates a Staff/Cashier account
exports.createStaff = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const staff = await User.create({ name, email, password: hashed, role: 'staff' });

    res.status(201).json({
      message: 'Staff created successfully',
      staff: { id: staff._id, name: staff.name, email: staff.email, role: staff.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getAllStaff = async (req, res) => {
  try {
    const staff = await User.find({ role: 'staff' }).select('-password');
    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const staff = await User.findOne({ _id: req.params.id, role: 'staff' });
    if (!staff) return res.status(404).json({ message: 'Staff member not found' });

    const [bills, wastage, returns, batches, ordered, received, products, suppliers, discounts] = await Promise.all([
      Bill.exists({ cashier: staff._id }),
      Wastage.exists({ recordedBy: staff._id }),
      Return.exists({ processedBy: staff._id }),
      StockBatch.exists({ receivedBy: staff._id }),
      PurchaseOrder.exists({ orderedBy: staff._id }),
      PurchaseOrder.exists({ receivedBy: staff._id }),
      Product.exists({ createdBy: staff._id }),
      Supplier.exists({ createdBy: staff._id }),
      Discount.exists({ createdBy: staff._id }),
    ]);

    if (bills || wastage || returns || batches || ordered || received || products || suppliers || discounts) {
      staff.isActive = false;
      await staff.save();
      return res.json({ message: 'Staff member has history and was deactivated', deactivated: true });
    }

    await staff.deleteOne();
    res.json({ message: 'Staff removed', deactivated: false });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
