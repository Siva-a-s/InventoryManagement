const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

const REASONS = ['damaged', 'expired', 'wrong_item', 'quality_issue', 'changed_mind', 'other'];

const returnBatchSchema = new Schema({
  batch: { type: Schema.Types.ObjectId, ref: 'StockBatch' },
  quantity: { type: Number, min: 1 },
  unitCost: { type: Number, min: 0 },
}, { _id: false });

const returnItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true },
    refundAmount: { type: Number, required: true },
    reason: { type: String, enum: REASONS, default: 'other' },
    restocked: { type: Boolean, default: false },
    restockedBatch: { type: Schema.Types.ObjectId, ref: 'StockBatch' },
    originalBatches: { type: [returnBatchSchema], default: undefined },
    wastageWrittenOff: { type: Boolean, default: false },
    wastageWrittenOffAt: Date,
    wastageWrittenOffBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const razorpayRefundSchema = new Schema({
  idempotencyKey: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['pending', 'processed', 'failed'], required: true },
  refundId: String,
  requestedAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
}, { _id: false });

const returnSchema = new Schema(
  {
    returnNumber: { type: String, unique: true },
    bill: { type: Schema.Types.ObjectId, ref: 'Bill', required: true, index: true },
    items: [returnItemSchema],
    totalRefund: { type: Number, required: true },
    refundMethod: { type: String, enum: ['cash', 'upi', 'card', 'store_credit', 'razorpay'], default: 'cash' },
    razorpayRefund: { type: razorpayRefundSchema, default: undefined },
    note: String,
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    processedByName: { type: String, trim: true },
  },
  { timestamps: true }
);

returnSchema.pre('validate', function () {
  if (!this.returnNumber) {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    this.returnNumber = `RET-${ymd}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  }
});

const Return = mongoose.model('Return', returnSchema);
Return.REASONS = REASONS;
module.exports = Return;
