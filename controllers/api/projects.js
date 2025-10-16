// controllers/api/projects.js
const Project = require('../../models/project');

// --- Helper Functions ---

function getUnits(item) {
  if (!item || !Array.isArray(item.surfaces)) {
    return 0;
  }

  return item.surfaces.reduce((sum, surface) => {
    if (!surface) return sum;
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
        console.warn(`getUnits: Unknown measurement type "${type}" in surface.`);
        break;
    }
    return sum + units;
  }, 0);
}

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
      if (p.method === 'Deposit') {
        depositAmount += amount;
      }
    }
  });
  
  return { totalPaid, depositAmount };
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

  const wasteFactorRate = s.wasteFactor || 0;
  const wasteCost = materialCost * wasteFactorRate;
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

/**
 * 🔧 CRITICAL FIX: Filters out incomplete work items and ensures valid data structure
 * @param {Array} categories - The categories array
 * @returns {Array} Fixed categories with only valid, complete work items
 */
function ensureCategoryKeys(categories) {
  if (!Array.isArray(categories)) {
    console.warn('ensureCategoryKeys: categories is not an array');
    return [];
  }
  
  return categories.map((category, catIndex) => {
    if (!category || typeof category !== 'object') {
      console.warn(`ensureCategoryKeys: Invalid category at index ${catIndex}`);
      return category;
    }

    // Ensure category has required fields
    if (!category.key || !category.name) {
      console.error(`ensureCategoryKeys: Category at index ${catIndex} missing key or name`, category);
      throw new Error(`Category at index ${catIndex} is missing required fields (key or name)`);
    }
    
    const validWorkItems = [];
    
    (category.workItems || []).forEach((item, itemIndex) => {
      if (!item || typeof item !== 'object') {
        console.warn(`ensureCategoryKeys: Invalid work item at category ${catIndex}, item ${itemIndex} - skipping`);
        return; // Skip this item
      }

      // CRITICAL: Filter out incomplete work items (those without a type)
      if (!item.type || item.type.trim() === '') {
        console.warn(`ensureCategoryKeys: Work item at category ${catIndex}, item ${itemIndex} has no type - skipping incomplete item`);
        return; // Skip incomplete items
      }

      // For custom work types, ensure customWorkTypeName is set
      if (item.type === 'custom-work-type' && (!item.customWorkTypeName || item.customWorkTypeName.trim() === '')) {
        console.warn(`ensureCategoryKeys: Custom work item at category ${catIndex}, item ${itemIndex} missing customWorkTypeName - skipping`);
        return; // Skip incomplete custom work items
      }

      // Build a complete, validated work item
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
        measurementType: item.measurementType || 'sqft',
        categoryKey: category.key, // CRITICAL: Set from parent category
      };

      console.log(`✅ Valid work item "${fixedItem.name}": type=${fixedItem.type}, categoryKey=${fixedItem.categoryKey}`);
      validWorkItems.push(fixedItem);
    });
    
    console.log(`Category "${category.name}" (${category.key}): ${validWorkItems.length} valid work items out of ${(category.workItems || []).length} total`);
    
    return {
      name: category.name,
      key: category.key,
      workItems: validWorkItems,
    };
  }).filter(category => {
    // OPTIONAL: Remove categories with no valid work items
    // Comment this out if you want to keep empty categories
    if (category.workItems.length === 0) {
      console.warn(`Category "${category.name}" has no valid work items - keeping category anyway`);
    }
    return true; // Keep all categories, even empty ones
  });
}

/**
 * ✅ REFACTORED: Single function to handle both creating and updating projects
 */
