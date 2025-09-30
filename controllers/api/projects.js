// controllers/api/projects.js
const Project = require('../../models/project');

// --- Helper Functions ---

/**
 * ✅ REFINED: Calculates total units for a work item based *only* on its surfaces array.
 * This aligns with the updated Mongoose schema where surfaces are the single source of truth for measurements.
 * @param {object} item - The work item object.
 * @returns {number} The total calculated units for the item.
 */
function getUnits(item) {
  if (!item || !Array.isArray(item.surfaces)) {
    return 0;
  }

  return item.surfaces.reduce((sum, surface) => {
    if (!surface) return sum;
    // The measurementType is normalized by the Mongoose pre-validate hook.
    const type = surface.measurementType || item.measurementType;
    let units = 0;
    switch (type) {
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
        // This case should rarely be hit due to normalization.
        console.warn(`getUnits: Unknown measurement type "${type}" in surface.`);
        break;
    }
    return sum + units;
  }, 0);
}

/**
 * ✅ SIMPLIFIED: Processes the payments array to get totals.
 * Deprecated standalone deposit fields are no longer handled here; they are managed by the model's migration logic.
 * @param {Array} payments - The array of payment objects from settings.
 * @returns {object} An object containing totalPaid and depositAmount.
 */
function parsePayments(payments = []) {
  if (!Array.isArray(payments)) {
    return { totalPaid: 0, depositAmount: 0 };
  }
  
  let totalPaid = 0;
  let depositAmount = 0;

  payments.forEach(p => {
    if (p && p.isPaid) {
      const amount = Number(p.amount) || 0;
      totalPaid += amount;
      // Specifically track the sum of payments marked as 'Deposit'.
      if (p.method === 'Deposit') {
        depositAmount += amount;
      }
    }
  });
  
  return { totalPaid, depositAmount };
}

/**
 * ⭐️ CRITICAL FIX: Rewritten to match the frontend CalculatorEngine logic precisely.
 * This guarantees that the UI and database will always show the same numbers by following the correct order of operations.
 * @param {Array} categories - The project's categories array.
 * @param {object} settings - The project's settings object.
 * @returns {object} A comprehensive object with all calculated costs, ready to be stored in the database.
 */
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
  
  // 1. Labor calculations
  const laborDiscountRate = s.laborDiscount || 0;
  const laborDiscountAmount = laborCostBeforeDiscount * laborDiscountRate;
  const laborCost = laborCostBeforeDiscount - laborDiscountAmount; // This is labor cost AFTER discount

  // 2. Waste calculations (based on material cost ONLY)
  const wasteFactorRate = s.wasteFactor || 0;
  const wasteCost = materialCost * wasteFactorRate;
  const materialCostWithWaste = materialCost + wasteCost;

  // 3. Subtotal (the base for tax and markup, CORRECTLY INCLUDES waste)
  const subtotal = materialCostWithWaste + laborCost;

  // 4. Markup and Tax calculations (based on the new, correct subtotal)
  const markupRate = s.markup || 0;
  const markupAmount = subtotal * markupRate;

  const taxRate = s.taxRate || 0;
  const taxAmount = subtotal * taxRate;
  
  // 5. Other flat fees
  const miscFeesTotal = (s.miscFees || []).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const transportationFee = Number(s.transportationFee) || 0;

  // 6. Final grand total calculation
  const grandTotal = subtotal + markupAmount + taxAmount + miscFeesTotal + transportationFee;

  return {
    materialCost: Number(materialCost.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)), // After discount
    laborCostBeforeDiscount: Number(laborCostBeforeDiscount.toFixed(2)),
    laborDiscount: Number(laborDiscountAmount.toFixed(2)),
    wasteCost: Number(wasteCost.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    markupAmount: Number(markupAmount.toFixed(2)),
    miscFeesTotal: Number(miscFeesTotal.toFixed(2)),
    transportationFee: Number(transportationFee.toFixed(2)),
    subtotal: Number(subtotal.toFixed(2)), // Includes waste
    total: Number(grandTotal.toFixed(2)),
  };
}

/**
 * 🔧 NEW: Ensures categoryKey is properly set on all work items before validation
 * @param {Array} categories - The categories array
 * @returns {Array} Fixed categories with categoryKey set on all work items
 */
