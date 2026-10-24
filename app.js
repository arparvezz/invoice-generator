/* Invoice Studio — runs 100% in the browser. No server, no tracking. */
(() => {
  'use strict';

  const STORAGE_KEY = 'invoice-studio:v1';
  const PAPER = {
    a4:     { w: 794, h: 1123, pdf: 'a4' },
    letter: { w: 816, h: 1056, pdf: 'letter' },
  };
  const CURRENCIES = [
    ['USD', 'US Dollar'], ['GBP', 'British Pound'], ['EUR', 'Euro'], ['CAD', 'Canadian Dollar'],
    ['AUD', 'Australian Dollar'], ['AED', 'UAE Dirham'], ['SAR', 'Saudi Riyal'], ['BDT', 'Bangladeshi Taka'],
    ['INR', 'Indian Rupee'], ['PKR', 'Pakistani Rupee'], ['CHF', 'Swiss Franc'], ['SEK', 'Swedish Krona'],
    ['SGD', 'Singapore Dollar'], ['JPY', 'Japanese Yen'], ['CNY', 'Chinese Yuan'],
  ];
  const ACCENTS = ['#0071e3', '#1d1d1f', '#34c759', '#ff9500', '#ff2d55', '#af52de', '#5856d6', '#00a3a3'];

  /* ---------- Helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = () => isoLocal(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const multiline = (s) => esc(s).replace(/\n/g, '<br>');
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => (a[k] ??= {}), o)[last] = v; };
  const deepMerge = (base, extra) => {
    if (Array.isArray(base) || typeof base !== 'object' || base === null) return extra === undefined ? base : extra;
    const out = { ...base };
    for (const k of Object.keys(extra || {})) out[k] = (k in base) ? deepMerge(base[k], extra[k]) : extra[k];
    return out;
  };

  function defaults() {
    const issue = today();
    return {
      business: {
        name: 'Your Company Ltd', email: 'billing@yourcompany.com', phone: '+1 (555) 010-2030',
        address: '123 Market Street, Suite 400\nSan Francisco, CA 94105\nUnited States',
        website: 'yourcompany.com', taxId: '', logo: '',
      },
      client: {
        name: 'Alex Morgan', company: 'Client Company Inc.', email: 'alex@client.com', phone: '',
        address: '500 Harbour Road\nLondon EC1A 1BB\nUnited Kingdom', taxId: '',
      },
      shipTo: { enabled: false, address: '' },
      meta: { title: 'Invoice', number: 'INV-0001', issueDate: issue, dueDate: addDays(issue, 14), reference: '', currency: 'USD', locale: 'en-US' },
      items: [
        { id: uid(), sku: '', desc: 'Brand identity design', details: 'Logo suite, colour palette and typography guide', qty: 1, rate: 1800 },
        { id: uid(), sku: '', desc: 'Website development', details: 'Responsive 6-page marketing site', qty: 1, rate: 3200 },
        { id: uid(), sku: '', desc: 'Monthly support', details: 'Hosting, updates and minor edits', qty: 3, rate: 150 },
      ],
      totals: { discountType: 'percent', discountValue: 0, shipping: 0, taxLabel: 'Tax', taxRate: 0, amountPaid: 0 },
      payment: { details: 'Bank: Your Bank\nAccount name: Your Company Ltd\nAccount no.: 0000 0000\nRouting / Sort code: 000000' },
      notes: 'Thank you for your business.',
      terms: 'Payment is due by the date above. Please include the invoice number with your payment.',
      footer: '',
      signature: { enabled: false, mode: 'draw', image: '', typed: '', name: '', title: '' },
      style: { accent: '#0071e3', paper: 'a4', status: 'none', logoHeight: 56, showNameWithLogo: false, showSku: false },
    };
  }

  /* ---------- State ---------- */
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = deepMerge(defaults(), parsed);
        merged.items = Array.isArray(parsed.items) ? parsed.items.map((i) => ({ id: uid(), sku: '', desc: '', details: '', qty: 1, rate: 0, ...i })) : [];
        return merged;
      }
    } catch (e) { /* storage unavailable */ }
    return defaults();
  }
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (e) { toast('Could not autosave — the logo or signature image may be too large.'); }
    }, 250);
  }

  /* ---------- Money & dates ---------- */
  function fmtMoney(v) {
    try { return new Intl.NumberFormat(state.meta.locale === 'iso' ? 'en-US' : state.meta.locale, { style: 'currency', currency: state.meta.currency }).format(v); }
    catch { return state.meta.currency + ' ' + v.toFixed(2); }
  }
  function fmtDate(iso) {
    if (!iso) return '';
    if (state.meta.locale === 'iso') return iso;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(state.meta.locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function calc() {
    const t = state.totals;
    const subtotal = state.items.reduce((s, i) => s + num(i.qty) * num(i.rate), 0);
    let discount = t.discountType === 'percent' ? subtotal * num(t.discountValue) / 100 : num(t.discountValue);
    discount = Math.min(Math.max(discount, 0), subtotal);
    const taxable = subtotal - discount;
    const tax = taxable * num(t.taxRate) / 100;
    const shipping = num(t.shipping);
    const total = taxable + tax + shipping;
    const paid = num(t.amountPaid);
    return { subtotal, discount, tax, shipping, total, paid, due: total - paid };
  }

  /* ---------- Colour ---------- */
  function softColor(hex, a = 0.09) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#eef5fd';
    const n = parseInt(m[1], 16);
    const mix = (c) => Math.round(c * a + 255 * (1 - a));
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  }

  /* ---------- Preview rendering ---------- */
  const paper = $('#paper');

  function render() {
    const s = state, c = calc(), b = s.business, cl = s.client;
    const paperKey = PAPER[s.style.paper] ? s.style.paper : 'a4';
    paper.className = 'paper ' + paperKey;
    paper.style.setProperty('--accent', s.style.accent);
    paper.style.setProperty('--accent-soft', softColor(s.style.accent));

    const showName = !b.logo || s.style.showNameWithLogo;
    const brand = `
      ${b.logo ? `<img src="${b.logo}" alt="" style="height:${num(s.style.logoHeight) || 56}px">` : ''}
      ${showName && b.name ? `<div class="bname">${esc(b.name)}</div>` : ''}`;

    const lines = (arr) => arr.filter(Boolean).map((x) => `<div class="line">${x}</div>`).join('');
    const from = `
      <div><div class="label">From</div>
        <div class="who">${esc(b.name)}</div>
        ${lines([b.address && multiline(b.address), esc(b.email), esc(b.phone), esc(b.website), b.taxId && `<span class="muted">Tax ID</span> ${esc(b.taxId)}`])}
      </div>`;
    const billTo = `
      <div><div class="label">Bill to</div>
        <div class="who">${esc(cl.name || cl.company)}</div>
        ${lines([cl.name && cl.company && esc(cl.company), cl.address && multiline(cl.address), esc(cl.email), esc(cl.phone), cl.taxId && `<span class="muted">Tax ID</span> ${esc(cl.taxId)}`])}
      </div>`;
    const shipTo = s.shipTo.enabled && s.shipTo.address
      ? `<div><div class="label">Ship to</div>${lines([multiline(s.shipTo.address)])}</div>` : '';
    const cols = shipTo ? 3 : 2;

    const sku = s.style.showSku;
    const rows = s.items.length ? s.items.map((i) => `
      <tr data-break>
        ${sku ? `<td class="isku">${esc(i.sku)}</td>` : ''}
        <td><div class="idesc">${esc(i.desc) || '&nbsp;'}</div>${i.details ? `<div class="idet">${multiline(i.details)}</div>` : ''}</td>
        <td class="r">${esc(fmtQty(i.qty))}</td>
        <td class="r">${fmtMoney(num(i.rate))}</td>
        <td class="r amt">${fmtMoney(num(i.qty) * num(i.rate))}</td>
      </tr>`).join('')
      : `<tr data-break><td class="empty" colspan="${sku ? 5 : 4}">No items yet</td></tr>`;

    const t = s.totals;
    const totalRows = [
      ['Subtotal', fmtMoney(c.subtotal)],
      c.discount > 0 && [`Discount${t.discountType === 'percent' ? ` (${num(t.discountValue)}%)` : ''}`, '−' + fmtMoney(c.discount)],
      num(t.taxRate) > 0 && [`${esc(t.taxLabel || 'Tax')} (${num(t.taxRate)}%)`, fmtMoney(c.tax)],
      c.shipping > 0 && ['Shipping', fmtMoney(c.shipping)],
    ].filter(Boolean).map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`).join('');

    const notesBlocks = [
      s.notes && `<div><div class="inv-sec-label">Notes</div><div class="body">${multiline(s.notes)}</div></div>`,
      s.terms && `<div><div class="inv-sec-label">Terms</div><div class="body">${multiline(s.terms)}</div></div>`,
    ].filter(Boolean);

    const sg = s.signature;
    let ink = '';
    if (sg.enabled) {
      if (sg.mode === 'type' && sg.typed) ink = `<span class="typed">${esc(sg.typed)}</span>`;
      else if (sg.mode !== 'type' && sg.image) ink = `<img src="${sg.image}" alt="Signature">`;
    }
    const signature = sg.enabled ? `
      <section class="inv-sign" data-break><div class="box">
        <div class="ink">${ink}</div>
        <div class="rule">
          <div class="sname">${esc(sg.name) || '&nbsp;'}</div>
          ${sg.title ? `<div class="stitle">${esc(sg.title)}</div>` : ''}
        </div>
      </div></section>` : '';

    const stamp = s.style.status && s.style.status !== 'none'
      ? `<div class="stamp ${esc(s.style.status)}">${esc(s.style.status)}</div>` : '';

    const dueLabel = c.paid > 0 ? 'Balance due' : 'Amount due';
    const footerText = s.footer || [b.name, b.website, b.email].filter(Boolean).join('  ·  ');

    paper.innerHTML = `
      <header class="inv-head" data-break>
        <div class="inv-brand">${brand}</div>
        <div class="inv-title">
          <h1>${esc(s.meta.title)}</h1>
          <div class="num">${esc(s.meta.number)}</div>
        </div>
      </header>

      <section class="inv-due" data-break>
        ${stamp}
        <div>
          <div class="label">${dueLabel}</div>
          <div class="big">${fmtMoney(c.due)}</div>
          ${s.meta.dueDate ? `<div class="sub">Due ${esc(fmtDate(s.meta.dueDate))}</div>` : ''}
        </div>
        <dl class="inv-dates">
          <dt>Issue date</dt><dd>${esc(fmtDate(s.meta.issueDate))}</dd>
          ${s.meta.dueDate ? `<dt>Due date</dt><dd>${esc(fmtDate(s.meta.dueDate))}</dd>` : ''}
          ${s.meta.reference ? `<dt>Reference</dt><dd>${esc(s.meta.reference)}</dd>` : ''}
          <dt>Currency</dt><dd>${esc(s.meta.currency)}</dd>
        </dl>
      </section>

      <section class="inv-parties" style="--cols:${cols}" data-break>${from}${billTo}${shipTo}</section>

      <table class="inv-items">
        <thead><tr>
          ${sku ? '<th>SKU</th>' : ''}<th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <section class="inv-summary" data-break>
        <div class="inv-pay">
          ${s.payment.details ? `<div class="inv-sec-label">Payment details</div><div class="body">${multiline(s.payment.details)}</div>` : ''}
        </div>
        <div class="inv-totals">
          ${totalRows}
          <div class="row total"><span>Total</span><span>${fmtMoney(c.total)}</span></div>
          ${c.paid > 0 ? `<div class="row"><span>Amount paid</span><span>−${fmtMoney(c.paid)}</span></div>` : ''}
          <div class="row due"><span>${dueLabel}</span><span>${fmtMoney(c.due)}</span></div>
        </div>
      </section>

      ${notesBlocks.length ? `<section class="inv-notes ${notesBlocks.length === 1 ? 'one' : ''}" data-break>${notesBlocks.join('')}</section>` : ''}
      ${signature}
      <div class="inv-spacer"></div>
      <footer class="inv-foot" data-break>
        <span><span class="accent-dot"></span>${esc(footerText)}</span>
        <span>${esc(s.meta.number)}</span>
      </footer>`;

    renderTotalsMini(c);
    fitPreview();
  }
  const fmtQty = (q) => { const n = num(q); return Number.isInteger(n) ? String(n) : String(+n.toFixed(4)); };

  function renderTotalsMini(c) {
    const box = $('#totalsMini');
    box.innerHTML = `
      <div><span>Subtotal</span><span>${fmtMoney(c.subtotal)}</span></div>
      ${c.discount ? `<div><span>Discount</span><span>−${fmtMoney(c.discount)}</span></div>` : ''}
      ${c.tax ? `<div><span>${esc(state.totals.taxLabel || 'Tax')}</span><span>${fmtMoney(c.tax)}</span></div>` : ''}
      ${c.shipping ? `<div><span>Shipping</span><span>${fmtMoney(c.shipping)}</span></div>` : ''}
      ${c.paid ? `<div><span>Paid</span><span>−${fmtMoney(c.paid)}</span></div>` : ''}
      <div class="grand"><span>${c.paid ? 'Balance due' : 'Total'}</span><span>${fmtMoney(c.due)}</span></div>`;
  }

  /* ---------- Fit preview to available width ---------- */
  const scaler = $('#paperScaler'), stage = $('#stage');
  let currentScale = 1;
  function fitPreview() {
    const avail = stage.clientWidth;
    const w = paper.offsetWidth;
    currentScale = Math.min(1, avail / w);
    scaler.style.transform = `scale(${currentScale})`;
    scaler.style.height = paper.offsetHeight * currentScale + 'px';
    scaler.style.width = w + 'px';
  }
  new ResizeObserver(() => fitPreview()).observe(stage);

  /* ---------- Form binding ---------- */
  function syncForm() {
    $$('[data-bind]').forEach((el) => {
      const v = getPath(state, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el) el.value = v ?? '';
    });
    $$('[data-show]').forEach((el) => { el.style.display = getPath(state, el.dataset.show) ? '' : 'none'; });
    document.body.classList.toggle('show-sku', !!state.style.showSku);
    syncLogo();
    syncSigMode();
    renderSwatches();
    renderItemsEditor();
  }

  document.addEventListener('input', onBindChange);
  document.addEventListener('change', onBindChange);
  function onBindChange(e) {
    const el = e.target;
    if (!el.dataset || !el.dataset.bind) return;
    const path = el.dataset.bind;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.hasAttribute('data-num') || el.type === 'range') v = num(v);
    setPath(state, path, v);
    if (path === 'meta.issueDate' || path === 'meta.dueDate') $('#termsQuick').value = '';
    if (path === 'style.showSku') document.body.classList.toggle('show-sku', !!v);
    if (path === 'meta.currency' || path === 'meta.locale') renderItemsEditor();
    $$(`[data-show="${path}"]`).forEach((n) => { n.style.display = v ? '' : 'none'; });
    if (path === 'signature.enabled' && v) requestAnimationFrame(sizeSigCanvas);
    save(); render();
  }

  $('#termsQuick').addEventListener('change', (e) => {
    if (e.target.value === '') return;
    state.meta.dueDate = addDays(state.meta.issueDate || today(), +e.target.value);
    $('[data-bind="meta.dueDate"]').value = state.meta.dueDate;
    save(); render();
  });

  // Currency options
  $('#currencySelect').innerHTML = CURRENCIES.map(([c, n]) => `<option value="${c}">${c} — ${n}</option>`).join('');

  /* ---------- Line items editor ---------- */
  const itemsList = $('#itemsList');
  function renderItemsEditor() {
    itemsList.innerHTML = state.items.map((i) => `
      <div class="item-row" data-id="${i.id}">
        <div class="desc-stack">
          <input class="sku-in" data-f="sku" placeholder="SKU / code" value="${esc(i.sku)}">
          <input data-f="desc" placeholder="Item or service" value="${esc(i.desc)}">
          <textarea data-f="details" rows="1" placeholder="Details (optional)">${esc(i.details)}</textarea>
        </div>
        <input type="number" step="any" min="0" data-f="qty" value="${esc(i.qty)}" aria-label="Quantity">
        <input type="number" step="any" min="0" data-f="rate" value="${esc(i.rate)}" aria-label="Rate">
        <div class="amount">${fmtMoney(num(i.qty) * num(i.rate))}</div>
        <button class="icon-btn" type="button" data-del title="Remove item" aria-label="Remove item">×</button>
      </div>`).join('');
  }
  itemsList.addEventListener('input', (e) => {
    const row = e.target.closest('.item-row'); const f = e.target.dataset.f;
    if (!row || !f) return;
    const item = state.items.find((x) => x.id === row.dataset.id);
    item[f] = (f === 'qty' || f === 'rate') ? e.target.value : e.target.value;
    if (f === 'qty' || f === 'rate') $('.amount', row).textContent = fmtMoney(num(item.qty) * num(item.rate));
    save(); render();
  });
  itemsList.addEventListener('click', (e) => {
    if (!e.target.closest('[data-del]')) return;
    const row = e.target.closest('.item-row');
    state.items = state.items.filter((x) => x.id !== row.dataset.id);
    renderItemsEditor(); save(); render();
  });
  $('#btnAddItem').addEventListener('click', () => {
    state.items.push({ id: uid(), sku: '', desc: '', details: '', qty: 1, rate: 0 });
    renderItemsEditor(); save(); render();
    const rows = $$('.item-row', itemsList); $('[data-f="desc"]', rows[rows.length - 1])?.focus();
  });

  /* ---------- Images (logo / signature upload) ---------- */
  function readImage(file, maxSide = 800) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) return reject(new Error('Please choose an image file.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.onload = () => {
        const url = reader.result;
        if (file.type === 'image/svg+xml') return resolve(url); // keep vector crisp
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, maxSide / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('That image could not be loaded.'));
        img.src = url;
      };
      reader.readAsDataURL(file);
    });
  }

  const logoDrop = $('#logoDrop'), logoInput = $('#logoInput');
  function syncLogo() {
    const has = !!state.business.logo;
    $('#logoPreview').hidden = !has; if (has) $('#logoPreview').src = state.business.logo;
    $('#logoHint').hidden = has; $('#logoRemove').hidden = !has;
  }
  async function setLogo(file) {
    try { state.business.logo = await readImage(file, 900); syncLogo(); save(); render(); }
    catch (err) { toast(err.message); }
  }
  logoDrop.addEventListener('click', () => logoInput.click());
  logoDrop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logoInput.click(); } });
  logoInput.addEventListener('change', () => { setLogo(logoInput.files[0]); logoInput.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => logoDrop.addEventListener(ev, (e) => { e.preventDefault(); logoDrop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => logoDrop.addEventListener(ev, () => logoDrop.classList.remove('drag')));
  logoDrop.addEventListener('drop', (e) => { e.preventDefault(); setLogo(e.dataTransfer.files[0]); });
  $('#logoRemove').addEventListener('click', () => { state.business.logo = ''; syncLogo(); save(); render(); });

  /* ---------- Signature ---------- */
  const sigCanvas = $('#sigCanvas');
  const sctx = sigCanvas.getContext('2d');
  let drawing = false, last = null, sigDirty = false;

  function sizeSigCanvas() {
    const r = sigCanvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.max(2, window.devicePixelRatio || 1);
    sigCanvas.width = Math.round(r.width * dpr); sigCanvas.height = Math.round(r.height * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.lineCap = 'round'; sctx.lineJoin = 'round'; sctx.strokeStyle = '#1d1d1f';
    if (state.signature.mode === 'draw' && state.signature.image) {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(r.width / img.width, r.height / img.height, 1);
        sctx.drawImage(img, (r.width - img.width * k) / 2, (r.height - img.height * k) / 2, img.width * k, img.height * k);
      };
      img.src = state.signature.image;
    }
  }
  const pos = (e) => { const r = sigCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 }; };
  sigCanvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); sigCanvas.setPointerCapture(e.pointerId); });
  sigCanvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    sctx.lineWidth = 1.6 + p.p * 2;
    sctx.beginPath(); sctx.moveTo(last.x, last.y);
    const mx = (last.x + p.x) / 2, my = (last.y + p.y) / 2;
    sctx.quadraticCurveTo(last.x, last.y, mx, my); sctx.lineTo(p.x, p.y); sctx.stroke();
    last = p; sigDirty = true;
  });
  const endStroke = () => {
    if (!drawing) return; drawing = false;
    if (sigDirty) { state.signature.image = trimCanvas(sigCanvas); save(); render(); }
  };
  sigCanvas.addEventListener('pointerup', endStroke);
  sigCanvas.addEventListener('pointercancel', endStroke);
  $('#sigClear').addEventListener('click', () => {
    sctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height); sigDirty = false;
    state.signature.image = ''; save(); render();
  });
  $('#sigUpload').addEventListener('change', async (e) => {
    try { state.signature.image = await readImage(e.target.files[0], 700); state.signature.mode = 'upload'; save(); render(); toast('Signature added'); }
    catch (err) { toast(err.message); }
    e.target.value = '';
  });
  $$('[data-sigmode]').forEach((b) => b.addEventListener('click', () => {
    state.signature.mode = b.dataset.sigmode;
    syncSigMode(); save(); render();
    if (state.signature.mode === 'draw') requestAnimationFrame(sizeSigCanvas);
  }));
  function syncSigMode() {
    const m = state.signature.mode || 'draw';
    $$('[data-sigmode]').forEach((b) => b.classList.toggle('active', b.dataset.sigmode === m));
    $$('.sig-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === m));
  }
  function trimCanvas(cv) {
    const ctx = cv.getContext('2d');
    const { width: w, height: h } = cv;
    const data = ctx.getImageData(0, 0, w, h).data;
    let top = h, left = w, right = 0, bottom = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
    }
    if (right < left) return '';
    const pad = 8, out = document.createElement('canvas');
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    out.width = Math.min(w, right + pad) - left; out.height = Math.min(h, bottom + pad) - top;
    out.getContext('2d').drawImage(cv, left, top, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }
  $('details:has(#sigCanvas)')?.addEventListener('toggle', () => requestAnimationFrame(sizeSigCanvas));
  window.addEventListener('resize', () => { if (state.signature.mode === 'draw') sizeSigCanvas(); });

  /* ---------- Accent swatches ---------- */
  function renderSwatches() {
    const wrap = $('#swatches');
    const custom = !ACCENTS.includes(state.style.accent);
    wrap.innerHTML = ACCENTS.map((c) => `<button type="button" class="swatch ${c === state.style.accent ? 'active' : ''}" style="background:${c}" data-color="${c}" aria-label="Accent ${c}"></button>`).join('')
      + `<input type="color" class="swatch-custom ${custom ? 'active' : ''}" value="${state.style.accent}" title="Custom colour" aria-label="Custom accent colour">`;
  }
  $('#swatches').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]'); if (!b) return;
    state.style.accent = b.dataset.color; renderSwatches(); save(); render();
  });
  $('#swatches').addEventListener('input', (e) => {
    if (!e.target.classList.contains('swatch-custom')) return;
    state.style.accent = e.target.value; $$('.swatch').forEach((s) => s.classList.remove('active')); save(); render();
  });

  /* ---------- Export ---------- */
  function fileBase() { return (state.meta.number || 'invoice').replace(/[^\w.-]+/g, '_'); }

  async function capture(scale = 2) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    return window.html2canvas(paper, {
      scale, backgroundColor: '#ffffff', useCORS: true, logging: false,
      onclone: (doc) => {
        const sc = doc.getElementById('paperScaler');
        sc.style.transform = 'none'; sc.style.height = 'auto';
        const p = doc.getElementById('paper'); p.style.boxShadow = 'none'; p.style.borderRadius = '0';
        // html2canvas draws glyph-by-glyph when letter-spacing is set, which causes uneven gaps in numbers.
        const st = doc.createElement('style');
        st.textContent = '#paper, #paper * { letter-spacing: 0 !important; }';
        doc.head.appendChild(st);
      },
    });
  }

  function breakPoints() {
    // Safe y positions (CSS px from paper top) where a page may be cut without splitting a row.
    const top = paper.getBoundingClientRect().top;
    return $$('[data-break]', paper).map((el) => (el.getBoundingClientRect().bottom - top) / currentScale).sort((a, b) => a - b);
  }

  async function withBusy(btn, label, fn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = label;
    try { await fn(); } catch (err) { console.error(err); toast('Export failed: ' + (err.message || err)); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  async function exportPdf() {
    const key = PAPER[state.style.paper] ? state.style.paper : 'a4';
    const P = PAPER[key];
    const breaks = breakPoints();
    const canvas = await capture(2.5);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: P.pdf, orientation: 'portrait', compress: true });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const cssW = paper.offsetWidth, cssH = paper.offsetHeight;
    const k = canvas.width / cssW;          // canvas px per CSS px
    const ptPerCss = pw / cssW;              // PDF pt per CSS px
    const pageCss = ph / ptPerCss;           // page height in CSS px
    const contTop = 56;                      // top margin on continuation pages (CSS px)

    let start = 0, page = 0;
    while (start < cssH - 1) {
      const offset = page === 0 ? 0 : contTop;
      const room = pageCss - offset;
      let end = start + room;
      if (end >= cssH - 1) end = cssH;
      else {
        const safe = breaks.filter((y) => y > start + room * 0.4 && y <= end);
        if (safe.length) end = safe[safe.length - 1];
      }
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = Math.round((end - start) * k);
      const sctx2 = slice.getContext('2d');
      sctx2.fillStyle = '#fff'; sctx2.fillRect(0, 0, slice.width, slice.height);
      sctx2.drawImage(canvas, 0, Math.round(start * k), canvas.width, slice.height, 0, 0, slice.width, slice.height);
      if (page > 0) pdf.addPage(P.pdf, 'portrait');
      pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, offset * ptPerCss, pw, (end - start) * ptPerCss, undefined, 'FAST');
      start = end; page++;
    }
    pdf.setProperties({ title: `${state.meta.title} ${state.meta.number}`, author: state.business.name, creator: 'Invoice Studio' });
    pdf.save(fileBase() + '.pdf');
    toast(page > 1 ? `PDF saved (${page} pages)` : 'PDF saved');
  }

  async function exportImage(type) {
    const canvas = await capture(3);
    const mime = type === 'png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((r) => canvas.toBlob(r, mime, 0.95));
    downloadBlob(blob, `${fileBase()}.${type === 'png' ? 'png' : 'jpg'}`);
    toast(type.toUpperCase() + ' saved');
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  $('#btnPdf').addEventListener('click', (e) => withBusy(e.currentTarget, 'Preparing…', exportPdf));
  $('#btnJpg').addEventListener('click', (e) => withBusy(e.currentTarget, '…', () => exportImage('jpg')));
  $('#btnPng').addEventListener('click', (e) => withBusy(e.currentTarget, '…', () => exportImage('png')));
  $('#btnPrint').addEventListener('click', () => window.print());

  /* ---------- New / Save / Open / Reset ---------- */
  function nextNumber(n) {
    const m = /^(.*?)(\d+)(\D*)$/.exec(n || '');
    if (!m) return (n || 'INV') + '-0001';
    const next = String(+m[2] + 1).padStart(m[2].length, '0');
    return m[1] + next + m[3];
  }
  $('#btnNew').addEventListener('click', () => {
    if (!confirm('Start a new invoice? Your business details, payment info, signature and style are kept.')) return;
    const d = defaults();
    state = {
      ...state,
      client: { name: '', company: '', email: '', phone: '', address: '', taxId: '' },
      shipTo: { enabled: false, address: '' },
      meta: { ...state.meta, number: nextNumber(state.meta.number), issueDate: d.meta.issueDate, dueDate: d.meta.dueDate, reference: '' },
      items: [{ id: uid(), sku: '', desc: '', details: '', qty: 1, rate: 0 }],
      totals: { ...state.totals, discountValue: 0, shipping: 0, amountPaid: 0 },
      style: { ...state.style, status: 'none' },
    };
    $('#termsQuick').value = '';
    syncForm(); save(); render(); toast('New invoice ' + state.meta.number);
  });
  $('#btnSaveJson').addEventListener('click', () => {
    downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), fileBase() + '.json');
    toast('Backup saved');
  });
  $('#fileJson').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (!parsed || typeof parsed !== 'object' || !parsed.meta) throw new Error('Not an Invoice Studio file');
      const merged = deepMerge(defaults(), parsed);
      merged.items = (parsed.items || []).map((i) => ({ id: uid(), sku: '', desc: '', details: '', qty: 1, rate: 0, ...i }));
      state = merged; syncForm(); save(); render(); requestAnimationFrame(sizeSigCanvas);
      toast('Opened ' + state.meta.number);
    } catch (err) { toast('Could not open: ' + err.message); }
  });
  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Reset everything, including your logo and business details?')) return;
    state = defaults(); syncForm(); save(); render(); sizeSigCanvas();
  });

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Boot ---------- */
  syncForm();
  render();
  requestAnimationFrame(sizeSigCanvas);
  if (document.fonts) document.fonts.ready.then(() => fitPreview());
  window.addEventListener('beforeprint', () => { scaler.style.transform = 'none'; });
  window.addEventListener('afterprint', fitPreview);
})();
