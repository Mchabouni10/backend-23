require('dotenv').config();
require('./config/database');
const express = require('express');
const logger = require('morgan');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// ---------- CORS CONFIG ----------
/*
  This logic:
  - Allows http://localhost:3000 for local development
  - Allows your Render frontend domain (if set in ALLOWED_ORIGINS)
  - Falls back to allowing all origins if none specified
*/

const rawOrigins = process.env.ALLOWED_ORIGINS;
const allowedOrigins = rawOrigins && rawOrigins.trim() !== ''
  ? rawOrigins.split(',').map(o => o.trim())
 : [
    'http://localhost:3000',
    'https://rawdahcalculator.vercel.app',
    'https://backend-23-czrd.onrender.com'
  ];


app.use(cors({
  origin: function (origin, callback) {
    // Allow requests from allowed origins or no origin (Postman, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`❌ CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  maxAge: 86400
}));

console.log('✅ Allowed Origins:', allowedOrigins.join(', '));

// ---------- BASIC MIDDLEWARE ----------
app.use(logger('dev'));
app.use(express.json());

// ---------- TOKEN CHECK MIDDLEWARE ----------
app.use((req, res, next) => {
  // Skip token check for login/signup routes
  if (
    req.path === '/api/users/login' ||
    req.path === '/api/users/signup' ||
    req.path === '/api/users/register'
  ) {
    return next();
  }
  return require('./config/checkToken')(req, res, next);
});

// ---------- ROUTES ----------
app.use('/api/users', require('./routes/api/users'));
app.use('/api/projects', require('./routes/api/projects'));

// ---------- START SERVER ----------
app.listen(port, () => {
  console.log(`🚀 Express running on port ${port}`);
});
