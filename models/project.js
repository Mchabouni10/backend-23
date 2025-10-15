// models/project.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// --- Constants & Helper Functions ---

// A centralized definition of valid work types for each category, synchronized with workTypes.js
const VALID_WORK_TYPES = {
  kitchen: [
    'kitchen-flooring',
    'kitchen-tiles', 
    'kitchen-backsplash',
    'kitchen-ceiling',
    'kitchen-walls',
    'kitchen-countertop-surface',
    'kitchen-cabinet-doors',
    'kitchen-island-top',
    'kitchen-cabinets',
    'kitchen-countertops',
    'kitchen-trim',
    'kitchen-island-edge',
    'kitchen-crown-molding',
    'kitchen-toe-kicks',
    'kitchen-cabinet-lighting',
    'kitchen-under-cabinet-strips',
    'kitchen-sink',
    'kitchen-faucet',
    'kitchen-lighting',
    'kitchen-appliance',
    'kitchen-hood',
    'kitchen-garbage-disposal',
    'kitchen-cabinet-hardware',
    'kitchen-outlet',
    'kitchen-switch',
    'kitchen-pantry-organizer',
  ],
  bathroom: [
    'bathroom-flooring',
    'bathroom-tiles',
    'bathroom-shower-tiles', 
    'bathroom-walls',
    'bathroom-ceiling',
    'bathroom-shower-floor',
    'bathroom-vanity-top',
    'bathroom-mirror-wall',
    'bathroom-vanity',
    'bathroom-trim',
    'bathroom-wainscoting',
    'bathroom-shower-trim',
    'bathroom-tub-surround',
    'bathroom-chair-rail',
    'bathroom-towel-bars',
    'bathroom-grab-bars',
    'bathroom-faucet',
    'bathroom-shower-faucet',
    'bathroom-fan',
    'bathroom-towel-warmer',
    'bathroom-toilet',
    'bathroom-mirror',
    'bathroom-lighting',
    'bathroom-bathtub',
    'bathroom-shower-ledge',
    'bathroom-medicine-cabinet',
    'bathroom-outlet',
    'bathroom-shower-door',
  ],
  'living-room': [
    'living-room-flooring',
    'living-room-walls',
    'living-room-ceiling',
    'living-room-accent-wall',
    'living-room-fireplace-surround',
    'living-room-built-in-shelving',
    'living-room-window-treatments',
    'living-room-trim',
    'living-room-crown-molding',
    'living-room-wainscoting',
    'living-room-chair-rail',
    'living-room-baseboard',
    'living-room-picture-ledge',
    'living-room-mantle',
    'living-room-cable-management',
    'living-room-lighting',
    'living-room-fireplace',
    'living-room-ceiling-fan',
    'living-room-tv-mount',
    'living-room-outlet',
    'living-room-switch',
    'living-room-window',
    'living-room-door',
    'living-room-built-in-cabinet',
    'living-room-speaker',
  ],
  bedroom: [
    'bedroom-flooring',
    'bedroom-walls',
    'bedroom-ceiling',
    'bedroom-closet-interior',
    'bedroom-accent-wall',
    'bedroom-window-treatments',
    'bedroom-headboard-wall',
    'bedroom-trim',
    'bedroom-closet-shelves',
    'bedroom-crown-molding',
    'bedroom-baseboard',
    'bedroom-chair-rail',
    'bedroom-closet-rods',
    'bedroom-window-sills',
    'bedroom-built-in-bench',
    'bedroom-lighting',
    'bedroom-ceiling-fan',
    'bedroom-window',
    'bedroom-closet-organizer',
    'bedroom-door',
    'bedroom-outlet',
    'bedroom-switch',
    'bedroom-closet-door',
    'bedroom-built-in-drawer',
    'bedroom-mirror',
  ],
  exterior: [
    'exterior-deck',
    'exterior-siding',
    'exterior-painting',
    'exterior-roofing',
    'exterior-patio',
    'exterior-driveway',
    'exterior-walkway',
    'exterior-retaining-wall',
    'exterior-fencing',
    'exterior-trim',
    'exterior-gutters',
    'exterior-deck-railing',
    'exterior-soffit',
    'exterior-fascia',
    'exterior-foundation-trim',
    'exterior-landscape-edging',
    'exterior-door',
    'exterior-window',
    'exterior-lighting',
    'exterior-mailbox',
    'exterior-gate',
    'exterior-outlet',
    'exterior-shutter',
    'exterior-downspout',
    'exterior-vent',
    'exterior-house-number',
  ],
  electricity: [
    'electricity-wiring',
    'electricity-panel-upgrade',
    'electricity-circuit-breaker',
    'electricity-outlet-installation',
    'electricity-lighting-fixture',
    'electricity-ceiling-fan-installation',
    'electricity-switch-installation',
    'electricity-surge-protector',
    'electricity-grounding-system',
    'electricity-smoke-detector-installation',
    'electricity-smart-home-integration',
    'electricity-exterior-lighting',
    'electricity-appliance-circuit',
  ],
  plumbing: [
    'plumbing-pipe-installation',
    'plumbing-faucet-installation',
    'plumbing-toilet-installation',
    'plumbing-shower-installation',
    'plumbing-sink-installation',
    'plumbing-water-heater',
    'plumbing-drain-cleaning',
    'plumbing-leak-repair',
    'plumbing-valve-replacement',
    'plumbing-sump-pump',
    'plumbing-water-line',
    'plumbing-sewer-line',
  ],
  hallway: [
    'hallway-flooring',
    'hallway-walls',
    'hallway-ceiling',
    'hallway-lighting',
    'hallway-trim',
    'hallway-baseboard',
    'hallway-crown-molding',
    'hallway-wainscoting',
    'hallway-door',
    'hallway-runner',
    'hallway-wall-art-frame',
    'hallway-console-table',
    'hallway-mirror',
  ],
  general: [
    'general-drywall',
    'general-painting',
    'general-flooring',
    'general-ceiling',
    'general-wall-repair',
    'general-insulation',
    'general-paneling',
    'general-wallpaper',
    'general-trim',
    'general-molding',
    'general-chair-rail',
    'general-baseboard',
    'general-door-frame',
    'general-window-frame',
    'general-pipe-covering',
    'general-conduit-covering',
    'general-lighting',
    'general-window',
    'general-door',
    'general-outlet',
    'general-switch',
    'general-smoke-detector',
    'general-thermostat',
    'general-ceiling-medallion',
    'general-vent-cover',
    'general-access-panel',
  ],
};

