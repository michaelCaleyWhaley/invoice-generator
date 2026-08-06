import './style.css';
import {
  loadInvoice,
  saveInvoice,
  createNewInvoice,
  createEmptyLineItem,
  formatGbp,
  lineTotal,
  invoiceTotal,
} from './invoiceState.js';
import { generateInvoicePdf } from './generatePdf.js';
import { validateInvoice } from './validate.js';

const PREVIEW_DEBOUNCE_MS = 300;

const { invoice: initialInvoice, restored } = loadInvoice();
let invoice = initialInvoice;
let invoiceNumberNeedsReview = restored;
/** @type {ReturnType<typeof validateInvoice>['errors'] | null} */
let fieldErrors = null;

let previewUrl = null;
let previewTimer = null;
let previewGeneration = 0;

const app = document.querySelector('#app');

function render() {
  const total = invoiceTotal(invoice);
  const customerNameError = fieldErrors?.customerName;

  app.innerHTML = `
    <div class="app-shell">
      <section class="form-pane">
        <header class="form-header">
          <div>
            <p class="eyebrow">Acme Consulting</p>
            <h1>Invoice Generator</h1>
          </div>
          <div class="header-actions">
            <button type="button" id="new-invoice" class="btn btn-secondary">New Invoice</button>
            <button type="button" id="download-pdf" class="btn btn-primary">Download PDF</button>
          </div>
        </header>

        ${
          invoiceNumberNeedsReview
            ? `<p class="banner" role="status">Draft restored from this browser. Review the invoice number before sending.</p>`
            : ''
        }

        <div id="form-error-summary" class="error-summary" hidden></div>

        <form id="invoice-fields" autocomplete="off" novalidate>
          <fieldset>
            <legend>Invoice</legend>
            <div class="field-grid">
              <label>
                Invoice number
                <input
                  type="text"
                  name="invoiceNumber"
                  value="${escapeAttr(invoice.invoiceNumber)}"
                  required
                />
              </label>
              <label>
                Date
                <input type="date" name="date" value="${escapeAttr(invoice.date)}" required />
              </label>
            </div>
            <label>
              Terms
              <input type="text" name="terms" value="${escapeAttr(invoice.terms)}" />
            </label>
          </fieldset>

          <fieldset>
            <legend>Customer</legend>
            <label class="${customerNameError ? 'has-error' : ''}">
              Name
              <input
                type="text"
                name="customerName"
                value="${escapeAttr(invoice.customerName)}"
                aria-invalid="${customerNameError ? 'true' : 'false'}"
                aria-describedby="${customerNameError ? 'customerName-error' : ''}"
              />
              ${
                customerNameError
                  ? `<span id="customerName-error" class="field-error">${escapeHtml(customerNameError)}</span>`
                  : ''
              }
            </label>
            <label>
              Address
              <textarea name="customerAddress" rows="3">${escapeHtml(invoice.customerAddress)}</textarea>
            </label>
          </fieldset>

          <fieldset class="line-items">
            <legend>Line items</legend>
            <div class="line-items-header" aria-hidden="true">
              <span>Description</span>
              <span>Qty</span>
              <span>Price</span>
              <span>Total</span>
              <span></span>
            </div>
            <div id="line-items-rows">
              ${invoice.lineItems.map((item, index) => lineItemRow(item, index)).join('')}
            </div>
            <div class="line-items-footer">
              <button type="button" id="add-line-item" class="btn btn-secondary">Add line item</button>
              <p class="invoice-total">Total <strong>${formatGbp(total)}</strong></p>
            </div>
          </fieldset>
        </form>
      </section>

      <section class="preview-pane" aria-label="PDF preview">
        <header class="preview-header">
          <h2>Preview</h2>
          <p id="preview-status" class="preview-status" aria-live="polite"></p>
        </header>
        <iframe id="pdf-preview" title="Invoice PDF preview"></iframe>
      </section>
    </div>
  `;

  bindEvents();
  schedulePreview({ immediate: true });
}

