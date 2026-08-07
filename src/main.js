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
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_LOGO_WIDTH = 400;
const ALLOWED_LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg'];

const { invoice: initialInvoice, restored } = loadInvoice();
let invoice = initialInvoice;
let invoiceNumberNeedsReview = restored;
/** @type {ReturnType<typeof validateInvoice>['errors'] | null} */
let fieldErrors = null;
let logoError = '';
let storageError = '';
let uploadWarning = '';
let jsonUploadError = '';

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

        ${(() => {
          if (invoiceNumberNeedsReview) {
            return `<p class="banner" role="status">Draft restored from this browser. Review the invoice number before sending.</p>`;
          }
          if (uploadWarning) {
            return `<p class="banner" role="status">${escapeHtml(uploadWarning)}</p>`;
          }
          return '';
        })()}

        <div id="form-error-summary" class="error-summary" hidden></div>
        <div id="storage-error-summary" class="error-summary" ${storageError ? '' : 'hidden'}>${escapeHtml(storageError)}</div>

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
            <legend>Logo</legend>
            <label>
              Upload logo
              <input
                type="file"
                id="logo-upload"
                accept=".svg,image/svg+xml,.png,image/png,.jpg,.jpeg,image/jpeg"
              />
            </label>
            ${invoice.logoData ? `<p class="logo-status">Current logo: ${invoice.logoType === 'svg' ? 'SVG' : 'Raster image'}</p>` : ''}
            ${invoice.logoData ? '<button type="button" id="remove-logo" class="btn btn-ghost">Remove logo</button>' : ''}
            ${logoError ? `<p class="field-error">${escapeHtml(logoError)}</p>` : ''}
          </fieldset>

          <fieldset>
            <legend>Invoice actions</legend>
            <div class="action-row">
              <button type="button" id="upload-invoice-json" class="btn btn-secondary">Upload Invoice JSON</button>
              <input type="file" id="invoice-json-upload" accept=".json,application/json" hidden />
            </div>
            ${jsonUploadError ? `<p class="field-error">${escapeHtml(jsonUploadError)}</p>` : ''}
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
      <label class="line-desc">
        <span class="line-label">Description</span>
        <input
          type="text"
          name="description"
          data-field="description"
          placeholder="What was provided"
          value="${escapeAttr(item.description)}"
          aria-label="Description ${index + 1}"
        />
      </label>
      <div class="line-metrics">
        <div class="cell ${qtyError ? 'has-error' : ''}">
          <span class="line-label">Qty</span>
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
          <span class="line-label">Price</span>
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
        <div class="cell line-total-cell">
          <span class="line-label">Total</span>
          <output class="line-total">${formatGbp(lineTotal(item))}</output>
        </div>
        <div class="cell line-actions">
          <span class="line-label" aria-hidden="true">&nbsp;</span>
          <button
            type="button"
            class="btn btn-ghost remove-line-item"
            data-index="${index}"
            ${invoice.lineItems.length === 1 ? 'disabled' : ''}
            aria-label="Remove line item ${index + 1}"
          >Remove</button>
        </div>
      </div>
    </div>
  `;
}

function bindEvents() {
  document.querySelector('#new-invoice').addEventListener('click', () => {
    invoice = createNewInvoice();
    invoiceNumberNeedsReview = false;
    fieldErrors = null;
    logoError = '';
    storageError = '';
    uploadWarning = '';
    jsonUploadError = '';
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
      const pdfBlob = await generateInvoicePdf(invoice);
      triggerDownload(pdfBlob, `invoice-${invoice.invoiceNumber || 'draft'}.pdf`);

      const jsonBlob = new Blob([
        JSON.stringify(invoiceToExportJson(invoice), null, 2),
      ], { type: 'application/json' });
      setTimeout(() => {
        triggerDownload(jsonBlob, `invoice-${invoice.invoiceNumber || 'draft'}.json`);
      }, 150);
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

  const logoUpload = document.querySelector('#logo-upload');
  if (logoUpload) {
    logoUpload.addEventListener('change', async () => {
      if (!logoUpload.files?.length) return;
      const file = logoUpload.files[0];
      logoError = '';
      const validation = validateLogoFile(file);
      if (!validation.ok) {
        logoError = validation.message;
        render();
        return;
      }

      try {
        await loadLogoFile(file);
        logoError = '';
      } catch (err) {
        console.error('[logo] upload failed', err);
        logoError = err?.message || 'Failed to load logo.';
      }
      render();
    });
  }

  const removeLogoButton = document.querySelector('#remove-logo');
  if (removeLogoButton) {
    removeLogoButton.addEventListener('click', () => {
      invoice.logoType = null;
      invoice.logoData = '';
      logoError = '';
      persist('remove-logo');
      render();
    });
  }

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

  const uploadButton = document.querySelector('#upload-invoice-json');
  const uploadInput = document.querySelector('#invoice-json-upload');
  if (uploadButton && uploadInput) {
    uploadButton.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async () => {
      if (!uploadInput.files?.length) return;
      const file = uploadInput.files[0];
      uploadInput.value = '';
      jsonUploadError = '';
      uploadWarning = '';

      try {
        const importedInvoice = await parseInvoiceJsonFile(file);
        invoice = {
          ...invoice,
          ...importedInvoice,
          logoType: invoice.logoType,
          logoData: invoice.logoData,
        };
        invoiceNumberNeedsReview = false;
        fieldErrors = null;
        uploadWarning = `Loaded invoice ${invoice.invoiceNumber}. Click New Invoice for a fresh number.`;
        jsonUploadError = '';
        persist('upload-json');
        render();
      } catch (err) {
        console.error('[json] upload failed', err);
        jsonUploadError = err?.message || 'Failed to load invoice JSON.';
        render();
      }
    });
  }

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
  try {
    saveInvoice(invoice);
    storageError = '';
  } catch (err) {
    console.error('[storage] save failed', err);
    storageError = getStorageErrorMessage(err);
    render();
    return;
  }

  console.log('[invoice]', { reason, invoice });
  schedulePreview();
}

function getStorageErrorMessage(err) {
  const name = err?.name;
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'Unable to save invoice draft: browser storage quota exceeded. Remove the logo or clear other local data.';
  }
  return `Unable to save invoice draft: ${err?.message || 'unknown error'}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function invoiceToExportJson(invoice) {
  return {
    customerName: invoice.customerName,
    customerAddress: invoice.customerAddress,
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    terms: invoice.terms,
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      qty: Number(item.qty) || 0,
      price: Number(item.price) || 0,
    })),
  };
}

