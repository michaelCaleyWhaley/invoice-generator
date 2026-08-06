/** @type {'A4'} */
export const PAGE_SIZE = 'A4';

/** Page margin in points (1/72 inch). */
export const MARGIN = 50;

export const ISSUER_DETAILS = {
  name: 'Acme Consulting Ltd',
  address: ['123 High Street', 'London', 'EC1A 1BB', 'United Kingdom'],
  contact: {
    email: 'billing@acme-consulting.example',
    phone: '+44 20 7946 0958',
  },
};

export const PAYMENT_DETAILS = {
  bankName: 'Example Bank',
  accountName: 'Acme Consulting Ltd',
  accountNumber: '12345678',
  sortCode: '12-34-56',
};
