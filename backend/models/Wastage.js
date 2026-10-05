const mongoose = require('mongoose');
const { Schema } = mongoose;

const REASONS = ['expired', 'damaged', 'spoiled', 'lost', 'other'];

const wastageSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    quantity: { type: Number, required: true, min: 0 },
    reason: { type: String, enum: REASONS, required: true },
    unitCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 }, // quantity × unitCost = money lost
    notes: String,
    automatic: { type: Boolean, default: false }, // true when created by "write off expired"
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

wastageSchema.index({ createdAt: -1 });

const Wastage = mongoose.model('Wastage', wastageSchema);
Wastage.REASONS = REASONS;
module.exports = Wastage;