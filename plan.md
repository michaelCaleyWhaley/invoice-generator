## Final Plan — Invoice Generator

### Decisions locked in

- **Page size:** A4
- **Font:** Helvetica via pdfkit's standalone browser build (`pdfkit/js/pdfkit.standalone.js`), which has AFM font data inlined — no filesystem reads, no separate font file needed. Fallback: embed a real `.ttf` (e.g. Liberation Sans) via `registerFont()` if the standalone build causes issues.
- **Stack:** Plain Vite + JS, frontend-only (`pdfkit` + `blob-stream`)
- **Line items:** description, qty, price → line total → sum total (no tax/discount)
- **Invoice number:** `YYMMDD-XXXX` (today's date + 4-char random alphanumeric suffix), generated once on load, editable, does not auto-regenerate on date edits
- **Issuer & payment details:** hardcoded in `constants.js` (name, address, contact, bank details) — not user-editable, not part of per-invoice state
- **Currency:** GBP, via `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })`
- **Form persistence:** synced to `localStorage`, with an explicit "New Invoice" button to reset and generate a fresh invoice number

---

### Phase 1 — Foundations

1. Scaffold Vite project: `npm create vite@latest invoice-generator -- --template vanilla`
2. Install deps: `pdfkit`, `blob-stream`
3. Import pdfkit via its **standalone browser build**, not the default Node entry point:
   ```js
   import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
   ```
   This build has AFM font data inlined at build time, avoiding the `fs.readFileSync` errors that occur when the Node-targeted build tries to read font files from a nonexistent filesystem in the browser.
4. Try running with **no Node polyfills first** — the standalone build is designed not to need them. Only if errors persist, add `vite-plugin-node-polyfills` back with:
   ```js
   nodePolyfills({
     include: ["buffer", "process", "stream", "util", "events", "zlib"],
     globals: { Buffer: true, global: true, process: true },
   });
   ```
   plus a `define` block for `__dirname`/`__filename` (not covered by the polyfills plugin):
   ```js
   define: {
     __dirname: JSON.stringify('/'),
     __filename: JSON.stringify('/index.js'),
   }
   ```
5. **Fallback plan (Option B)** if the standalone build still misbehaves: skip standard font loading entirely by embedding a real font file (e.g. Liberation Sans, metric-compatible with Helvetica, open license) via `doc.registerFont('Helvetica', fontBytes)`, sidestepping AFM loading altogether
6. Create `src/constants.js` with `PAGE_SIZE`, `MARGIN`, `ISSUER_DETAILS`, `PAYMENT_DETAILS`
7. Create `src/generatePdf.js` with a minimal test function: creates an A4 doc, sets metadata `Title`, writes "Hello, Invoice!" in Helvetica, pipes to a blob
8. Wire a temporary "Generate Test PDF" button in `main.js` to call it and open the result

**Deliverable:** clicking a button produces a valid downloadable A4 PDF with Helvetica text and correct metadata title, using the standalone build (or embedded-font fallback) — proves the full toolchain before building real features.

### Phase 2 — Data model & form UI

- Per-invoice state object:

```js
{
  customerName,
  customerAddress,
  invoiceNumber,   // YYMMDD-XXXX, generated once on load, editable
  date,            // today, editable
  terms,           // e.g. "Net 30", editable
  lineItems: [{ description, qty, price }]
}
```

- Form fields: customer name, customer address, terms, line items (add/remove/edit rows)
- Sync state to `localStorage`; on reload, restore draft but flag invoice number for review
- "New Invoice" / "Clear Form" button: resets customer/terms/line items to defaults, clears `localStorage` entry, immediately generates a fresh `YYMMDD-XXXX` invoice number
- Price fields formatted via `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })` at display time (state stores raw numbers)

**Deliverable:** working form with persistence and reset, verified via console/log (no PDF yet).

### Phase 3 — PDF generation engine

- Pure function: `(invoiceData) => PDF bytes`, pulling `ISSUER_DETAILS`/`PAYMENT_DETAILS` from consts
- Layout: issuer block, invoice number/date, customer block, line items table, totals, payment instructions/terms footer
- Overflow handling: track Y-position while drawing line items; on crossing bottom margin, call `addPage()`, redraw table header, continue
- GBP formatting applied to all money values in the PDF
- Metadata title set per-invoice (e.g. `Invoice {invoiceNumber}`)

**Deliverable:** given sample data, produces a correctly formatted, paginated downloadable PDF.

### Phase 4 — Live preview

- Reuse the exact Phase 3 function, render into an embedded preview pane via blob URL (guarantees preview = actual output)
- Debounced regeneration on input change

**Deliverable:** two-pane UI — form + live PDF preview.

### Phase 5 — Download & polish

- "Download PDF" button, filename `invoice-{number}.pdf`
- Validation: required customer name, valid qty/price (numeric, positive)
- Form styling pass

### Phase 6 — Cross-machine verification

- Test in 2+ browsers / 2+ OSes for identical output
- Test overflow case (enough line items to force a page break) across machines
- Confirm date formatting isn't timezone-dependent (pin explicit format, don't rely on default locale behavior)

