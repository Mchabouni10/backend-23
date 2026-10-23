const Customer = require('../../models/customer');
const Project = require('../../models/project');
const logger = require('../../utils/logger');
const {
  normalizeUSPhone,
  normalizeEmail,
  isValidUSPhone,
  isValidZip,
  sameText,
} = require('../../utils/contactRules');

// ─── helpers ────────────────────────────────────────────────────────────────

const CONTACT_FIELDS = [
  'firstName', 'lastName', 'street', 'unit', 'city', 'state', 'zipCode',
  'phone', 'email', 'notes', 'addressNumber', 'direction', 'streetName', 'streetType',
];
const ADDRESS_PARTS = ['addressNumber', 'direction', 'streetName', 'streetType'];

const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whitelist + normalize. Only keys the caller actually sent are returned, so a
// partial update can never blank out a field the caller didn't mention.
function cleanBody(body = {}) {
  const cleaned = Object.fromEntries(
    CONTACT_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])
  );
  if (cleaned.phone !== undefined) cleaned.phone = normalizeUSPhone(cleaned.phone);
  if (cleaned.email !== undefined) cleaned.email = normalizeEmail(cleaned.email);
  // `street` is the source of truth. If a caller changes it without sending the
  // parsed components, clear the old components so they can't go stale.
  if (cleaned.street !== undefined && ADDRESS_PARTS.every((k) => cleaned[k] === undefined)) {
    ADDRESS_PARTS.forEach((k) => { cleaned[k] = ''; });
  }
  return cleaned;
}

function slim(c) {
  return {
    _id: c._id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    street: c.street,
    unit: c.unit,
    city: c.city,
    state: c.state,
    zipCode: c.zipCode,
    updatedAt: c.updatedAt,
  };
}

function sendError(res, err, context, fallbackMessage) {
  if (err && err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Customer validation failed.',
      details: Object.values(err.errors).map((e) => e.message),
    });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid customer id.' });
  }
  logger.error(`❌ customers.${context}:`, err);
  return res.status(500).json({ error: fallbackMessage });
}

// Possible duplicates of a contact for this user.
// A match is: same email, OR same phone + same last name.
// `exact` additionally means same first AND last name (safe to auto-reuse).
// Shared emails (spouses) are therefore NOT treated as the same person.
async function findDuplicates(userId, data, excludeId) {
  const email = normalizeEmail(data.email);
  const phone = normalizeUSPhone(data.phone);
  const last = String(data.lastName || '').trim();

  const or = [];
  if (email) or.push({ email });
  if (last) or.push({ lastName: new RegExp(`^${escapeRegExp(last)}$`, 'i') });
  if (!or.length) return [];

  const query = { userId, $or: or };
  if (excludeId) query._id = { $ne: excludeId };
  const candidates = await Customer.find(query).lean();

  const matches = [];
  for (const c of candidates) {
    const sameEmail = Boolean(email) && normalizeEmail(c.email) === email;
    const samePhone = Boolean(phone) && normalizeUSPhone(c.phone) === phone;
    const sameLast = sameText(c.lastName, data.lastName);
    const sameFirst = sameText(c.firstName, data.firstName);
    if (!(sameEmail || (samePhone && sameLast))) continue;
    matches.push({
      contact: c,
      exact: sameFirst && sameLast && (sameEmail || samePhone),
      reason: sameEmail ? 'email' : 'phone',
    });
  }
  matches.sort((a, b) => Number(b.exact) - Number(a.exact));
  return matches;
}

// ─── sync (legacy projects → contacts) ──────────────────────────────────────
// Safe to run repeatedly. Never overwrites an existing contact.
// Intended as a one-time/occasional repair tool, not a daily workflow.

const syncing = new Set(); // one sync per user at a time (double-click / two tabs)

