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
router.get('/fast-moving', c.getFastMovingProducts);
router.get('/purchase-analysis', c.getPurchaseAnalysis);
router.get('/supplier-purchases', c.getSupplierPurchaseAnalysis);
router.get('/profitability',c.getProfitability);
router.get('/product-profitability',c.getProductProfitability);
router.get(
  '/inventory-health',
  c.getInventoryHealth
);
router.get('/revenue-summary', c.getRevenueSummary);
router.get('/sales-by-category', c.getSalesByCategory);

module.exports = router;