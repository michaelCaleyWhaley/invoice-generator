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

## Phase 9 — Collapsible Logo section (updated)

- One collapsible section: **"Logo"** — logo upload input, preview, "Remove logo" control (from Phase 7)
- **Default-collapsed** on page load
- **Positioned first** in the input list — appears above the Customer fields and Invoice fields, which remain plain (non-collapsible) inputs as originally specified in Phase 2
- Live preview pane stays always-visible outside the accordion
- Accordion state doesn't persist across reloads — always starts collapsed
- Implementation: `<details>`/`<summary>` (no extra dependency, native keyboard accessibility) unless custom animated open/close is wanted, in which case a toggle-class approach with explicit `tabindex`/`aria-expanded` handling
- give the collapsed section the same margin as the rest of the inputs

**Deliverable:** on page load, the Logo section appears collapsed at the top of the input list; expanding it reveals the upload controls; Customer and Invoice fields remain visible as normal below it; live preview and action buttons remain visible and usable regardless of accordion state.

---
