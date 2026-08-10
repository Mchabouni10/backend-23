// controllers/api/projects.js
const Project = require('../../models/project');
const logger = require('../../utils/logger');

// --- Helper Functions ---
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

// ─── CREATE / UPDATE ────────────────────────────────────────────────────────
async function createOrUpdate(req, res, isUpdate = false) {
  try {
    const { customerInfo, categories = [], settings = {} } = req.body;
    
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
      logger.log(`✅ Project updated: ${project._id}, payments: ${cleanSettings.payments.length}`);

    } else {
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
      
      // ✅ FIX: Changed logger.info to logger.log
      logger.log(`✅ Project created: ${project._id}, payments: ${cleanSettings.payments.length}`);
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
