/**
 * @param {{
 *   customerName: string,
 *   customerAddress: string,
 *   invoiceNumber: string,
 *   date: string,
 *   terms: string,
 *   lineItems: Array<{ description: string, qty: number, price: number }>
 * }} invoice
 * @returns {{
 *   ok: boolean,
 *   errors: {
 *     customerName?: string,
 *     lineItems: Array<{ qty?: string, price?: string } | null>
 *   }
 * }}
 */
export function validateInvoice(invoice) {
  /** @type {{ customerName?: string, lineItems: Array<{ qty?: string, price?: string } | null> }} */
  const errors = { lineItems: [] };
  let ok = true;

  if (!String(invoice.customerName || '').trim()) {
    errors.customerName = 'Customer name is required.';
    ok = false;
  }

  for (const item of invoice.lineItems) {
    /** @type {{ qty?: string, price?: string } | null} */
    let row = null;

    if (!isPositiveNumber(item.qty)) {
      row = row || {};
      row.qty = 'Qty must be a positive number.';
      ok = false;
    }

    if (!isPositiveNumber(item.price)) {
      row = row || {};
      row.price = 'Price must be a positive number.';
      ok = false;
    }

    errors.lineItems.push(row);
  }

  return { ok, errors };
}

function isPositiveNumber(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0;
}