async function syncFromProjects(req, res) {
  const lockKey = String(req.user._id);
  if (syncing.has(lockKey)) {
    return res.status(409).json({ error: 'A contact sync is already running. Try again in a moment.' });
  }
  syncing.add(lockKey);

  try {
    const [projects, customers] = await Promise.all([
      Project.find({ userId: req.user._id })
        // Only the snapshot fields we need — NOT the signature image etc.
        .select(
          '_id customerId contactLinkState ' +
          'customerInfo.firstName customerInfo.lastName customerInfo.street customerInfo.unit ' +
          'customerInfo.city customerInfo.state customerInfo.zipCode customerInfo.phone ' +
          'customerInfo.email customerInfo.addressNumber customerInfo.direction ' +
          'customerInfo.streetName customerInfo.streetType'
        )
        .lean(),
      Customer.find({ userId: req.user._id }).lean(),
    ]);

    const byId = new Map(customers.map((c) => [String(c._id), c]));
    // email → LIST of contacts (spouses/relatives can share one email)
    const byEmail = new Map();
    const addEmail = (c) => {
      const key = normalizeEmail(c.email);
      if (!key) return;
      byEmail.set(key, [...(byEmail.get(key) || []), c]);
    };
    customers.forEach(addEmail);
    const identityOf = (first, last, phone) => `${first}|${last}|${phone}`.trim().toLowerCase();
    const byIdentity = new Map(
      customers.map((c) => [identityOf(c.firstName, c.lastName, normalizeUSPhone(c.phone)), c])
    );

    let created = 0;
    let preserved = 0;
    let linked = 0;
    let skipped = 0;
    let failed = 0;
    let ignored = 0;
    const skippedDetails = [];

    for (const project of projects) {
      const info = project.customerInfo || {};
      const displayName =
        `${info.firstName || ''} ${info.lastName || ''}`.trim() || 'Unnamed project customer';

      try {
        // The user intentionally detached this project — never re-link it.
        if (project.contactLinkState === 'unlinked') {
          ignored += 1;
          continue;
        }

        const phone = normalizeUSPhone(info.phone);
        const email = normalizeEmail(info.email);
        const validPhone = isValidUSPhone(phone);
        const identityKey = validPhone ? identityOf(info.firstName, info.lastName, phone) : '';

        // 1) existing link  2) same name + phone  3) same email (carefully)
        let customer = project.customerId ? byId.get(String(project.customerId)) : null;
        if (!customer && identityKey) customer = byIdentity.get(identityKey) || null;
        if (!customer && email) {
          const list = byEmail.get(email) || [];
          if (list.length === 1) {
            if (!info.lastName || sameText(list[0].lastName, info.lastName)) {
              customer = list[0];
            } else {
              skipped += 1;
              skippedDetails.push({
                projectId: project._id,
                name: displayName,
                reasons: [`email already belongs to contact "${list[0].firstName} ${list[0].lastName}"`],
              });
              continue;
            }
          } else if (list.length > 1) {
            const named = list.filter(
              (c) => sameText(c.firstName, info.firstName) && sameText(c.lastName, info.lastName)
            );
            if (named.length === 1) {
              customer = named[0];
            } else {
              skipped += 1;
              skippedDetails.push({
                projectId: project._id,
                name: displayName,
                reasons: ['email is shared by several contacts — link this project manually'],
              });
              continue;
            }
          }
        }

        const missing = [];
        if (!info.firstName) missing.push('first name');
        if (!info.lastName) missing.push('last name');
        if (!info.street) missing.push('street');
        if (!info.city) missing.push('city');
        if (!info.state) missing.push('state');
        if (!isValidZip(info.zipCode)) missing.push('ZIP code');
        if (!validPhone) missing.push('valid US phone');
        if (!email) missing.push('email');

        if (!customer && missing.length) {
          skipped += 1;
          skippedDetails.push({ projectId: project._id, name: displayName, reasons: missing });
          continue;
        }

        let saved = customer;
        if (!saved) {
          const doc = await Customer.create({
            userId: req.user._id,
            firstName: info.firstName,
            lastName: info.lastName,
            street: info.street,
            unit: info.unit || '',
            city: info.city,
            state: info.state,
            zipCode: String(info.zipCode),
            phone,
            email,
            addressNumber: info.addressNumber,
            direction: info.direction,
            streetName: info.streetName,
            streetType: info.streetType,
          });
          saved = doc.toObject();
          created += 1;
          byId.set(String(saved._id), saved);
          addEmail(saved);
          byIdentity.set(identityOf(saved.firstName, saved.lastName, normalizeUSPhone(saved.phone)), saved);
        } else {
          // Project customerInfo is a historical snapshot. Never use a bulk
          // reconciliation to overwrite a real contact with old data.
          preserved += 1;
        }

        if (String(project.customerId || '') !== String(saved._id)) {
          await Project.updateOne(
            { _id: project._id, userId: req.user._id },
            { $set: { customerId: saved._id, contactLinkState: 'linked' } }
          );
          linked += 1;
        }
      } catch (err) {
        // One bad project must not abort (or hide) the rest of the batch.
        failed += 1;
        const reasons =
          err && err.name === 'ValidationError'
            ? Object.values(err.errors).map((e) => e.message)
            : ['unexpected error — see server log'];
        if (!(err && err.name === 'ValidationError')) {
          logger.error(`❌ customers.syncFromProjects project ${project._id}:`, err);
        }
        skippedDetails.push({ projectId: project._id, name: displayName, reasons });
      }
    }

    res.json({
      created, preserved, linked, skipped, failed, ignored,
      skippedDetails, totalProjects: projects.length,
    });
  } catch (err) {
    sendError(res, err, 'syncFromProjects', 'Server error syncing contacts from projects.');
  } finally {
    syncing.delete(lockKey);
  }
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

async function index(req, res) {
  try {
    const [customers, counts] = await Promise.all([
      Customer.find({ userId: req.user._id }).sort({ lastName: 1, firstName: 1 }).lean(),
      Project.aggregate([
        { $match: { userId: req.user._id, customerId: { $ne: null } } },
        { $group: { _id: '$customerId', projectCount: { $sum: 1 } } },
      ]),
    ]);
    const countByCustomerId = new Map(counts.map((row) => [String(row._id), row.projectCount]));
    res.json(
      customers.map((customer) => ({
        ...customer,
        projectCount: countByCustomerId.get(String(customer._id)) || 0,
      }))
    );
  } catch (err) {
    sendError(res, err, 'index', 'Server error retrieving customers.');
  }
}

async function show(req, res) {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    res.json(customer);
  } catch (err) {
    sendError(res, err, 'show', 'Server error retrieving customer.');
  }
}

