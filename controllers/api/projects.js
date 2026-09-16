// controllers/api/projects.js
const Project = require('../../models/project');
const Customer = require('../../models/customer');
const logger = require('../../utils/logger');

// --- Helper Functions ---

// Mirrors src/constants/measurementTypes.js normalizeMeasurementType() on the
// frontend. Kept in sync manually — if you change one, change the other.
// Used only to decide which items are "wasteable" (SF/LF) vs not (BY_UNIT);
// it does not affect stored measurementType values.
function normalizeMeasurementType(type) {
  if (!type) return 'square-foot';
  const t = String(type).toLowerCase().trim();
  if (['square-foot', 'sqft', 'sq ft', 'square foot', 'square foot (sqft)', 'single-surface'].includes(t)) {
    return 'square-foot';
  }
  if (['linear-foot', 'linear ft', 'linearft', 'linear foot'].includes(t)) {
    return 'linear-foot';
  }
  if (['by-unit', 'by unit', 'unit', 'units'].includes(t)) {
    return 'by-unit';
  }
  return 'square-foot';
}

function getUnits(item) {
  if (!item || !Array.isArray(item.surfaces)) return 0;
  return item.surfaces.reduce((sum, surface) => {
    if (!surface) return sum;
    const type = surface.measurementType || item.measurementType;
    let units = 0;
    switch (type) {
      case 'square-foot':
      case 'sqft':
        units = parseFloat(surface.sqft) || 0;
        break;
      case 'linear-foot':
        units = parseFloat(surface.linearFt) || 0;
        break;
      case 'by-unit':
        units = parseInt(surface.units) || 0;
        break;
      default:
        logger.warn(`⚠️ getUnits: Unknown measurement type "${type}" in surface.`);
        break;
    }
    return sum + units;
  }, 0);
}

function parsePayments(payments = []) {
  if (!Array.isArray(payments)) return { totalPaid: 0, depositAmount: 0, totalRefunded: 0 };
  let totalPaid = 0;
  let depositAmount = 0;
  let totalRefunded = 0;
  payments.forEach(p => {
    if (!p) return;
    const amount = Number(p.amount) || 0;
    const paymentType = p.type || p.paymentType;

    if (paymentType === 'Refund') {
      totalRefunded += amount;
      return;
    }

    if (p.isPaid) {
      totalPaid += amount;
    }

    // Check both type and paymentType for Deposit
    if (p.isPaid && (paymentType === 'Deposit' || p.method === 'Deposit')) {
      depositAmount += amount;
    }
  });
  return {
    totalPaid: Math.max(0, Number((totalPaid - totalRefunded).toFixed(2))),
    depositAmount: Number(depositAmount.toFixed(2)),
    totalRefunded: Number(totalRefunded.toFixed(2)),
  };
}

// Waste is calculated only on the wasteable material cost (SF + LF items)
// passed in — BY_UNIT items are excluded upstream in calculateCostsAndTotals().
// Mirrors CalculatorEngine._calculateWaste() on the frontend exactly.
function calculateWasteCost(wasteableMaterialCost, settings) {
  const s = settings || {};
  const wasteEntries = Array.isArray(s.wasteEntries) ? s.wasteEntries : [];
  if (wasteEntries.length > 0) {
    return wasteEntries.reduce((sum, entry) => {
      const surfaceCost = Math.max(0, Number(entry.surfaceCost) || 0);
      const factor = Math.max(0, Math.min(0.5, Number(entry.wasteFactor) || 0));
      return sum + surfaceCost * factor;
    }, 0);
  }
  const wasteFactorRate = Math.max(0, Math.min(0.5, Number(s.wasteFactor) || 0));
  return wasteableMaterialCost * wasteFactorRate;
}

