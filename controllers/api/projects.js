// controllers/api/projects.js

const Project = require('../../models/project');

// --- Helper Functions ---

function getUnits(item) {
  if (!item || !Array.isArray(item.surfaces)) return 0;

  return item.surfaces.reduce((sum, surface) => {
    if (!surface) return sum;
    const type = surface.measurementType || item.measurementType;
    let units = 0;
    switch (type) {
      case 'square-foot':
      case 'sqft': // legacy — kept for backward compat with old DB records
        units = parseFloat(surface.sqft) || 0;
        break;
      case 'linear-foot':
        units = parseFloat(surface.linearFt) || 0;
        break;
      case 'by-unit':
        units = parseInt(surface.units) || 0;
        break;
      default:
        console.warn(`⚠️ getUnits: Unknown measurement type "${type}" in surface.`);
        break;
    }
    return sum + units;
  }, 0);
}

function parsePayments(payments = []) {
  if (!Array.isArray(payments)) return { totalPaid: 0, depositAmount: 0 };

  let totalPaid = 0;
  let depositAmount = 0;

  payments.forEach(p => {
    if (p && p.isPaid) {
      const amount = Number(p.amount) || 0;
      totalPaid += amount;
      if (p.paymentType === 'Deposit' || p.type === 'Deposit' || p.method === 'Deposit') {
        depositAmount += amount;
      }
    }
  });

  return { totalPaid, depositAmount };
}

function calculateWasteCost(materialCost, settings) {
  const s = settings || {};
  const wasteEntries = Array.isArray(s.wasteEntries) ? s.wasteEntries : [];

  if (wasteEntries.length > 0) {
    return wasteEntries.reduce((sum, entry) => {
      const surfaceCost = Math.max(0, Number(entry.surfaceCost) || 0);
      const factor = Math.max(0, Math.min(0.5, Number(entry.wasteFactor) || 0));
      return sum + surfaceCost * factor;
    }, 0);
  }

  const wasteFactorRate = Math.max(0, Math.min(0.5, s.wasteFactor || 0));
  return materialCost * wasteFactorRate;
}

function calculateCostsAndTotals(categories, settings) {
  let materialCost = 0;
  let laborCostBeforeDiscount = 0;

  (categories || []).forEach(category => {
    (category.workItems || []).forEach(item => {
      const units = getUnits(item);
      materialCost += (Number(item.materialCost) || 0) * units;
      laborCostBeforeDiscount += (Number(item.laborCost) || 0) * units;
    });
  });

  const s = settings || {};

  const laborDiscountRate = s.laborDiscount || 0;
  const laborDiscountAmount = laborCostBeforeDiscount * laborDiscountRate;
  const laborCost = laborCostBeforeDiscount - laborDiscountAmount;

  const wasteCost = calculateWasteCost(materialCost, s);
  const materialCostWithWaste = materialCost + wasteCost;

  const subtotal = materialCostWithWaste + laborCost;

  const markupRate = s.markup || 0;
  const markupAmount = subtotal * markupRate;

  const taxRate = s.taxRate || 0;
  const taxAmount = subtotal * taxRate;

  const miscFeesTotal = (s.miscFees || []).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const transportationFee = Number(s.transportationFee) || 0;

  const grandTotal = subtotal + markupAmount + taxAmount + miscFeesTotal + transportationFee;

  return {
    materialCost: Number(materialCost.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)),
    laborCostBeforeDiscount: Number(laborCostBeforeDiscount.toFixed(2)),
    laborDiscount: Number(laborDiscountAmount.toFixed(2)),
    wasteCost: Number(wasteCost.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    markupAmount: Number(markupAmount.toFixed(2)),
    miscFeesTotal: Number(miscFeesTotal.toFixed(2)),
    transportationFee: Number(transportationFee.toFixed(2)),
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(grandTotal.toFixed(2)),
  };
}

