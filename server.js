require('dotenv').config();

if (!process.env.SECRET) {
  console.error('❌ SECRET is not set. Add SECRET to your .env file.');
  process.exit(1);
}
if (process.env.SECRET.length < 32) {
  console.error('❌ SECRET must be at least 32 characters. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"');
  process.exit(1);
}

require('./config/database');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const devLogger = require('./utils/logger');

const checkToken = require('./config/checkToken');
const ensureLoggedIn = require('./config/ensureLoggedIn');

const app = express();
const port = process.env.PORT || 3001;

// Trust the first proxy (Render, Vercel, etc.) so express-rate-limit and
// req.ip see the real client IP instead of the proxy IP.
app.set('trust proxy', 1);

// ---------- SECURITY HEADERS ----------
// Helmet sets a number of safe-by-default headers. We disable
// crossOriginResourcePolicy because the API serves cross-origin requests
// (the frontend at a different host, the Capacitor WebView, etc.) and that
// policy would block them.
app.use(helmet({ crossOriginResourcePolicy: false }));

// ---------- CORS CONFIG ----------
const rawOrigins = process.env.ALLOWED_ORIGINS;
const allowedOrigins = rawOrigins && rawOrigins.trim() !== ''
  ? rawOrigins.split(',').map(o => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173'
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Reject requests with no Origin header except for the health check.
    // (Mobile apps / Postman can hit /health directly; they have no use for
    // /api/* endpoints without an Origin.)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    devLogger.warn(`❌ CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  maxAge: 86400
}));

devLogger.log('✅ Allowed Origins:', allowedOrigins.join(', '));

// ---------- BASIC MIDDLEWARE ----------
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------- RATE LIMITS ----------
// Loose global limit so a single IP can't drain the server; strict limit on
// mutating endpoints.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many write requests. Please slow down.' },
});

app.use(globalLimiter);

// ---------- AUTH (GLOBAL) ----------
// checkToken attaches req.user if a valid JWT is presented (header or cookie).
// ensureLoggedIn then 401s anything missing req.user.
// /api/users is mounted BEFORE ensureLoggedIn so signup/login still work.
app.use(checkToken);

app.use('/api/users', require('./routes/api/users'));

// Anything below this line requires authentication.
app.use(ensureLoggedIn);

app.use('/api/projects', writeLimiter, require('./routes/api/projects'));
app.use('/api/expenses', writeLimiter, require('./routes/api/expenses'));
app.use('/api/work-types', writeLimiter, require('./routes/api/workTypes'));

// ---------- HEALTH CHECK (public) ----------
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});

// ---------- ROOT ENDPOINT ----------
app.get('/', (req, res) => {
  res.json({
    message: 'Rawdah Calculator API',
    version: '1.0.0',
    endpoints: {
      users: '/api/users',
      projects: '/api/projects',
      expenses: '/api/expenses',
      workTypes: '/api/work-types',
      health: '/health'
    }
  });
});

// ---------- 404 HANDLER ----------
app.use((req, res) => {
  devLogger.warn(`⚠️ 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Invalid or expired token'
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.message
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ---------- START SERVER ----------
app.listen(port, () => {
  devLogger.log(`🚀 Express running on port ${port}`);
  devLogger.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  devLogger.log(`📁 Available routes:`);
  devLogger.log(`   - POST   /api/users/signup`);
  devLogger.log(`   - POST   /api/users/login`);
  devLogger.log(`   - POST   /api/users/logout`);
  devLogger.log(`   - GET    /api/users/me`);
  devLogger.log(`   - POST   /api/users/refresh`);
  devLogger.log(`   - GET    /api/projects`);
  devLogger.log(`   - POST   /api/projects`);
  devLogger.log(`   - GET    /api/expenses`);
  devLogger.log(`   - POST   /api/expenses`);
  devLogger.log(`   - GET    /api/expenses/dashboard`);
  devLogger.log(`   - DELETE /api/expenses/:id`);
  devLogger.log(`   - GET    /api/work-types`);
  devLogger.log(`   - PATCH  /api/work-types/...`);
  devLogger.log(`   - DELETE /api/work-types/...`);
  devLogger.log(`   - GET    /health`);
});

// Handle unhandled promise rejections — exit in prod so the orchestrator
// restarts a clean process; in dev, log so we don't lose the dev server.
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  if (process.env.NODE_ENV === 'production') process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'production') process.exit(1);
});

module.exports = app;