// Validator function for category keys.
const validateCategoryKey = (key) => {
  if (!key) return false;
  return key.startsWith('custom_') || Object.keys(VALID_WORK_TYPES).includes(key);
};

// FIXED: Validator function for work types - now handles custom work types
const validateWorkType = (categoryKey, workType) => {
  if (!categoryKey || !workType) {
    console.warn(`Validation skipped: categoryKey=${categoryKey}, workType=${workType}`);
    return false;
  }
  
  // CRITICAL FIX: Allow custom work types (those starting with 'custom-')
  if (workType.startsWith('custom-')) {
    console.log(`Custom work type detected: ${workType} - VALID`);
    return true;
  }
  
  // Allow any work type for custom categories
  if (categoryKey.startsWith('custom_')) {
    console.log(`Custom category detected: ${categoryKey} - allowing work type: ${workType}`);
    return true;
  }
  
  // Check if the category exists in VALID_WORK_TYPES
  const validTypes = VALID_WORK_TYPES[categoryKey];
  if (!validTypes) {
    console.warn(`Category '${categoryKey}' not found in VALID_WORK_TYPES`);
    return false;
  }
  
  const isValid = validTypes.includes(workType);
  
  if (!isValid) {
    console.warn(`Invalid work type '${workType}' for category '${categoryKey}'. Valid types:`, validTypes);
  }
  
  return isValid;
};

// Normalizes various measurement type strings into one of three canonical values.
const normalizeToCanonicalMeasurementType = (type) => {
  if (!type || typeof type !== 'string') return 'sqft';
  const t = type.toLowerCase().trim();
  if (['sqft', 'square-foot', 'square foot', 'single-surface'].includes(t)) return 'sqft';
  if (['linear-foot', 'linear ft', 'linear'].includes(t)) return 'linear-foot';
  if (['by-unit', 'by unit', 'unit', 'units'].includes(t)) return 'by-unit';
  return 'sqft'; // Default fallback
};

// --- Sub-Schemas ---

// Clean and focused surface data structure.
const surfaceSchema = new Schema({
  name: { type: String, default: '', trim: true },
  measurementType: { type: String, required: true },
  width: { type: Number, default: 0, min: 0 },
  height: { type: Number, default: 0, min: 0 },
  sqft: { type: Number, default: 0, min: 0 },
  manualSqft: { type: Boolean, default: false },
  linearFt: { type: Number, default: 0, min: 0 },
  units: { type: Number, default: 0, min: 0 },
  length: { type: Number, default: 0, min: 0 },
});

