require('dotenv').config();
const mongoose = require('mongoose');

async function backfillPaymentType() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to DB');

  const db = mongoose.connection.db;
  const projects = await db.collection('projects')
    .find({ 'settings.payments.0': { $exists: true } })
    .toArray();

  let updatedProjects = 0;
  let updatedPayments = 0;

  for (const project of projects) {
    let changed = false;
    const payments = project.settings.payments.map(p => {
      if (!p.type && p.paymentType) {
        changed = true;
        updatedPayments++;
        return { ...p, type: p.paymentType };
      }
      return p;
    });

    if (changed) {
      await db.collection('projects').updateOne(
        { _id: project._id },
        { $set: { 'settings.payments': payments } }
      );
      updatedProjects++;
    }
  }

  console.log(`✅ Backfilled ${updatedProjects} projects, ${updatedPayments} payments.`);
  await mongoose.disconnect();
  process.exit(0);
}

backfillPaymentType().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});