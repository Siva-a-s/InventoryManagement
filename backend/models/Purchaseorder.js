const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

const itemSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitCost: { type: Number, required: true, min: 0 },
  expiryDate: Date, // optional at order time; can be given when receiving
  batch: { type: Schema.Types.ObjectId, ref: 'StockBatch' }, // filled once received
});

const purchaseOrderSchema = new Schema(
  {
    poNumber: { type: String, unique: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: {
      type: [itemSchema],
      validate: [(v) => v.length > 0, 'A purchase order needs at least one item'],
    },
    totalAmount: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'received', 'cancelled'], default: 'pending' },
    expectedDate: Date,
    notes: String,
    orderedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receivedByName: { type: String, trim: true },
    receivedAt: Date,
    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ status: 1, createdAt: -1 });

purchaseOrderSchema.pre('validate', function () {
  if (!this.poNumber) {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.poNumber = `PO-${ymd}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  }
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
