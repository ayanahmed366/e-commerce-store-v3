/* RS Model - Khata (customer ledger) page logic (khata.html)
 * Needs common.js loaded first.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var RS = window.RS;
  var selectedId = null;

  function balClass(b) { return b > 0 ? 'text-red-600' : (b < 0 ? 'text-brand-700' : 'text-slate-500'); }
  function balText(b) {
    if (b > 0) return 'Rs. ' + RS.money(b);
    if (b < 0) return 'Advance Rs. ' + RS.money(-b);
    return 'Saaf';
  }

  function describe(e) {
    switch (e.type) {
      case 'bill': return 'Bill #' + e.invoiceNo + (e.note ? ' <span class="text-slate-400">(' + RS.esc(e.note) + ')</span>' : '');
      case 'billpay': return 'Bill #' + e.invoiceNo + ' ke saath wasooli' + (e.note ? ' <span class="text-slate-400">(' + RS.esc(e.note) + ')</span>' : '');
      case 'payment': return 'Paisay wasool' + (e.note ? ' <span class="text-slate-400">- ' + RS.esc(e.note) + '</span>' : '');
      case 'opening': return 'Purana udhaar' + (e.note ? ' <span class="text-slate-400">- ' + RS.esc(e.note) + '</span>' : '');
      default: return 'Udhaar' + (e.note ? ' <span class="text-slate-400">- ' + RS.esc(e.note) + '</span>' : '');
    }
  }
  function describePlain(e) {
    var d = describe(e).replace(/<[^>]+>/g, '');
    return d.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  /* ---------- summary + customer list ---------- */
  function renderSummary() {
    var custs = RS.getCustomers(), bal = RS.balances();
    var sum = 0, owing = 0;
    custs.forEach(function (c) {
      var b = bal[c.id] || 0;
      if (b > 0) { sum += b; owing++; }
    });
    $('sumCustomers').textContent = custs.length;
    $('sumUdhaar').textContent = 'Rs. ' + RS.money(sum);
    $('sumOwing').textContent = owing;
  }

  function renderCustomers() {
    var q = RS.key($('custSearch').value);
    var bal = RS.balances();
    var list = RS.getCustomers().filter(function (c) {
      return !q || RS.key(c.name).indexOf(q) > -1 || String(c.phone || '').replace(/\D/g, '').indexOf(q.replace(/\D/g, '') || '\u0000') > -1;
    }).sort(function (a, b) {
      return (bal[b.id] || 0) - (bal[a.id] || 0) || RS.key(a.name).localeCompare(RS.key(b.name));
    });

    $('custList').innerHTML = list.length ? list.map(function (c) {
      var b = bal[c.id] || 0, active = c.id === selectedId;
      return '<li><button type="button" data-id="' + RS.esc(c.id) + '" class="w-full text-left px-4 py-3 flex items-center justify-between gap-2 hover:bg-slate-50 ' + (active ? 'bg-brand-50 border-l-4 border-brand-600' : 'border-l-4 border-transparent') + '"' + (active ? ' aria-current="true"' : '') + '>' +
        '<span class="min-w-0"><span class="block font-semibold text-sm truncate">' + RS.esc(c.name) + '</span>' +
        '<span class="block text-[11px] text-slate-400">' + (RS.esc(c.phone) || 'phone nahi') + '</span></span>' +
        '<span class="text-xs font-bold whitespace-nowrap ' + balClass(b) + '">' + balText(b) + '</span></button></li>';
    }).join('') : '<li class="px-4 py-8 text-center text-xs text-slate-400">' + (RS.getCustomers().length ? 'Koi customer nahi mila' : 'Abhi koi khata nahi. Upar se naya khata kholein.') + '</li>';
  }

  /* ---------- ledger ---------- */
  function rowsWithRunning(id) {
    var run = 0;
    return RS.getLedger(id).map(function (e) {
      run = RS.r2(run + (Number(e.debit) || 0) - (Number(e.credit) || 0));
      return { e: e, run: run };
    });
  }

  function renderLedger() {
    var c = selectedId ? RS.getCustomer(selectedId) : null;
    $('ledgerEmpty').classList.toggle('hidden', !!c);
    $('ledgerPanel').classList.toggle('hidden', !c);
    if (!c) return;

    var bal = RS.balance(c.id);
    $('ledgerName').textContent = c.name;
    $('ledgerPhone').textContent = c.phone ? 'Phone: ' + c.phone : '';
    $('ledgerBalLabel').textContent = bal < 0 ? 'Advance' : 'Baqaya';
    $('ledgerBal').textContent = bal < 0 ? 'Rs. ' + RS.money(-bal) : 'Rs. ' + RS.money(bal);
    $('ledgerBal').className = 'text-2xl font-bold ' + (bal > 0 ? 'text-red-400' : (bal < 0 ? 'text-brand-400' : 'text-white'));

    var rows = rowsWithRunning(c.id), dr = 0, cr = 0;
    $('ledgerBody').innerHTML = rows.length ? rows.map(function (r) {
      var e = r.e;
      dr += Number(e.debit) || 0;
      cr += Number(e.credit) || 0;
      var deletable = e.type === 'payment' || e.type === 'manual' || e.type === 'opening';
      return '<tr class="hover:bg-slate-50">' +
        '<td class="py-2.5 px-3 whitespace-nowrap">' + RS.fmtDate(e.ts) + '<br><span class="text-slate-400">' + RS.fmtTime(e.ts) + '</span></td>' +
        '<td class="py-2.5 px-3">' + describe(e) + '</td>' +
        '<td class="py-2.5 px-3 text-right">' + (e.debit > 0 ? RS.money(e.debit) : '-') + '</td>' +
        '<td class="py-2.5 px-3 text-right text-brand-700">' + (e.credit > 0 ? RS.money(e.credit) : '-') + '</td>' +
        '<td class="py-2.5 px-3 text-right font-semibold ' + balClass(r.run) + '">' + RS.money(r.run) + '</td>' +
        '<td class="py-2.5 px-2 text-center">' + (deletable ? '<button type="button" data-delentry="' + RS.esc(e.id) + '" class="text-slate-300 hover:text-red-600" title="Ye entry hatayen" aria-label="Entry hatayen"><i class="fa-solid fa-xmark"></i></button>' : '') + '</td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="6" class="py-8 text-center text-slate-400">Abhi koi entry nahi</td></tr>';

    $('ledgerFoot').innerHTML = rows.length ?
      '<tr><td class="py-2.5 px-3" colspan="2">Total</td><td class="py-2.5 px-3 text-right">' + RS.money(dr) + '</td><td class="py-2.5 px-3 text-right text-brand-700">' + RS.money(cr) + '</td><td class="py-2.5 px-3 text-right ' + balClass(bal) + '">' + RS.money(bal) + '</td><td></td></tr>' : '';

    $('btnNewBill').href = 'index.html?name=' + encodeURIComponent(c.name);
  }

  function refreshAll() { renderSummary(); renderCustomers(); renderLedger(); }

  function selectCustomer(id) {
    selectedId = id;
    try { history.replaceState(null, '', '?c=' + encodeURIComponent(id)); } catch (e) { /* file:// may block */ }
    refreshAll();
  }

  /* ---------- actions ---------- */
  function addCustomer(e) {
    e.preventDefault();
    var r = RS.addCustomer($('newName').value, $('newPhone').value);
    if (!r.ok) { RS.toast(r.error, 'error'); $('newName').focus(); return; }
    var opening = parseFloat($('newOpening').value);
    if (opening > 0) {
      RS.addEntry({ customerId: r.customer.id, type: 'opening', debit: opening, credit: 0, note: '' });
    }
    $('addCustomerForm').reset();
    RS.toast('"' + r.customer.name + '" ka khata ban gaya', 'success');
    selectCustomer(r.customer.id);
  }

  function receivePayment(e) {
    e.preventDefault();
    if (!selectedId) return;
    var amt = RS.r2(parseFloat($('payAmount').value));
    if (!(amt > 0)) { RS.toast('Sahi amount likhein', 'error'); return; }
    var bal = RS.balance(selectedId);
    if (amt > Math.max(bal, 0) && !window.confirm('Ye amount baqaya (Rs. ' + RS.money(Math.max(bal, 0)) + ') se zyada hai. Zyada rakam customer ka advance ban jayegi. Jari rakhein?')) return;
    RS.addEntry({ customerId: selectedId, type: 'payment', debit: 0, credit: amt, note: RS.cleanName($('payNote').value) });
    $('payForm').reset();
    RS.toast('Rs. ' + RS.money(amt) + ' wasool ho gaye', 'success');
    refreshAll();
  }

  function addManual(e) {
    e.preventDefault();
    if (!selectedId) return;
    var amt = RS.r2(parseFloat($('manAmount').value));
    if (!(amt > 0)) { RS.toast('Sahi amount likhein', 'error'); return; }
    RS.addEntry({ customerId: selectedId, type: 'manual', debit: amt, credit: 0, note: RS.cleanName($('manNote').value) });
    $('manualForm').reset();
    RS.toast('Rs. ' + RS.money(amt) + ' udhaar jama ho gaya', 'success');
    refreshAll();
  }

  function deleteCustomer() {
    var c = selectedId && RS.getCustomer(selectedId);
    if (!c) return;
    var bal = RS.balance(c.id);
    var msg = '"' + c.name + '" ka poora khata delete karein?\nSaari ledger entries hat jayengi.';
    if (bal > 0) msg += '\n\nWarning: iska Rs. ' + RS.money(bal) + ' baqaya abhi baqi hai!';
    if (!window.confirm(msg)) return;
    RS.deleteCustomer(c.id);
    selectedId = null;
    try { history.replaceState(null, '', 'khata.html'); } catch (e) { /* ignore */ }
    RS.toast('Khata delete ho gaya', 'success');
    refreshAll();
  }

  function printStatement() {
    var c = selectedId && RS.getCustomer(selectedId);
    if (!c) return;
    var s = RS.getSettings();
    var rows = rowsWithRunning(c.id), bal = RS.balance(c.id), dr = 0, cr = 0;
    var body = rows.map(function (r) {
      var e = r.e;
      dr += Number(e.debit) || 0;
      cr += Number(e.credit) || 0;
      return '<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd">' + RS.fmtDate(e.ts) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #ddd">' + RS.esc(describePlain(e)) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right">' + (e.debit > 0 ? RS.money(e.debit) : '-') + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right">' + (e.credit > 0 ? RS.money(e.credit) : '-') + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold">' + RS.money(r.run) + '</td></tr>';
    }).join('');

    $('statement-print').innerHTML =
      '<div style="text-align:center;margin-bottom:10px"><div style="font-size:20px;font-weight:bold;letter-spacing:1px">' + RS.esc(s.shopName) + '</div>' +
      '<div>' + RS.esc(s.address) + (s.phone ? ' | Tel: ' + RS.esc(s.phone) : '') + '</div></div>' +
      '<div style="text-align:center;font-size:15px;font-weight:bold;border-top:2px solid #000;border-bottom:2px solid #000;padding:4px 0;margin-bottom:10px">CUSTOMER KHATA STATEMENT</div>' +
      '<table style="width:100%;margin-bottom:10px"><tr><td><b>Customer:</b> ' + RS.esc(c.name) + '</td><td style="text-align:right"><b>Date:</b> ' + RS.fmtDate(Date.now()) + '</td></tr>' +
      '<tr><td><b>Phone:</b> ' + (RS.esc(c.phone) || '-') + '</td><td style="text-align:right"><b>Time:</b> ' + RS.fmtTime(Date.now()) + '</td></tr></table>' +
      '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#eee">' +
      '<th style="padding:5px 6px;text-align:left">Date</th><th style="padding:5px 6px;text-align:left">Details</th>' +
      '<th style="padding:5px 6px;text-align:right">Bill / Udhaar</th><th style="padding:5px 6px;text-align:right">Received</th><th style="padding:5px 6px;text-align:right">Balance</th></tr></thead>' +
      '<tbody>' + (body || '<tr><td colspan="5" style="padding:10px;text-align:center">No entries</td></tr>') + '</tbody>' +
      '<tfoot><tr style="font-weight:bold"><td colspan="2" style="padding:6px">Total</td><td style="padding:6px;text-align:right">' + RS.money(dr) + '</td><td style="padding:6px;text-align:right">' + RS.money(cr) + '</td><td style="padding:6px;text-align:right">' + RS.money(bal) + '</td></tr></tfoot></table>' +
      '<div style="margin-top:14px;text-align:right;font-size:15px;font-weight:bold">' + (bal < 0 ? 'Advance Balance' : 'Total Baqaya') + ': Rs. ' + RS.money(Math.abs(bal)) + '</div>' +
      '<div style="margin-top:30px;text-align:center;font-size:11px;color:#555">*** System Generated Statement ***</div>';

    var oldTitle = document.title;
    document.title = 'Khata - ' + c.name;
    var restore = function () { document.title = oldTitle; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    setTimeout(function () { window.print(); }, 60);
  }

  /* ---------- init ---------- */
  function init() {
    RS.initChrome(function () { /* settings only affect printouts */ });

    $('addCustomerForm').addEventListener('submit', addCustomer);
    $('payForm').addEventListener('submit', receivePayment);
    $('manualForm').addEventListener('submit', addManual);
    $('btnStatement').addEventListener('click', printStatement);
    $('btnDeleteCust').addEventListener('click', deleteCustomer);
    $('custSearch').addEventListener('input', function () {
      // Keep the quick search at the top and the customer-list search in sync.
      var quick = $('khataQuickSearch');
      if (quick && quick.value !== this.value) quick.value = this.value;
      renderCustomers();
    });
    $('khataQuickSearch').addEventListener('input', function () {
      $('custSearch').value = this.value;
      renderCustomers();
    });

    $('custList').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-id]');
      if (b) selectCustomer(b.dataset.id);
    });
    $('ledgerBody').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-delentry]');
      if (!b) return;
      if (!window.confirm('Ye entry delete karein? Balance dobara hisaab hoga.')) return;
      RS.deleteEntry(b.dataset.delentry);
      RS.toast('Entry hat gayi', 'success');
      refreshAll();
    });

    // billing page se aaye hon (khata.html?c=ID)
    var m = /[?&]c=([^&]+)/.exec(window.location.search);
    if (m) {
      var id = decodeURIComponent(m[1]);
      if (RS.getCustomer(id)) selectedId = id;
    }
    refreshAll();

    window.addEventListener('pageshow', refreshAll);
    window.addEventListener('focus', refreshAll);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
