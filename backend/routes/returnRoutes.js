const express = require('express');
const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');
const c = require('../controllers/returnController');

router.use(protect);

router.get('/', c.getReturns);
router.post('/', c.createReturn);
router.post('/:id/razorpay-refund', authorize('owner'), c.refundReturnWithRazorpay);
router.post('/:id/write-off-wastage', authorize('owner'), c.writeOffReturnAsWastage);
router.get('/:id', c.getReturn);

module.exports = router;
