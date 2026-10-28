// models/projectAssignment.js
// "Ahmed is doing the George kitchen job for $2,000" = one assignment.
// What was actually paid comes from Expense rows (category worker_pay).
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const projectAssignmentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required.'],
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project is required.'],
    },
    workerId: {
      type: Schema.Types.ObjectId,
      ref: 'Worker',
      required: [true, 'Worker is required.'],
    },
    agreedAmount: {
      type: Number,
      required: [true, 'Agreed amount is required.'],
      min: [0, 'Agreed amount cannot be negative.'],
      validate: {
        validator: (v) => Number.isFinite(v),
        message: 'Agreed amount must be a number.',
      },
    },
    notes: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

// One assignment per worker per project
projectAssignmentSchema.index(
  { userId: 1, projectId: 1, workerId: 1 },
  { unique: true }
);

projectAssignmentSchema.pre('save', function (next) {
  this.agreedAmount = Math.round(this.agreedAmount * 100) / 100;
  next();
});

module.exports = mongoose.model('ProjectAssignment', projectAssignmentSchema);