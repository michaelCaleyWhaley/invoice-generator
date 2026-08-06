import PDFDocument from 'pdfkit/js/pdfkit.standalone.js';
import blobStream from 'blob-stream';
import {
  PAGE_SIZE,
  MARGIN,
  ISSUER_DETAILS,
  PAYMENT_DETAILS,
} from './constants.js';
import { formatGbp, lineTotal, invoiceTotal } from './invoiceState.js';

const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';
const PAGE_WIDTH = 595.28;

const COL = {
  description: MARGIN,
  qty: 350,
  price: 400,
  total: 470,
};

const COL_WIDTH = {
  description: COL.qty - COL.description - 8,
  qty: COL.price - COL.qty - 8,
  price: COL.total - COL.price - 8,
  total: PAGE_WIDTH - MARGIN - COL.total,
};

const TABLE_HEADER_HEIGHT = 18;
const ROW_PADDING = 4;

/**
 * Format YYYY-MM-DD without timezone shift.
 * @param {string} isoDate
 */
function formatInvoiceDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate || '';
  const [, yyyy, mm, dd] = match;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Pure PDF generator: invoice form data → PDF blob.
 * Issuer/payment details come from constants, not invoiceData.
 *
 * @param {{
 *   customerName: string,
 *   customerAddress: string,
 *   invoiceNumber: string,
 *   date: string,
 *   terms: string,
 *   lineItems: Array<{ description: string, qty: number, price: number }>
 * }} invoiceData
 * @returns {Promise<Blob>}
 */
export function generateInvoicePdf(invoiceData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: PAGE_SIZE,
        margin: MARGIN,
        info: {
          Title: `Invoice ${invoiceData.invoiceNumber || ''}`.trim(),
        },
      });

      const stream = doc.pipe(blobStream());
      const contentBottom = () => doc.page.height - MARGIN;

      drawHeader(doc, invoiceData);
      drawCustomer(doc, invoiceData);
      drawTableHeader(doc);

      for (const item of invoiceData.lineItems) {
        drawLineItem(doc, item, contentBottom);
      }

      drawTotals(doc, invoiceData, contentBottom);
      drawFooter(doc, invoiceData, contentBottom);

      stream.on('finish', () => {
        resolve(stream.toBlob('application/pdf'));
      });
      stream.on('error', reject);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function drawHeader(doc, invoiceData) {
  const rightX = 320;
  const top = MARGIN;

  doc.font(FONT_BOLD).fontSize(16).text(ISSUER_DETAILS.name, MARGIN, top, {
    width: 250,
  });

  doc.font(FONT).fontSize(9);
  let y = doc.y + 4;
  for (const line of ISSUER_DETAILS.address) {
    doc.text(line, MARGIN, y, { width: 250 });
    y = doc.y;
  }
  doc.text(ISSUER_DETAILS.contact.email, MARGIN, y);
  doc.text(ISSUER_DETAILS.contact.phone, MARGIN, doc.y);
  const issuerBottom = doc.y;

  doc.font(FONT_BOLD).fontSize(18).text('INVOICE', rightX, top, {
    width: PAGE_WIDTH - MARGIN - rightX,
    align: 'right',
  });

  doc.font(FONT).fontSize(10);
  let metaY = top + 28;
  const metaWidth = PAGE_WIDTH - MARGIN - rightX;
  doc.text(`Invoice #: ${invoiceData.invoiceNumber || ''}`, rightX, metaY, {
    width: metaWidth,
    align: 'right',
  });
  metaY = doc.y + 2;
  doc.text(`Date: ${formatInvoiceDate(invoiceData.date)}`, rightX, metaY, {
    width: metaWidth,
    align: 'right',
  });
  if (invoiceData.terms) {
    metaY = doc.y + 2;
    doc.text(`Terms: ${invoiceData.terms}`, rightX, metaY, {
      width: metaWidth,
      align: 'right',
    });
  }

  doc.y = Math.max(issuerBottom, doc.y) + 20;
}

