// routes/api/workTypes.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../../controllers/api/workTypes');

// Auth (checkToken + ensureLoggedIn) is applied globally in server.js.

// ─── Full taxonomy tree ───────────────────────────────────────────────────────
// GET  /api/work-types
router.get('/', ctrl.getAll);

// ─── Categories ──────────────────────────────────────────────────────────────
// GET    /api/work-types/categories
router.get('/categories', ctrl.getCategories);

// GET    /api/work-types/categories/:categoryKey
router.get('/categories/:categoryKey', ctrl.getCategory);

// POST   /api/work-types/categories          body: { name, key? }
router.post('/categories', ctrl.createCategory);

// PATCH  /api/work-types/categories/:categoryKey   body: { name }
router.patch('/categories/:categoryKey', ctrl.updateCategory);

// DELETE /api/work-types/categories/:categoryKey   (custom only, cascades)
router.delete('/categories/:categoryKey', ctrl.deleteCategory);

// ─── Work types (nested under a category) ────────────────────────────────────
// POST   /api/work-types/categories/:categoryKey/work-types
//        body: { name, key?, measurementType? }
router.post('/categories/:categoryKey/work-types', ctrl.createWorkType);

// PATCH  /api/work-types/work-types/:workTypeKey
//        body: { name?, measurementType? }
router.patch('/work-types/:workTypeKey', ctrl.updateWorkType);

// DELETE /api/work-types/work-types/:workTypeKey   (custom only, cascades subtypes)
router.delete('/work-types/:workTypeKey', ctrl.deleteWorkType);

// ─── Subtypes ────────────────────────────────────────────────────────────────
// GET    /api/work-types/work-types/:workTypeKey/subtypes
router.get('/work-types/:workTypeKey/subtypes', ctrl.getSubtypes);

// POST   /api/work-types/work-types/:workTypeKey/subtypes
//        body: { value, isDefault? }
router.post('/work-types/:workTypeKey/subtypes', ctrl.createSubtype);

// PATCH  /api/work-types/work-types/:workTypeKey/subtypes/:subtypeId
//        body: { value }
router.patch('/work-types/:workTypeKey/subtypes/:subtypeId', ctrl.updateSubtype);

// PATCH  /api/work-types/work-types/:workTypeKey/subtypes/:subtypeId/set-default
router.patch(
  '/work-types/:workTypeKey/subtypes/:subtypeId/set-default',
  ctrl.setDefaultSubtype,
);

// DELETE /api/work-types/work-types/:workTypeKey/subtypes/:subtypeId  (custom only)
router.delete('/work-types/:workTypeKey/subtypes/:subtypeId', ctrl.deleteSubtype);

module.exports = router;