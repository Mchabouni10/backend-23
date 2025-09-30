require('dotenv').config();
require('./config/database');
const express = require('express');
const logger = require('morgan');
const cors = require('cors');
const port = process.env.PORT || 3001;
const app = express();

// CORS configuration - allow both local development and production
const allowedOrigins = [
  'http://localhost:3000',           // Local React development server
  'https://your-frontend-domain.com' // Replace with your actual production domain
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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