/**
 * Page settings and business details are read from Vite environment variables
 * (VITE_ prefixed) so they can be configured via a local `.env` file.
 */

export const PAGE_SIZE = import.meta.env.VITE_PAGE_SIZE || 'A4';

/** Page margin in points (1/72 inch). */
export const MARGIN = Number(import.meta.env.VITE_MARGIN) || 50;

const rawAddress = import.meta.env.VITE_ISSUER_ADDRESS || '';
const parsedAddress = rawAddress ? String(rawAddress).split('|').map((s) => s.trim()).filter(Boolean) : ['123 High Street', 'London', 'EC1A 1BB', 'United Kingdom'];

export const ISSUER_DETAILS = {
  name: import.meta.env.VITE_ISSUER_NAME || 'Acme Consulting Ltd',
  address: parsedAddress,
  contact: {
    email: import.meta.env.VITE_ISSUER_CONTACT || 'billing@acme-consulting.example',
    phone: import.meta.env.VITE_ISSUER_PHONE || '+44 20 7946 0958',
  },
};

export const PAYMENT_DETAILS = {
  bankName: import.meta.env.VITE_PAYMENT_BANK_NAME || 'Example Bank',
  accountName: import.meta.env.VITE_PAYMENT_ACCOUNT_NAME || 'Acme Consulting Ltd',
  accountNumber: import.meta.env.VITE_PAYMENT_ACCOUNT_NUMBER || '12345678',
  sortCode: import.meta.env.VITE_PAYMENT_SORT_CODE || '12-34-56',
};