// Plain create (unchanged behaviour: always creates).
async function create(req, res) {
  try {
    const customer = await Customer.create({ ...cleanBody(req.body), userId: req.user._id });
    res.status(201).json(customer);
  } catch (err) {
    sendError(res, err, 'create', 'Server error creating customer.');
  }
}

// POST /api/customers/find-or-create
//  • exact same person already saved  → returns that contact (never modified)
//  • similar contact (shared email, same phone+last name) → returns
//    { needsDecision: true, matches } and creates nothing, unless the caller
//    re-sends with allowDuplicate: true
//  • otherwise → creates the contact
// Always answers with a normal 2xx so any client can read the body.
async function findOrCreate(req, res) {
  try {
    const data = cleanBody(req.body);
    const matches = await findDuplicates(req.user._id, data);

    const exact = matches.find((m) => m.exact);
    if (exact) {
      return res.json({ customer: exact.contact, created: false, reused: true });
    }
    if (matches.length && !req.body.allowDuplicate) {
      return res.json({
        customer: null,
        created: false,
        needsDecision: true,
        matches: matches.map((m) => ({ ...slim(m.contact), matchedOn: m.reason })),
      });
    }

    const customer = await Customer.create({ ...data, userId: req.user._id });
    res.status(201).json({ customer, created: true });
  } catch (err) {
    sendError(res, err, 'findOrCreate', 'Server error saving customer.');
  }
}

// PUT/PATCH — partial update. Only the fields sent are changed.
// If the client sends `expectedUpdatedAt` (the contact's updatedAt when the
// user last looked at it) and the contact changed since, nothing is written
// and 409 is returned, so a stale form can never overwrite newer data.
async function update(req, res) {
  try {
    const { expectedUpdatedAt } = req.body || {};
    const current = await Customer.findOne({ _id: req.params.id, userId: req.user._id }).select('updatedAt');
    if (!current) return res.status(404).json({ error: 'Customer not found.' });

    const guard = Boolean(expectedUpdatedAt && current.updatedAt);
    const staleBody = {
      error: 'This contact was changed since you opened it. Review the latest version and try again.',
      code: 'STALE_CONTACT',
    };
    if (guard && new Date(expectedUpdatedAt).getTime() !== current.updatedAt.getTime()) {
      return res.status(409).json(staleBody);
    }

    const filter = { _id: req.params.id, userId: req.user._id, ...(guard ? { updatedAt: current.updatedAt } : {}) };
    const customer = await Customer.findOneAndUpdate(
      filter,
      { $set: cleanBody(req.body) },
      { new: true, runValidators: true }
    );
    if (!customer) {
      // Filter matched nothing: either it changed in the meantime, or was deleted.
      return res.status(guard ? 409 : 404).json(guard ? staleBody : { error: 'Customer not found.' });
    }
    res.json(customer);
  } catch (err) {
    sendError(res, err, 'update', 'Server error updating customer.');
  }
}

// DELETE — refuses when projects are linked, unless ?unlinkProjects=true.
// Unlinking only detaches the relationship: each project keeps its own copy of
// the customer's details, so no project data is lost.
async function deleteCustomer(req, res) {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });

    const projectCount = await Project.countDocuments({ userId: req.user._id, customerId: customer._id });
    const unlink = req.query.unlinkProjects === 'true';

    if (projectCount > 0 && !unlink) {
      return res.status(409).json({
        error: 'This contact is linked to projects and cannot be deleted.',
        details: [`Unlink or reassign its ${projectCount} project${projectCount === 1 ? '' : 's'} before deleting this contact.`],
        projectCount,
      });
    }
    if (projectCount > 0) {
      await Project.updateMany(
        { userId: req.user._id, customerId: customer._id },
        { $set: { customerId: null, contactLinkState: 'unlinked' } }
      );
    }
    await customer.deleteOne();
    res.json({ message: 'Customer deleted successfully.', unlinkedProjects: unlink ? projectCount : 0 });
  } catch (err) {
    sendError(res, err, 'delete', 'Server error deleting customer.');
  }
}

async function projects(req, res) {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id }).select('_id');
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    const rows = await Project.find({ userId: req.user._id, customerId: customer._id }).sort('-updatedAt');
    res.json(rows);
  } catch (err) {
    sendError(res, err, 'projects', 'Server error retrieving customer projects.');
  }
}

module.exports = {
  index,
  show,
  create,
  findOrCreate,
  update,
  projects,
  syncFromProjects,
  delete: deleteCustomer,
};
