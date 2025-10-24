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
        console.warn(`⚠️ getUnits: Unknown measurement type "${type}" in surface.`);
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
 * ✅ ENHANCED: Validates and filters work items with comprehensive checks
 * @param {Array} categories - The categories array
 * @returns {Array} Fixed categories with only valid, complete work items
 */
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

    // Ensure category has required fields
    if (!category.key || !category.name) {
      console.error(`❌ ensureCategoryKeys: Category at index ${catIndex} missing key or name`, category);
      throw new Error(`Category at index ${catIndex} is missing required fields (key or name)`);
    }
    
    const validWorkItems = [];
    const skippedItems = [];
    
    (category.workItems || []).forEach((item, itemIndex) => {
      if (!item || typeof item !== 'object') {
        skippedItems.push({ index: itemIndex, reason: 'Invalid item object' });
        console.warn(`⚠️ ensureCategoryKeys: Invalid work item at category ${catIndex}, item ${itemIndex} - skipping`);
        return;
      }

      // ✅ FIX #3: Enhanced validation for incomplete work items
      if (!item.type || item.type.trim() === '') {
        skippedItems.push({ index: itemIndex, reason: 'No work type selected', name: item.name || 'Unnamed' });
        console.warn(`⚠️ ensureCategoryKeys: Work item at category ${catIndex}, item ${itemIndex} has no type - skipping incomplete item`);
        return;
      }

      // ✅ FIX #4: CRITICAL validation for custom work types
      if (item.type === 'custom-work-type') {
        if (!item.customWorkTypeName || item.customWorkTypeName.trim() === '') {
          skippedItems.push({ 
            index: itemIndex, 
            reason: 'Custom work type missing name', 
            name: item.name || 'Unnamed Custom Work' 
          });
          console.warn(`❌ ensureCategoryKeys: Custom work item at category ${catIndex}, item ${itemIndex} missing customWorkTypeName - skipping`);
          return;
        }
        console.log(`✅ Valid custom work type: "${item.customWorkTypeName}" at category ${catIndex}, item ${itemIndex}`);
      }

      // ✅ Build a complete, validated work item
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

      // ✅ Additional validation: Check if surfaces exist for work items that need them
      if (fixedItem.surfaces.length === 0 && fixedItem.type !== 'custom-work-type') {
        console.warn(`⚠️ Work item "${fixedItem.name}" has no surfaces, but will be kept`);
      }

      console.log(`✅ Valid work item "${fixedItem.name}": type=${fixedItem.type}, categoryKey=${fixedItem.categoryKey}${fixedItem.customWorkTypeName ? `, customName=${fixedItem.customWorkTypeName}` : ''}`);
      validWorkItems.push(fixedItem);
    });
    
    // ✅ Enhanced logging
    if (skippedItems.length > 0) {
      console.warn(`⚠️ Category "${category.name}" (${category.key}): Skipped ${skippedItems.length} invalid items:`);
      skippedItems.forEach(skip => {
        console.warn(`   - Item ${skip.index}: ${skip.reason} (${skip.name})`);
      });
    }
    
    console.log(`📊 Category "${category.name}" (${category.key}): ${validWorkItems.length} valid work items out of ${(category.workItems || []).length} total`);
    
    return {
      name: category.name,
      key: category.key,
      workItems: validWorkItems,
    };
  }).filter(category => {
    // Keep all categories, even empty ones (user might add items later)
    if (category.workItems.length === 0) {
      console.warn(`⚠️ Category "${category.name}" has no valid work items - keeping category`);
    }
    return true;
  });
}

/**
 * ✅ ENHANCED: Single function to handle both creating and updating projects
 */
