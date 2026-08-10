// users in route

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const usersCtrl = require('../../controllers/api/users');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

// POST /api/users — signup
router.post('/', authLimiter, usersCtrl.create);
// POST /api/users/login
router.post('/login', authLimiter, usersCtrl.login);
// POST /api/users/logout — clears the HttpOnly auth cookie
router.post('/logout', usersCtrl.logout);

module.exports = router;