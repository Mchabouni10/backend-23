// controllers/api/expenses.js
const Expense = require('../../models/expense');

// --- Helper Functions ---

/**
 * Calculate totals for different time periods
 * FIXED: Better date handling with timezone awareness
 */
function calculatePeriodTotals(expenses) {
  const now = new Date();
  
  // Get start and end of today in local timezone
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  // Get start and end of current week (Sunday to Saturday)
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  // Get start and end of current month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Get start and end of current year
  const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  let daily = 0;
  let weekly = 0;
  let monthly = 0;
  let yearly = 0;

  expenses.forEach(exp => {
    const amount = exp.amount;
    const expDate = new Date(exp.date);
    
    // Daily
    if (expDate >= startOfDay && expDate <= endOfDay) {
      daily += amount;
    }
    
    // Weekly
    if (expDate >= startOfWeek && expDate <= endOfWeek) {
      weekly += amount;
    }
    
    // Monthly
    if (expDate >= startOfMonth && expDate <= endOfMonth) {
      monthly += amount;
    }
    
    // Yearly
    if (expDate >= startOfYear && expDate <= endOfYear) {
      yearly += amount;
    }
  });

  return {
    daily: Number(daily.toFixed(2)),
    weekly: Number(weekly.toFixed(2)),
    monthly: Number(monthly.toFixed(2)),
    yearly: Number(yearly.toFixed(2))
  };
}

/**
 * Calculate category breakdown
 */
function calculateCategoryBreakdown(expenses) {
  const categoryTotals = {};
  let totalSpending = 0;
  
  expenses.forEach(exp => {
    const amount = exp.amount;
    totalSpending += amount;
    
    if (categoryTotals[exp.category]) {
      categoryTotals[exp.category] += amount;
    } else {
      categoryTotals[exp.category] = amount;
    }
  });
  
  const breakdown = Object.entries(categoryTotals).map(([category, total]) => ({
    category,
    total: Number(total.toFixed(2)),
    percentage: totalSpending > 0 ? Number(((total / totalSpending) * 100).toFixed(1)) : 0
  }));
  
  // Sort by total descending
  breakdown.sort((a, b) => b.total - a.total);
  
  return {
    breakdown,
    totalSpending: Number(totalSpending.toFixed(2))
  };
}

// --- API Methods ---

/**
 * POST /api/expenses - Create a new expense
 */
async function create(req, res) {
  try {
    // Validate required fields
    if (!req.body.date) {
      return res.status(400).json({ 
        error: 'Date is required.' 
      });
    }
    
    if (!req.body.amount || req.body.amount <= 0) {
      return res.status(400).json({ 
        error: 'Valid amount is required.' 
      });
    }
    
    if (!req.body.category) {
      return res.status(400).json({ 
        error: 'Category is required.' 
      });
    }

    const expenseData = {
      userId: req.user._id,
      date: req.body.date,
      category: req.body.category,
      amount: parseFloat(req.body.amount),
      description: req.body.description || '',
      paymentMethod: req.body.paymentMethod || 'Cash',
      vendor: req.body.vendor || '',
      taxDeductible: req.body.taxDeductible !== undefined ? req.body.taxDeductible : true,
      notes: req.body.notes || '',
      status: req.body.status || 'Approved',
      tags: req.body.tags || []
    };
    
    console.log('➕ Creating expense:', {
      userId: req.user._id,
      category: expenseData.category,
      amount: expenseData.amount,
      date: expenseData.date
    });
    
    const expense = await Expense.create(expenseData);
    
    console.log('✅ Expense created successfully:', expense._id);
    res.status(201).json(expense);
    
  } catch (err) {
    console.error('❌ Error creating expense:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed.', 
        details: messages,
        paths: Object.keys(err.errors)
      });
    }
    
    return res.status(500).json({ 
      error: 'An internal server error occurred.',
      details: err.message
    });
  }
}

/**
 * GET /api/expenses - List all expenses for the authenticated user
 */
