const express = require('express');
const router = express.Router();

const protect = require('../middleware/auth');
const c = require('../controllers/returnController');

router.use(protect);

router.get('/', c.getReturns);
router.post('/', c.createReturn);
router.get('/:id', c.getReturn);

module.exports = router;