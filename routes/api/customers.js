const express = require('express');
const ctrl = require('../../controllers/api/customers');

const router = express.Router();

// Static paths first, then /:id routes.
router.get('/', ctrl.index);
router.post('/sync-from-projects', ctrl.syncFromProjects);
router.post('/find-or-create', ctrl.findOrCreate);
router.post('/', ctrl.create);
router.get('/:id/projects', ctrl.projects);
router.get('/:id', ctrl.show);
router.put('/:id', ctrl.update);
router.patch('/:id', ctrl.update); // same partial-update behaviour as PUT
router.delete('/:id', ctrl.delete); // ?unlinkProjects=true detaches linked projects first

module.exports = router;
