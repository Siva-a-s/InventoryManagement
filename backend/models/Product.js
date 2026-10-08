const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
       type: mongoose.Schema.Types.ObjectId,
       ref: "Category",
       required: true,
    },
    unit: {
      type: String, // e.g. "kg", "pcs", "litre", "box"
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    barcode: {
      type: String,
      unique: true,
      sparse: true, // allows products without a barcode too
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reorderLevel: {
      type: Number,
      default: 10,
      min: 0,
    },
    expiryAlertDays: {
      type: Number,
      default: 30,
      min: 1,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
