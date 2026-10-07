const express = require('express');
const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');

const {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
} = require('../controllers/supplierController');

// owner + staff can view (staff need the list for the stock-entry dropdown)
router.get('/', protect, authorize('owner', 'staff'), getSuppliers);
// router.get('/:id', protect, authorize('owner', 'staff'), getSupplierById);

// only the owner can change suppliers
router.post('/', protect, authorize('owner'), createSupplier);
router.put('/:id', protect, authorize('owner'), updateSupplier);
router.delete('/:id', protect, authorize('owner'), deleteSupplier);

module.exports = router;