async function createOrUpdate(req, res, isUpdate = false) {
  try {
    const { customerInfo, categories = [], settings = {} } = req.body;

    console.log('=== CONTROLLER DEBUG START ===');
    console.log('Operation:', isUpdate ? 'UPDATE' : 'CREATE');
    console.log('User ID:', req.user._id);
    console.log('Raw categories count:', categories.length);
    
    // Log each category's work items
    categories.forEach((cat, i) => {
      console.log(`Category ${i}: ${cat.name} (${cat.key}) - ${(cat.workItems || []).length} work items`);
      (cat.workItems || []).forEach((item, j) => {
        console.log(`  Item ${j}: name="${item.name}", type="${item.type}", customWorkTypeName="${item.customWorkTypeName || 'N/A'}"`);
      });
    });

    // Validate input
    if (!Array.isArray(categories) || categories.length === 0) {
      console.error('Invalid categories:', categories);
      return res.status(400).json({ 
        error: 'Validation failed.',
        details: ['Project must have at least one category'],
        paths: ['categories']
      });
    }

    // FIXED: Call ensureCategoryKeys with better error handling
    let fixedCategories;
    try {
      fixedCategories = ensureCategoryKeys(categories);
      console.log(`✅ Fixed categories: ${fixedCategories.length} categories with valid work items`);
      
      // Count total valid work items
      const totalWorkItems = fixedCategories.reduce((sum, cat) => sum + cat.workItems.length, 0);
      console.log(`✅ Total valid work items across all categories: ${totalWorkItems}`);
      
      if (totalWorkItems === 0) {
        console.warn('⚠️ No valid work items found in any category');
        return res.status(400).json({
          error: 'Validation failed.',
          details: ['No complete work items found. Please ensure each work item has a work type selected.'],
          paths: ['categories.workItems']
        });
      }
      
    } catch (validationError) {
      console.error('❌ Validation error in ensureCategoryKeys:', validationError);
      return res.status(400).json({
        error: 'Validation failed.',
        details: [validationError.message],
        paths: ['categories']
      });
    }

    // Calculate all project costs
    const costs = calculateCostsAndTotals(fixedCategories, settings);
    const grandTotal = costs.total;
    
    // Process payments
    const { totalPaid, depositAmount } = parsePayments(settings.payments);
    const totalDue = Math.max(0, grandTotal - totalPaid);

    // Assemble project data
    const projectData = {
      userId: req.user._id,
      customerInfo,
      categories: fixedCategories,
      settings,
      totals: costs,
      paymentDetails: {
        grandTotal: grandTotal,
        totalPaid: totalPaid,
        totalDue: totalDue,
        depositAmount: depositAmount,
      },
    };

    console.log('=== CONTROLLER DEBUG END ===');

    let project;
    const options = { 
      new: true, 
      runValidators: true,
      context: 'query'
    };

    if (isUpdate) {
      console.log('🔄 Updating project:', req.params.id);
      project = await Project.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { $set: projectData },
        options
      );
      if (!project) {
        console.error('❌ Project not found or unauthorized:', req.params.id);
        return res.status(404).json({ 
          error: 'Project not found or you do not have permission to edit it.' 
        });
      }
      console.log('✅ Project updated successfully:', project._id);
    } else {
      console.log('➕ Creating new project');
      project = new Project(projectData);
      await project.save();
      console.log('✅ Project created successfully:', project._id);
    }
    
    res.status(isUpdate ? 200 : 201).json(project);

  } catch (err) {
    console.error(`❌ Error in ${isUpdate ? 'update' : 'create'} operation:`, err);
    
    // Enhanced error logging for validation issues
    if (err.name === 'ValidationError') {
      console.log('=== VALIDATION ERROR DETAILS ===');
      console.log('Full validation error:', err);
      console.log('Error paths:', Object.keys(err.errors));
      
      Object.entries(err.errors).forEach(([path, error]) => {
        console.log(`❌ Path: ${path}`);
        console.log(`   Message: ${error.message}`);
        console.log(`   Value:`, error.value);
        console.log(`   Kind: ${error.kind}`);
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
    
    // Handle cast errors
    if (err.name === 'CastError') {
      console.error('❌ Cast error:', err);
      return res.status(400).json({
        error: 'Invalid data format.',
        details: [err.message],
        paths: [err.path]
      });
    }
    
    return res.status(500).json({ 
      error: 'An internal server error occurred.',
      details: [err.message]
    });
  }
}

// --- API Methods ---
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