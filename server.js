require('dotenv').config();
require('./config/database');
const express = require('express');
const logger = require('morgan');
const cors = require('cors');
const port = process.env.PORT || 3001;
const app = express();

// CORS configuration - allow requests from any origin
// For production, you can restrict this by setting ALLOWED_ORIGINS in your .env file
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : null; // null means allow all origins

app.use(cors({
  origin: function (origin, callback) {
    // If no specific origins are configured, allow all
    if (!allowedOrigins) {
      return callback(null, true);
    }
    
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization'],
  maxAge: 86400 // 24 hours - cache preflight requests
}));

// Basic middleware
app.use(logger('dev'));
app.use(express.json());

// Apply checkToken middleware conditionally - skip for login/signup routes
app.use((req, res, next) => {
  // Skip token check for login and signup routes
  if (req.path === '/api/users/login' || req.path === '/api/users/signup' || req.path === '/api/users/register') {
    return next();
  }
  // Apply token check for all other routes
  return require('./config/checkToken')(req, res, next);
});

// API Routes
app.use('/api/users', require('./routes/api/users'));
app.use('/api/projects', require('./routes/api/projects'));

// Listener
app.listen(port, () => console.log(`Express running on port ${port}`));