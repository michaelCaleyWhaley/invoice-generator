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

That symptom — page jumping to top plus a flicker — is a classic sign of one of two causes. Worth pinning down which, since the fix differs:

**Likely cause 1: Actual page navigation/reload**
If "Add Line Item" is a `<button>` inside a `<form>` without `type="button"`, it defaults to `type="submit"`, which submits the form and reloads the page — that's a full page reload, which would explain both the flicker and the jump-to-top instantly. This is the most common cause of this exact symptom.

**Likely cause 2: Full DOM re-render on every state change**
If the render function rebuilds the entire form's HTML (e.g. `container.innerHTML = renderForm(state)`) every time state changes, the whole DOM tree gets torn down and rebuilt on each keystroke/click — losing scroll position (hence jump-to-top) and causing a visible flicker, even without a real page reload.

## Phase 10 — Fix line-item add causing flicker/scroll reset

- **Diagnose first:** check the "Add Line Item" button's `type` attribute — if missing or `type="submit"` inside a `<form>`, change to `type="button"` and confirm this alone fixes it (quick, high-probability fix)
- **If flicker persists after that fix**, the render approach is likely doing full-DOM replacement on state change:
  - Move to targeted DOM updates: only append the new line-item row element to the existing table, rather than re-rendering the whole form
  - Alternative if a lighter refactor is preferred: preserve scroll position manually before re-render and restore it after (`window.scrollY` captured/restored around the render call) — a smaller patch than restructuring the render logic, but treats the symptom rather than the cause
- Preferred fix: structure line-item rendering so each row is its own DOM node that gets appended/removed individually (add → `appendChild` one new row; remove → `removeChild` that one row) rather than the whole list re-rendering from scratch on every change
- Re-test: add multiple line items in a row, confirm no flicker, no scroll jump, and existing input focus/values in other fields aren't lost mid-edit

**Deliverable:** clicking "Add Line Item" appends a new row smoothly with no visible flicker and no scroll position change.

---

## Phase 11 — Move constants to `.env`

- Create `.env` (git-ignored) and `.env.example` (committed, same keys, placeholder values) at the project root
- All `VITE_`-prefixed keys (required by Vite to expose them to client code via `import.meta.env`):
  ```
  VITE_ISSUER_NAME=
  VITE_ISSUER_ADDRESS=
  VITE_ISSUER_CONTACT=
  VITE_PAYMENT_BANK_NAME=
  VITE_PAYMENT_ACCOUNT_NAME=
  VITE_PAYMENT_ACCOUNT_NUMBER=
  VITE_PAYMENT_SORT_CODE=
  VITE_PAGE_SIZE=A4
  VITE_MARGIN=50
  ```
- **Multi-line values (address):** `.env` files don't handle real line breaks cleanly — use a delimiter convention instead, e.g. store as a single line with `\n` escape sequences or a separator like `|`, and split it back into lines in code:
  ```
  VITE_ISSUER_ADDRESS=123 Example Street|Second Line|City|Postcode
  ```
  parsed as `import.meta.env.VITE_ISSUER_ADDRESS.split('|')`
- Update `src/constants.js` to read from `import.meta.env` instead of hardcoded values:
  ```js
  export const ISSUER_DETAILS = {
    name: import.meta.env.VITE_ISSUER_NAME,
    address: import.meta.env.VITE_ISSUER_ADDRESS.split("|"),
    contact: import.meta.env.VITE_ISSUER_CONTACT,
  };
  ```
- Add `.env` to `.gitignore` (confirm it's not already tracked — if it was ever committed previously, it needs removing from git history too, not just added to `.gitignore` going forward)
- `.env.example` committed with the same key names and empty/placeholder values, so anyone cloning the repo knows what to fill in
- Confirm build behavior: since Vite inlines `import.meta.env.VITE_*` values into the JS bundle at build time, the `dist/` output will contain the actual values baked in as plain strings — this is expected and required for the app to work (there's no server to read `.env` at runtime), but it does mean **the built app is only as private as wherever you host/share the `dist/` folder**
- Update README (if one exists, or create a short one) noting: copy `.env.example` to `.env`, fill in real values, then run the build

**Deliverable:** all business-specific config lives in a git-ignored `.env`, with `.env.example` documenting the required keys; building the app correctly bakes these values into the static output exactly as before, just sourced from environment config instead of a hardcoded file.

---
