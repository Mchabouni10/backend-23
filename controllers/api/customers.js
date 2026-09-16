const Customer = require('../../models/customer');

function cleanBody(body = {}) {
  const fields = [
    'firstName', 'lastName', 'street', 'unit', 'city', 'state', 'zipCode',
    'phone', 'email', 'notes', 'addressNumber', 'direction', 'streetName', 'streetType',
  ];
  return Object.fromEntries(fields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
}

async function index(req, res) {
  try {
    const customers = await Customer.find({ userId: req.user._id }).sort({ lastName: 1, firstName: 1 });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: 'Server error retrieving customers.' });
  }
}

async function show(req, res) {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: 'Invalid customer id.' });
  }
}

async function create(req, res) {
  try {
    const customer = await Customer.create({ ...cleanBody(req.body), userId: req.user._id });
    res.status(201).json(customer);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Customer validation failed.', details: Object.values(err.errors).map((e) => e.message) });
    }
    res.status(500).json({ error: 'Server error creating customer.' });
  }
}

async function update(req, res) {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: cleanBody(req.body) },
      { new: true, runValidators: true }
    );
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    res.json(customer);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Customer validation failed.', details: Object.values(err.errors).map((e) => e.message) });
    }
    res.status(500).json({ error: 'Server error updating customer.' });
  }
}

async function deleteCustomer(req, res) {
  try {
    const customer = await Customer.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!customer) return res.status(404).json({ error: 'Customer not found.' });
    res.json({ message: 'Customer deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error deleting customer.' });
  }
}

module.exports = { index, show, create, update, delete: deleteCustomer };