// FIXED: Work item schema with custom work type support
const workItemSchema = new Schema({
  name: { type: String, required: [true, 'Work item name is required.'], trim: true },
  customWorkTypeName: { type: String, default: '', trim: true }, 
  type: {
    type: String,
    required: [true, 'Work item type is required.'],
    trim: true,
    validate: {
      validator: function(v) {
        try {
          // Get category key from the work item itself (set by pre-validate hook)
          const categoryKey = this.categoryKey;
          
          if (!categoryKey) {
            console.warn('Cannot validate work type: categoryKey not set');
            return true; // Allow if categoryKey isn't set (will be set by hook)
          }
          
          return validateWorkType(categoryKey, v);
        } catch (error) {
          console.error('Error validating work type:', error);
          return false;
        }
      },
      message: function(props) {
        const categoryKey = this.categoryKey || 'unknown';
        return `"${props.value}" is not a valid work type for category "${categoryKey}".`;
      }
    }
  },
  subtype: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  surfaces: { type: [surfaceSchema], default: [] },
  materialCost: { type: Number, default: 0, min: 0 },
  laborCost: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '', trim: true },
  measurementType: { type: String, required: true, default: 'sqft' },
  categoryKey: { type: String }, // Denormalized for easier access, set by pre-validate hook
});

const categorySchema = new Schema({
  name: { type: String, required: [true, 'Category name is required.'], trim: true },
  key: {
    type: String,
    required: [true, 'Category key is required.'],
    trim: true,
    validate: [validateCategoryKey, 'Invalid category key.']
  },
  workItems: { type: [workItemSchema], default: [] },
});

const miscFeeSchema = new Schema({
  name: { type: String, required: [true, 'Fee name is required.'], trim: true },
  amount: { type: Number, required: true, min: 0 },
});

const paymentSchema = new Schema({
  date: { type: Date, required: true },
  amount: { type: Number, required: true, min: 0.01 },
  method: {
    type: String,
    enum: ['Credit', 'Debit', 'Check', 'Cash', 'Zelle', 'Deposit'],
    default: 'Cash',
  },
  note: { type: String, default: '', trim: true },
  isPaid: { type: Boolean, default: true },
  status: { type: String, enum: ['Pending', 'Paid', 'Overdue'], default: 'Paid' },
}, { timestamps: true });

// Settings are for user inputs only. Calculated totals are removed to prevent data inconsistency.
const settingsSchema = new Schema({
  taxRate: { type: Number, default: 0, min: 0, max: 1 },
  transportationFee: { type: Number, default: 0, min: 0 },
  wasteFactor: { type: Number, default: 0, min: 0, max: 1 },
  laborDiscount: { type: Number, default: 0, min: 0, max: 1 },
  markup: { type: Number, default: 0, min: 0, max: 10 },
  miscFees: { type: [miscFeeSchema], default: [] },
  payments: { type: [paymentSchema], default: [] },
});

// Customer info with stronger validation.
const customerInfoSchema = new Schema({
  firstName: { type: String, required: [true, 'First name is required.'], trim: true },
  lastName: { type: String, required: [true, 'Last name is required.'], trim: true },
  street: { type: String, required: [true, 'Street address is required.'], trim: true },
  unit: { type: String, default: '', trim: true },
  city: { type: String, required: [true, 'City is required.'], trim: true },
  state: { type: String, required: [true, 'State is required.'], default: 'IL', trim: true },
  zipCode: {
    type: String,
    required: [true, 'ZIP code is required.'],
    match: [/^\d{5}$/, 'ZIP code must be 5 digits.']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required.'],
    validate: {
      validator: (v) => /^\d{10,11}$/.test((v || '').replace(/\D/g, '')),
      message: 'Phone number must be a valid 10 or 11-digit number.'
    }
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please enter a valid email address.'],
    lowercase: true,
    trim: true
  },
  projectName: { type: String, required: [true, 'Project name is required.'], trim: true },
  type: { type: String, enum: ['Residential', 'Commercial'], default: 'Residential' },
  paymentType: { type: String, enum: ['Credit', 'Debit', 'Check', 'Cash', 'Zelle', 'Deposit'], default: 'Cash' },
  startDate: { type: Date, required: [true, 'Start date is required.'] },
  finishDate: {
    type: Date,
    validate: {
      validator: function(v) { return !v || !this.startDate || v >= this.startDate; },
      message: 'Finish date cannot be before the start date.'
    }
  },
  notes: { type: String, default: '', trim: true },
  // Frontend helpers for address components
  addressNumber: String,
  direction: String,
  streetName: String,
  streetType: String,
});

