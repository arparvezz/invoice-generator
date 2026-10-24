# Invoice Studio

A clean, Apple-style invoice generator that runs entirely in the browser.
Export as **PDF**, **JPG** or **PNG**. No server, no database, no sign-up — your data stays in your browser.

## Features
- Logo upload (drag & drop, PNG/JPG/SVG) with size control
- Business + client details, optional separate shipping address, tax/VAT IDs
- 8 document types (Invoice, Tax Invoice, Proforma, Commercial, Quote, Estimate, Receipt, Credit Note)
- Line items with optional SKU column, multi-line details
- Discount (% or fixed), tax, shipping, partial payment → balance due
- 15 currencies, US / UK / ISO date formats, Net 7/14/30/60 quick terms
- Optional signature: draw, type, or upload
- Status stamp (Paid, Unpaid, Due, Overdue, Draft), accent colour, A4 or US Letter
- Multi-page PDF that breaks between rows, not through them
- Autosave in the browser, plus Save/Open `.json` backups
- "New" keeps your business details and auto-increments the invoice number

## Deploy to Vercel (free)
1. Create a new GitHub repository and upload every file in this folder (keep the `vendor/` folder).
2. Go to vercel.com → **Add New… → Project** → import the repository.
3. Framework preset: **Other**. Leave build command and output directory empty.
4. Click **Deploy**. Done — every push to GitHub redeploys automatically.

## Run locally
Open `index.html` in a browser, or run `npx serve .` in this folder.

## Notes
- Invoices are saved only in the browser you used (localStorage). Use **Save** to keep `.json` backups and **Open** to reload them on another device.
- Fonts: uses Apple's system font (SF Pro) on Mac/iPhone and Inter as a close match on Windows/Android.
- Libraries bundled in `vendor/`: html2canvas 1.4.1 and jsPDF 2.5.2 (both MIT licensed).
# invoice-generator