function ensureCategoryKeys(categories) {
  if (!Array.isArray(categories)) return [];
  
  return categories.map(category => {
    if (!category || typeof category !== 'object') return category;
    
    const fixedWorkItems = (category.workItems || []).map(item => {
      if (!item || typeof item !== 'object') return item;
      
      // Ensure categoryKey is set for validation
      return {
        ...item,
        categoryKey: category.key
      };
    });
    
    return {
      ...category,
      workItems: fixedWorkItems
    };
  });
}

/**
 * ✅ REFACTORED: A single, robust function to handle both creating and updating projects.
 * This eliminates code duplication and centralizes the core business logic.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {boolean} isUpdate - Flag to indicate if this is an update operation.
 */
async function createOrUpdate(req, res, isUpdate = false) {
  try {
    const { customerInfo, categories = [], settings = {} } = req.body;

    // FIXED: Call ensureCategoryKeys to create fixedCategories
    const fixedCategories = ensureCategoryKeys(categories);

    console.log('Fixed categories with categoryKey:', JSON.stringify(fixedCategories, null, 2));

    // 1. Calculate all project costs using the synchronized engine.
    const costs = calculateCostsAndTotals(fixedCategories, settings);
    const grandTotal = costs.total;
    
    // 2. Process payments to get paid amounts.
    const { totalPaid, depositAmount } = parsePayments(settings.payments);
    const totalDue = Math.max(0, grandTotal - totalPaid);

    // 3. Assemble the complete project data object that matches the Mongoose schema.
    const projectData = {
      userId: req.user._id,
      customerInfo,
      categories: fixedCategories, // Use fixed categories with categoryKey set
      settings,
      totals: costs, // The entire 'costs' object now maps directly to the 'totals' schema.
      paymentDetails: {
        grandTotal: grandTotal,
        totalPaid: totalPaid,
        totalDue: totalDue,
        depositAmount: depositAmount,
      },
    };

    console.log('Final project data structure:', JSON.stringify(projectData, null, 2));
    console.log('=== CONTROLLER DEBUG END ===');

    let project;
    const options = { new: true, runValidators: true };

    if (isUpdate) {
      project = await Project.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { $set: projectData },
        options
      );
      if (!project) {
        return res.status(404).json({ error: 'Project not found or you do not have permission to edit it.' });
      }
    } else {
      project = await new Project(projectData).save();
    }
    
    res.status(isUpdate ? 200 : 201).json(project);

  } catch (err) {
    console.error(`Error in ${isUpdate ? 'update' : 'create'} operation:`, err);
    
    // Enhanced error logging for validation issues
    if (err.name === 'ValidationError') {
      console.log('=== VALIDATION ERROR DETAILS ===');
      console.log('Full validation error:', err);
      console.log('Error paths:', Object.keys(err.errors));
      
      Object.entries(err.errors).forEach(([path, error]) => {
        console.log(`Path: ${path}`);
        console.log(`Message: ${error.message}`);
        console.log(`Value: ${error.value}`);
        console.log('---');
      });
      console.log('=== END VALIDATION ERROR DETAILS ===');
      
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed.', 
        details: messages,
        paths: Object.keys(err.errors),
        fullError: err.message 
      });
    }
    
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

// --- API Methods ---
// These now act as simple wrappers around the main createOrUpdate logic.
const create = (req, res) => createOrUpdate(req, res, false);
const update = (req, res) => createOrUpdate(req, res, true);

async function index(req, res) {
  try {
    const projects = await Project.find({ userId: req.user._id }).sort('-updatedAt');
    res.json(projects);
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Server error retrieving projects.' });
  }
}

async function show(req, res) {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.json(project);
  } catch (err) {
    console.error(`Error fetching project ${req.params.id}:`, err);
    res.status(500).json({ error: 'Server error retrieving project.' });
  }
}

async function deleteProject(req, res) {
  try {
    const project = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }
    res.status(200).json({ message: 'Project deleted successfully.' });
  } catch (err) {
    console.error(`Error deleting project ${req.params.id}:`, err);
    res.status(500).json({ error: 'Server error deleting project.' });
  }
}

module.exports = {
  create,
  index,
  show,
  update,
  delete: deleteProject,
};