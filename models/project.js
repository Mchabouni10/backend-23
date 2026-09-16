// models/project.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// --- Constants & Helper Functions ---

const validateCategoryKey = (key) => {
  if (!key || typeof key !== 'string') return false;
  return key.trim().length > 0;
};

const validateWorkType = (categoryKey, workType) => {
  if (!categoryKey || !workType || typeof workType !== 'string') {
    return false;
  }
  return workType.trim().length > 0;
};

const normalizeToCanonicalMeasurementType = (type) => {
  if (!type || typeof type !== 'string') return 'square-foot';
  const t = type.toLowerCase().trim();
  if (['sqft', 'square-foot', 'square foot', 'single-surface'].includes(t)) return 'square-foot';
  if (['linear-foot', 'linear ft', 'linear'].includes(t)) return 'linear-foot';
  if (['by-unit', 'by unit', 'unit', 'units'].includes(t)) return 'by-unit';
  return 'square-foot';
};

// --- Sub-Schemas ---

const surfaceSchema = new Schema({
  id: { type: String, default: '', trim: true },
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

const workItemSchema = new Schema({
  name: { type: String, required: [true, 'Work item name is required.'], trim: true },
  customWorkTypeName: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: function (v) {
        if (this.type === 'custom-work-type') {
          return v && v.trim().length > 0;
        }
        return true;
      },
      message: 'Custom work type name is required when using custom work types.',
    },
  },
  type: {
    type: String,
    required: [true, 'Work item type is required.'],
    trim: true,
    validate: {
      validator: function (v) {
        try {
          let categoryKey = this.categoryKey;
          if (!categoryKey && this.parent && this.parent()) {
            const parent = this.parent();
            if (parent.key) categoryKey = parent.key;
          }
          if (!categoryKey) {
            console.warn(`⚠️ Cannot validate work type: categoryKey not available for type "${v}"`);
            return true;
          }
          const isValid = validateWorkType(categoryKey, v);
          if (!isValid) {
            console.log(`❌ Validation failed: work type "${v}" for category "${categoryKey}"`);
          }
          return isValid;
        } catch (error) {
          console.error('❌ Error validating work type:', error);
          return false;
        }
      },
      message: function (props) {
        const categoryKey = this.categoryKey || this.parent?.()?.key || 'unknown';
        return `"${props.value}" is not a valid work type for category "${categoryKey}".`;
      },
    },
  },
  subtype: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  surfaces: { type: [surfaceSchema], default: [] },
  materialCost: { type: Number, default: 0, min: 0 },
  laborCost: { type: Number, default: 0, min: 0 },
  notes: { type: String, default: '', trim: true },
  measurementType: { type: String, required: true, default: 'square-foot' },
  categoryKey: { type: String },
});

const categorySchema = new Schema({
  name: { type: String, required: [true, 'Category name is required.'], trim: true },
  key: {
    type: String,
    required: [true, 'Category key is required.'],
    trim: true,
    validate: [validateCategoryKey, 'Invalid category key.'],
  },
  workItems: { type: [workItemSchema], default: [] },
});

const miscFeeSchema = new Schema({
  name: { type: String, required: [true, 'Fee name is required.'], trim: true },
  amount: { type: Number, required: true, min: 0 },
});

// ─── Credits: price adjustments (damaged product, price change, customer ──
// dissatisfaction, etc). These reduce the project's grand total itself —
// they are NOT a payment/refund, and are distinct from settings.payments.
// Shape must match EMPTY_CREDIT() in PaymentTracking.jsx: { id, date,
// amount, reason, createdAt, updatedAt }.
const creditSchema = new Schema(
  {
    id: { type: String, default: '', trim: true, index: true },
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: [true, 'Credit reason is required.'], trim: true },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  {
    _id: true,
  }
);

// ─── FIXED: Complete payment schema with all fields ────────────────────────────
const paymentSchema = new Schema(
  {
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    // ─── CRITICAL: 'type' is the field the frontend uses ──────────────
    // Must match exactly: "Deposit", "Installment", "Refund", "Other"
    type: {
      type: String,
      enum: ['Deposit', 'Installment', 'Refund', 'Other'],
      required: true,
      default: 'Installment',
    },
    // Backward compatibility field
    paymentType: {
      type: String,
      enum: ['Deposit', 'Installment', 'Refund', 'Other'],
      default: 'Installment',
    },
    method: {
      type: String,
      enum: [
        'Credit', 'Debit', 'Check', 'Cash', 'Zelle',
        'Deposit', 'Installment', 'Wire',
        'Bank Transfer', 'PayPal', 'Venmo', 'CashApp', 'Other',
      ],
      default: 'Cash',
    },
    note: { type: String, default: '', trim: true },
    isPaid: { type: Boolean, default: true },
    status: { type: String, enum: ['Pending', 'Paid', 'Overdue'], default: 'Paid' },
    
    // ─── CRITICAL: Fields for installment tracking ──────────────────────
    paidMethod: { type: String, default: '', trim: true },
    manuallyAdjusted: { type: Boolean, default: false },
    paidAt: { type: Date },
    createdAt: { type: Date },
    updatedAt: { type: Date },
    installmentNumber: { type: Number, index: true },
    totalInstallments: { type: Number },
    id: { type: String, default: '', trim: true, index: true },
    
    // Additional fields for payment tracking
    paymentNumber: { type: String, trim: true },
    reference: { type: String, trim: true },
    transactionId: { type: String, trim: true },
    checkNumber: { type: String, trim: true },
  },
  {
    _id: true,
  }
);

