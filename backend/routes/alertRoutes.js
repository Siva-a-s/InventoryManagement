const express = require('express');

const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');

const {
  getAlerts,
  getLowStockAlerts,
  getExpiryAlerts,
  getAlertCount
} = require('../controllers/alertController');

router.use(protect);
router.use(authorize('owner','staff'));

router.get('/', getAlerts);

router.get('/count', getAlertCount);

router.get('/low-stock', getLowStockAlerts);

router.get('/expiry', getExpiryAlerts);

module.exports = router;

