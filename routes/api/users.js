// users in route

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const usersCtrl = require('../../controllers/api/users');
const ensureLoggedIn = require('../../config/ensureLoggedIn');

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
// GET /api/users/me — current user + token expiry (session bootstrap)
router.get('/me', ensureLoggedIn, usersCtrl.me);
// POST /api/users/refresh — sliding session: issue a new 24h JWT
router.post('/refresh', ensureLoggedIn, usersCtrl.refresh);

module.exports = router;