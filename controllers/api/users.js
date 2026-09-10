//user.js in controller


const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../../models/user');

const TOKEN_TTL = '24h';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

module.exports = {
  create,
  login,
  logout,
  me,
  refresh,
};

async function create(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.create({ name: name.trim(), email: normalizedEmail, password });
    res.status(201).json(issueAuth(res, user));
  } catch (e) {
    // Duplicate email
    if (e && e.code === 11000) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    res.status(400).json({ error: e.message });
  }
}

async function login(req, res) {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    // Use bcrypt.compare against a dummy hash when the user is not found, so
    // the response time is similar whether the email exists or not. This
    // makes user enumeration via timing harder.
    const hash = user ? user.password : '$2b$10$invalidsaltinvalidsaltinvalidsaltinvalidsalt00';
    const match = await bcrypt.compare(password, hash);
    if (!user || !match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.status(200).json(issueAuth(res, user));
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
}

async function logout(req, res) {
  clearAuthCookie(res);
  res.status(200).json({ ok: true });
}

async function me(req, res) {
  res.status(200).json({
    user: publicUser(req.user),
    expiresAt: expiryFromRequest(req),
  });
}

async function refresh(req, res) {
  res.status(200).json(issueAuth(res, req.user));
}

/* Helper Functions */

function createJWT(user) {
  // Sign only the user's id. Never embed the user document — that would
  // leak the bcrypt hash into every token (tokens are base64, not encrypted).
  return jwt.sign(
    { id: user._id.toString() },
    process.env.SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function issueAuth(res, user) {
  const token = createJWT(user);
  setAuthCookie(res, token);
  const decoded = jwt.decode(token);
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000).toISOString()
    : new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  return { token, user: publicUser(user), expiresAt };
}

function expiryFromRequest(req) {
  if (req.exp instanceof Date && !Number.isNaN(req.exp.getTime())) {
    return req.exp.toISOString();
  }
  return new Date(Date.now() + TOKEN_TTL_MS).toISOString();
}

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
  };
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax', // 'none' so the cookie works for the
    // Capacitor mobile WebView cross-site; 'lax' is sufficient for local dev.
    maxAge: TOKEN_TTL_MS,
    path: '/',
  });
}

function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('token', {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
}