// ─── FIXED: Keep type/paymentType in sync ──────────────────────────────────
paymentSchema.pre('validate', function (next) {
  // If type is set but paymentType isn't, copy type to paymentType
  if (this.type && !this.paymentType) {
    this.paymentType = this.type;
  }
  // If paymentType is set but type isn't, copy paymentType to type
  if (this.paymentType && !this.type) {
    this.type = this.paymentType;
  }
  // If both are set but different, use type as the source of truth
  if (this.type && this.paymentType && this.type !== this.paymentType) {
    this.paymentType = this.type;
  }

  if (this.type === 'Refund') {
    this.isPaid = true;
    this.status = 'Paid';
  } else if (this.isPaid) {
    this.status = 'Paid';
  } else if (!this.status || this.status === 'Paid') {
    this.status = this.date && this.date < new Date() ? 'Overdue' : 'Pending';
  }

  next();
});

const wasteEntrySchema = new Schema({
  surfaceName: { type: String, default: '', trim: true },
  surfaceId: { type: String, default: '', trim: true },
  surfaceCost: { type: Number, default: 0, min: 0 },
  measurementType: { type: String, default: null, trim: true },
  wasteable: { type: Boolean, default: null },
  wasteFactor: { type: Number, default: 0, min: 0, max: 0.5 },
  manualOverride: { type: Boolean, default: false },
});

const settingsSchema = new Schema({
  taxRate: { type: Number, default: 0, min: 0, max: 1 },
  transportationFee: { type: Number, default: 0, min: 0 },
  wasteFactor: { type: Number, default: 0, min: 0, max: 1 },
  wasteEntries: { type: [wasteEntrySchema], default: [] },
  laborDiscount: { type: Number, default: 0, min: 0, max: 1 },
  markup: { type: Number, default: 0, min: 0, max: 10 },
  miscFees: { type: [miscFeeSchema], default: [] },
  payments: { type: [paymentSchema], default: [] },
  credits: { type: [creditSchema], default: [] },
});

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
    match: [/^\d{5}$/, 'ZIP code must be 5 digits.'],
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required.'],
    validate: {
      validator: (v) => /^\d{10,11}$/.test((v || '').replace(/\D/g, '')),
      message: 'Phone number must be a valid 10 or 11-digit number.',
    },
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please enter a valid email address.'],
    lowercase: true,
    trim: true,
  },
  projectName: { type: String, required: [true, 'Project name is required.'], trim: true },
  type: { type: String, enum: ['Residential', 'Commercial'], default: 'Residential' },
  paymentType: {
    type: String,
    enum: ['Credit', 'Debit', 'Check', 'Cash', 'Zelle', 'Deposit'],
    default: 'Cash',
  },
  startDate: { type: Date, required: [true, 'Start date is required.'] },
  finishDate: {
    type: Date,
    validate: {
      validator: function (v) { return !v || !this.startDate || v >= this.startDate; },
      message: 'Finish date cannot be before the start date.',
    },
  },
  notes: { type: String, default: '', trim: true },
  addressNumber: String,
  direction: String,
  streetName: String,
  streetType: String,
  signature: {
    dataUrl: { type: String, default: '' },
    date: { type: Date }
  }
});

// --- Main Project Schema ---

const projectSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    workflowStatus: { type: String, enum: ['draft', 'active', 'completed'], default: 'draft', index: true },
    customerInfo: { type: customerInfoSchema, required: true },
    categories: {
      type: [categorySchema],
      default: [],
      validate: [
        function (v) {
          const status = this.workflowStatus || this.get?.('workflowStatus') || this.getUpdate?.()?.$set?.workflowStatus;
          return status === 'draft' || (Array.isArray(v) && v.length > 0);
        },
        'Project must have at least one category.',
      ],
    },
    settings: { type: settingsSchema, default: {} },
    totals: {
      materialCost: { type: Number, default: 0 },
      laborCost: { type: Number, default: 0 },
      laborCostBeforeDiscount: { type: Number, default: 0 },
      laborDiscount: { type: Number, default: 0 },
      wasteCost: { type: Number, default: 0 },
      taxAmount: { type: Number, default: 0 },
      markupAmount: { type: Number, default: 0 },
      miscFeesTotal: { type: Number, default: 0 },
      creditsTotal: { type: Number, default: 0 },
      transportationFee: { type: Number, default: 0 },
      subtotal: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },
    paymentDetails: {
      totalPaid: { type: Number, default: 0 },
      totalDue: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
      depositAmount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    validateBeforeSave: true,
  }
);

// --- Hooks ---

