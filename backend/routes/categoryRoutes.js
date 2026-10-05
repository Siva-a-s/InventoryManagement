const express = require('express');
const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');

const {
  addCategory,
  getCategories,
  deleteCategory,
  getCategorySummary
} = require('../controllers/categoryController');

router.get('/', protect, getCategories);
router.get('/summary', protect, getCategorySummary);

router.post('/', protect, authorize('owner'), addCategory);
router.delete('/:id', protect, authorize('owner'), deleteCategory);

module.exports = router;