/**
 * scripts/audit-contacts.js
 *
 * Run this BEFORE and AFTER deploying the contacts update.
 *
 *   node scripts/audit-contacts.js            → READ-ONLY report (changes nothing)
 *   node scripts/audit-contacts.js --apply    → also applies the ONE safe fix:
 *                                               store phones as 10 digits and
 *                                               emails trimmed/lowercase
 *
 * It never deletes, merges, or re-links anything. Duplicates and broken links
 * are only REPORTED so you decide what to do.
 *
 * Connection string: reads DATABASE_URL or MONGODB_URI from the environment
 * (or .env). Change the line below if your project uses another name.
 */
try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

const mongoose = require('mongoose');
const Customer = require('../models/customer');
const Project = require('../models/project');
const { normalizeUSPhone, normalizeEmail, isValidUSPhone } = require('../utils/contactRules');

const APPLY = process.argv.includes('--apply');
const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;

const label = (c) => `${c.firstName} ${c.lastName} <${c.email}> ${c.phone}`;

(async () => {
  if (!uri) {
    console.error('No DATABASE_URL / MONGODB_URI found in the environment.');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const customers = await Customer.find({}).lean();
  const projects = await Project.find({})
    .select('_id userId customerId contactLinkState customerInfo.firstName customerInfo.lastName')
    .lean();

  console.log(`\nContacts: ${customers.length}   Projects: ${projects.length}   Mode: ${APPLY ? 'APPLY' : 'read-only'}\n`);

  // 1) Records that would fail today's validation if fully re-saved
  const invalid = [];
  for (const c of customers) {
    const err = new Customer(c).validateSync();
    if (err) invalid.push({ c, problems: Object.values(err.errors).map((e) => e.message) });
  }
  console.log(`1) Contacts failing current validation: ${invalid.length}`);
  invalid.slice(0, 25).forEach(({ c, problems }) => console.log(`   - ${label(c)} [${c._id}] → ${problems.join('; ')}`));

  // 2) Phone / email not stored in normalized form
  const unnormalized = customers.filter(
    (c) => normalizeUSPhone(c.phone) !== c.phone || normalizeEmail(c.email) !== c.email
  );
  console.log(`\n2) Contacts with un-normalized phone/email: ${unnormalized.length}`);
  let fixed = 0;
  for (const c of unnormalized) {
    const phone = normalizeUSPhone(c.phone);
    const email = normalizeEmail(c.email);
    const phoneOk = isValidUSPhone(phone);
    console.log(`   - ${label(c)} → phone ${c.phone} → ${phone}${phoneOk ? '' : '  (INVALID, left untouched)'}`);
    if (APPLY) {
      const $set = {};
      if (phoneOk && phone !== c.phone) $set.phone = phone;
      if (email && email !== c.email) $set.email = email;
      if (Object.keys($set).length) {
        await Customer.collection.updateOne({ _id: c._id }, { $set });
        fixed += 1;
      }
    }
  }
  if (APPLY) console.log(`   → normalized ${fixed} contact(s)`);

  // 3) Possible duplicates (reported only)
  const groups = (keyFn) => {
    const m = new Map();
    customers.forEach((c) => {
      const k = keyFn(c);
      if (k) m.set(k, [...(m.get(k) || []), c]);
    });
    return [...m.values()].filter((g) => g.length > 1);
  };
  const dupEmail = groups((c) => `${c.userId}|${normalizeEmail(c.email)}`);
  const dupPhone = groups((c) => `${c.userId}|${normalizeUSPhone(c.phone)}|${String(c.lastName).trim().toLowerCase()}`);
  console.log(`\n3) Possible duplicate groups — same email: ${dupEmail.length}, same phone+last name: ${dupPhone.length}`);
  [...dupEmail, ...dupPhone].slice(0, 25).forEach((g) => {
    console.log('   - ' + g.map((c) => `${c.firstName} ${c.lastName} [${c._id}]`).join('  |  '));
  });
  console.log('   (shared emails between spouses are normal — review, don\'t auto-merge)');

  // 4) Project ↔ contact link health
  const ids = new Set(customers.map((c) => String(c._id)));
  const orphan = projects.filter((p) => p.customerId && !ids.has(String(p.customerId)));
  const contradictory = projects.filter((p) => p.contactLinkState === 'unlinked' && p.customerId);
  const notLinkedYet = projects.filter((p) => !p.customerId && p.contactLinkState !== 'unlinked');
  const intentionallyUnlinked = projects.filter((p) => !p.customerId && p.contactLinkState === 'unlinked');
  console.log('\n4) Project ↔ contact links');
  console.log(`   linked correctly:                 ${projects.length - orphan.length - notLinkedYet.length - intentionallyUnlinked.length}`);
  console.log(`   point to a contact that is GONE:  ${orphan.length}`);
  console.log(`   marked unlinked but still linked: ${contradictory.length}`);
  console.log(`   not linked yet (sync candidates): ${notLinkedYet.length}`);
  console.log(`   intentionally unlinked:           ${intentionallyUnlinked.length}`);
  orphan.slice(0, 15).forEach((p) => console.log(`   - orphan: project ${p._id} → missing contact ${p.customerId}`));

  console.log('\nDone. Nothing was deleted, merged or re-linked.\n');
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});