const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { normalizeUSPhone, isValidUSPhone, isValidEmail } = require('../utils/contactRules');

// Nothing here is stricter than before for data that already exists:
//  - same required fields, same ZIP rule
//  - email rule is a superset of the old one (now accepts long TLDs)
//  - phone/email are normalized by SETTERS, so every write path (API, sync,
//    scripts) stores the same format. Setters only run on writes.
const customerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firstName: { type: String, required: [true, 'First name is required.'], trim: true },
    lastName: { type: String, required: [true, 'Last name is required.'], trim: true },
    street: { type: String, required: [true, 'Street address is required.'], trim: true },
    unit: { type: String, default: '', trim: true },
    city: { type: String, required: [true, 'City is required.'], trim: true },
    state: { type: String, required: [true, 'State is required.'], default: 'IL', trim: true },
    zipCode: {
      type: String,
      required: [true, 'ZIP code is required.'],
      match: [/^\d{5}$/, 'ZIP code must be 5 digits.'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required.'],
      set: normalizeUSPhone,
      validate: { validator: isValidUSPhone, message: 'Phone number must be a valid 10-digit US number.' },
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      lowercase: true,
      trim: true,
      validate: { validator: isValidEmail, message: 'Please enter a valid email address.' },
    },
    notes: { type: String, default: '', trim: true },
    addressNumber: String,
    direction: String,
    streetName: String,
    streetType: String,
  },
  { timestamps: true }
);

customerSchema.index({ userId: 1, lastName: 1, firstName: 1 });
customerSchema.index({ userId: 1, email: 1 });
customerSchema.index({ userId: 1, phone: 1 }); // duplicate detection

module.exports = mongoose.model('Customer', customerSchema);