function lineItemRow(item, index) {
  const rowErrors = fieldErrors?.lineItems?.[index] || null;
  const qtyError = rowErrors?.qty;
  const priceError = rowErrors?.price;

  return `
    <div class="line-item" data-index="${index}">
      <input
        type="text"
        name="description"
        data-field="description"
        placeholder="Description"
        value="${escapeAttr(item.description)}"
        aria-label="Description ${index + 1}"
      />
      <div class="cell ${qtyError ? 'has-error' : ''}">
        <input
          type="number"
          name="qty"
          data-field="qty"
          min="0"
          step="any"
          value="${escapeAttr(String(item.qty))}"
          aria-label="Quantity ${index + 1}"
          aria-invalid="${qtyError ? 'true' : 'false'}"
        />
        ${qtyError ? `<span class="field-error">${escapeHtml(qtyError)}</span>` : ''}
      </div>
      <div class="cell ${priceError ? 'has-error' : ''}">
        <input
          type="number"
          name="price"
          data-field="price"
          min="0"
          step="0.01"
          value="${escapeAttr(String(item.price))}"
          aria-label="Price ${index + 1}"
          aria-invalid="${priceError ? 'true' : 'false'}"
        />
        ${priceError ? `<span class="field-error">${escapeHtml(priceError)}</span>` : ''}
      </div>
      <output class="line-total">${formatGbp(lineTotal(item))}</output>
      <button
        type="button"
        class="btn btn-ghost remove-line-item"
        data-index="${index}"
        ${invoice.lineItems.length === 1 ? 'disabled' : ''}
        aria-label="Remove line item ${index + 1}"
      >Remove</button>
    </div>
  `;
}

function bindEvents() {
  document.querySelector('#new-invoice').addEventListener('click', () => {
    invoice = createNewInvoice();
    invoiceNumberNeedsReview = false;
    fieldErrors = null;
    render();
  });

  document.querySelector('#download-pdf').addEventListener('click', async () => {
    const button = document.querySelector('#download-pdf');
    const result = validateInvoice(invoice);

    if (!result.ok) {
      fieldErrors = result.errors;
      render();
      showErrorSummary(result);
      document.querySelector('.has-error input, .has-error textarea')?.focus();
      return;
    }

    fieldErrors = null;
    clearErrorSummary();
    button.disabled = true;

    try {
      const blob = await generateInvoicePdf(invoice);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${invoice.invoiceNumber || 'draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[pdf] download failed', err);
      alert(`PDF generation failed: ${err.message}`);
    } finally {
      button.disabled = false;
    }
  });

  document.querySelector('#add-line-item').addEventListener('click', () => {
    invoice.lineItems.push(createEmptyLineItem());
    fieldErrors = null;
    persist('add-line-item');
    render();
  });

  document.querySelectorAll('.remove-line-item').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      if (invoice.lineItems.length <= 1) return;
      invoice.lineItems.splice(index, 1);
      fieldErrors = null;
      persist('remove-line-item');
      render();
    });
  });

  const form = document.querySelector('#invoice-fields');

  form.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    const lineItem = target.closest('.line-item');
    if (lineItem) {
      const index = Number(lineItem.dataset.index);
      const field = target.dataset.field;
      const item = invoice.lineItems[index];
      if (!item || !field) return;

      if (field === 'description') {
        item.description = target.value;
      } else if (field === 'qty' || field === 'price') {
        item[field] = target.value === '' ? 0 : Number(target.value);
        const output = lineItem.querySelector('.line-total');
        if (output) output.textContent = formatGbp(lineTotal(item));
        const totalEl = document.querySelector('.invoice-total strong');
        if (totalEl) totalEl.textContent = formatGbp(invoiceTotal(invoice));
      }

      if (fieldErrors) {
        clearFieldError(field === 'description' ? null : { lineIndex: index, field });
      }

      persist(`line-item:${field}`);
      return;
    }

    const name = target.name;
    if (
      name === 'invoiceNumber' ||
      name === 'date' ||
      name === 'terms' ||
      name === 'customerName' ||
      name === 'customerAddress'
    ) {
      invoice[name] = target.value;
      if (name === 'invoiceNumber') {
        invoiceNumberNeedsReview = false;
        const banner = document.querySelector('.banner');
        if (banner) banner.remove();
      }
      if (name === 'customerName' && fieldErrors?.customerName) {
        clearFieldError({ customerName: true });
      }
      persist(name);
    }
  });
}

