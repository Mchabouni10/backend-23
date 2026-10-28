// controllers/api/workers.js
const mongoose = require('mongoose');
const Worker = require('../../models/worker');
const ProjectAssignment = require('../../models/projectAssignment');
const Project = require('../../models/project');
const Expense = require('../../models/expense');
const logger = require('../../utils/logger');

const str = (v) => (typeof v === 'string' ? v.trim() : '');

const cleanAddress = (a) => {
  const src = a && typeof a === 'object' ? a : {};
  return {
    street: str(src.street),
    unit: str(src.unit),
    city: str(src.city),
    state: str(src.state).toUpperCase(),
    zipCode: str(src.zipCode),
  };
};

// Returns an error message, or null when the address looks fine.
// (Checked here as well so updates are validated the same way as creates.)
const addressProblem = (addr) => {
  if (addr.state && !/^[A-Z]{2}$/.test(addr.state)) {
    return 'State must be a 2-letter code.';
  }
  if (addr.zipCode && !/^\d{5}$/.test(addr.zipCode)) {
    return 'ZIP code must be 5 digits.';
  }
  return null;
};

const sendValidation = (res, err) => {
  const messages = Object.values(err.errors).map((e) => e.message);
  return res
    .status(400)
    .json({ error: 'Validation failed.', details: messages });
};

// ───────────────────────── Workers ─────────────────────────

/** GET /api/workers */
async function index(req, res) {
  try {
    const workers = await Worker.find({ userId: req.user._id }).sort('name');
    res.json(workers);
  } catch (err) {
    logger.error('❌ Error fetching workers:', err);
    res.status(500).json({ error: 'Server error retrieving workers.' });
  }
}

/** POST /api/workers */
async function create(req, res) {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Worker name is required.' });

    const address = cleanAddress(req.body.address);
    const problem = addressProblem(address);
    if (problem) return res.status(400).json({ error: problem });

    const worker = await Worker.create({
      userId: req.user._id,
      name,
      phone: str(req.body.phone),
      address,
      type: req.body.type || 'contractor',
      notes: req.body.notes || '',
    });
    res.status(201).json(worker);
  } catch (err) {
    logger.error('❌ Error creating worker:', err);
    if (err.name === 'ValidationError') return sendValidation(res, err);
    res.status(500).json({ error: 'Server error creating worker.' });
  }
}

/** PUT /api/workers/:id */
async function update(req, res) {
  try {
    const updateData = {};
    ['name', 'phone', 'type', 'notes', 'active'].forEach((f) => {
      if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });

    if (updateData.name !== undefined && !str(updateData.name)) {
      return res.status(400).json({ error: 'Worker name is required.' });
    }

    if (req.body.address !== undefined) {
      const address = cleanAddress(req.body.address);
      const problem = addressProblem(address);
      if (problem) return res.status(400).json({ error: problem });
      updateData.address = address;
    }

    const worker = await Worker.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: updateData },
      { new: true, runValidators: true }
    );
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });
    res.json(worker);
  } catch (err) {
    logger.error('❌ Error updating worker:', err);
    if (err.name === 'ValidationError') return sendValidation(res, err);
    res.status(500).json({ error: 'Server error updating worker.' });
  }
}

/**
 * DELETE /api/workers/:id
 * A worker who has payment history is deactivated instead of deleted, so
 * old expenses and yearly totals never lose their name.
 */
async function remove(req, res) {
  try {
    const worker = await Worker.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });

    const hasPayments = await Expense.exists({
      userId: req.user._id,
      workerId: worker._id,
    });

    if (hasPayments) {
      worker.active = false;
      await worker.save();
      return res.json({
        deactivated: true,
        message: 'Worker has payment history, so they were deactivated instead of deleted.',
      });
    }

    await ProjectAssignment.deleteMany({
      userId: req.user._id,
      workerId: worker._id,
    });
    await worker.deleteOne();
    res.json({ deleted: true });
  } catch (err) {
    logger.error('❌ Error deleting worker:', err);
    res.status(500).json({ error: 'Server error deleting worker.' });
  }
}

// ──────────────────── Project assignments ────────────────────

/** GET /api/workers/assignments?projectId= */
async function listAssignments(req, res) {
  try {
    const query = { userId: req.user._id };
    if (req.query.projectId) {
      if (!mongoose.isValidObjectId(req.query.projectId)) {
        return res.status(400).json({ error: 'Invalid project.' });
      }
      query.projectId = req.query.projectId;
    }
    const assignments = await ProjectAssignment.find(query);
    res.json(assignments);
  } catch (err) {
    logger.error('❌ Error fetching assignments:', err);
    res.status(500).json({ error: 'Server error retrieving assignments.' });
  }
}

/** PUT /api/workers/assignments  { projectId, workerId, agreedAmount, notes } */
async function saveAssignment(req, res) {
  try {
    const { projectId, workerId } = req.body;
    const agreedAmount = parseFloat(req.body.agreedAmount);

    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(workerId)) {
      return res.status(400).json({ error: 'A valid project and worker are required.' });
    }
    if (!Number.isFinite(agreedAmount) || agreedAmount < 0) {
      return res.status(400).json({ error: 'Agreed amount must be 0 or more.' });
    }

    const [project, worker] = await Promise.all([
      Project.exists({ _id: projectId, userId: req.user._id }),
      Worker.exists({ _id: workerId, userId: req.user._id }),
    ]);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });

    const assignment = await ProjectAssignment.findOneAndUpdate(
      { userId: req.user._id, projectId, workerId },
      {
        $set: {
          agreedAmount: Math.round(agreedAmount * 100) / 100,
          ...(req.body.notes !== undefined ? { notes: req.body.notes } : {}),
        },
        $setOnInsert: { userId: req.user._id, projectId, workerId },
      },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(assignment);
  } catch (err) {
    logger.error('❌ Error saving assignment:', err);
    if (err.name === 'ValidationError') return sendValidation(res, err);
    res.status(500).json({ error: 'Server error saving assignment.' });
  }
}

/** DELETE /api/workers/assignments/:id */
async function deleteAssignment(req, res) {
  try {
    const removed = await ProjectAssignment.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!removed) return res.status(404).json({ error: 'Assignment not found.' });
    res.json({ deleted: true });
  } catch (err) {
    logger.error('❌ Error deleting assignment:', err);
    res.status(500).json({ error: 'Server error deleting assignment.' });
  }
}

module.exports = {
  index,
  create,
  update,
  delete: remove,
  listAssignments,
  saveAssignment,
  deleteAssignment,
};