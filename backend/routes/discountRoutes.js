const express = require('express');
const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');

const {
  createDiscount,
  getDiscounts,
  updateDiscount,
  deleteDiscount
} = require('../controllers/discountController');

router.post('/', protect, authorize('owner'), createDiscount);
router.get('/', protect, authorize('owner'), getDiscounts);
router.put('/:id', protect, authorize('owner'), updateDiscount);
router.delete('/:id', protect, authorize('owner'), deleteDiscount);

module.exports = router;