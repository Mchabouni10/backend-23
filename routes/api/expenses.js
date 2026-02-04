// routes/api/expenses.js
const express = require('express');
const router = express.Router();
const expensesCtrl = require('../../controllers/api/expenses');

// Require token middleware for all routes
router.use(require('../../config/checkToken'));

// --- Dashboard (MUST come before /:id to avoid conflict) ---
router.get('/dashboard', expensesCtrl.dashboard);

// --- Reports (MUST come before /:id to avoid conflict) ---
router.get('/reports/monthly', expensesCtrl.monthlyReport);
router.get('/reports/category', expensesCtrl.categoryReport);
router.get('/reports/vendors', expensesCtrl.vendorsReport);

// --- Bulk Operations (MUST come before /:id to avoid conflict) ---
router.post('/bulk/delete', expensesCtrl.bulkDelete);
router.post('/import', expensesCtrl.importCSV);

// --- Main CRUD Routes ---
router.post('/', expensesCtrl.create);
router.get('/', expensesCtrl.index);
router.get('/:id', expensesCtrl.show);
router.put('/:id', expensesCtrl.update);
router.delete('/:id', expensesCtrl.delete);

module.exports = router;