async function index(req, res) {
  try {
    const { startDate, endDate, category, month, year, limit, sort } = req.query;
    
    // Build query
    const query = { userId: req.user._id };
    
    // Date filtering with better handling
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.date.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    } else if (month) {
      // Month format: YYYY-MM
      const [y, m] = month.split('-');
      const startOfMonth = new Date(parseInt(y), parseInt(m) - 1, 1, 0, 0, 0, 0);
      const endOfMonth = new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999);
      query.date = { $gte: startOfMonth, $lte: endOfMonth };
    } else if (year) {
      const startOfYear = new Date(parseInt(year), 0, 1, 0, 0, 0, 0);
      const endOfYear = new Date(parseInt(year), 11, 31, 23, 59, 59, 999);
      query.date = { $gte: startOfYear, $lte: endOfYear };
    }
    
    // Category filtering
    if (category) {
      query.category = category;
    }
    
    console.log('🔍 Query:', JSON.stringify(query, null, 2));
    
    // Execute query
    const queryBuilder = Expense.find(query)
      .sort(sort || '-date')
      .limit(limit ? parseInt(limit) : 1000);
    
    const expenses = await queryBuilder;
    
    console.log(`✅ Retrieved ${expenses.length} expenses for user ${req.user._id}`);
    res.json(expenses);
    
  } catch (err) {
    console.error('❌ Error fetching expenses:', err);
    res.status(500).json({ 
      error: 'Server error retrieving expenses.',
      details: err.message 
    });
  }
}

/**
 * GET /api/expenses/dashboard - Get dashboard data with totals and breakdowns
 */
async function dashboard(req, res) {
  try {
    // Get all expenses for the current year (for calculations)
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1, 0, 0, 0, 0);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
    
    console.log('📊 Dashboard query:', {
      userId: req.user._id,
      dateRange: { start: startOfYear, end: endOfYear }
    });
    
    const expenses = await Expense.find({
      userId: req.user._id,
      date: { $gte: startOfYear, $lte: endOfYear }
    }).sort('-date');
    
    console.log(`📈 Found ${expenses.length} expenses for dashboard`);
    
    // Calculate period totals
    const periodTotals = calculatePeriodTotals(expenses);
    
    // Calculate category breakdown
    const { breakdown, totalSpending } = calculateCategoryBreakdown(expenses);
    
    console.log(`✅ Dashboard data generated:`, {
      userId: req.user._id,
      periodTotals,
      totalSpending,
      expenseCount: expenses.length
    });
    
    res.json({
      periodTotals,
      categoryBreakdown: breakdown,
      totalSpending,
      expenseCount: expenses.length
    });
    
  } catch (err) {
    console.error('❌ Error fetching dashboard:', err);
    res.status(500).json({ 
      error: 'Server error retrieving dashboard data.',
      details: err.message 
    });
  }
}

/**
 * GET /api/expenses/:id - Get expense details
 */
async function show(req, res) {
  try {
    const expense = await Expense.findOne({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!expense) {
      console.warn(`⚠️ Expense not found: ${req.params.id}`);
      return res.status(404).json({ error: 'Expense not found.' });
    }
    
    console.log(`✅ Retrieved expense: ${expense._id}`);
    res.json(expense);
    
  } catch (err) {
    console.error(`❌ Error fetching expense ${req.params.id}:`, err);
    res.status(500).json({ 
      error: 'Server error retrieving expense.',
      details: err.message 
    });
  }
}

/**
 * PUT /api/expenses/:id - Update an expense
 */
async function update(req, res) {
  try {
    console.log(`🔄 Updating expense: ${req.params.id}`);
    
    // Prepare update data
    const updateData = {};
    const allowedFields = ['date', 'category', 'amount', 'description', 'paymentMethod', 'vendor', 'taxDeductible', 'notes', 'status', 'tags'];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });
    
    // Convert amount to number if present
    if (updateData.amount) {
      updateData.amount = parseFloat(updateData.amount);
    }
    
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: updateData },
      { 
        new: true, 
        runValidators: true
      }
    );
    
    if (!expense) {
      console.error(`❌ Expense not found or unauthorized: ${req.params.id}`);
      return res.status(404).json({ 
        error: 'Expense not found or you do not have permission to edit it.' 
      });
    }
    
    console.log(`✅ Expense updated successfully: ${expense._id}`);
    res.json(expense);
    
  } catch (err) {
    console.error(`❌ Error updating expense ${req.params.id}:`, err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ 
        error: 'Validation failed.', 
        details: messages,
        paths: Object.keys(err.errors)
      });
    }
    
    return res.status(500).json({ 
      error: 'An internal server error occurred.',
      details: err.message
    });
  }
}

/**
 * DELETE /api/expenses/:id - Delete an expense
 */
