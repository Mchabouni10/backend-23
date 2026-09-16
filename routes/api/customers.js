const express = require('express');
const ctrl = require('../../controllers/api/customers');

const router = express.Router();
router.get('/', ctrl.index);
router.post('/', ctrl.create);
router.get('/:id', ctrl.show);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

module.exports = router;