function ensureCategoryKeys(categories) {
  if (!Array.isArray(categories)) {
    console.warn('⚠️ ensureCategoryKeys: categories is not an array');
    return [];
  }

  return categories.map((category, catIndex) => {
    if (!category || typeof category !== 'object') {
      console.warn(`⚠️ ensureCategoryKeys: Invalid category at index ${catIndex}`);
      return category;
    }

    if (!category.key || !category.name) {
      console.error(`❌ ensureCategoryKeys: Category at index ${catIndex} missing key or name`, category);
      throw new Error(`Category at index ${catIndex} is missing required fields (key or name)`);
    }

    const validWorkItems = [];
    const skippedItems = [];

    (category.workItems || []).forEach((item, itemIndex) => {
      if (!item || typeof item !== 'object') {
        skippedItems.push({ index: itemIndex, reason: 'Invalid item object' });
        return;
      }

      if (!item.type || item.type.trim() === '') {
        skippedItems.push({ index: itemIndex, reason: 'No work type selected', name: item.name || 'Unnamed' });
        return;
      }

      if (item.type === 'custom-work-type') {
        if (!item.customWorkTypeName || item.customWorkTypeName.trim() === '') {
          skippedItems.push({ index: itemIndex, reason: 'Custom work type missing name', name: item.name || 'Unnamed Custom Work' });
          return;
        }
      }

      const fixedItem = {
        name: item.name || 'Unnamed Work Item',
        customWorkTypeName: item.customWorkTypeName || '',
        type: item.type.trim(),
        subtype: item.subtype || '',
        description: item.description || '',
        surfaces: Array.isArray(item.surfaces) ? item.surfaces : [],
        materialCost: Number(item.materialCost) || 0,
        laborCost: Number(item.laborCost) || 0,
        notes: item.notes || '',
        measurementType: item.measurementType || 'square-foot',
        categoryKey: category.key,
      };

      validWorkItems.push(fixedItem);
    });

    if (skippedItems.length > 0) {
      console.warn(`⚠️ Category "${category.name}" (${category.key}): Skipped ${skippedItems.length} invalid items`);
    }

    return {
      name: category.name,
      key: category.key,
      workItems: validWorkItems,
    };
  }).filter(() => true);
}

// ─── FIX: Sanitize settings before saving ────────────────────────────────────
// Strips any fields NOT in the schema and ensures wasteEntries are clean.
// This prevents Mongoose strict mode from silently dropping valid fields
// due to casting errors caused by unknown/extra fields in the same object.
function sanitizeSettings(raw) {
  const s = raw || {};

  // ── wasteEntries: keep only valid entries ──────────────────────────────────
  const wasteEntries = Array.isArray(s.wasteEntries)
    ? s.wasteEntries
        .filter(e => e && typeof e === 'object')
        .map(e => ({
          surfaceName: String(e.surfaceName || '').trim(),
          surfaceCost: Math.max(0, Number(e.surfaceCost) || 0),
          // CRITICAL: wasteFactor must be 0–0.5 per schema max
          wasteFactor: Math.max(0, Math.min(0.5, Number(e.wasteFactor) || 0)),
        }))
    : [];

  // ── miscFees: keep only valid entries ─────────────────────────────────────
  const miscFees = Array.isArray(s.miscFees)
    ? s.miscFees
        .filter(f => f && f.name && typeof f.amount === 'number')
        .map(f => ({
          name: String(f.name).trim(),
          amount: Math.max(0, Number(f.amount) || 0),
        }))
    : [];

  // ── payments: strip unknown fields that can cause Mongoose cast failures ───
  // A cast failure on ANY payment causes Mongoose to abort the ENTIRE
  // settings subdocument update, silently dropping wasteEntries too.
  const VALID_METHODS = new Set([
    'Credit', 'Debit', 'Check', 'Cash', 'Zelle',
    'Deposit', 'Installment', 'Wire',
    'Bank Transfer', 'PayPal', 'Venmo', 'CashApp', 'Other',
  ]);
  const VALID_PAYMENT_TYPES = new Set(['Deposit', 'One-Time', 'Installment', 'Other']);
  const VALID_STATUSES = new Set(['Pending', 'Paid', 'Overdue']);

  const payments = Array.isArray(s.payments)
    ? s.payments
        .filter(p => p && p.date && p.amount > 0)
        .map(p => {
          // Detect deposit from any field the frontend might use
          const isDeposit =
            p.paymentType === 'Deposit' ||
            p.type === 'Deposit' ||
            p.method === 'Deposit';

          const method = VALID_METHODS.has(p.method) ? p.method : 'Cash';
          const paymentType = VALID_PAYMENT_TYPES.has(p.paymentType)
            ? p.paymentType
            : isDeposit ? 'Deposit' : 'One-Time';
          const status = VALID_STATUSES.has(p.status) ? p.status : 'Paid';

          const clean = {
            date: new Date(p.date),
            amount: Number(p.amount),
            method,
            paymentType,
            note: String(p.note || '').trim(),
            isPaid: Boolean(p.isPaid),
            status,
          };
          // Preserve _id if present so Mongoose doesn't create duplicates
          if (p._id) clean._id = p._id;
          return clean;
        })
    : [];

  return {
    taxRate:          Math.max(0, Math.min(1,   Number(s.taxRate)          || 0)),
    transportationFee:Math.max(0,               Number(s.transportationFee)|| 0),
    wasteFactor:      Math.max(0, Math.min(0.5, Number(s.wasteFactor)      || 0)),
    laborDiscount:    Math.max(0, Math.min(1,   Number(s.laborDiscount)    || 0)),
    markup:           Math.max(0, Math.min(10,  Number(s.markup)           || 0)),
    wasteEntries,
    miscFees,
    payments,
  };
}

