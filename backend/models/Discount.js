const mongoose = require('mongoose');

const discountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },       // e.g. "Diwali offer"
    type: { type: String, enum: ['percent', 'amount'], required: true },
    value: { type: Number, required: true, min: 0 },          // percent, or rupees off per unit
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },               // owner can switch an offer off early
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Discount', discountSchema);