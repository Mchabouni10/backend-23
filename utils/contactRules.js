// utils/contactRules.js
// ONE definition of "valid contact data" for the backend.
// (Frontend twin: src/utilities/contactRules.js — keep the regexes identical.)
//
// Backward compatible on purpose: every email/phone the OLD rules accepted is
// still accepted. The only change is that long TLDs (.design, .company,
// .construction …) are now allowed. Validators only run when a field is written,
// so existing stored data is never re-validated or modified by this file.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[2-9]\d{2}[2-9]\d{6}$/;
const ZIP_RE = /^\d{5}$/;

function normalizeUSPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith('1')) {
    // US area codes never start with 1 (NANP rules: [2-9]xx).
    // A 10-digit number starting with 1 indicates an entry
    // where country code +1 was prepended to 9 digits.
    digits = digits.slice(1);
  }
  return digits;
}

function isValidUSPhone(value) {
  return PHONE_RE.test(normalizeUSPhone(value));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return EMAIL_RE.test(normalizeEmail(value));
}

function isValidZip(value) {
  return ZIP_RE.test(String(value || ''));
}

// Case/space-insensitive text comparison (names, etc.)
function sameText(a, b) {
  const n = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return n(a) !== '' && n(a) === n(b);
}

module.exports = {
  EMAIL_RE, PHONE_RE, ZIP_RE,
  normalizeUSPhone, isValidUSPhone,
  normalizeEmail, isValidEmail,
  isValidZip, sameText,
};