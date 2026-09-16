const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const customerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    street: { type: String, required: true, trim: true },
    unit: { type: String, default: '', trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, default: 'IL', trim: true },
    zipCode: { type: String, required: true, match: /^\d{5}$/ },
    phone: { type: String, required: true, validate: (v) => /^\d{10,11}$/.test((v || '').replace(/\D/g, '')) },
    email: { type: String, required: true, lowercase: true, trim: true, match: /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/ },
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

module.exports = mongoose.model('Customer', customerSchema);
