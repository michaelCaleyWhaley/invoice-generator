const STORAGE_KEY = 'invoice-generator:draft';

const gbpFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
});

export function formatGbp(amount) {
  return gbpFormatter.format(Number(amount) || 0);
}

function randomSuffix(length = 4) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

/** @returns {string} YYMMDD-XXXX */
export function generateInvoiceNumber(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}-${randomSuffix()}`;
}

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function createEmptyLineItem() {
  return { description: '', qty: 1, price: 0 };
}

export function createDefaultInvoice() {
  return {
    customerName: '',
    customerAddress: '',
    invoiceNumber: generateInvoiceNumber(),
    date: todayIsoDate(),
    terms: 'Net 30',
    lineItems: [createEmptyLineItem()],
  };
}

/**
 * @param {ReturnType<typeof createDefaultInvoice>} invoice
 */
export function lineTotal(item) {
  return (Number(item.qty) || 0) * (Number(item.price) || 0);
}

/**
 * @param {ReturnType<typeof createDefaultInvoice>} invoice
 */
export function invoiceTotal(invoice) {
  return invoice.lineItems.reduce((sum, item) => sum + lineTotal(item), 0);
}

/**
 * @returns {{ invoice: ReturnType<typeof createDefaultInvoice>, restored: boolean }}
 */
export function loadInvoice() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { invoice: createDefaultInvoice(), restored: false };
    }
    const parsed = JSON.parse(raw);
    const invoice = {
      ...createDefaultInvoice(),
      ...parsed,
      lineItems:
        Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0
          ? parsed.lineItems.map((item) => ({
              description: String(item.description ?? ''),
              qty: Number(item.qty) || 0,
              price: Number(item.price) || 0,
            }))
          : [createEmptyLineItem()],
    };
    return { invoice, restored: true };
  } catch (err) {
    console.warn('Failed to restore invoice draft', err);
    return { invoice: createDefaultInvoice(), restored: false };
  }
}

/**
 * @param {ReturnType<typeof createDefaultInvoice>} invoice
 */
export function saveInvoice(invoice) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(invoice));
}

export function clearStoredInvoice() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Reset customer/terms/line items, clear storage, mint a fresh invoice number.
 * @returns {ReturnType<typeof createDefaultInvoice>}
 */
export function createNewInvoice() {
  clearStoredInvoice();
  return createDefaultInvoice();
}
