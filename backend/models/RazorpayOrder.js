const mongoose = require('mongoose');

const razorpayOrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    unit: String,
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    offerName: String,
  },
  { _id: false }
);

const razorpayOrderSchema = new mongoose.Schema(
  {
    razorpayOrderId: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [razorpayOrderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, required: true },
    total: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'payment_verified', 'paid'],
      default: 'pending',
    },
    razorpayPaymentId: { type: String, sparse: true, unique: true },
    paymentVerifiedAt: Date,
    bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RazorpayOrder', razorpayOrderSchema);