/**
 * @param {{ customerName?: boolean, lineIndex?: number, field?: string } | null} target
 */
function clearFieldError(target) {
  if (!fieldErrors) return;

  if (target?.customerName) {
    delete fieldErrors.customerName;
    const label = document.querySelector('input[name="customerName"]')?.closest('label');
    label?.classList.remove('has-error');
    label?.querySelector('.field-error')?.remove();
    document.querySelector('input[name="customerName"]')?.setAttribute('aria-invalid', 'false');
  }

  if (target && target.lineIndex != null && target.field) {
    const row = fieldErrors.lineItems[target.lineIndex];
    if (row) {
      delete row[target.field];
      if (!row.qty && !row.price) {
        fieldErrors.lineItems[target.lineIndex] = null;
      }
    }
    const lineEl = document.querySelector(`.line-item[data-index="${target.lineIndex}"]`);
    const cell = lineEl?.querySelector(`input[data-field="${target.field}"]`)?.closest('.cell');
    cell?.classList.remove('has-error');
    cell?.querySelector('.field-error')?.remove();
    lineEl
      ?.querySelector(`input[data-field="${target.field}"]`)
      ?.setAttribute('aria-invalid', 'false');
  }

  if (!fieldErrors.customerName && fieldErrors.lineItems.every((row) => row == null)) {
    fieldErrors = null;
    clearErrorSummary();
  }
}

function showErrorSummary(result) {
  const summary = document.querySelector('#form-error-summary');
  if (!summary) return;

  const messages = [];
  if (result.errors.customerName) messages.push(result.errors.customerName);
  for (const [index, row] of result.errors.lineItems.entries()) {
    if (!row) continue;
    if (row.qty) messages.push(`Line ${index + 1}: ${row.qty}`);
    if (row.price) messages.push(`Line ${index + 1}: ${row.price}`);
  }

  summary.hidden = false;
  summary.innerHTML = `
    <strong>Fix these before downloading:</strong>
    <ul>${messages.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
  `;
}

function clearErrorSummary() {
  const summary = document.querySelector('#form-error-summary');
  if (!summary) return;
  summary.hidden = true;
  summary.innerHTML = '';
}

function persist(reason) {
  saveInvoice(invoice);
  console.log('[invoice]', { reason, invoice });
  schedulePreview();
}

/**
 * @param {{ immediate?: boolean }} [options]
 */
function schedulePreview(options = {}) {
  clearTimeout(previewTimer);
  if (options.immediate) {
    refreshPreview();
    return;
  }
  const status = document.querySelector('#preview-status');
  if (status) status.textContent = 'Updating preview…';
  previewTimer = setTimeout(() => {
    refreshPreview();
  }, PREVIEW_DEBOUNCE_MS);
}

async function refreshPreview() {
  const generation = ++previewGeneration;
  const status = document.querySelector('#preview-status');
  const frame = document.querySelector('#pdf-preview');
  if (!frame) return;

  if (status) status.textContent = 'Updating preview…';

  try {
    const blob = await generateInvoicePdf(invoice);
    if (generation !== previewGeneration) return;

    const url = URL.createObjectURL(blob);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url;
    frame.src = url;
    if (status) status.textContent = '';
  } catch (err) {
    if (generation !== previewGeneration) return;
    console.error('[pdf] preview failed', err);
    if (status) status.textContent = `Preview failed: ${err.message}`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

render();
