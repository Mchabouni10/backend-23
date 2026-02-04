
//database.js
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    const db = mongoose.connection;
    console.log(`✅ Connected to ${db.name} at ${db.host}`);

    if (db.name !== 'Calculator23') {
      throw new Error(`❌ Connected to wrong database: ${db.name}`);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

module.exports = mongoose;
