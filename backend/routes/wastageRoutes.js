const express = require('express');
const router = express.Router();

const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');
const c = require('../controllers/wastageController');

router.use(protect);
router.use(authorize('owner'));

router.get('/summary', c.getWastageSummary);
router.post('/write-off-expired', c.writeOffExpired);

router.get('/', c.getWastage);
router.post('/', c.recordWastage);

module.exports = router;