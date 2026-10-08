const express = require('express');
const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');

const bill = require('../controllers/billController');

// Owner + Staff/Cashier
router.post('/preview', protect, authorize('owner', 'staff'), bill.previewBill);
router.post('/', protect, authorize('owner', 'staff'), bill.createBill);
router.get('/', protect, authorize('owner', 'staff'), bill.getBills);

// Owner only (keep before '/:id' so "summary" isn't treated as an id)
router.get('/summary/today', protect, authorize('owner', 'staff'), bill.getSalesSummary);
router.patch('/:id/cancel', protect, authorize('owner'), bill.cancelBill);

router.get('/:id', protect, authorize('owner', 'staff'), bill.getBillById);

module.exports = router;
