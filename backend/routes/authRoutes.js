const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const authorize = require('../middleware/roleCheck');
const {
  signup, login, createStaff, getAllStaff, deleteStaff
} = require('../controllers/authController');

router.post('/signup', signup);
router.post('/login', login);

router.post('/staff', protect, authorize('owner'), createStaff);
router.get('/staff', protect, authorize('owner'), getAllStaff);
router.delete('/staff/:id', protect, authorize('owner'), deleteStaff);

module.exports = router;
