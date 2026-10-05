const express = require('express');
const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');
const c = require('../controllers/reportController');

router.use(protect);
router.use(authorize('owner'));

router.get('/dashboard', c.getDashboard);
router.get('/sales', c.getSalesTrend);
router.get('/top-products', c.getTopProducts);
router.get('/revenue-summary', c.getRevenueSummary);
router.get('/sales-by-category', c.getSalesByCategory);

module.exports = router;