async function parseInvoiceJsonFile(file) {
  const text = await readFileAsText(file);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Invalid JSON file.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invoice JSON must be an object.');
  }

  const invoiceNumber = String(parsed.invoiceNumber ?? '').trim();
  const customerName = String(parsed.customerName ?? '').trim();
  const customerAddress = String(parsed.customerAddress ?? '');
  const date = String(parsed.date ?? '').trim();
  const terms = String(parsed.terms ?? '');
  const lineItems = parsed.lineItems;

  if (!invoiceNumber) {
    throw new Error('Invoice JSON is missing invoiceNumber.');
  }
  if (!customerName) {
    throw new Error('Invoice JSON is missing customerName.');
  }
  if (!date) {
    throw new Error('Invoice JSON is missing date.');
  }
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('Invoice JSON must include at least one line item.');
  }

  const sanitizedLineItems = lineItems.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Line item ${index + 1} is invalid.`);
    }

    const description = String(item.description ?? '').trim();
    const qty = Number(item.qty);
    const price = Number(item.price);

    if (!description) {
      throw new Error(`Line item ${index + 1} is missing a description.`);
    }
    if (!Number.isFinite(qty)) {
      throw new Error(`Line item ${index + 1} has an invalid qty.`);
    }
    if (!Number.isFinite(price)) {
      throw new Error(`Line item ${index + 1} has an invalid price.`);
    }

    return { description, qty, price };
  });

  const normalizedInvoice = {
    customerName,
    customerAddress,
    invoiceNumber,
    date,
    terms,
    lineItems: sanitizedLineItems,
  };

  const validation = validateInvoice(normalizedInvoice);
  if (!validation.ok) {
    const errors = [];
    if (validation.errors.customerName) errors.push(validation.errors.customerName);
    for (const [index, row] of validation.errors.lineItems.entries()) {
      if (!row) continue;
      if (row.qty) errors.push(`Line ${index + 1}: ${row.qty}`);
      if (row.price) errors.push(`Line ${index + 1}: ${row.price}`);
    }
    throw new Error(errors.join(' '));
  }

  return normalizedInvoice;
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

function validateLogoFile(file) {
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, message: 'Logo must be 2MB or smaller before processing.' };
  }

  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: 'Please upload an SVG, PNG, or JPEG logo file.',
    };
  }

  return { ok: true };
}

async function loadLogoFile(file) {
  if (file.type === 'image/svg+xml') {
    const svg = await readFileAsText(file);
    invoice.logoType = 'svg';
    invoice.logoData = svg;
    persist('logo-upload');
    return;
  }

  const rasterData = await readAndDownscaleRaster(file, MAX_LOGO_WIDTH);
  invoice.logoType = 'raster';
  invoice.logoData = rasterData;
  persist('logo-upload');
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read the logo file.'));
    reader.readAsText(file);
  });
}

async function readAndDownscaleRaster(file, maxWidth) {
  const bitmap = await createImageBitmap(file);
  const width = Math.min(bitmap.width, maxWidth);
  const height = Math.round((bitmap.height * width) / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

render();
