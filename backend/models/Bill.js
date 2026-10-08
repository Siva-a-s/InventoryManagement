const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },      // snapshot at time of sale
    unit: { type: String },
    price: { type: Number, required: true },     // unit price at time of sale
    quantity: { type: Number, required: true, min: 0.001 },
    lineTotal: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    offerName: String,
    // Which batches this sale was taken from (needed to restore stock on cancel)
    batches: [
      {
        _id: false,
        batch: { type: mongoose.Schema.Types.ObjectId, ref: 'StockBatch', required: true },
        quantity: { type: Number, required: true },
        costPrice: { type: Number, min: 0 },
      },
    ],
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    billNumber: { type: String, required: true, unique: true },
    items: { type: [billItemSchema], validate: (v) => v.length > 0 },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['cash', 'upi', 'card'], default: 'cash' },
    amountPaid: { type: Number, required: true },
    changeGiven: { type: Number, default: 0 },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancelReason: { type: String },
  },
  { timestamps: true }
);

billSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Bill', billSchema);
