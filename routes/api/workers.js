// routes/api/workers.js
const express = require('express');
const router = express.Router();
const workersCtrl = require('../../controllers/api/workers');

// Auth (checkToken + ensureLoggedIn) is applied globally in server.js.

// --- Project assignments (MUST come before /:id to avoid conflict) ---
router.get('/assignments', workersCtrl.listAssignments);
router.put('/assignments', workersCtrl.saveAssignment);
router.delete('/assignments/:id', workersCtrl.deleteAssignment);

// --- Workers ---
router.get('/', workersCtrl.index);
router.post('/', workersCtrl.create);
router.put('/:id', workersCtrl.update);
router.delete('/:id', workersCtrl.delete);

module.exports = router;