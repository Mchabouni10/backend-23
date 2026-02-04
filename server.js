require('dotenv').config();
require('./config/database');
const express = require('express');
const logger = require('morgan');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// ---------- CORS CONFIG ----------
const rawOrigins = process.env.ALLOWED_ORIGINS;
const allowedOrigins = rawOrigins && rawOrigins.trim() !== ''
  ? rawOrigins.split(',').map(o => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://rawdahcalculator.vercel.app',
      'https://backend-23-czrd.onrender.com'
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
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
app.use(express.urlencoded({ extended: true }));

// ---------- ROUTES (NO GLOBAL TOKEN CHECK) ----------
// Let individual routes handle authentication
app.use('/api/users', require('./routes/api/users'));
app.use('/api/projects', require('./routes/api/projects'));
app.use('/api/expenses', require('./routes/api/expenses'));

// ---------- HEALTH CHECK ----------
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
      health: '/health'
    }
  });
});

// ---------- 404 HANDLER ----------
app.use((req, res) => {
  console.warn(`⚠️ 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// ---------- ERROR HANDLER ----------
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  
  // Handle specific error types
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
  console.log(`🚀 Express running on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Available routes:`);
  console.log(`   - POST   /api/users/signup`);
  console.log(`   - POST   /api/users/login`);
  console.log(`   - GET    /api/projects`);
  console.log(`   - GET    /api/expenses`);
  console.log(`   - POST   /api/expenses`);
  console.log(`   - GET    /api/expenses/dashboard`);
  console.log(`   - DELETE /api/expenses/:id`);
  console.log(`   - GET    /health`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
});

module.exports = app;