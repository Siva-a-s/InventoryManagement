const express = require("express");
const router = express.Router();

const {
  addProduct,
  getProducts,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

const protect = require("../middleware/auth");
const authorize = require("../middleware/roleCheck");

router.get("/", protect, getProducts);
// router.get("/:id", protect, getProductById);

router.post("/", protect, authorize("owner"), addProduct);
router.put("/:id", protect, authorize("owner"), updateProduct);
router.delete("/:id", protect, authorize("owner"), deleteProduct);

module.exports = router;