// ─── SOURCE OF TRUTH: CalculatorEngine.js (frontend) ───────────────────────
// This function is the backend mirror of CalculatorEngine.calculateTotals()
// / _calculateAdjustments(). If the two ever disagree, CalculatorEngine.js
// is correct and this should be changed to match it — not the other way
// around. Order of operations (industry-standard for US contractors):
//
//  1. Raw material cost (all types) + wasteable material cost (SF/LF only)
//  2. + Waste             → on SF/LF materials only (not BY_UNIT)
//  3. = Adjusted material cost
//  4. − Labor discount    → on labor only
//  5. = Job subtotal      (adjusted materials + discounted labor)
//  6. + Tax               → on adjusted material cost ONLY (materials are
//                            taxed, labor is a service and is not taxed —
//                            see Illinois Use Tax rules)
//  7. + Markup            → on the pre-tax job subtotal
//  8. + Misc fees + Transportation (flat pass-through, not taxed/marked-up)
//  9. − Credits           → price adjustments, the only step that lowers
//                            the grand total below the raw job cost
// 10. = Grand total (floored at 0)
// ─────────────────────────────────────────────────────────────────────────
function calculateCostsAndTotals(categories, settings) {
  let materialCost = 0;              // all material (SF + LF + EA)
  let wasteableMaterialCost = 0;     // only SF + LF material
  let laborCostBeforeDiscount = 0;

  (categories || []).forEach(category => {
    (category.workItems || []).forEach(item => {
      const units = getUnits(item);
      const itemMaterialCost = (Number(item.materialCost) || 0) * units;
      materialCost += itemMaterialCost;
      laborCostBeforeDiscount += (Number(item.laborCost) || 0) * units;

      // Only SF and LF items are wasteable. BY_UNIT items (faucets,
      // fixtures, etc.) are never wasted — a contractor buys exactly
      // what they need.
      const mt = normalizeMeasurementType(item.measurementType);
      if (mt === 'square-foot' || mt === 'linear-foot') {
        wasteableMaterialCost += itemMaterialCost;
      }
    });
  });

  const s = settings || {};

  const wasteCost = calculateWasteCost(wasteableMaterialCost, s);
  const adjustedMaterialCost = materialCost + wasteCost;

  const laborDiscountRate = Math.max(0, Math.min(1, Number(s.laborDiscount) || 0));
  const laborDiscountAmount = laborCostBeforeDiscount * laborDiscountRate;
  const laborCost = laborCostBeforeDiscount - laborDiscountAmount;

  const subtotal = adjustedMaterialCost + laborCost;

  // Tax on adjusted material cost only — NOT on labor.
  const taxRate = Math.max(0, Math.min(0.25, Number(s.taxRate) || 0));
  const taxAmount = adjustedMaterialCost * taxRate;

  // Markup on the pre-tax subtotal (materials + labor).
  const markupRate = Math.max(0, Math.min(5, Number(s.markup) || 0));
  const markupAmount = subtotal * markupRate;

  const miscFeesTotal = (s.miscFees || []).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const transportationFee = Math.max(0, Number(s.transportationFee) || 0);

  const creditsTotal = (s.credits || []).reduce((sum, c) => sum + Math.max(0, Number(c.amount) || 0), 0);

  const preCreditTotal = subtotal + markupAmount + taxAmount + miscFeesTotal + transportationFee;
  const grandTotal = Math.max(0, preCreditTotal - creditsTotal);

  return {
    materialCost: Number(materialCost.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)),
    laborCostBeforeDiscount: Number(laborCostBeforeDiscount.toFixed(2)),
    laborDiscount: Number(laborDiscountAmount.toFixed(2)),
    wasteCost: Number(wasteCost.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    markupAmount: Number(markupAmount.toFixed(2)),
    miscFeesTotal: Number(miscFeesTotal.toFixed(2)),
    creditsTotal: Number(creditsTotal.toFixed(2)),
    transportationFee: Number(transportationFee.toFixed(2)),
    subtotal: Number(subtotal.toFixed(2)),
    total: Number(grandTotal.toFixed(2)),
  };
}

