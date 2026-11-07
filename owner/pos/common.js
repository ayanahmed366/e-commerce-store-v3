/* RS Model - Rustam Super Mart POS
 * Shared code: storage, khata (ledger), settings, backup, toast, modal helpers.
 * Used by index.html (billing) and khata.html (customer accounts).
 */
(function (global) {
  'use strict';

  var RS = (global.RS = {});

  var K = {
    invoices: 'rs_invoices',
    next: 'rs_invoice_next',
    customers: 'rs_customers',
    ledger: 'rs_ledger',
    settings: 'rs_settings',
    prices: 'rs_item_prices'
  };

  RS.WALKIN = 'Walk-in Customer';
  RS.DEFAULTS = {
    shopName: 'RUSTAM SUPER MART',
    address: 'Main Bazaar, City Center',
    phone: '+92 300 1234567',
    footer: 'Please check goods & expiry date'
  };

  /* ---------- small helpers ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  RS.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  RS.r2 = function (n) { return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100; };
  RS.money = function (n) {
    return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  RS.qty = function (n) { return String(Math.round((Number(n) || 0) * 1000) / 1000); };
  RS.cleanName = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };
  RS.key = function (s) { return RS.cleanName(s).toLowerCase(); };
  RS.cleanPhone = function (s) { return String(s || '').replace(/[^\d+\-\s]/g, '').trim(); };
  RS.uid = function (p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  RS.fmtDate = function (ts) {
    var d = new Date(ts);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  };
  RS.fmtTime = function (ts) {
    var d = new Date(ts), h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return pad(h) + ':' + pad(d.getMinutes()) + ' ' + ap;
  };
  RS.isToday = function (ts) {
    var a = new Date(ts), b = new Date();
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };

  /* ---------- storage ---------- */
  function read(key, fallback) {
    try {
      var v = global.localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      RS.toast('Data save nahi ho saka (browser storage full ya blocked hai)', 'error');
      return false;
    }
  }
  function readArray(key) { var a = read(key, []); return Array.isArray(a) ? a : []; }

  /* ---------- settings ---------- */
  RS.getSettings = function () {
    var s = read(K.settings, {});
    var out = {};
    Object.keys(RS.DEFAULTS).forEach(function (k) { out[k] = typeof s[k] === 'string' ? s[k] : RS.DEFAULTS[k]; });
    return out;
  };
  RS.saveSettings = function (s) { return write(K.settings, s); };

  /* ---------- invoices ---------- */
  RS.getInvoices = function () { return readArray(K.invoices); };

  RS.peekInvoiceNo = function () {
    var max = 1000;
    RS.getInvoices().forEach(function (i) { if (i.no > max) max = i.no; });
    var stored = Number(read(K.next, 0)) || 0;
    return Math.max(stored, max + 1, 1001);
  };

  /* ---------- customers (khata) ---------- */
  RS.getCustomers = function () { return readArray(K.customers); };
  RS.getCustomer = function (id) {
    var list = RS.getCustomers();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  RS.findCustomer = function (name) {
    var k = RS.key(name);
    if (!k) return null;
    var list = RS.getCustomers();
    for (var i = 0; i < list.length; i++) if (RS.key(list[i].name) === k) return list[i];
    return null;
  };
  RS.addCustomer = function (name, phone) {
    name = RS.cleanName(name);
    if (!name) return { ok: false, error: 'Customer ka naam likhein' };
    if (RS.key(name) === RS.key(RS.WALKIN)) return { ok: false, error: '"Walk-in Customer" ka khata nahi ban sakta, asli naam likhein' };
    if (RS.findCustomer(name)) return { ok: false, error: 'Is naam ka customer pehle se mojood hai' };
    var c = { id: RS.uid('c'), name: name, phone: RS.cleanPhone(phone), createdAt: Date.now() };
    var list = RS.getCustomers();
    list.push(c);
    if (!write(K.customers, list)) return { ok: false, error: 'Save nahi ho saka' };
    return { ok: true, customer: c };
  };
  RS.deleteCustomer = function (id) {
    write(K.customers, RS.getCustomers().filter(function (c) { return c.id !== id; }));
    write(K.ledger, readArray(K.ledger).filter(function (e) { return e.customerId !== id; }));
  };

  /* ---------- ledger ---------- */
  /* entry: {id, customerId, ts, type: bill|billpay|payment|opening|manual, invoiceNo, debit, credit, note}
     debit = customer ne udhaar liya (balance barhta hai), credit = customer ne paise diye (balance kam). */
  RS.getLedger = function (customerId) {
    return readArray(K.ledger)
      .filter(function (e) { return e.customerId === customerId; })
      .sort(function (a, b) { return a.ts - b.ts; });
  };
  RS.addEntry = function (e) {
    var list = readArray(K.ledger);
    e.id = RS.uid('e');
    e.ts = e.ts || Date.now();
    e.debit = RS.r2(e.debit);
    e.credit = RS.r2(e.credit);
    list.push(e);
    return write(K.ledger, list) ? e : null;
  };
  RS.deleteEntry = function (id) {
    write(K.ledger, readArray(K.ledger).filter(function (e) { return e.id !== id; }));
  };
  RS.balance = function (customerId) {
    var sum = 0;
    readArray(K.ledger).forEach(function (e) {
      if (e.customerId === customerId) sum += (Number(e.debit) || 0) - (Number(e.credit) || 0);
    });
    return RS.r2(sum);
  };
  RS.balances = function () {
    var map = {};
    readArray(K.ledger).forEach(function (e) {
      map[e.customerId] = (map[e.customerId] || 0) + (Number(e.debit) || 0) - (Number(e.credit) || 0);
    });
    Object.keys(map).forEach(function (k) { map[k] = RS.r2(map[k]); });
    return map;
  };

  /* ---------- item price memory (auto-fill) ---------- */
  RS.getItemPrices = function () { var p = read(K.prices, {}); return p && typeof p === 'object' ? p : {}; };
  function rememberItems(items) {
    var p = RS.getItemPrices();
    items.forEach(function (it) { p[RS.key(it.name)] = { name: it.name, price: it.price }; });
    write(K.prices, p);
  }

  /* ---------- sales ---------- */
  /* Saves an invoice. If `customer` is given, the bill and any payment are posted to that customer's khata. */
  RS.recordSale = function (inv, customer) {
    inv.no = RS.peekInvoiceNo();
    inv.ts = Date.now();
    inv.customerId = customer ? customer.id : null;
    var list = RS.getInvoices();
    list.push(inv);
    if (!write(K.invoices, list)) return false;
    write(K.next, inv.no + 1);
    if (customer) {
      RS.addEntry({ customerId: customer.id, ts: inv.ts, type: 'bill', invoiceNo: inv.no, debit: inv.total, credit: 0, note: inv.itemCount + ' item(s)' });
      if (inv.paid > 0) {
        RS.addEntry({ customerId: customer.id, ts: inv.ts, type: 'billpay', invoiceNo: inv.no, debit: 0, credit: inv.paid, note: inv.payment });
      }
    }
    rememberItems(inv.items);
    return true;
  };
  /* Pehle se save hui bill ko baad me kisi customer ke khata me daalna (dobara kuch likhna nahi parta). */
  RS.addInvoiceToKhata = function (no, customer) {
    var list = RS.getInvoices(), inv = null;
    list.forEach(function (i) { if (i.no === no) inv = i; });
    if (!inv) return { ok: false, error: 'Ye invoice nahi mili' };
    if (inv.customerId) return { ok: false, error: 'Ye bill pehle se khata me hai' };
    var old = RS.balance(customer.id);
    var credit = RS.r2(Math.min(Number(inv.paid) || 0, inv.total));
    if (!RS.addEntry({ customerId: customer.id, ts: inv.ts, type: 'bill', invoiceNo: no, debit: inv.total, credit: 0, note: inv.itemCount + ' item(s)' })) {
      return { ok: false, error: 'Khata me save nahi ho saka' };
    }
    if (credit > 0) {
      RS.addEntry({ customerId: customer.id, ts: inv.ts, type: 'billpay', invoiceNo: no, debit: 0, credit: credit, note: inv.payment });
    }
    inv.customerId = customer.id;
    inv.customer = customer.name;
    inv.khata = true;
    inv.oldBalance = old;
    inv.totalBalance = RS.r2(inv.total + old);
    inv.netBalance = RS.r2(inv.totalBalance - credit);
    write(K.invoices, list);
    return { ok: true, invoice: inv, credit: credit };
  };
  RS.deleteInvoice = function (no) {
    write(K.invoices, RS.getInvoices().filter(function (i) { return i.no !== no; }));
    write(K.ledger, readArray(K.ledger).filter(function (e) { return e.invoiceNo !== no; }));
  };
  /* History clear: sirf invoices hotay hain, khata (ledger) mehfooz rehta hai. */
  RS.clearInvoices = function () { write(K.invoices, []); };

  /* ---------- backup / restore ---------- */
  RS.exportBackup = function () {
    var payload = {
      app: 'RS Model POS',
      version: 1,
      exportedAt: new Date().toISOString(),
      invoices: RS.getInvoices(),
      nextInvoice: RS.peekInvoiceNo(),
      customers: RS.getCustomers(),
      ledger: readArray(K.ledger),
      settings: read(K.settings, {}),
      itemPrices: RS.getItemPrices()
    };
    var d = new Date();
    var name = 'rs-backup-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json';
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    RS.toast('Backup file download ho rahi hai', 'success');
  };
  RS.importBackup = function (file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (e) { RS.toast('Ye valid backup file nahi hai', 'error'); return; }
      if (!data || data.app !== 'RS Model POS' || !Array.isArray(data.invoices) || !Array.isArray(data.customers) || !Array.isArray(data.ledger)) {
        RS.toast('Ye RS Model ki backup file nahi lagti', 'error');
        return;
      }
      if (!global.confirm('Restore karne se mojooda saara data (bills, khata) is backup se replace ho jayega. Jari rakhein?')) return;
      write(K.invoices, data.invoices);
      write(K.customers, data.customers);
      write(K.ledger, data.ledger);
      write(K.next, Number(data.nextInvoice) || 1001);
      write(K.settings, data.settings && typeof data.settings === 'object' ? data.settings : {});
      write(K.prices, data.itemPrices && typeof data.itemPrices === 'object' ? data.itemPrices : {});
      RS.toast('Backup restore ho gaya', 'success');
      setTimeout(function () { global.location.reload(); }, 700);
    };
    reader.readAsText(file);
  };

  /* ---------- UI helpers (browser only) ---------- */
  RS.toast = function (msg, type) {
    var box = global.document && document.getElementById('toastContainer');
    if (!box) return;
    var colors = { success: 'bg-brand-600', error: 'bg-red-600', info: 'bg-slate-800' };
    var el = document.createElement('div');
    el.className = 'toast-item pointer-events-auto ' + (type === 'success' ? 'text-slate-900' : 'text-white') + ' text-sm font-medium px-4 py-3 rounded-lg shadow-lg ' + (colors[type] || colors.info);
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('toast-out');
      setTimeout(function () { el.remove(); }, 300);
    }, 3200);
  };

  var modalStack = [];
  RS.openModal = function (el, focusEl) {
    if (!el) return;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    modalStack.push({ el: el, prev: document.activeElement });
    if (focusEl) setTimeout(function () { focusEl.focus(); }, 30);
  };
  RS.closeModal = function (el) {
    if (!el) return;
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
    for (var i = modalStack.length - 1; i >= 0; i--) {
      if (modalStack[i].el === el) {
        var prev = modalStack[i].prev;
        modalStack.splice(i, 1);
        if (prev && prev.focus) prev.focus();
        break;
      }
    }
  };
  RS.bindModal = function (el) {
    el.addEventListener('click', function (e) { if (e.target === el) RS.closeModal(el); });
    Array.prototype.forEach.call(el.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', function () { RS.closeModal(el); });
    });
  };

  /* Settings modal is injected so both pages share one copy. */
  function buildSettingsModal() {
    var div = document.createElement('div');
    div.id = 'settingsModal';
    div.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-labelledby', 'settingsTitle');
    div.setAttribute('aria-hidden', 'true');
    div.innerHTML =
      '<form id="settingsForm" class="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">' +
      '<div class="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">' +
      '<h3 id="settingsTitle" class="font-bold text-lg"><i class="fa-solid fa-gear text-brand-500 mr-2"></i>Shop Settings</h3>' +
      '<button type="button" data-close class="text-slate-400 hover:text-white" aria-label="Close settings"><i class="fa-solid fa-xmark text-xl"></i></button>' +
      '</div>' +
      '<div class="p-6 space-y-4">' +
      '<p class="text-xs text-slate-500">Ye details receipt aur khata statement par print hongi.</p>' +
      field('setName', 'Shop Name') + field('setAddress', 'Address') + field('setPhone', 'Phone') + field('setFooter', 'Receipt Footer Message') +
      '</div>' +
      '<div class="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">' +
      '<button type="button" data-close class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs">Cancel</button>' +
      '<button type="submit" class="bg-brand-600 hover:bg-brand-700 text-slate-900 font-semibold px-4 py-2 rounded-lg text-xs">Save</button>' +
      '</div></form>';
    document.body.appendChild(div);
    return div;
  }
  function field(id, label) {
    return '<div><label for="' + id + '" class="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">' + label + '</label>' +
      '<input type="text" id="' + id + '" maxlength="80" class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"></div>';
  }

  /* Wires header buttons: #btnSettings, #btnBackup, #btnRestore + hidden #fileRestore. */
  RS.initChrome = function (onSettingsChange) {
    var modal = buildSettingsModal();
    RS.bindModal(modal);
    var form = document.getElementById('settingsForm');
    var map = { setName: 'shopName', setAddress: 'address', setPhone: 'phone', setFooter: 'footer' };

    var btnSettings = document.getElementById('btnSettings');
    if (btnSettings) btnSettings.addEventListener('click', function () {
      var s = RS.getSettings();
      Object.keys(map).forEach(function (id) { document.getElementById(id).value = s[map[id]]; });
      RS.openModal(modal, document.getElementById('setName'));
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var s = {};
      Object.keys(map).forEach(function (id) { s[map[id]] = RS.cleanName(document.getElementById(id).value); });
      if (!s.shopName) { RS.toast('Shop ka naam khali nahi ho sakta', 'error'); return; }
      if (RS.saveSettings(s)) {
        RS.closeModal(modal);
        RS.toast('Settings save ho gayi', 'success');
        if (onSettingsChange) onSettingsChange();
      }
    });

    var btnBackup = document.getElementById('btnBackup');
    if (btnBackup) btnBackup.addEventListener('click', RS.exportBackup);
    var btnRestore = document.getElementById('btnRestore');
    var fileRestore = document.getElementById('fileRestore');
    if (btnRestore && fileRestore) {
      btnRestore.addEventListener('click', function () { fileRestore.click(); });
      fileRestore.addEventListener('change', function () {
        if (fileRestore.files && fileRestore.files[0]) RS.importBackup(fileRestore.files[0]);
        fileRestore.value = '';
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalStack.length) RS.closeModal(modalStack[modalStack.length - 1].el);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