projectSchema.pre('validate', function (next) {
  try {
    console.log('=== PRE-VALIDATE HOOK START ===');

    if (this.customerInfo) {
      const { addressNumber, direction, streetName, streetType } = this.customerInfo;
      if (addressNumber || streetName) {
        this.customerInfo.street = [addressNumber, direction, streetName, streetType]
          .filter(Boolean)
          .join(' ')
          .trim();
      }
    }

    if (Array.isArray(this.categories)) {
      this.categories.forEach((category, categoryIndex) => {
        if (!category || !Array.isArray(category.workItems)) {
          console.warn(`⚠️ Invalid category at index ${categoryIndex}:`, category);
          return;
        }

        console.log(`📁 Processing category ${categoryIndex}: key="${category.key}", name="${category.name}"`);

        category.workItems.forEach((item, itemIndex) => {
          if (!item) {
            console.warn(`⚠️ Invalid work item at category ${categoryIndex}, item ${itemIndex}`);
            return;
          }

          item.categoryKey = category.key;

          if (item.type === 'custom-work-type') {
            if (!item.customWorkTypeName || item.customWorkTypeName.trim() === '') {
              console.error(
                `❌ Custom work item at category ${categoryIndex}, item ${itemIndex} missing customWorkTypeName`,
              );
            } else {
              console.log(
                `  ✅ Custom work type "${item.customWorkTypeName}" validated for categoryKey="${category.key}"`,
              );
            }
          } else {
            console.log(`  ✅ Standard work type "${item.type}" for categoryKey="${category.key}"`);
          }

          item.measurementType = normalizeToCanonicalMeasurementType(item.measurementType);

          if (Array.isArray(item.surfaces)) {
            item.surfaces.forEach((surface) => {
              if (surface) {
                surface.measurementType = normalizeToCanonicalMeasurementType(
                  surface.measurementType,
                );
              }
            });
          }
        });
      });
    }

    console.log('=== PRE-VALIDATE HOOK END ===');
    next();
  } catch (error) {
    console.error('❌ Pre-validation hook error:', error);
    next(error);
  }
});

projectSchema.post('validate', function (doc) {
  console.log('✅ Project validation passed successfully');
  if (doc.categories) {
    const totalWorkItems = doc.categories.reduce(
      (sum, cat) => sum + (cat.workItems?.length || 0),
      0,
    );
    const customWorkItems = doc.categories.reduce((sum, cat) => {
      return (
        sum +
        (cat.workItems?.filter((item) => item.type === 'custom-work-type').length || 0)
      );
    }, 0);
    console.log(
      `📊 Validation summary: ${doc.categories.length} categories, ${totalWorkItems} work items (${customWorkItems} custom)`,
    );
  }
});

// --- Indexes ---
projectSchema.index({ userId: 1, 'customerInfo.lastName': 1 });
projectSchema.index({ userId: 1, 'customerInfo.startDate': 1 });
projectSchema.index({ userId: 1, createdAt: -1 });

// --- Static Methods ---

projectSchema.statics.validateAndRepairProjects = async function () {
  console.log('🔧 Starting project validation and repair...');
  const projects = await this.find({});
  const repairs = [];

  for (const project of projects) {
    let needsRepair = false;
    project.categories.forEach((category) => {
      category.workItems.forEach((item) => {
        if (
          item.type === 'custom-work-type' &&
          (!item.customWorkTypeName || !item.customWorkTypeName.trim())
        ) {
          item.customWorkTypeName = 'Unnamed Custom Work';
          needsRepair = true;
        }
      });
    });

    if (needsRepair) {
      try {
        await project.save({ validateBeforeSave: false });
        repairs.push(project._id);
        console.log(`✅ Repaired project ${project._id}`);
      } catch (err) {
        console.error(`❌ Failed to repair project ${project._id}:`, err.message);
      }
    }
  }

  console.log(`✅ Repair complete. Fixed ${repairs.length} projects.`);
  return { repaired: repairs.length, projectIds: repairs };
};

projectSchema.statics.migrateDepositToPayment = async function () {
  const projectsToMigrate = await this.find({
    'settings.deposit': { $exists: true, $gt: 0 },
  });

  if (projectsToMigrate.length === 0) {
    console.log('No projects with legacy deposits found to migrate.');
    return { migrated: 0 };
  }

  const migrationPromises = projectsToMigrate.map(async (project) => {
    const hasExistingDepositPayment = project.settings.payments.some(
      (p) => p.method === 'Deposit',
    );

    if (!hasExistingDepositPayment) {
      project.settings.payments.push({
        date:
          project.settings.depositDate ||
          project.customerInfo.startDate ||
          new Date(),
        amount: project.settings.deposit,
        method: 'Deposit',
        note: 'Initial Deposit (migrated from old system)',
        isPaid: true,
        status: 'Paid',
        type: 'Deposit',
        paymentType: 'Deposit',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      project.set('settings.deposit', undefined);
      project.set('settings.depositMethod', undefined);
      project.set('settings.depositDate', undefined);

      try {
        await project.save({ validateBeforeSave: false });
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