async function createOrUpdate(req, res, isUpdate = false) {
  try {
    const { customerInfo, categories = [], settings = {} } = req.body;

    // ── Diagnostic logging — confirms what the server actually receives ──────
    console.log(`\n📥 [${isUpdate ? 'UPDATE' : 'CREATE'}] Received settings:`);
    console.log(`   wasteEntries count : ${Array.isArray(settings.wasteEntries) ? settings.wasteEntries.length : 'NOT AN ARRAY'}`);
    console.log(`   wasteEntries data  :`, JSON.stringify(settings.wasteEntries));
    console.log(`   payments count     : ${Array.isArray(settings.payments) ? settings.payments.length : 'NOT AN ARRAY'}`);
    console.log(`   miscFees count     : ${Array.isArray(settings.miscFees) ? settings.miscFees.length : 'NOT AN ARRAY'}`);

    if (!Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({
        error: 'Validation failed.',
        details: ['Project must have at least one category'],
        paths: ['categories']
      });
    }

    let fixedCategories;
    try {
      fixedCategories = ensureCategoryKeys(categories);
      const totalWorkItems = fixedCategories.reduce((sum, cat) => sum + cat.workItems.length, 0);
      if (totalWorkItems === 0) {
        return res.status(400).json({
          error: 'Validation failed.',
          details: [
            'No complete work items found.',
            'Please ensure each work item has a work type selected.',
            'Custom work types must have a name specified.'
          ],
          paths: ['categories.workItems']
        });
      }
    } catch (validationError) {
      return res.status(400).json({
        error: 'Validation failed.',
        details: [validationError.message],
        paths: ['categories']
      });
    }

    // ── FIX: Sanitize settings before any DB operation ───────────────────────
    // This ensures no unknown fields can cause Mongoose to abort the cast
    // of the settings subdocument, which would silently drop wasteEntries.
    const cleanSettings = sanitizeSettings(settings);

    console.log(`\n🧹 Sanitized settings:`);
    console.log(`   wasteEntries count : ${cleanSettings.wasteEntries.length}`);
    console.log(`   wasteEntries data  :`, JSON.stringify(cleanSettings.wasteEntries));

    const costs = calculateCostsAndTotals(fixedCategories, cleanSettings);
    const grandTotal = costs.total;

    const { totalPaid, depositAmount } = parsePayments(cleanSettings.payments);
    const totalDue = Math.max(0, grandTotal - totalPaid);

    let project;

    if (isUpdate) {
      // ── FIX: Use explicit dot-notation $set for each settings field ─────────
      // Replacing the entire `settings` object with { $set: { settings: {...} } }
      // forces Mongoose to cast ALL fields at once. If any field fails casting
      // (e.g. an invalid payment field), the WHOLE settings object is dropped.
      //
      // Dot-notation sets each field independently, so a bad payment can't
      // silently take wasteEntries down with it.
      const updatePayload = {
        $set: {
          userId:           req.user._id,
          customerInfo,
          categories:       fixedCategories,
          // Top-level settings fields — dot-notation keeps them independent
          'settings.taxRate':           cleanSettings.taxRate,
          'settings.transportationFee': cleanSettings.transportationFee,
          'settings.wasteFactor':       cleanSettings.wasteFactor,
          'settings.laborDiscount':     cleanSettings.laborDiscount,
          'settings.markup':            cleanSettings.markup,
          // Arrays — set each explicitly so a problem in one can't kill another
          'settings.wasteEntries':      cleanSettings.wasteEntries,
          'settings.miscFees':          cleanSettings.miscFees,
          'settings.payments':          cleanSettings.payments,
          // Computed totals
          'totals.materialCost':        costs.materialCost,
          'totals.laborCost':           costs.laborCost,
          'totals.laborCostBeforeDiscount': costs.laborCostBeforeDiscount,
          'totals.laborDiscount':       costs.laborDiscount,
          'totals.wasteCost':           costs.wasteCost,
          'totals.taxAmount':           costs.taxAmount,
          'totals.markupAmount':        costs.markupAmount,
          'totals.miscFeesTotal':       costs.miscFeesTotal,
          'totals.transportationFee':   costs.transportationFee,
          'totals.subtotal':            costs.subtotal,
          'totals.total':               costs.total,
          // Payment summary
          'paymentDetails.grandTotal':  grandTotal,
          'paymentDetails.totalPaid':   totalPaid,
          'paymentDetails.totalDue':    totalDue,
          'paymentDetails.depositAmount': depositAmount,
        }
      };

      console.log(`\n💾 Sending to MongoDB:`);
      console.log(`   settings.wasteEntries:`, JSON.stringify(updatePayload.$set['settings.wasteEntries']));

      project = await Project.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        updatePayload,
        { new: true, runValidators: true, context: 'query' }
      );

      if (!project) {
        return res.status(404).json({ error: 'Project not found or you do not have permission to edit it.' });
      }

      console.log(`\n✅ Saved to DB — wasteEntries:`, JSON.stringify(project.settings.wasteEntries));

    } else {
      // CREATE — use normal document save (pre-validate hook runs here)
      const projectData = {
        userId: req.user._id,
        customerInfo,
        categories: fixedCategories,
        settings: cleanSettings,
        totals: costs,
        paymentDetails: {
          grandTotal,
          totalPaid,
          totalDue,
          depositAmount,
        },
      };

      project = new Project(projectData);
      await project.save();

      console.log(`\n✅ Created — wasteEntries:`, JSON.stringify(project.settings.wasteEntries));
    }

    res.status(isUpdate ? 200 : 201).json(project);

  } catch (err) {
    console.error(`❌ Error in ${isUpdate ? 'update' : 'create'} operation:`, err);

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({
        error: 'Validation failed.',
        details: messages,
        paths: Object.keys(err.errors),
        fullError: err.message
      });
    }

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid data format.', details: [err.message], paths: [err.path] });
    }

    if (err.code === 11000) {
      return res.status(400).json({
        error: 'Duplicate entry.',
        details: ['A record with this information already exists.'],
        paths: Object.keys(err.keyPattern || {})
      });
    }

    return res.status(500).json({ error: 'An internal server error occurred.', details: [err.message] });
  }
}

const create = (req, res) => createOrUpdate(req, res, false);
const update = (req, res) => createOrUpdate(req, res, true);

async function index(req, res) {
  try {
    const projects = await Project.find({ userId: req.user._id }).sort('-updatedAt');
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Server error retrieving projects.' });
  }
}

async function show(req, res) {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    let needsRepair = false;
    project.categories.forEach((category) => {
      category.workItems.forEach((item) => {
        if (item.type === 'custom-work-type' && (!item.customWorkTypeName || !item.customWorkTypeName.trim())) {
          item.customWorkTypeName = 'Unnamed Custom Work';
          needsRepair = true;
        }
      });
    });

    if (needsRepair) {
      try {
        await project.save({ validateBeforeSave: false });
      } catch (saveErr) {
        console.error(`❌ Failed to auto-repair project ${project._id}:`, saveErr.message);
      }
    }

    res.json(project);
  } catch (err) {
    res.status(500).json({ error: 'Server error retrieving project.' });
  }
}

async function deleteProject(req, res) {
  try {
    const project = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.status(200).json({ message: 'Project deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error deleting project.' });
  }
}

module.exports = { create, index, show, update, delete: deleteProject };