const mongoose = require('mongoose');

const stockBatchSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
      index: true,
    },
    batchNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    // Quantity received in this purchase (never changes after entry, unless corrected)
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    // What is left in this batch. Module 4 (billing) will reduce this.
    remainingQuantity: {
      type: Number,
      min: [0, 'Remaining quantity cannot be negative'],
    },
    costPrice: {
      type: Number,
      min: [0, 'Cost price cannot be negative'],
      default: 0,
    },
    // Optional: non-perishable items can leave this empty
    expiryDate: {
      type: Date,
      default: null,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    supplier: { 
      type: mongoose.Schema.Types.ObjectId,
       ref: 'Supplier' 
      },
    invoiceNumber: { 
      type: String,
       trim: true
       },
       // How this stock entered the inventory
    sourceType: {
       type: String,
      enum: ['manual', 'purchase_order'],
      default: 'manual',
      required: true,
      },

// Filled only when stock came from a purchase order
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      default: null,
      },

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: { 
      type: String, 
      trim: true 
    },
  },
  { timestamps: true }
);

// Same product can't have two batches with the same batch number
stockBatchSchema.index(
  { product: 1, batchNumber: 1 },
  { unique: true, partialFilterExpression: { batchNumber: { $type: 'string' } } }
);
// Fast FEFO (first-expiry-first-out) lookups
stockBatchSchema.index({ product: 1, expiryDate: 1 });

stockBatchSchema.index({ purchaseOrder: 1 });

// On first save, remaining = quantity; auto-generate batch number if none given
stockBatchSchema.pre('validate', function () {
  if (this.isNew) {
    if (this.remainingQuantity === undefined || this.remainingQuantity === null) {
      this.remainingQuantity = this.quantity;
    }
    if (!this.batchNumber) {
      const d = new Date();
      const stamp = d.toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      this.batchNumber = `B${stamp}-${rand}`;
    }
  }
  if (this.remainingQuantity > this.quantity) {
    throw new Error('Remaining quantity cannot exceed batch quantity');
  }
});

stockBatchSchema.virtual('isExpired').get(function () {
  return !!this.expiryDate && this.expiryDate < new Date();
});

stockBatchSchema.set('toJSON', { virtuals: true });
stockBatchSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('StockBatch', stockBatchSchema);