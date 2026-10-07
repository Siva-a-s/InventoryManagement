const express = require('express');
const router = express.Router();


const protect = require('../middleware/auth.js');
const authorize = require('../middleware/roleCheck.js');

const {
  addBatch,
  addBulk,
  getBatches,
  getProductStock,
  getStockSummary,
  getBatch,
  updateBatch,
  deleteBatch,
  getPurchaseHistory,
} = require('../controllers/stockController');

router.use(protect); // must be logged in for everything below

// Owner + Staff/Cashier: stock-in and viewing
router.post('/', authorize('owner', 'staff'), addBatch);
// router.post('/bulk', authorize('owner', 'staff'), addBulk);
router.get('/', authorize('owner', 'staff'), getBatches);
// router.get('/summary', authorize('owner', 'staff'), getStockSummary);
router.get('/product/:productId', authorize('owner', 'staff'), getProductStock);
// router.get('/history', authorize('owner', 'staff'), getPurchaseHistory);
router.get('/:id', authorize('owner', 'staff'), getBatch);

// Owner only: corrections and deletion
router.put('/:id', authorize('owner'), updateBatch);
router.delete('/:id', authorize('owner'), deleteBatch);

module.exports = router;

