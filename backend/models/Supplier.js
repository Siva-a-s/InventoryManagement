const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    // products this supplier provides (shown in the supplier details,
    // and used later to pick a supplier when placing a purchase order)
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    // switch off instead of deleting, so old stock records keep their supplier
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 1 });

module.exports = mongoose.model('Supplier', supplierSchema);