function ensureCategoryKeys(categories) {
  if (!Array.isArray(categories)) {
    logger.warn('⚠️ ensureCategoryKeys: categories is not an array');
    return [];
  }
  return categories.map((category, catIndex) => {
    if (!category || typeof category !== 'object') {
      logger.warn(`⚠️ ensureCategoryKeys: Invalid category at index ${catIndex}`);
      return category;
    }
    if (!category.key || !category.name) {
      logger.error(`❌ ensureCategoryKeys: Category at index ${catIndex} missing key or name`, category);
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

      const preservedSurfaces = Array.isArray(item.surfaces)
        ? item.surfaces.map(surface => ({
            ...surface,
            id: surface.id || '',
            measurementType: surface.measurementType || item.measurementType || 'square-foot',
            width: typeof surface.width === 'number' ? surface.width : 0,
            height: typeof surface.height === 'number' ? surface.height : 0,
            sqft: typeof surface.sqft === 'number' ? surface.sqft : 0,
            linearFt: typeof surface.linearFt === 'number' ? surface.linearFt : 0,
            units: typeof surface.units === 'number' ? surface.units : 0,
            manualSqft: Boolean(surface.manualSqft),
          }))
        : [];

      const fixedItem = {
        name: item.name || 'Unnamed Work Item',
        customWorkTypeName: item.customWorkTypeName || '',
        type: item.type.trim(),
        subtype: item.subtype || '',
        description: item.description || '',
        surfaces: preservedSurfaces,
        materialCost: Number(item.materialCost) || 0,
        laborCost: Number(item.laborCost) || 0,
        notes: item.notes || '',
        measurementType: item.measurementType || 'square-foot',
        categoryKey: category.key,
      };

      validWorkItems.push(fixedItem);
    });

    if (skippedItems.length > 0) {
      logger.warn(`⚠️ Category "${category.name}" (${category.key}): Skipped ${skippedItems.length} invalid items`);
    }

    return {
      name: category.name,
      key: category.key,
      workItems: validWorkItems,
    };
  }).filter(() => true);
}