// --- Main Project Schema ---
const projectSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerInfo: { type: customerInfoSchema, required: true },
  categories: {
    type: [categorySchema],
    default: [],
    validate: [(v) => Array.isArray(v) && v.length > 0, 'Project must have at least one category.']
  },
  settings: { type: settingsSchema, default: {} },

  // Stores results from the backend calculation engine.
  totals: {
    materialCost: { type: Number, default: 0 },
    laborCost: { type: Number, default: 0 }, // After discount
    laborCostBeforeDiscount: { type: Number, default: 0 },
    laborDiscount: { type: Number, default: 0 },
    wasteCost: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    markupAmount: { type: Number, default: 0 },
    miscFeesTotal: { type: Number, default: 0 },
    transportationFee: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 }, // Includes waste cost
    total: { type: Number, default: 0 },
  },

  // Stores payment calculation results.
  paymentDetails: {
    totalPaid: { type: Number, default: 0 },
    totalDue: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    depositAmount: { type: Number, default: 0 },
  }
}, {
  timestamps: true,
  validateBeforeSave: true
});

// --- FIXED: Middleware (Hooks) ---

// Enhanced pre-validation hook to ensure categoryKey is set and log validation issues
projectSchema.pre('validate', function(next) {
  try {
    console.log('=== PRE-VALIDATE HOOK START ===');
    
    // 1. Assemble full street address from components if they exist.
    if (this.customerInfo) {
      const { addressNumber, direction, streetName, streetType } = this.customerInfo;
      if (addressNumber || streetName) {
        this.customerInfo.street = [addressNumber, direction, streetName, streetType].filter(Boolean).join(' ').trim();
      }
    }

    // 2. FIXED: Normalize measurement types and set category keys throughout the document.
    if (this.isModified('categories') && Array.isArray(this.categories)) {
      this.categories.forEach((category, categoryIndex) => {
        if (!category || !Array.isArray(category.workItems)) {
          console.warn(`Invalid category at index ${categoryIndex}:`, category);
          return;
        }
        
        console.log(`Processing category ${categoryIndex}: key=${category.key}, name=${category.name}`);
        
        category.workItems.forEach((item, itemIndex) => {
          if (!item) {
            console.warn(`Invalid work item at category ${categoryIndex}, item ${itemIndex}`);
            return;
          }

          // CRITICAL FIX: Set categoryKey for validation AND log it
          item.categoryKey = category.key;
          console.log(`Set categoryKey for work item "${item.name}" (type: ${item.type}): ${category.key}`);

          // Normalize measurement types to ensure data consistency.
          item.measurementType = normalizeToCanonicalMeasurementType(item.measurementType);
          
          if (Array.isArray(item.surfaces)) {
            item.surfaces.forEach(surface => {
              if (surface) {
                surface.measurementType = normalizeToCanonicalMeasurementType(surface.measurementType);
              }
            });
          }
          
          console.log(`Work item ${itemIndex} processed: type=${item.type}, categoryKey=${item.categoryKey}, measurementType=${item.measurementType}`);
        });
      });
    }
    
    console.log('=== PRE-VALIDATE HOOK END ===');
    next();
  } catch (error) {
    console.error('Pre-validation hook error:', error);
    next(error);
  }
});

// --- Indexes ---
projectSchema.index({ userId: 1, 'customerInfo.lastName': 1 });
projectSchema.index({ userId: 1, 'customerInfo.startDate': 1 });
projectSchema.index({ userId: 1, createdAt: -1 });

// --- Static Methods ---

// A helper to migrate legacy projects with 'deposit' fields to the new payment system.
projectSchema.statics.migrateDepositToPayment = async function() {
  // Find projects that have the old 'settings.deposit' field with a value.
  const projectsToMigrate = await this.find({
    'settings.deposit': { $exists: true, $gt: 0 }
  });

  if (projectsToMigrate.length === 0) {
    console.log('No projects with legacy deposits found to migrate.');
    return { migrated: 0 };
  }

  const migrationPromises = projectsToMigrate.map(async (project) => {
    const hasExistingDepositPayment = project.settings.payments.some(p => p.method === 'Deposit');

    // Only migrate if a 'Deposit' payment doesn't already exist.
    if (!hasExistingDepositPayment) {
      project.settings.payments.push({
        date: project.settings.depositDate || project.customerInfo.startDate || new Date(),
        amount: project.settings.deposit,
        method: 'Deposit',
        note: 'Initial Deposit (migrated from old system)',
        isPaid: true,
        status: 'Paid',
      });

      // Mark the old paths for removal upon save.
      project.set('settings.deposit', undefined);
      project.set('settings.depositMethod', undefined);
      project.set('settings.depositDate', undefined);

      try {
        await project.save({ validateBeforeSave: false }); // Skip validation for migration
        return 1;
      } catch (err) {
        console.error(`Failed to migrate project ${project._id}:`, err);
        return 0;
      }
    }
    return 0;
  });

  const results = await Promise.all(migrationPromises);
  const migratedCount = results.reduce((sum, result) => sum + result, 0);
  console.log(`Successfully migrated ${migratedCount} projects.`);

  return { migrated: migratedCount };
};

module.exports = mongoose.model('Project', projectSchema);
