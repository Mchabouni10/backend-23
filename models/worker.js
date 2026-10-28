// models/worker.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { isValidUSPhone } = require('../utils/contactRules');

const addressSchema = new Schema(
  {
    street: { type: String, trim: true, default: '', maxlength: 200 },
    unit: { type: String, trim: true, default: '', maxlength: 50 },
    city: { type: String, trim: true, default: '', maxlength: 100 },
    state: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
      match: [/^[A-Z]{2}$/, 'State must be a 2-letter code.'],
    },
    zipCode: {
      type: String,
      trim: true,
      default: '',
      match: [/^\d{5}$/, 'ZIP code must be 5 digits.'],
    },
  },
  { _id: false }
);

const workerSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required.'],
      index: true,
    },
    // Full name
    name: {
      type: String,
      required: [true, 'Worker name is required.'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters.'],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      maxlength: 30,
      validate: {
        validator: (v) => !v || isValidUSPhone(v),
        message: 'Phone number must be a valid 10 or 11-digit number.',
      },
    },
    address: { type: addressSchema, default: () => ({}) },
    // Paid-per-project workers are normally independent contractors.
    // Kept as a field so classification is recorded per person.
    type: {
      type: String,
      enum: ['contractor', 'employee'],
      default: 'contractor',
    },
    notes: { type: String, trim: true, default: '', maxlength: 500 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

workerSchema.index({ userId: 1, name: 1 });

module.exports = mongoose.model('Worker', workerSchema);