// ─── FIXED: Sanitize settings with complete payment preservation ────────────────────
function sanitizeSettings(raw) {
  const s = raw || {};
  
  // ── wasteEntries ──────────────────────────────────────────────────────────
  const wasteEntries = Array.isArray(s.wasteEntries)
    ? s.wasteEntries
        .filter(e => e && typeof e === 'object')
        .map(e => ({
          surfaceName: String(e.surfaceName || '').trim(),
          surfaceId: String(e.surfaceId || '').trim(),
          surfaceCost: Math.max(0, Number(e.surfaceCost) || 0),
          measurementType: e.measurementType ? String(e.measurementType).trim() : null,
          wasteable: typeof e.wasteable === 'boolean' ? e.wasteable : null,
          wasteFactor: Math.max(0, Math.min(0.5, Number(e.wasteFactor) || 0)),
          manualOverride: Boolean(e.manualOverride),
        }))
    : [];

  // ── miscFees ──────────────────────────────────────────────────────────────
  const miscFees = Array.isArray(s.miscFees)
    ? s.miscFees
        .filter(f => f && f.name && typeof f.amount === 'number')
        .map(f => ({
          name: String(f.name).trim(),
          amount: Math.max(0, Number(f.amount) || 0),
        }))
    : [];

  // ── payments: PRESERVE ALL FIELDS including type ────────────────────────
  const VALID_METHODS = new Set([
    'Credit', 'Debit', 'Check', 'Cash', 'Zelle',
    'Deposit', 'Installment', 'Wire',
    'Bank Transfer', 'PayPal', 'Venmo', 'CashApp', 'Other',
  ]);
  const LEGACY_METHOD_MAP = {
    'Credit Card': 'Credit',
    'Debit Card': 'Debit',
  };
  const VALID_PAYMENT_TYPES = new Set(['Deposit', 'Installment', 'Refund', 'Other']);
  const VALID_STATUSES = new Set(['Pending', 'Paid', 'Overdue']);

  const payments = Array.isArray(s.payments)
    ? s.payments
        .filter(p => p && p.date && p.amount >= 0)
        .map(p => {
          // ─── CRITICAL: Normalize and preserve the type exactly ──────────────────
          let rawType = (typeof p.type === 'string') ? p.type.trim() : '';
          let resolvedType = VALID_PAYMENT_TYPES.has(rawType) ? rawType : null;
          
          if (!resolvedType) {
            let rawPaymentType = (typeof p.paymentType === 'string') ? p.paymentType.trim() : '';
            if (VALID_PAYMENT_TYPES.has(rawPaymentType)) {
               resolvedType = rawPaymentType;
            } else if (p.note && /installment/i.test(p.note)) {
              resolvedType = 'Installment';
            } else if (p.method === 'Deposit') {
              resolvedType = 'Deposit';
            } else {
               resolvedType = 'Installment';
            }
          }

          // Clean up the method
          const rawMethod = (typeof p.method === 'string') ? p.method.trim() : '';
          const method = VALID_METHODS.has(rawMethod)
            ? rawMethod
            : VALID_METHODS.has(LEGACY_METHOD_MAP[rawMethod])
              ? LEGACY_METHOD_MAP[rawMethod]
              : 'Cash';
          
          const isPaid = Boolean(p.isPaid);
          const rawStatus = (typeof p.status === 'string') ? p.status.trim() : '';
          let status = VALID_STATUSES.has(rawStatus) ? rawStatus : null;
          if (resolvedType === 'Refund') {
            status = 'Paid';
          } else if (isPaid) {
            status = 'Paid';
          } else if (!status || status === 'Paid') {
            status = new Date(p.date) < new Date() ? 'Overdue' : 'Pending';
          }

          // ─── Build the clean payment object ──────────────────────────────
          const clean = {
            date: new Date(p.date),
            amount: Number(p.amount),
            method: method,
            type: resolvedType,
            paymentType: resolvedType,
            note: String(p.note || '').trim(),
            isPaid,
            status: status,
          };
          
          // ─── PRESERVE ALL additional fields ──────────────────────────────
          if (p.paidMethod !== undefined) {
            clean.paidMethod = String(p.paidMethod || '').trim();
          }
          
          if (p.manuallyAdjusted !== undefined && p.manuallyAdjusted !== null) {
            clean.manuallyAdjusted = Boolean(p.manuallyAdjusted);
          }
          
          if (p.paidAt) clean.paidAt = new Date(p.paidAt);
          if (p.createdAt) clean.createdAt = new Date(p.createdAt);
          if (p.updatedAt) clean.updatedAt = new Date(p.updatedAt);
          
          // ─── CRITICAL: Always preserve installment numbers ─────────────
          if (p.installmentNumber !== undefined && p.installmentNumber !== null) {
            clean.installmentNumber = Number(p.installmentNumber);
          } else if (resolvedType === 'Installment') {
            const match = p.note ? p.note.match(/Installment\s*(\d+)\s*of\s*(\d+)/i) : null;
            if (match) {
              clean.installmentNumber = parseInt(match[1], 10);
              clean.totalInstallments = parseInt(match[2], 10);
            }
          }
          
          if (p.totalInstallments !== undefined && p.totalInstallments !== null) {
            clean.totalInstallments = Number(p.totalInstallments);
          }
          
          // ─── Preserve IDs ────────────────────────────────────────────────
          if (p._id) clean._id = p._id;
          if (p.id) clean.id = String(p.id);
          
          // ─── Preserve any other fields that might exist ──────────────────
          const extraFields = ['paymentNumber', 'reference', 'transactionId', 'checkNumber'];
          extraFields.forEach(field => {
            if (p[field] !== undefined && p[field] !== null) {
              clean[field] = p[field];
            }
          });
          
          return clean;
        })
    : [];

  // ── credits: price adjustments (damaged product, price change, etc) ────
  // Distinct from payments/refunds — these lower the grand total itself.
  // Shape matches EMPTY_CREDIT() in PaymentTracking.jsx.
  const credits = Array.isArray(s.credits)
    ? s.credits
        .filter(c => c && c.date && c.amount >= 0 && c.reason)
        .map(c => {
          const clean = {
            date: new Date(c.date),
            amount: Math.max(0, Number(c.amount) || 0),
            reason: String(c.reason).trim(),
          };
          if (c._id) clean._id = c._id;
          if (c.id) clean.id = String(c.id);
          if (c.createdAt) clean.createdAt = new Date(c.createdAt);
          if (c.updatedAt) clean.updatedAt = new Date(c.updatedAt);
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
    credits,
  };
}

// ─── CREATE / UPDATE ────────────────────────────────────────────────────────
async function createOrUpdate(req, res, isUpdate = false) {
  try {
    const {
      customerInfo,
      customerId,
      workflowStatus = isUpdate ? undefined : 'active',
      categories = [],
      settings = {},
    } = req.body;
    const isDraft = workflowStatus === 'draft';

    if (customerId) {
      const customer = await Customer.findOne({ _id: customerId, userId: req.user._id }).select('_id');
      if (!customer) {
        return res.status(400).json({ error: 'Invalid customer.', details: ['Customer does not exist or does not belong to this account.'] });
      }
    }
    
    if (!isDraft && (!Array.isArray(categories) || categories.length === 0)) {
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
      if (!isDraft && totalWorkItems === 0) {
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

    const cleanSettings = sanitizeSettings(settings);
    const costs = calculateCostsAndTotals(fixedCategories, cleanSettings);
    const grandTotal = costs.total;

    // Parse payments from the cleaned settings
    const { totalPaid, depositAmount } = parsePayments(cleanSettings.payments);
    const totalDue = Math.max(0, grandTotal - totalPaid);

    let project;

    if (isUpdate) {
      const updatePayload = {
        $set: {
          userId:           req.user._id,
          ...(customerId ? { customerId } : {}),
          ...(workflowStatus ? { workflowStatus } : {}),
          customerInfo,
          categories:       fixedCategories,
          'settings.taxRate':           cleanSettings.taxRate,
          'settings.transportationFee': cleanSettings.transportationFee,
          'settings.wasteFactor':       cleanSettings.wasteFactor,
          'settings.laborDiscount':     cleanSettings.laborDiscount,
          'settings.markup':            cleanSettings.markup,
          'settings.wasteEntries':      cleanSettings.wasteEntries,
          'settings.miscFees':          cleanSettings.miscFees,
          'settings.payments':          cleanSettings.payments,
          'settings.credits':           cleanSettings.credits,
          'totals.materialCost':        costs.materialCost,
          'totals.laborCost':           costs.laborCost,
          'totals.laborCostBeforeDiscount': costs.laborCostBeforeDiscount,
          'totals.laborDiscount':       costs.laborDiscount,
          'totals.wasteCost':           costs.wasteCost,
          'totals.taxAmount':           costs.taxAmount,
          'totals.markupAmount':        costs.markupAmount,
          'totals.miscFeesTotal':       costs.miscFeesTotal,
          'totals.creditsTotal':        costs.creditsTotal,
          'totals.transportationFee':   costs.transportationFee,
          'totals.subtotal':            costs.subtotal,
          'totals.total':               costs.total,
          'paymentDetails.grandTotal':  grandTotal,
          'paymentDetails.totalPaid':   totalPaid,
          'paymentDetails.totalDue':    totalDue,
          'paymentDetails.depositAmount': depositAmount,
        }
      };

      project = await Project.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        updatePayload,
        { new: true, runValidators: true, context: 'query' }
      );

      if (!project) {
        return res.status(404).json({ error: 'Project not found or you do not have permission to edit it.' });
      }

      // ✅ FIX: Changed logger.info to logger.log and fixed the template literal spacing
      logger.log(`✅ Project updated: ${project._id}, payments: ${cleanSettings.payments.length}, credits: ${cleanSettings.credits.length}`);

    } else {
      const projectData = {
        userId: req.user._id,
        ...(customerId ? { customerId } : {}),
        workflowStatus: workflowStatus || 'active',
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
      
      // ✅ FIX: Changed logger.info to logger.log
      logger.log(`✅ Project created: ${project._id}, payments: ${cleanSettings.payments.length}, credits: ${cleanSettings.credits.length}`);
    }

    res.status(isUpdate ? 200 : 201).json(project);
  } catch (err) {
    logger.error(`❌ Error in ${isUpdate ? 'update' : 'create'} operation:`, err);
    
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
        logger.error(`❌ Failed to auto-repair project ${project._id}:`, saveErr.message);
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
