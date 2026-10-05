const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
  const staff = await User.find({ role: 'staff' }).select('-password');
  res.json(staff);
};

exports.deleteStaff = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'Staff removed' });
};

exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
};