async function createOrUpdate(req, res, isUpdate = false) {
  try {
    const { customerInfo, categories = [], settings = {} } = req.body;

    console.log('\n=== CONTROLLER DEBUG START ===');
    console.log(`📝 Operation: ${isUpdate ? 'UPDATE' : 'CREATE'}`);
    console.log(`👤 User ID: ${req.user._id}`);
    console.log(`📁 Raw categories count: ${categories.length}`);
    
    // ✅ Enhanced logging for debugging
    categories.forEach((cat, i) => {
      console.log(`\n📂 Category ${i}: ${cat.name} (${cat.key})`);
      console.log(`   Work items: ${(cat.workItems || []).length}`);
      (cat.workItems || []).forEach((item, j) => {
        const customInfo = item.type === 'custom-work-type' 
          ? ` | customName="${item.customWorkTypeName || 'MISSING'}"` 
          : '';
        console.log(`   - Item ${j}: "${item.name}" | type="${item.type}"${customInfo}`);
      });
    });

    // ✅ Validate input
    if (!Array.isArray(categories) || categories.length === 0) {
      console.error('❌ Invalid categories:', categories);
      return res.status(400).json({ 
        error: 'Validation failed.',
        details: ['Project must have at least one category'],
        paths: ['categories']
      });
    }

    // ✅ FIX #5: Enhanced category validation with better error handling
    let fixedCategories;
    try {
      fixedCategories = ensureCategoryKeys(categories);
      console.log(`\n✅ Fixed categories: ${fixedCategories.length} categories processed`);
      
      // Count total valid work items
      const totalWorkItems = fixedCategories.reduce((sum, cat) => sum + cat.workItems.length, 0);
      const customWorkItems = fixedCategories.reduce((sum, cat) => {
        return sum + cat.workItems.filter(item => item.type === 'custom-work-type').length;
      }, 0);
      
      console.log(`📊 Total valid work items: ${totalWorkItems} (${customWorkItems} custom)`);
      
      // ✅ Enhanced validation: Ensure at least one valid work item exists
      if (totalWorkItems === 0) {
        console.warn('⚠️ No valid work items found in any category');
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

    console.log('=== CONTROLLER DEBUG END ===\n');

    let project;
    const options = { 
      new: true, 
      runValidators: true,
      context: 'query'
    };

    if (isUpdate) {
      console.log(`🔄 Updating project: ${req.params.id}`);
      project = await Project.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { $set: projectData },
        options
      );
      if (!project) {
        console.error(`❌ Project not found or unauthorized: ${req.params.id}`);
        return res.status(404).json({ 
          error: 'Project not found or you do not have permission to edit it.' 
        });
      }
      console.log(`✅ Project updated successfully: ${project._id}`);
    } else {
      console.log('➕ Creating new project');
      project = new Project(projectData);
      await project.save();
      console.log(`✅ Project created successfully: ${project._id}`);
    }
    
    res.status(isUpdate ? 200 : 201).json(project);

  } catch (err) {
    console.error(`\n❌ Error in ${isUpdate ? 'update' : 'create'} operation:`, err);
    
    // ✅ Enhanced error logging for validation issues
    if (err.name === 'ValidationError') {
      console.log('\n=== VALIDATION ERROR DETAILS ===');
      console.log('Full validation error:', err.message);
      console.log('Error paths:', Object.keys(err.errors));
      
      Object.entries(err.errors).forEach(([path, error]) => {
        console.log(`\n❌ Path: ${path}`);
        console.log(`   Message: ${error.message}`);
        console.log(`   Value:`, error.value);
        console.log(`   Kind: ${error.kind}`);
      });
      console.log('=== END VALIDATION ERROR DETAILS ===\n');
      
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
    
    // Handle duplicate key errors
    if (err.code === 11000) {
      console.error('❌ Duplicate key error:', err);
      return res.status(400).json({
        error: 'Duplicate entry.',
        details: ['A record with this information already exists.'],
        paths: Object.keys(err.keyPattern || {})
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
    console.log(`✅ Retrieved ${projects.length} projects for user ${req.user._id}`);
    res.json(projects);
  } catch (err) {
    console.error('❌ Error fetching projects:', err);
    res.status(500).json({ error: 'Server error retrieving projects.' });
  }
}

async function show(req, res) {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!project) {
      console.warn(`⚠️ Project not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Project not found.' });
    }
    
    // ✅ FIX #6: Post-fetch validation and repair for corrupted data
    let needsRepair = false;
    
    project.categories.forEach((category, catIndex) => {
      category.workItems.forEach((item, itemIndex) => {
        // Check for custom work types without names
        if (item.type === 'custom-work-type' && (!item.customWorkTypeName || !item.customWorkTypeName.trim())) {
          console.warn(`⚠️ Found corrupted custom work type in project ${project._id}, category ${catIndex}, item ${itemIndex}`);
          console.warn(`   Repairing: Setting customWorkTypeName to "Unnamed Custom Work"`);
          item.customWorkTypeName = 'Unnamed Custom Work';
          needsRepair = true;
        }
      });
    });
    
    // If we found corruption, save the repaired project
    if (needsRepair) {
      try {
        await project.save({ validateBeforeSave: false });
        console.log(`✅ Auto-repaired corrupted project: ${project._id}`);
      } catch (saveErr) {
        console.error(`❌ Failed to auto-repair project ${project._id}:`, saveErr.message);
        // Continue anyway - send the repaired data even if save failed
      }
    }
    
    console.log(`✅ Retrieved project: ${project._id} (${project.customerInfo.projectName})`);
    res.json(project);
  } catch (err) {
    console.error(`❌ Error fetching project ${req.params.id}:`, err);
    res.status(500).json({ error: 'Server error retrieving project.' });
  }
}

async function deleteProject(req, res) {
  try {
    const project = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    
    if (!project) {
      console.warn(`⚠️ Project not found for deletion: ${req.params.id}`);
      return res.status(404).json({ error: 'Project not found.' });
    }
    
    console.log(`✅ Project deleted successfully: ${req.params.id} (${project.customerInfo.projectName})`);
    res.status(200).json({ message: 'Project deleted successfully.' });
  } catch (err) {
    console.error(`❌ Error deleting project ${req.params.id}:`, err);
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