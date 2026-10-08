const express = require('express');

const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');

const c = require('../controllers/purchaseorderController');

router.use(protect);

router.get('/summary', c.getPurchaseOrderSummary);

router
  .route('/')
  .get(c.getPurchaseOrders)
  .post(authorize('owner'), c.createPurchaseOrder);

router
  .route('/:id')
  .get(c.getPurchaseOrder)
  .put(authorize('owner'), c.updatePurchaseOrder);

router.patch('/:id/receive', authorize('owner', 'staff'), c.receivePurchaseOrder);

router.patch(
  '/:id/cancel',
  authorize('owner'),
  c.cancelPurchaseOrder
);

module.exports = router;
