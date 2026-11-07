/* RS Model - Billing page logic (index.html)
 * Needs common.js loaded first.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var RS = window.RS;

  var items = [];          // [{name, qty, price}]
  var oldLocked = false;   // old balance is auto-filled from khata
  var previewLocked = false; // receipt preview is showing a saved bill (print in progress)
  var afterPrintFn = null;
  var fallbackTimer = null;

  /* ================= customer / khata ================= */
  function isWalkIn(name) { return RS.key(name) === RS.key(RS.WALKIN); }

  function lookup() {
    var name = RS.cleanName($('custName').value) || RS.WALKIN;
    var existing = isWalkIn(name) ? null : RS.findCustomer(name);
    var wantsNew = !existing && !isWalkIn(name) && $('khataCheck').checked;
    return { name: name, existing: existing, isKhata: !!existing || wantsNew };
  }

  function syncCustomerUI() {
    var c = lookup();
    var info = $('khataInfo'), old = $('oldBalance');

    $('khataCheckWrap').classList.toggle('hidden', !!c.existing || isWalkIn(c.name));
    if (isWalkIn(c.name) || c.existing) $('khataCheck').checked = false;

    if (c.existing) {
      var bal = RS.balance(c.existing.id);
      var txt;
      if (bal > 0) txt = '<span class="text-red-600 font-bold">Baqaya: Rs. ' + RS.money(bal) + '</span>';
      else if (bal < 0) txt = '<span class="text-brand-700 font-bold">Advance: Rs. ' + RS.money(-bal) + '</span>';
      else txt = '<span class="text-slate-600 font-bold">Hisaab saaf (Rs. 0.00)</span>';
      info.innerHTML = '<span class="bg-brand-600 text-slate-900 px-1.5 py-0.5 rounded font-bold mr-1">KHATA</span>' + txt +
        ' &middot; <a class="text-brand-700 underline font-semibold" href="khata.html?c=' + encodeURIComponent(c.existing.id) + '">Khata kholein</a>';
      old.value = bal.toFixed(2);
      old.readOnly = true;
      oldLocked = true;
      $('oldBalanceNote').textContent = '(khata se)';
    } else {
      if (oldLocked) { old.value = '0.00'; oldLocked = false; }
      old.readOnly = false;
      $('oldBalanceNote').textContent = '';
    }
    info.classList.toggle('hidden', !c.existing);
  }

  function refreshDatalists() {
    $('khataCustomers').innerHTML = RS.getCustomers().map(function (c) {
      return '<option value="' + RS.esc(c.name) + '"></option>';
    }).join('');
    var prices = RS.getItemPrices();
    $('itemSuggestions').innerHTML = Object.keys(prices).map(function (k) {
      return '<option value="' + RS.esc(prices[k].name) + '"></option>';
    }).join('');
  }

  /* ================= calculations ================= */
  function compute(c) {
    var total = 0;
    items.forEach(function (it) { total += (Number(it.qty) || 0) * (Number(it.price) || 0); });
    total = RS.r2(total);
    var old = c.existing ? RS.balance(c.existing.id) : RS.r2(Math.max(Number($('oldBalance').value) || 0, 0));
    var totalBalance = RS.r2(total + old);
    var cash = RS.r2(Math.max(Number($('cashReceived').value) || 0, 0));
    var payable = Math.max(totalBalance, 0);
    var paid = RS.r2(Math.min(cash, payable));
    var change = RS.r2(Math.max(cash - payable, 0));
    var net = RS.r2(totalBalance - paid);
    return { total: total, old: old, totalBalance: totalBalance, cash: cash, paid: paid, change: change, net: net };
  }

  function buildData(c, t) {
    return {
      ts: Date.now(),
      no: RS.peekInvoiceNo(),
      customer: c.name,
      khata: c.isKhata,
      payment: $('paymentMethod').value,
      items: items.map(function (it) { return { name: it.name, qty: it.qty, price: it.price }; }),
      itemCount: items.length,
      total: t.total,
      oldBalance: t.old,
      totalBalance: t.totalBalance,
      cash: t.cash,
      paid: t.paid,
      change: t.change,
      netBalance: t.net
    };
  }

  /* ================= receipt ================= */
  function renderReceipt(d, isReprint) {
    var s = RS.getSettings();
    $('recShopName').textContent = s.shopName;
    $('recAddress').textContent = s.address;
    $('recPhone').textContent = s.phone ? 'Tel: ' + s.phone : '';
    $('recFooter').textContent = s.footer;
    $('recDup').classList.toggle('hidden', !isReprint);

    $('recDate').textContent = RS.fmtDate(d.ts);
    $('recTime').textContent = RS.fmtTime(d.ts);
    $('recInvoiceNo').textContent = '#' + d.no;
    $('recCustomer').textContent = d.customer;
    $('recKhataTag').classList.toggle('hidden', !d.khata);

    $('recItemsBody').innerHTML = d.items.length ? d.items.map(function (it) {
      var line = RS.r2(it.qty * it.price);
      return '<tr class="align-top"><td class="py-0.5 pr-1">' + RS.esc(it.name) + '</td>' +
        '<td class="py-0.5 text-center">' + RS.qty(it.qty) + '</td>' +
        '<td class="py-0.5 text-right">' + RS.money(it.price) + '</td>' +
        '<td class="py-0.5 text-right">' + RS.money(line) + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="py-2 text-center text-slate-400">- koi item nahi -</td></tr>';

    $('recItemCount').textContent = d.itemCount;
    $('recTotalAmount').textContent = RS.money(d.total);
    $('recOldBalance').textContent = RS.money(d.oldBalance);
    $('recTotalBalance').textContent = RS.money(d.totalBalance);
    $('recCashReceived').textContent = RS.money(d.cash);
    $('recChange').textContent = RS.money(d.change);
    $('recChangeRow').classList.toggle('hidden', !(d.change > 0));
    $('recNetLabel').textContent = d.netBalance < 0 ? 'Advance Balance:' : 'Net Balance:';
    $('recNetBalance').textContent = RS.money(Math.abs(d.netBalance));
    $('recPaymentMethod').textContent = d.payment;
  }

  function updateAll() {
    var c = lookup();
    var t = compute(c);
    $('displayInvoiceNum').textContent = RS.peekInvoiceNo();

    $('uiTotal').textContent = RS.money(t.total);
    $('uiNetLabel').textContent = t.net < 0 ? 'Advance' : 'Net Balance';
    $('uiNet').textContent = RS.money(Math.abs(t.net));
    $('uiNet').className = 'text-sm font-bold ' + (t.net > 0 ? 'text-red-600' : 'text-slate-800');
    $('uiChange').textContent = RS.money(t.change);

    if (!previewLocked) renderReceipt(buildData(c, t), false);
  }

  /* ================= line items ================= */
  function renderItems() {
    var body = $('itemsContainer');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="6" class="py-6 text-center text-slate-400">Abhi koi item add nahi hua. Upar se item likh kar Enter dabayein.</td></tr>';
      return;
    }
    body.innerHTML = items.map(function (it, i) {
      return '<tr>' +
        '<td class="py-2 px-3 text-center border-r border-slate-100 text-slate-500">' + (i + 1) + '</td>' +
        '<td class="py-2 px-3 border-r border-slate-100 font-medium break-words">' + RS.esc(it.name) + '</td>' +
        '<td class="py-1 px-1 border-r border-slate-100"><input type="number" class="no-spin w-full text-center px-1 py-1.5 border border-transparent hover:border-slate-300 focus:border-brand-500 rounded outline-none" data-i="' + i + '" data-f="qty" min="0.001" step="any" value="' + RS.qty(it.qty) + '" aria-label="Quantity of ' + RS.esc(it.name) + '"></td>' +
        '<td class="py-1 px-1 border-r border-slate-100"><input type="number" class="no-spin w-full text-right px-1 py-1.5 border border-transparent hover:border-slate-300 focus:border-brand-500 rounded outline-none" data-i="' + i + '" data-f="price" min="0" step="0.01" value="' + it.price + '" aria-label="Price of ' + RS.esc(it.name) + '"></td>' +
        '<td class="py-2 px-2 border-r border-slate-100 text-right font-semibold" data-total="' + i + '">' + RS.money(RS.r2(it.qty * it.price)) + '</td>' +
        '<td class="py-1 px-1 text-center"><button type="button" data-del="' + i + '" class="text-slate-400 hover:text-red-600 px-2 py-1" aria-label="Remove ' + RS.esc(it.name) + '"><i class="fa-solid fa-xmark"></i></button></td>' +
        '</tr>';
    }).join('');
  }

  function addItem() {
    var nameEl = $('entryItemName'), qtyEl = $('entryQty'), priceEl = $('entryPrice');
    var name = RS.cleanName(nameEl.value);
    var qty = parseFloat(qtyEl.value);
    var price = parseFloat(priceEl.value);
    if (!name) { RS.toast('Item ka naam likhein', 'error'); nameEl.focus(); return false; }
    if (!(qty > 0)) { RS.toast('Quantity 0 se zyada honi chahiye', 'error'); qtyEl.focus(); qtyEl.select(); return false; }
    if (isNaN(price) || price < 0) { RS.toast('Sahi price likhein', 'error'); priceEl.focus(); return false; }

    qty = Math.round(qty * 1000) / 1000;
    price = RS.r2(price);
    var k = RS.key(name), merged = false;
    for (var i = 0; i < items.length; i++) {
      if (RS.key(items[i].name) === k && items[i].price === price) {
        items[i].qty = Math.round((items[i].qty + qty) * 1000) / 1000;
        merged = true;
        break;
      }
    }
    if (!merged) items.push({ name: name, qty: qty, price: price });

    nameEl.value = '';
    qtyEl.value = '1';
    priceEl.value = '';
    priceEl.dataset.auto = '';
    renderItems();
    updateAll();
    nameEl.focus();
    return true;
  }

  /* Enter / arrow key navigation in the fast-entry bar */
  var ORDER = ['entryItemName', 'entryQty', 'entryPrice'];
  function onQuickKey(e) {
    var idx = ORDER.indexOf(e.target.id);
    if (idx < 0) return;
    function go(n) { var el = $(ORDER[n]); el.focus(); if (el.select) el.select(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx < 2) go(idx + 1); else addItem();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      var el = e.target, textual = el.type === 'text';
      var atEnd = !textual || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
      var atStart = !textual || (el.selectionStart === 0 && el.selectionEnd === 0);
      if (e.key === 'ArrowRight' && atEnd && idx < 2) { e.preventDefault(); go(idx + 1); }
      else if (e.key === 'ArrowLeft' && atStart && idx > 0) { e.preventDefault(); go(idx - 1); }
    }
  }

  /* Known item: auto-fill last used price */
  function onItemNameInput() {
    var p = RS.getItemPrices()[RS.key($('entryItemName').value)];
    var priceEl = $('entryPrice');
    if (p && (priceEl.value === '' || priceEl.dataset.auto === '1')) {
      priceEl.value = p.price;
      priceEl.dataset.auto = '1';
    }
  }

  /* ================= saving ================= */
  function validate(c, t) {
    if (!items.length) return 'Pehle bill me kam az kam ek item add karein';
    for (var i = 0; i < items.length; i++) {
      if (!(items[i].qty > 0)) return 'Line ' + (i + 1) + ': quantity 0 se zyada honi chahiye';
      if (!(items[i].price >= 0)) return 'Line ' + (i + 1) + ': price sahi nahi hai';
    }
    if (Number($('cashReceived').value) < 0) return 'Cash received negative nahi ho sakta';
    if (!c.existing && Number($('oldBalance').value) < 0) return 'Old balance negative nahi ho sakta';
    return '';
  }

  function doSave() {
    if (previewLocked) { RS.toast('Print chal raha hai, thora intezar karein', 'info'); return null; }
    var c = lookup(), t = compute(c);
    var err = validate(c, t);
    if (err) { RS.toast(err, 'error'); return null; }

    if (!c.isKhata && t.net > 0) {
      var ok = window.confirm('Is bill ka Rs. ' + RS.money(t.net) + ' baqi hai.\n\nKhata (udhaar) banaye baghair isi tarah save karein?\n(Cancel dabayein, phir customer ka naam likh kar "Khata" select karein.)');
      if (!ok) return null;
    }

    var customer = c.existing;
    if (c.isKhata && !customer) {
      var r = RS.addCustomer(c.name, '');
      if (!r.ok) { RS.toast(r.error, 'error'); return null; }
      customer = r.customer;
    }

    var data = buildData(c, t);
    if (!RS.recordSale(data, customer)) return null;
    refreshBadge();
    refreshDatalists();
    return data;
  }

  function resetForm() {
    items = [];
    $('custName').value = RS.WALKIN;
    $('khataCheck').checked = false;
    $('paymentMethod').value = 'Cash';
    $('cashReceived').value = '0.00';
    $('oldBalance').value = '0.00';
    $('entryItemName').value = '';
    $('entryQty').value = '1';
    $('entryPrice').value = '';
    $('entryPrice').dataset.auto = '';
    oldLocked = false;
    renderItems();
    syncCustomerUI();
    updateAll();
    $('entryItemName').focus();
  }

  function onlySave() {
    var inv = doSave();
    if (!inv) return;
    RS.toast('Invoice #' + inv.no + ' save ho gaya', 'success');
    resetForm();
  }

  /* ================= printing ================= */
  function runAfterPrint() {
    clearTimeout(fallbackTimer);
    var f = afterPrintFn;
    afterPrintFn = null;
    if (f) f();
  }
  window.addEventListener('afterprint', runAfterPrint);

  function doPrint(no, cb) {
    var oldTitle = document.title;
    document.title = 'Invoice ' + no;
    afterPrintFn = function () { document.title = oldTitle; if (cb) cb(); };
    clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(runAfterPrint, 20000);
    setTimeout(function () { window.print(); }, 60);
  }

  function printAndSave() {
    var inv = doSave();
    if (!inv) return;
    RS.toast('Invoice #' + inv.no + ' save ho gaya, print ho raha hai', 'success');
    previewLocked = true;
    renderReceipt(inv, false);
    doPrint(inv.no, function () { previewLocked = false; resetForm(); });
  }

  function reprintInvoice(no) {
    if (previewLocked) return;
    var inv = null;
    RS.getInvoices().forEach(function (i) { if (i.no === no) inv = i; });
    if (!inv) { RS.toast('Ye invoice nahi mili', 'error'); return; }
    RS.closeModal($('historyModal'));
    previewLocked = true;
    renderReceipt(inv, true);
    doPrint(inv.no, function () { previewLocked = false; updateAll(); });
  }

  function reprintLast() {
    var last = null;
    RS.getInvoices().forEach(function (i) { if (!last || i.no > last.no) last = i; });
    if (!last) { RS.toast('Abhi koi saved bill nahi hai', 'error'); return; }
    reprintInvoice(last.no);
  }

  /* ================= add saved bill to khata ================= */
  var khataTargetNo = null;

  function getInvoice(no) {
    var inv = null;
    RS.getInvoices().forEach(function (i) { if (i.no === no) inv = i; });
    return inv;
  }
  function lastInvoice() {
    var last = null;
    RS.getInvoices().forEach(function (i) { if (!last || i.no > last.no) last = i; });
    return last;
  }

  function renderLastBar() {
    var inv = lastInvoice(), bar = $('lastBillBar');
    bar.classList.toggle('hidden', !inv);
    if (!inv) return;
    var due = RS.r2(inv.total - (inv.paid || 0));
    $('lbNo').textContent = inv.no;
    $('lbInfo').textContent = inv.customer + ' | Bill Rs. ' + RS.money(inv.total) + (due > 0 ? ' | Baqi Rs. ' + RS.money(due) : ' | Poora ada');
    $('btnLastToKhata').classList.toggle('hidden', !!inv.customerId);
    $('lbInKhata').classList.toggle('hidden', !inv.customerId);
    $('lbKhataName').textContent = 'Khata: ' + inv.customer;
  }

  function updateKhataModalInfo() {
    var name = RS.cleanName($('kmName').value), inv = getInvoice(khataTargetNo), el = $('kmInfo');
    if (!inv || !name) { el.textContent = ''; return; }
    if (isWalkIn(name)) { el.innerHTML = '<span class="text-red-600">Asli customer ka naam likhein.</span>'; return; }
    var c = RS.findCustomer(name);
    var due = RS.r2(inv.total - Math.min(inv.paid || 0, inv.total));
    if (c) {
      var b = RS.balance(c.id);
      el.innerHTML = '<span class="text-brand-700 font-bold">Khata mojood hai.</span> Abhi baqaya: Rs. ' + RS.money(b) +
        ' &rarr; is bill ke baad: <b>Rs. ' + RS.money(b + due) + '</b>';
    } else {
      el.innerHTML = '<span class="text-amber-700 font-bold">Naya khata ban jayega.</span> Baqaya hoga: <b>Rs. ' + RS.money(due) + '</b>';
    }
  }

  function openKhataModal(no) {
    var inv = getInvoice(no);
    if (!inv) { RS.toast('Ye invoice nahi mili', 'error'); return; }
    if (inv.customerId) { RS.toast('Ye bill pehle se khata me hai', 'info'); return; }
    khataTargetNo = no;
    var due = RS.r2(inv.total - Math.min(inv.paid || 0, inv.total));
    $('kmBill').innerHTML =
      '<div class="flex justify-between"><span>Invoice</span><b>#' + inv.no + '</b></div>' +
      '<div class="flex justify-between"><span>Bill total</span><b>Rs. ' + RS.money(inv.total) + '</b></div>' +
      '<div class="flex justify-between"><span>Cash mila</span><b>Rs. ' + RS.money(Math.min(inv.paid || 0, inv.total)) + '</b></div>' +
      '<div class="flex justify-between text-red-600"><span>Khata me jayega (baqaya)</span><b>Rs. ' + RS.money(due) + '</b></div>';
    $('kmName').value = isWalkIn(inv.customer) ? '' : inv.customer;
    updateKhataModalInfo();
    RS.closeModal($('historyModal'));
    RS.openModal($('khataModal'), $('kmName'));
  }

  function confirmKhata(e) {
    e.preventDefault();
    var name = RS.cleanName($('kmName').value);
    if (!name || isWalkIn(name)) { RS.toast('Asli customer ka naam likhein', 'error'); return; }
    var customer = RS.findCustomer(name);
    if (!customer) {
      var r = RS.addCustomer(name, '');
      if (!r.ok) { RS.toast(r.error, 'error'); return; }
      customer = r.customer;
    }
    var res = RS.addInvoiceToKhata(khataTargetNo, customer);
    if (!res.ok) { RS.toast(res.error, 'error'); return; }
    RS.closeModal($('khataModal'));
    RS.toast('Bill #' + khataTargetNo + ' "' + customer.name + '" ke khata me chala gaya', 'success');
    refreshBadge();
    refreshDatalists();
    renderLastBar();
    renderHistory();
    syncCustomerUI();
    updateAll();
  }

  /* ================= history ================= */
  function refreshBadge() {
    var n = RS.getInvoices().length, b = $('historyBadge');
    b.textContent = n;
    b.classList.toggle('hidden', n === 0);
    renderLastBar();
  }

  function renderHistory() {
    var q = RS.key($('historySearch').value).replace(/^#/, '');
    var all = RS.getInvoices().slice().sort(function (a, b) { return b.no - a.no; });
    var list = all.filter(function (i) {
      return !q || String(i.no).indexOf(q) > -1 || RS.key(i.customer).indexOf(q) > -1 || RS.fmtDate(i.ts).indexOf(q) > -1;
    });

    var todayCount = 0, todaySum = 0;
    all.forEach(function (i) { if (RS.isToday(i.ts)) { todayCount++; todaySum += i.total; } });
    $('historySummary').textContent = 'Aaj: ' + todayCount + ' bill, Rs. ' + RS.money(todaySum) + ' ki sale  |  Kul saved bills: ' + all.length;

    $('historyTableBody').innerHTML = list.length ? list.map(function (i) {
      var net = i.netBalance > 0 ? '<span class="text-red-600 font-semibold">' + RS.money(i.netBalance) + '</span>' : RS.money(Math.abs(i.netBalance || 0));
      var tag = i.khata ? ' <span class="bg-brand-100 text-brand-800 text-[10px] font-bold px-1.5 py-0.5 rounded">Khata</span>' : '';
      return '<tr class="hover:bg-slate-50">' +
        '<td class="py-3 px-4 font-mono font-bold">#' + i.no + '</td>' +
        '<td class="py-3 px-4 whitespace-nowrap">' + RS.fmtDate(i.ts) + '<br><span class="text-slate-400">' + RS.fmtTime(i.ts) + '</span></td>' +
        '<td class="py-3 px-4 font-medium">' + RS.esc(i.customer) + tag + '</td>' +
        '<td class="py-3 px-4 text-center">' + i.itemCount + '</td>' +
        '<td class="py-3 px-4 text-right">' + RS.money(i.total) + '</td>' +
        '<td class="py-3 px-4 text-right">' + net + '</td>' +
        '<td class="py-3 px-4 text-center">' + RS.esc(i.payment) + '</td>' +
        '<td class="py-3 px-4 text-center whitespace-nowrap">' +
        '<button type="button" data-reprint="' + i.no + '" class="text-brand-700 hover:bg-brand-50 border border-brand-200 rounded px-2 py-1 mr-1" title="Reprint"><i class="fa-solid fa-print"></i> Reprint</button>' +
        (i.customerId ? '' : '<button type="button" data-tokhata="' + i.no + '" class="text-amber-700 hover:bg-amber-50 border border-amber-300 rounded px-2 py-1 mr-1" title="Is bill ko khata me daalein"><i class="fa-solid fa-book"></i> Khata</button>') +
        '<button type="button" data-delinv="' + i.no + '" class="text-red-600 hover:bg-red-50 border border-red-200 rounded px-2 py-1" title="Delete invoice" aria-label="Delete invoice ' + i.no + '"><i class="fa-solid fa-trash-can"></i></button>' +
        '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="py-8 text-center text-slate-400">Koi invoice nahi mili</td></tr>';
  }

  function openHistory() {
    $('historySearch').value = '';
    renderHistory();
    RS.openModal($('historyModal'), $('historySearch'));
  }

  function clearHistory() {
    var n = RS.getInvoices().length;
    if (!n) { RS.toast('History pehle se khali hai', 'info'); return; }
    if (!window.confirm('Saare ' + n + ' saved bills delete ho jayenge.\n\nKhata (customer accounts) mehfooz rahenge.\nPehle upar header se Backup download kar lein.\n\nPhir bhi delete karein?')) return;
    RS.clearInvoices();
    refreshBadge();
    renderHistory();
    updateAll();
    RS.toast('Sales history clear ho gayi', 'success');
  }

  function onHistoryClick(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.reprint) { reprintInvoice(Number(btn.dataset.reprint)); return; }
    if (btn.dataset.tokhata) { openKhataModal(Number(btn.dataset.tokhata)); return; }
    if (btn.dataset.delinv) {
      var no = Number(btn.dataset.delinv);
      if (!window.confirm('Invoice #' + no + ' delete karein?\nAgar ye bill khata me tha to khata se bhi hat jayega.')) return;
      RS.deleteInvoice(no);
      refreshBadge();
      renderHistory();
      updateAll();
      syncCustomerUI();
      RS.toast('Invoice #' + no + ' delete ho gayi', 'success');
    }
  }

  /* ================= init ================= */
  function init() {
    RS.initChrome(function () { updateAll(); });
    RS.bindModal($('historyModal'));
    RS.bindModal($('khataModal'));
    $('btnLastToKhata').addEventListener('click', function () { var l = lastInvoice(); if (l) openKhataModal(l.no); });
    $('kmName').addEventListener('input', updateKhataModalInfo);
    $('khataModalForm').addEventListener('submit', confirmKhata);

    $('custName').addEventListener('input', function () { syncCustomerUI(); updateAll(); });
    $('custName').addEventListener('focus', function () { if (isWalkIn(this.value)) this.select(); });
    $('custName').addEventListener('blur', function () { if (!RS.cleanName(this.value)) { this.value = RS.WALKIN; syncCustomerUI(); updateAll(); } });
    $('khataCheck').addEventListener('change', function () { syncCustomerUI(); updateAll(); });
    $('paymentMethod').addEventListener('change', updateAll);
    $('oldBalance').addEventListener('input', updateAll);
    $('cashReceived').addEventListener('input', updateAll);

    ORDER.forEach(function (id) { $(id).addEventListener('keydown', onQuickKey); });
    $('entryItemName').addEventListener('input', onItemNameInput);
    $('entryItemName').addEventListener('change', onItemNameInput);
    $('entryPrice').addEventListener('input', function () { this.dataset.auto = ''; });
    $('btnAddItem').addEventListener('click', addItem);

    $('itemsContainer').addEventListener('input', function (e) {
      var el = e.target;
      if (!el.dataset || el.dataset.i === undefined) return;
      var i = Number(el.dataset.i), f = el.dataset.f, v = parseFloat(el.value);
      if (!items[i]) return;
      var bad = isNaN(v) || (f === 'qty' ? v <= 0 : v < 0);
      el.classList.toggle('border-red-500', bad);
      items[i][f] = bad ? 0 : v;
      var cell = $('itemsContainer').querySelector('[data-total="' + i + '"]');
      if (cell) cell.textContent = RS.money(RS.r2(items[i].qty * items[i].price));
      updateAll();
    });
    $('itemsContainer').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-del]');
      if (!btn) return;
      items.splice(Number(btn.dataset.del), 1);
      renderItems();
      updateAll();
    });
    $('btnClearItems').addEventListener('click', function () {
      if (!items.length) return;
      if (window.confirm('Bill ke saare items hata dein?')) { items = []; renderItems(); updateAll(); }
    });

    $('btnPrintSave').addEventListener('click', printAndSave);
    $('btnOnlySave').addEventListener('click', onlySave);
    $('btnReprint').addEventListener('click', reprintLast);

    $('btnHistory').addEventListener('click', openHistory);
    $('historySearch').addEventListener('input', renderHistory);
    $('btnClearHistory').addEventListener('click', clearHistory);
    $('historyTableBody').addEventListener('click', onHistoryClick);

    // Khata page me payment lene ke baad wapas aayen to balance taza ho
    function refreshOnReturn() { refreshDatalists(); syncCustomerUI(); updateAll(); refreshBadge(); }
    window.addEventListener('focus', refreshOnReturn);
    window.addEventListener('pageshow', refreshOnReturn);
    setInterval(function () { if (!previewLocked) updateAll(); }, 20000);

    refreshDatalists();
    refreshBadge();
    resetForm();
    // khata page se "Is ka Naya Bill" dabane par customer ka naam pehle se bhar jata hai
    var nm = /[?&]name=([^&]+)/.exec(window.location.search);
    if (nm) {
      try { $('custName').value = decodeURIComponent(nm[1].replace(/\+/g, ' ')).slice(0, 60); } catch (e) { /* ignore */ }
      syncCustomerUI();
      updateAll();
      $('entryItemName').focus();
    }
    document.title = 'RS Model - Billing | ' + RS.getSettings().shopName;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
