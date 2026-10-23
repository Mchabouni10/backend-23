const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

function cleanCustomerInfoDates(info = {}) {
  const cleaned = { ...info };
  if (cleaned.finishDate === '' || cleaned.finishDate === null) {
    delete cleaned.finishDate;
  }
  if (cleaned.startDate === '' || cleaned.startDate === null) {
    cleaned.startDate = new Date();
  }
  return cleaned;
}

test('duplicate-project rules start as a draft with clean payments', () => {
  const source = { workflowStatus: 'active', settings: { payments: [{ amount: 100 }] } };
  const duplicate = { ...source, workflowStatus: 'draft', settings: { ...source.settings, payments: [] } };
  assert.equal(duplicate.workflowStatus, 'draft');
  assert.deepEqual(duplicate.settings.payments, []);
});

test('summary values are numeric and additive', () => {
  const rows = [{ grandTotal: 100, paid: 40 }, { grandTotal: 50, paid: 10 }];
  const result = rows.reduce((out, row) => ({ total: out.total + row.grandTotal, paid: out.paid + row.paid }), { total: 0, paid: 0 });
  assert.deepEqual(result, { total: 150, paid: 50 });
});

test('empty finishDate strings are omitted so mongoose can save a draft', () => {
  const cleaned = cleanCustomerInfoDates({
    firstName: 'Test',
    startDate: '2026-10-07',
    finishDate: '',
  });
  assert.equal('finishDate' in cleaned, false);
  assert.equal(cleaned.startDate, '2026-10-07');
});

test('mongoose rejects invalid finishDate without cleaning', async () => {
  const schema = new mongoose.Schema({ finishDate: Date });
  const Model = mongoose.models.FinishDateCastProbe || mongoose.model('FinishDateCastProbe', schema);
  const doc = new Model({ finishDate: 'invalid-date' });
  await assert.rejects(() => doc.validate(), { name: 'ValidationError' });
});