---

---

---

Updated

---

## Phase 7 — Logo upload (revised)

- Install `svg-to-pdfkit`
- File input accepting `.svg`, `.jpeg`/`.jpg`, `.png`
- **On upload:**
  - PNG/JPEG: draw onto an offscreen `<canvas>`, downscaled to a max width (e.g. 400px, preserving aspect ratio), then exported as base64 — keeps the stored payload well under `localStorage` limits (raw 2MB uploads would balloon to ~2.7MB in base64; downscaling first keeps this to roughly tens of KB)
  - SVG: read as raw text (`readAsText`) — already lightweight, no downscaling needed, just the file-size cap
  - Store a `logoType` flag (`'svg' | 'raster'`) so generation knows which path to use
- Persist logo + `logoType` in `localStorage` alongside issuer details (set once, not per-invoice)
- Wrap the `localStorage.setItem()` call in `try...catch` to catch `QuotaExceededError` gracefully, showing a clear error rather than silently failing
- "Remove logo" option — **reverts the header back to the plain text company name** (i.e. it's a toggle between the two states, not an addition alongside)
- Validation: file size cap (e.g. 2MB upload limit _before_ downscaling), file type check, clear rejection message
- **Update Phase 3's generation function:**
  - The issuer block currently renders `ISSUER_DETAILS.name` (e.g. "Acme Consulting Ltd") as text at a fixed position. This position becomes a **shared bounding box** (e.g. 150×50pt) that renders **either** the text name **or** the logo — never both:
    - No logo present → render `ISSUER_DETAILS.name` as text, as today
    - Logo present → render the logo image/SVG in that exact same box, replacing the text entirely
  - Raster: `doc.image(base64Data, x, y, { fit: [150, 50] })` (preserves aspect ratio, no distortion)
  - SVG: `SVGtoPDF(doc, svgString, x, y, { width: 150, height: 50, preserveAspectRatio: 'xMinYMin meet' })` — explicitly locks aspect ratio
  - Wrap `SVGtoPDF()` in `try...catch`: on rendering failure (unsupported SVG features like embedded `<style>`, gradients, clip paths), **fall back to rendering the text company name instead** — same fallback behavior as "no logo," so a bad SVG degrades to a known-good state rather than leaving a blank box or crashing the live preview
  - Because the box position/size is fixed regardless of which of the three states is active (text / logo / fallback-to-text), downstream Y-coordinates for the rest of the header never shift
- Update live preview to reflect logo changes, tested against the try/catch fallback

**Deliverable:** user can upload a logo that replaces the "Acme Consulting Ltd" text in-place with the image, in a fixed non-distorting box; removing the logo (or a failed SVG render) cleanly reverts to the text name; everything persists across sessions without risking quota errors.

---

## Phase 8 — JSON export/import for re-editing (updated)

- **On "Download PDF" click:** trigger download of `invoice-{number}.pdf`, then after a short delay (~150ms) trigger download of `invoice-{number}.json` — the delay avoids some browsers' "multiple downloads" prompt/block heuristic when two files are triggered synchronously from a single click
  ```js
  triggerDownload(pdfBlob, `invoice-${invoiceNumber}.pdf`);
  setTimeout(() => {
    triggerDownload(jsonBlob, `invoice-${invoiceNumber}.json`);
  }, 150);
  ```
- JSON contains invoice-only data (customer name, address, invoice number, date, terms, line items) — issuer/payment/logo excluded, as those are fixed local settings
- "Upload Invoice JSON" button: parses and validates shape (required fields present, `lineItems` well-formed, `qty`/`price` numeric) before applying
  - Valid file: overwrites form state, syncs `localStorage`, refreshes preview
  - Invalid file: rejected with a clear error, current state untouched
- Warning banner on upload (e.g. "Loaded invoice {number} — click New Invoice for a fresh number") to prevent accidental invoice-number reuse
- Round-trip check: download → upload → confirm form/PDF regenerate identically

**Deliverable:** clicking "Download PDF" reliably produces both files without browser download-blocking; uploading the JSON later fully restores the invoice for editing, with malformed-file protection and duplicate-number warnings.

---

