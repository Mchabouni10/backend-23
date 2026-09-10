// config/checkToken.js
//
// Reads the JWT from either:
//   - the Authorization: Bearer <token> header, OR
//   - the HttpOnly `token` cookie (set by the login/signup handlers).
// Query-string tokens are intentionally NOT supported — they leak into
// access logs and Referer headers.
//
// On invalid or expired tokens, throws an UnauthorizedError so the global
// error handler in server.js returns a 401 — instead of silently passing
// through with req.user = null.
//
// The JWT payload carries only { id }. The full user document is fetched
// from MongoDB per request so we never embed the bcrypt hash in a token.

const jwt = require('jsonwebtoken');
const User = require('../models/user');

// Tagged error so the global error handler in server.js returns 401.
// Matches the shape that was already being detected there.
class TokenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
    this.status = 401;
  }
}

function extractToken(req) {
  const header = req.get('Authorization');
  if (header && header.startsWith('Bearer ')) {
    const t = header.slice('Bearer '.length).trim();
    if (t) return t;
  }
  // HttpOnly cookie path (set by controllers/api/users.js).
  // Cookie header parsing is deliberately tiny — we only care about a single
  // named cookie and want to avoid adding cookie-parser as a dependency.
  const raw = req.get('Cookie') || req.headers?.cookie || '';
  if (raw) {
    for (const part of raw.split(';')) {
      const [k, ...v] = part.split('=');
      if (k && k.trim() === 'token') {
        return decodeURIComponent(v.join('=').trim());
      }
    }
  }
  return null;
}

module.exports = async function checkToken(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    // No credentials presented — let ensureLoggedIn decide.
    return next();
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.SECRET);
  } catch (err) {
    return next(new TokenError('Invalid or expired token'));
  }

  if (!payload || !payload.id) {
    return next(new TokenError('Invalid token payload'));
  }

  try {
    const user = await User.findById(payload.id).select('-password');
    if (!user) return next(new TokenError('User no longer exists'));
    req.user = user;
    req.exp = payload.exp ? new Date(payload.exp * 1000) : null;
    return next();
  } catch (err) {
    return next(err);
  }
};