async function deleteExpense(req, res) {
  try {
    const expense = await Expense.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user._id 
    });
    
    if (!expense) {
      console.warn(`⚠️ Expense not found for deletion: ${req.params.id}`);
      return res.status(404).json({ error: 'Expense not found.' });
    }
    
    console.log(`✅ Expense deleted successfully: ${req.params.id}`);
    res.status(200).json({ message: 'Expense deleted successfully.' });
    
  } catch (err) {
    console.error(`❌ Error deleting expense ${req.params.id}:`, err);
    res.status(500).json({ 
      error: 'Server error deleting expense.',
      details: err.message 
    });
  }
}

/**
 * POST /api/expenses/bulk/delete - Bulk delete expenses
 */
async function bulkDelete(req, res) {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request. Provide an array of expense IDs.' 
      });
    }
    
    const result = await Expense.deleteMany({
      _id: { $in: ids },
      userId: req.user._id
    });
    
    console.log(`✅ Bulk deleted ${result.deletedCount} expenses`);
    res.json({ 
      message: `Successfully deleted ${result.deletedCount} expense(s).`,
      deletedCount: result.deletedCount
    });
    
  } catch (err) {
    console.error('❌ Error bulk deleting expenses:', err);
    res.status(500).json({ 
      error: 'Server error deleting expenses.',
      details: err.message 
    });
  }
}

/**
 * GET /api/expenses/reports/monthly - Get monthly report
 */
async function monthlyReport(req, res) {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    
    const monthlyTotals = await Expense.getMonthlyTotals(req.user._id, targetYear);
    
    // Fill in missing months with zero
    const fullReport = Array.from({ length: 12 }, (_, i) => {
      const monthData = monthlyTotals.find(m => m._id === i + 1);
      return {
        month: i + 1,
        monthName: new Date(targetYear, i, 1).toLocaleString('default', { month: 'long' }),
        total: monthData ? monthData.total : 0,
        count: monthData ? monthData.count : 0
      };
    });
    
    console.log(`✅ Generated monthly report for ${targetYear}`);
    res.json({ year: targetYear, months: fullReport });
    
  } catch (err) {
    console.error('❌ Error generating monthly report:', err);
    res.status(500).json({ 
      error: 'Server error generating report.',
      details: err.message 
    });
  }
}

/**
 * GET /api/expenses/reports/category - Get category summary
 */
async function categoryReport(req, res) {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();
    
    const summary = await Expense.getSummary(req.user._id, start, end);
    
    console.log(`✅ Generated category report from ${start.toISOString()} to ${end.toISOString()}`);
    res.json({ 
      startDate: start,
      endDate: end,
      categories: summary 
    });
    
  } catch (err) {
    console.error('❌ Error generating category report:', err);
    res.status(500).json({ 
      error: 'Server error generating report.',
      details: err.message 
    });
  }
}

/**
 * GET /api/expenses/reports/vendors - Get top vendors report
 */
async function vendorsReport(req, res) {
  try {
    const { limit } = req.query;
    const topVendors = await Expense.getTopVendors(
      req.user._id, 
      limit ? parseInt(limit) : 10
    );
    
    console.log(`✅ Generated top vendors report`);
    res.json({ vendors: topVendors });
    
  } catch (err) {
    console.error('❌ Error generating vendors report:', err);
    res.status(500).json({ 
      error: 'Server error generating report.',
      details: err.message 
    });
  }
}

/**
 * POST /api/expenses/import - Import expenses from CSV
 */
async function importCSV(req, res) {
  try {
    const { expenses } = req.body;
    
    if (!Array.isArray(expenses) || expenses.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request. Provide an array of expenses.' 
      });
    }
    
    // Add userId to each expense
    const expensesWithUser = expenses.map(exp => ({
      ...exp,
      userId: req.user._id
    }));
    
    const result = await Expense.insertMany(expensesWithUser, { 
      ordered: false // Continue on errors
    });
    
    console.log(`✅ Imported ${result.length} expenses`);
    res.status(201).json({ 
      message: `Successfully imported ${result.length} expense(s).`,
      importedCount: result.length
    });
    
  } catch (err) {
    console.error('❌ Error importing expenses:', err);
    
    // Handle partial success
    if (err.writeErrors) {
      return res.status(207).json({
        message: 'Partial import completed with errors.',
        imported: err.insertedDocs?.length || 0,
        errors: err.writeErrors.length
      });
    }
    
    res.status(500).json({ 
      error: 'Server error importing expenses.',
      details: err.message 
    });
  }
}

module.exports = {
  create,
  index,
  dashboard,
  show,
  update,
  delete: deleteExpense,
  bulkDelete,
  monthlyReport,
  categoryReport,
  vendorsReport,
  importCSV
};