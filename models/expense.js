// models/expense.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// --- Constants ---
const EXPENSE_CATEGORIES = [
  'fuel', 'vehicle_maint', 'phone', 'website', 'software', 'marketing',
  'insurance', 'tools', 'material', 'subcontractors', 'permits', 'office',
  'rent', 'disposal', 'taxes', 'meals', 'other'
];

// --- Sub-Schemas ---
const recurringExpenseSchema = new Schema({
  enabled: { type: Boolean, default: false },
  frequency: { 
    type: String, 
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    default: 'monthly'
  },
  nextDueDate: { type: Date },
  autoCreate: { type: Boolean, default: false }
}, { _id: false });

const attachmentSchema = new Schema({
  filename: { type: String, required: true },
  url: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  size: { type: Number },
  mimeType: { type: String }
}, { _id: false });

// --- Main Expense Schema ---
const expenseSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'User ID is required.'],
    index: true 
  },
  
  date: { 
    type: Date, 
    required: [true, 'Expense date is required.'],
    index: true
  },
  
  category: {
    type: String,
    required: [true, 'Category is required.'],
    enum: {
      values: EXPENSE_CATEGORIES,
      message: '{VALUE} is not a valid expense category.'
    },
    index: true
  },
  
  amount: {
    type: Number,
    required: [true, 'Amount is required.'],
    min: [0.01, 'Amount must be at least $0.01'],
    validate: {
      validator: function(v) {
        return Number.isFinite(v) && v > 0;
      },
      message: 'Amount must be a positive number.'
    }
  },
  
  description: {
    type: String,
    trim: true,
    default: '',
    maxlength: [500, 'Description cannot exceed 500 characters.']
  },
  
  projectId: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    default: null
  },
  
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Credit', 'Debit', 'Check', 'ACH', 'Wire Transfer', 'Other'],
    default: 'Cash'
  },
  
  vendor: {
    type: String,
    trim: true,
    default: '',
    maxlength: [200, 'Vendor name cannot exceed 200 characters.']
  },
  
  attachments: {
    type: [attachmentSchema],
    default: []
  },
  
  taxDeductible: {
    type: Boolean,
    default: true
  },
  
  recurring: {
    type: recurringExpenseSchema,
    default: () => ({ enabled: false })
  },
  
  parentExpenseId: {
    type: Schema.Types.ObjectId,
    ref: 'Expense',
    default: null
  },
  
  notes: {
    type: String,
    trim: true,
    default: '',
    maxlength: [1000, 'Notes cannot exceed 1000 characters.']
  },
  
  status: {
    type: String,
    enum: ['Draft', 'Pending', 'Approved', 'Rejected', 'Paid'],
    default: 'Approved'
  },
  
  tags: {
    type: [String],
    default: []
  }
  
}, {
  timestamps: true,
  validateBeforeSave: true
});

// --- Indexes for Performance ---
expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, category: 1 });
expenseSchema.index({ userId: 1, createdAt: -1 });
expenseSchema.index({ userId: 1, projectId: 1 });

// --- Instance Methods ---

expenseSchema.methods.isCurrentMonth = function() {
  const now = new Date();
  const expenseDate = new Date(this.date);
  return expenseDate.getMonth() === now.getMonth() && 
         expenseDate.getFullYear() === now.getFullYear();
};

expenseSchema.methods.isCurrentYear = function() {
  const now = new Date();
  const expenseDate = new Date(this.date);
  return expenseDate.getFullYear() === now.getFullYear();
};

expenseSchema.methods.toExportFormat = function() {
  return {
    date: this.date.toISOString().split('T')[0],
    category: this.category,
    description: this.description || '',
    amount: this.amount.toFixed(2),
    vendor: this.vendor || '',
    paymentMethod: this.paymentMethod,
    taxDeductible: this.taxDeductible ? 'Yes' : 'No',
    notes: this.notes || ''
  };
};

// --- Static Methods (FIXED) ---

expenseSchema.statics.getSummary = async function(userId, startDate, endDate) {
  const pipeline = [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId), // FIXED
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { total: -1 }
    }
  ];
  
  return await this.aggregate(pipeline);
};

expenseSchema.statics.getMonthlyTotals = async function(userId, year) {
  const pipeline = [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId), // FIXED
        date: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31T23:59:59.999Z`)
        }
      }
    },
    {
      $group: {
        _id: { $month: '$date' },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ];
  
  return await this.aggregate(pipeline);
};

expenseSchema.statics.getTopVendors = async function(userId, limit = 10) {
  const pipeline = [
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId), // FIXED
        vendor: { $exists: true, $ne: '' }
      }
    },
    {
      $group: {
        _id: '$vendor',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { total: -1 }
    },
    {
      $limit: limit
    }
  ];
  
  return await this.aggregate(pipeline);
};

expenseSchema.statics.bulkCreateFromTemplate = async function(templateExpense, dates) {
  const expenses = dates.map(date => ({
    userId: templateExpense.userId,
    date: date,
    category: templateExpense.category,
    amount: templateExpense.amount,
    description: templateExpense.description,
    paymentMethod: templateExpense.paymentMethod,
    vendor: templateExpense.vendor,
    taxDeductible: templateExpense.taxDeductible,
    parentExpenseId: templateExpense._id,
    status: 'Approved'
  }));
  
  return await this.insertMany(expenses);
};

// --- Pre-save Middleware ---
expenseSchema.pre('save', function(next) {
  // Round amount to 2 decimal places
  if (this.amount) {
    this.amount = Math.round(this.amount * 100) / 100;
  }
  
  // Set next due date for recurring expenses
  if (this.recurring && this.recurring.enabled && !this.recurring.nextDueDate) {
    const nextDate = new Date(this.date);
    switch (this.recurring.frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }
    this.recurring.nextDueDate = nextDate;
  }
  
  next();
});

// --- Virtual Properties ---
expenseSchema.virtual('categoryName').get(function() {
  const categoryMap = {
    fuel: 'Fuel / Van',
    vehicle_maint: 'Vehicle Maintenance',
    phone: 'Phone Bill',
    website: 'Website / Hosting',
    software: 'Software / Subscriptions',
    marketing: 'Marketing / Ads',
    insurance: 'Insurance',
    tools: 'Tools',
    material: 'Materials',
    subcontractors: 'Subcontractors',
    permits: 'Permits / Licenses',
    office: 'Office Supplies',
    rent: 'Rent / Utilities',
    disposal: 'Waste Disposal',
    taxes: 'Taxes / Fees',
    meals: 'Meals / Entertainment',
    other: 'Other'
  };
  return categoryMap[this.category] || this.category;
});

module.exports = mongoose.model('Expense', expenseSchema);