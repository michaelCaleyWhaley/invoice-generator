# Invoice Generator

Browser-only invoice app: fill in a form, preview a live A4 PDF, download when ready. Built with Vite, [PDFKit](https://pdfkit.org/) (standalone browser build), and `blob-stream`.

## Features

- Customer details, terms, and line items (description, qty, price)
- Invoice numbers in `YYMMDD-XXXX` format (editable; not regenerated when the date changes)
- Live PDF preview that matches the downloaded file
- GBP formatting via `Intl.NumberFormat('en-GB')`
- Draft persistence in `localStorage`, plus **New Invoice** to clear and mint a fresh number
- Download as `invoice-{number}.pdf` (validates customer name and positive qty/price)

Issuer name, address, contact, and bank details are hardcoded in `src/constants.js` — not part of the form.

## Setup

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

```bash
npm run build    # production build → dist/
npm run preview  # serve the production build locally
```

## Customise issuer & payment details

Edit `src/constants.js`:

```js
export const ISSUER_DETAILS = {
  name: '…',
  address: ['…'],
  contact: { email: '…', phone: '…' },
};

export const PAYMENT_DETAILS = {
  bankName: '…',
  accountName: '…',
  accountNumber: '…',
  sortCode: '…',
};
```

Page size (`A4`) and margins live in the same file.

## Project layout

| Path | Role |
|------|------|
| `src/main.js` | Form UI, preview, download |
| `src/invoiceState.js` | State, invoice numbers, `localStorage`, GBP helpers |
| `src/generatePdf.js` | PDF layout (A4, Helvetica, pagination) |
| `src/validate.js` | Download validation |
| `src/constants.js` | Issuer, payment, page settings |
| `plan.md` | Design decisions and phased plan |

## Notes

- PDFs use Helvetica from PDFKit’s standalone build (`pdfkit/js/pdfkit.standalone.js`), so font metrics don’t depend on the local OS.
- Dates in the PDF are formatted from `YYYY-MM-DD` as `DD/MM/YYYY` without timezone conversion.
- There is no backend; everything runs in the browser.
