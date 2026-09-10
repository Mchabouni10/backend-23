
//database.js
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI, {
  // Fail fast instead of hanging when Atlas/the cluster is asleep or unreachable.
  serverSelectionTimeoutMS: 8000,
  socketTimeoutMS: 20000,
  maxPoolSize: 10,
})
  .then(() => {
    const db = mongoose.connection;
    console.log(`✅ Connected to ${db.name} at ${db.host}`);
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

module.exports = mongoose;