function drawCustomer(doc, invoiceData) {
  doc.font(FONT_BOLD).fontSize(10).text('Bill to', MARGIN, doc.y);
  doc.font(FONT).fontSize(10);
  doc.text(invoiceData.customerName || '—', MARGIN, doc.y + 2, {
    width: 280,
  });

  const address = (invoiceData.customerAddress || '').trim();
  if (address) {
    doc.text(address, MARGIN, doc.y + 2, { width: 280 });
  }

  doc.y += 16;
}

function drawTableHeader(doc) {
  const y = doc.y;

  doc
    .moveTo(MARGIN, y)
    .lineTo(PAGE_WIDTH - MARGIN, y)
    .stroke('#333');

  doc.font(FONT_BOLD).fontSize(9);
  const textY = y + 5;
  doc.text('Description', COL.description, textY, {
    width: COL_WIDTH.description,
  });
  doc.text('Qty', COL.qty, textY, { width: COL_WIDTH.qty, align: 'right' });
  doc.text('Price', COL.price, textY, {
    width: COL_WIDTH.price,
    align: 'right',
  });
  doc.text('Total', COL.total, textY, {
    width: COL_WIDTH.total,
    align: 'right',
  });

  const bottom = y + TABLE_HEADER_HEIGHT;
  doc
    .moveTo(MARGIN, bottom)
    .lineTo(PAGE_WIDTH - MARGIN, bottom)
    .stroke('#333');
  doc.y = bottom + 4;
}

function ensureLineItemSpace(doc, needed, contentBottom) {
  if (doc.y + needed <= contentBottom()) return;
  doc.addPage();
  drawTableHeader(doc);
}

function ensureBlockSpace(doc, needed, contentBottom) {
  if (doc.y + needed <= contentBottom()) return;
  doc.addPage();
}

function drawLineItem(doc, item, contentBottom) {
  const description = item.description || '—';
  const qty = Number(item.qty) || 0;
  const price = Number(item.price) || 0;
  const total = lineTotal(item);

  doc.font(FONT).fontSize(9);
  const descHeight = doc.heightOfString(description, {
    width: COL_WIDTH.description,
  });
  const rowHeight = Math.max(descHeight, 12) + ROW_PADDING;

  ensureLineItemSpace(doc, rowHeight + 2, contentBottom);

  const y = doc.y;
  doc.text(description, COL.description, y, {
    width: COL_WIDTH.description,
  });
  doc.text(String(qty), COL.qty, y, {
    width: COL_WIDTH.qty,
    align: 'right',
  });
  doc.text(formatGbp(price), COL.price, y, {
    width: COL_WIDTH.price,
    align: 'right',
  });
  doc.text(formatGbp(total), COL.total, y, {
    width: COL_WIDTH.total,
    align: 'right',
  });

  doc.y = y + rowHeight;
}

function drawTotals(doc, invoiceData, contentBottom) {
  ensureBlockSpace(doc, 36, contentBottom);

  doc
    .moveTo(COL.price, doc.y)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y)
    .stroke('#333');
  doc.y += 8;

  const y = doc.y;
  doc.font(FONT_BOLD).fontSize(11);
  doc.text('Total', COL.price, y, {
    width: COL_WIDTH.price,
    align: 'right',
  });
  doc.text(formatGbp(invoiceTotal(invoiceData)), COL.total, y, {
    width: COL_WIDTH.total,
    align: 'right',
  });

  doc.y = y + 24;
}

function drawFooter(doc, invoiceData, contentBottom) {
  ensureBlockSpace(doc, 90, contentBottom);

  doc.font(FONT_BOLD).fontSize(10).text('Payment details', MARGIN, doc.y);
  doc.font(FONT).fontSize(9);
  doc.text(`Account name: ${PAYMENT_DETAILS.accountName}`, MARGIN, doc.y + 4);
  doc.text(`Bank: ${PAYMENT_DETAILS.bankName}`, MARGIN, doc.y);
  doc.text(`Account number: ${PAYMENT_DETAILS.accountNumber}`, MARGIN, doc.y);
  doc.text(`Sort code: ${PAYMENT_DETAILS.sortCode}`, MARGIN, doc.y);

  if (invoiceData.terms) {
    doc.moveDown(1);
    doc.font(FONT_BOLD).fontSize(10).text('Terms');
    doc.font(FONT).fontSize(9).text(invoiceData.terms, { width: 400 });
  }
}
