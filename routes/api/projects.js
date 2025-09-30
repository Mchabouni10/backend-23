// routes/api/projects.js
const express = require('express');
const router = express.Router();
const projectsCtrl = require('../../controllers/api/projects');

// Require token middleware for all routes
router.use(require('../../config/checkToken'));

// POST /api/projects - Create a new project
router.post('/', projectsCtrl.create);

// GET /api/projects - List all projects for the authenticated user
router.get('/', projectsCtrl.index);

// GET /api/projects/:id - Get project details
router.get('/:id', projectsCtrl.show);

// PUT /api/projects/:id - Update a project
router.put('/:id', projectsCtrl.update);

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', projectsCtrl.delete);

module.exports = router;