/*
  owner.js - "RS Online Orders" (owner panel).
  Tabs: Orders, Collections & Products (add / edit / delete), Customers, Payment Settings.
  Collections aur products yahan se badalte hain aur turant customer shop par nazar aate hain.
*/
'use strict';
const TOKEN_KEY = 'rsOwnerTokenV1';
const $ = id => document.getElementById(id);

/* ---------- Small helpers ---------- */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  });
  kids.flat(Infinity).forEach(kid => {
    if (kid === null || kid === undefined || kid === false) return;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  });
  return el;
}
function money(value) { return 'Rs ' + Number(value).toLocaleString('en-US'); }
function fmtDate(iso) {
  const date = new Date(iso);
  return isNaN(date) ? '' : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
function makeId(prefix) {
  const clean = String(prefix || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'item';
  return `${clean}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(value) {
  try { if (value) localStorage.setItem(TOKEN_KEY, value); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

async function api(path, options) {
  const opts = options || {};
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(path, {
      method: opts.method || 'GET', headers, cache: 'no-store',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
  } catch { throw new Error('Could not reach the server. Please check your connection.'); }
  let data = {};
  try { data = await response.json(); } catch { /* ignore */ }
  if (response.status === 401 && path !== '/api/owner/login') {
    logout('Please login again.');
    throw new Error('Please login again.');
  }
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

/* ---------- Login / logout ---------- */
let pollTimer = null;
function logout(message) {
  setToken(null);
  clearInterval(pollTimer);
  closeModal();
  $('appView').hidden = true;
  $('loginView').hidden = false;
  $('ownerPassword').value = '';
  const error = $('loginError');
  error.textContent = message || '';
  error.hidden = !message;
}
function startApp() {
  $('loginView').hidden = true;
  $('appView').hidden = false;
  switchTab('orders');
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (!document.hidden) loadOrders(true); }, 20000);
}
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const error = $('loginError');
  error.hidden = true;
  const button = $('loginSubmit');
  button.disabled = true;
  try {
    const data = await api('/api/owner/login', { method: 'POST', body: { password: $('ownerPassword').value } });
    setToken(data.token);
    startApp();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally { button.disabled = false; }
});
$('logoutBtn').addEventListener('click', () => logout(''));

/* ---------- Tabs ---------- */
const POS_PAGES = { billing: '/owner/pos/index.html', khata: '/owner/pos/khata.html', inventory: '/owner/inventory/index.html' };
function loadPosTab(name) {
  const frame = $('frame-' + name);
  if (!frame.getAttribute('src')) frame.src = POS_PAGES[name];
  else {
    // dobara kholne par khata / bills ka taaza data dikhane ke liye
    try { frame.contentWindow.dispatchEvent(new Event('focus')); } catch { /* ignore */ }
  }
}
const loaders = {
  orders: () => loadOrders(false), catalog: loadCatalogTab, customers: loadCustomers, settings: loadSettings,
  billing: () => loadPosTab('billing'), khata: () => loadPosTab('khata'), inventory: () => loadPosTab('inventory')
};
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  ['orders', 'catalog', 'customers', 'settings', 'billing', 'khata', 'inventory'].forEach(id => { $('panel-' + id).hidden = id !== name; });
  $('appMain').classList.toggle('wide', name in POS_PAGES);
  loaders[name]();
}
$('tabs').addEventListener('click', event => {
  const tab = event.target.closest('.tab');
  if (tab) switchTab(tab.dataset.tab);
});

/* ---------- Modal ---------- */
function openModal(title, kicker, ...body) {
  closeModal();
  const backdrop = h('div', { class: 'modal-backdrop', onclick: event => { if (event.target === backdrop) closeModal(); } },
    h('section', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close', text: '×', onclick: closeModal }),
      kicker ? h('span', { class: 'modal-kicker', text: kicker }) : null,
      h('h2', { text: title }),
      ...body));
  $('modalRoot').append(backdrop);
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('modalRoot').replaceChildren();
  document.body.style.overflow = '';
}
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

/* =====================================================================
   ORDERS
   ===================================================================== */
const STATUS_LABEL = { new: 'New', confirmed: 'Confirmed', delivered: 'Delivered', cancelled: 'Cancelled' };
let orders = [];
let ordersSig = '';
let orderFilter = 'all';
let lastOrderNumber = null;

async function loadOrders(silent) {
  try {
    const data = await api('/api/orders');
    const list = data.orders || [];
    const maxNumber = list.reduce((max, order) => Math.max(max, order.number || 0), 0);
    if (lastOrderNumber !== null && maxNumber > lastOrderNumber) {
      const fresh = list.filter(order => order.number > lastOrderNumber);
      toast(`New order ${fresh[0].id}!`);
    }
    lastOrderNumber = maxNumber;
    const sig = JSON.stringify(list);
    if (sig !== ordersSig || !silent) {
      ordersSig = sig;
      orders = list;
      renderOrders();
    }
  } catch (error) { if (!silent) toast(error.message); }
}

async function updateOrder(id, patch, question) {
  if (question && !confirm(question)) return;
  try {
    const updated = await api('/api/orders/' + encodeURIComponent(id), { method: 'PATCH', body: patch });
    orders = orders.map(order => (order.id === id ? updated : order));
    ordersSig = JSON.stringify(orders);
    renderOrders();
    toast(`${id} updated.`);
  } catch (error) { toast(error.message); }
}

function printOrder(order) {
  const pay = order.payment || { label: 'Cash on Delivery', status: 'pending', txnId: '' };
  $('printArea').replaceChildren(
    h('h2', { text: 'Rustam Super Mart' }),
    h('p', { text: `Order ${order.id} · ${fmtDate(order.createdAt)}` }),
    h('p', { text: `${order.customer.name} · ${order.customer.phone}` }),
    h('p', { text: order.customer.location }),
    h('table', {},
      h('tr', {}, h('th', { text: 'Item' }), h('th', { text: 'Qty' }), h('th', { text: 'Total' })),
      order.items.map(item => h('tr', {}, h('td', { text: item.name }), h('td', { text: qtyText(item) }), h('td', { text: money(item.total) })))),
    h('p', { text: 'Total: ' + money(order.total) }),
    h('p', { text: `Payment: ${pay.label} (${pay.status === 'paid' ? 'paid' : 'not received yet'})${pay.txnId ? ' · TID ' + pay.txnId : ''}` }),
    order.note ? h('p', { text: 'Note: ' + order.note }) : null);
  window.print();
}
function qtyText(item) {
  const parts = [];
  if (item.cartons) parts.push(`${item.cartons} carton`);
  if (item.boxes) parts.push(`${item.boxes} box`);
  return parts.join(' + ');
}

function orderCard(order) {
  const pay = order.payment || { method: 'cod', label: 'Cash on Delivery', status: 'pending', txnId: '' };
  const actions = [];
  if (order.status === 'new') actions.push(h('button', { class: 'ghost-btn small good', type: 'button', text: 'Confirm', onclick: () => updateOrder(order.id, { status: 'confirmed' }) }));
  if (order.status === 'new' || order.status === 'confirmed') actions.push(h('button', { class: 'ghost-btn small', type: 'button', text: 'Mark Delivered', onclick: () => updateOrder(order.id, { status: 'delivered' }) }));
  if (order.status !== 'delivered' && order.status !== 'cancelled') actions.push(h('button', { class: 'ghost-btn small danger', type: 'button', text: 'Cancel', onclick: () => updateOrder(order.id, { status: 'cancelled' }, `Cancel order ${order.id}?`) }));
  actions.push(h('button', { class: 'ghost-btn small', type: 'button', text: pay.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid', onclick: () => updateOrder(order.id, { paymentStatus: pay.status === 'paid' ? 'pending' : 'paid' }) }));
  actions.push(h('button', { class: 'ghost-btn small', type: 'button', text: 'Print', onclick: () => printOrder(order) }));

  return h('article', { class: 'order-card status-' + order.status },
    h('div', { class: 'order-head' },
      h('strong', { text: order.id }),
      h('span', { class: 'pill ' + order.status, text: STATUS_LABEL[order.status] || order.status }),
      h('span', { class: 'muted', text: fmtDate(order.createdAt) })),
    h('div', { class: 'order-body' },
      h('div', { class: 'order-customer' },
        h('strong', { text: order.customer.name }),
        h('a', { href: 'tel:' + String(order.customer.phone).replace(/[^\d+]/g, ''), text: order.customer.phone }),
        h('span', { text: order.customer.location })),
      h('table', { class: 'items' },
        h('tr', {}, h('th', { text: 'Product' }), h('th', { text: 'Qty' }), h('th', { text: 'Total' })),
        order.items.map(item => h('tr', {}, h('td', { text: item.name }), h('td', { text: qtyText(item) }), h('td', { text: money(item.total) })))),
      h('div', { class: 'order-total' }, h('span', { text: 'Order total' }), h('span', { text: money(order.total) })),
      h('div', { class: 'order-pay' },
        h('strong', { text: 'Payment:' }), h('span', { text: pay.label }),
        pay.txnId ? h('span', { text: 'TID: ' + pay.txnId }) : null,
        h('span', { class: 'pill ' + (pay.status === 'paid' ? 'paid' : 'pending'), text: pay.status === 'paid' ? 'Paid' : 'Not received yet' })),
      order.note ? h('div', { class: 'order-note', text: 'Note: ' + order.note }) : null,
      h('div', { class: 'order-actions' }, actions)));
}

function renderOrders() {
  const counts = { all: orders.length };
  Object.keys(STATUS_LABEL).forEach(key => { counts[key] = orders.filter(order => order.status === key).length; });
  const badge = $('newBadge');
  badge.textContent = String(counts.new);
  badge.hidden = counts.new === 0;
  document.title = counts.new ? `(${counts.new}) RS Online Orders` : 'RS Online Orders | Rustam Super Mart';

  const shown = orderFilter === 'all' ? orders : orders.filter(order => order.status === orderFilter);
  const filters = ['all', 'new', 'confirmed', 'delivered', 'cancelled'].map(key =>
    h('button', {
      type: 'button', class: 'filter' + (orderFilter === key ? ' active' : ''),
      text: `${key === 'all' ? 'All' : STATUS_LABEL[key]} (${counts[key]})`,
      onclick: () => { orderFilter = key; renderOrders(); }
    }));
  $('panel-orders').replaceChildren(
    h('div', { class: 'panel-head' },
      h('div', {}, h('h2', { text: 'Customer Orders' }), h('p', { text: 'New orders appear here automatically (checked every 20 seconds).' })),
      h('div', { class: 'head-actions' }, h('button', { class: 'ghost-btn', type: 'button', text: '↻ Refresh', onclick: () => loadOrders(false) }))),
    h('div', { class: 'filters' }, filters),
    shown.length
      ? h('div', { class: 'order-list' }, shown.map(orderCard))
      : h('p', { class: 'empty', text: orders.length ? 'No orders in this list.' : 'No orders yet.' }));
}

/* =====================================================================
   COLLECTIONS & PRODUCTS (customer shop ka catalog)
   ===================================================================== */
let catalog = [];
let openCollectionId = null;

async function loadCatalogTab() {
  try {
    const data = await api('/api/catalog');
    catalog = data.collections || [];
    renderCatalog();
  } catch (error) { toast(error.message); }
}

async function saveCatalog(next, message) {
  const data = await api('/api/owner/catalog', { method: 'PUT', body: { collections: next } });
  catalog = data.collections || [];
  renderCatalog();
  if (message) toast(message);
}
async function trySave(next, message) {
  try { await saveCatalog(next, message); } catch (error) { toast(error.message); }
}

/* --- Picture picker (picture ko chhota karke bhejta hai) --- */
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;   // asal photo ki hadd (browser khud chhota kar deta hai)
const MAX_IMAGE_SIDE = 600;
const MAX_SENT_BYTES = 600 * 1024;          // server 800 KB tak leta hai
function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}
async function compressImage(file) {
  // createImageBitmap phone ki bari photos aur rotation behtar sambhalta hai; na chale to Image() use hota hai
  let source = null;
  try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { source = await loadImageElement(file); }
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error('bad image');
  let side = MAX_IMAGE_SIDE;
  let quality = 0.8;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, side / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    // base64 ka size asal bytes se ~33% zyada hota hai
    if (dataUrl.startsWith('data:image/jpeg') && dataUrl.length * 0.75 <= MAX_SENT_BYTES) {
      if (source.close) source.close();
      return dataUrl;
    }
    side = Math.round(side * 0.8);
    quality = Math.max(0.5, quality - 0.1);
  }
  if (source.close) source.close();
  throw new Error('too big');
}
function imagePicker(initial, onError) {
  let value = initial || '';
  let pending = null; // jab tak picture tayyar ho rahi hai
  const hint = h('small');
  const preview = h('img', { class: 'img-preview', alt: 'Preview' });
  const remove = h('button', { type: 'button', class: 'ghost-btn small', text: 'Remove picture', onclick: () => { value = ''; input.value = ''; refresh(); } });
  const input = h('input', {
    type: 'file', class: 'file-input', accept: 'image/*',
    onchange: () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const looksLikeImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name);
      if (!looksLikeImage) { input.value = ''; return onError('Please choose a valid image file.'); }
      if (file.size > MAX_IMAGE_BYTES) { input.value = ''; return onError('This photo is too big (over 30 MB). Please choose a smaller one.'); }
      hint.textContent = 'Preparing image...';
      pending = compressImage(file).then(result => { value = result; })
        .catch(() => {
          input.value = '';
          onError('Could not read this picture. Please use a JPG, PNG or WEBP photo.');
        })
        .finally(() => { pending = null; refresh(); });
    }
  });
  function refresh() {
    preview.hidden = !value;
    if (value) preview.src = value;
    remove.hidden = !value;
    hint.textContent = value ? 'Choose a new image to replace it' : 'PNG, JPG, WEBP (optional)';
  }
  refresh();
  const el = h('div', {},
    h('label', { class: 'upload-box' }, h('span', { class: 'upload-icon', text: '＋' }), h('strong', { text: 'Choose an image' }), hint, preview, input),
    h('div', { style: 'margin-top:6px' }, remove));
  // Save dabane se pehle picture ke tayyar hone ka intezar
  return { el, get: () => value, ready: () => pending || Promise.resolve() };
}
function field(label, input, required) {
  return h('label', { class: 'field' }, h('span', {}, label, required ? h('b', { text: ' *' }) : null), input);
}

/* --- Collection form --- */
function openCollectionForm(existing) {
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const fail = message => { error.textContent = message; error.hidden = false; };
  const picker = imagePicker(existing ? existing.image : '', fail);
  const name = h('input', { type: 'text', maxlength: '45', placeholder: 'e.g. Cold Drinks', value: existing ? existing.title : '' });
  const description = h('textarea', { maxlength: '180', placeholder: 'e.g. Refreshing drinks for every occasion.', text: existing ? existing.description : '' });
  const emoji = h('input', { type: 'text', maxlength: '16', placeholder: 'e.g. 🥤', value: existing ? existing.emoji : '' });
  const save = h('button', { class: 'black-btn', type: 'submit', text: existing ? 'Save Changes' : 'Save Collection' });

  const form = h('form', {
    novalidate: true,
    onsubmit: async event => {
      event.preventDefault();
      error.hidden = true;
      const title = name.value.trim();
      const desc = description.value.trim();
      if (!title || !desc) return fail('Please fill in the name and description.');
      save.disabled = true;
      await picker.ready();
      save.disabled = false;
      const next = structuredClone(catalog);
      const image = picker.get();
      const emojiText = emoji.value.trim() || (image ? '' : '🛒');
      if (existing) {
        const item = next.find(entry => entry.id === existing.id);
        if (!item) return fail('This collection no longer exists.');
        Object.assign(item, { title, description: desc, image, emoji: emojiText });
      } else {
        next.push({ id: makeId(title), title, description: desc, art: '', emoji: emojiText, image, products: [] });
      }
      save.disabled = true;
      try {
        await saveCatalog(next, existing ? `“${title}” updated.` : `“${title}” added to the shop.`);
        closeModal();
      } catch (err) { fail(err.message); }
      finally { save.disabled = false; }
    }
  },
    field('Collection name', name, true),
    field('Collection picture (optional)', picker.el),
    field('Emoji (shown if there is no picture)', emoji),
    field('Short description', description, true),
    error,
    h('div', { class: 'form-actions' }, h('button', { class: 'ghost-btn', type: 'button', text: 'Cancel', onclick: closeModal }), save));
  openModal(existing ? 'Edit Collection' : 'Add Collection', existing ? 'UPDATE YOUR SHOP' : 'GROW YOUR SHOP', form);
  setTimeout(() => name.focus(), 50);
}

function deleteCollection(collection) {
  const count = collection.products.length;
  const extra = count ? ` Its ${count} product(s) will be deleted too.` : '';
  if (!confirm(`Delete "${collection.title}" collection?${extra}`)) return;
  trySave(catalog.filter(entry => entry.id !== collection.id), `“${collection.title}” deleted.`);
}

/* --- Product form --- */
function numberInput(value, placeholder, mode, step) {
  return h('input', { type: 'number', min: '1', step: step || 'any', inputmode: mode, placeholder, value: value === undefined || value === '' ? null : value });
}
function openProductForm(collection, existing) {
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const fail = message => { error.textContent = message; error.hidden = false; };
  const picker = imagePicker(existing ? existing.image : '', fail);
  const name = h('input', { type: 'text', maxlength: '60', placeholder: 'e.g. Chocolate Cream Biscuits', value: existing ? existing.name : '' });
  const emoji = h('input', { type: 'text', maxlength: '8', placeholder: 'e.g. 🍪', value: existing ? existing.emoji : '' });
  const price = numberInput(existing ? existing.price : '', 'e.g. 480', 'decimal');
  const pieces = numberInput(existing ? existing.pieces : '', 'e.g. 12', 'numeric', '1');
  const cartonPrice = numberInput(existing ? existing.cartonPrice : '', 'e.g. 5600', 'decimal');
  const perCarton = numberInput(existing ? existing.boxesPerCarton : '', 'e.g. 12', 'numeric', '1');
  const stock = h('input', { type: 'checkbox', checked: existing ? existing.inStock !== false : true });
  const save = h('button', { class: 'black-btn', type: 'submit', text: existing ? 'Save Changes' : 'Save Product' });

  const form = h('form', {
    novalidate: true,
    onsubmit: async event => {
      event.preventDefault();
      error.hidden = true;
      save.disabled = true;
      await picker.ready();
      save.disabled = false;
      const data = {
        name: name.value.trim(),
        emoji: emoji.value.trim() || '🛒',
        image: picker.get(),
        price: Number(price.value),
        pieces: Number(pieces.value),
        cartonPrice: Number(cartonPrice.value),
        boxesPerCarton: Number(perCarton.value),
        inStock: stock.checked
      };
      if (!data.name) return fail('Please enter the product name.');
      if (!(data.price > 0)) return fail('Please enter a valid box price.');
      if (!Number.isInteger(data.pieces) || data.pieces < 1) return fail('Pieces in 1 box must be a whole number (1 or more).');
      if (!(data.cartonPrice > 0)) return fail('Please enter a valid carton price.');
      if (!Number.isInteger(data.boxesPerCarton) || data.boxesPerCarton < 1) return fail('Boxes in 1 carton must be a whole number (1 or more).');
      const next = structuredClone(catalog);
      const target = next.find(entry => entry.id === collection.id);
      if (!target) return fail('This collection no longer exists.');
      if (existing) {
        const product = target.products.find(item => item.id === existing.id);
        if (!product) return fail('This product no longer exists.');
        Object.assign(product, data);
      } else {
        target.products.push({ id: makeId(data.name), ...data });
      }
      save.disabled = true;
      try {
        await saveCatalog(next, existing ? `“${data.name}” updated.` : `“${data.name}” added.`);
        closeModal();
      } catch (err) { fail(err.message); }
      finally { save.disabled = false; }
    }
  },
    field('Product name', name, true),
    field('Product picture (optional)', picker.el),
    field('Emoji (shown if there is no picture)', emoji),
    h('div', { class: 'two-cols' }, field('Box price (Rs)', price, true), field('Pieces in 1 box', pieces, true)),
    h('div', { class: 'two-cols' }, field('Carton price (Rs)', cartonPrice, true), field('Boxes in 1 carton', perCarton, true)),
    h('label', { class: 'check-line' }, stock, 'Available in stock (untick to show "Sold Out")'),
    error,
    h('div', { class: 'form-actions' }, h('button', { class: 'ghost-btn', type: 'button', text: 'Cancel', onclick: closeModal }), save));
  openModal(existing ? 'Edit Product' : 'Add Product', existing ? 'UPDATE PRODUCT' : 'NEW PRODUCT', form);
  setTimeout(() => name.focus(), 50);
}

function deleteProduct(collection, product) {
  if (!confirm(`Delete "${product.name}"?`)) return;
  const next = structuredClone(catalog);
  const target = next.find(entry => entry.id === collection.id);
  if (!target) return;
  target.products = target.products.filter(item => item.id !== product.id);
  trySave(next, `“${product.name}” deleted.`);
}
function toggleStock(collection, product) {
  const next = structuredClone(catalog);
  const target = next.find(entry => entry.id === collection.id);
  const item = target && target.products.find(entry => entry.id === product.id);
  if (!item) return;
  item.inStock = item.inStock === false;
  trySave(next, item.inStock ? `“${product.name}” is back in stock.` : `“${product.name}” marked Sold Out.`);
}

/* --- Catalog views --- */
function artBox(item, className) {
  return h('div', { class: className }, item.image ? h('img', { src: item.image, alt: item.title || item.name || '' }) : (item.emoji || '🛒'));
}
function renderCatalog() {
  const collection = catalog.find(entry => entry.id === openCollectionId);
  if (openCollectionId && !collection) openCollectionId = null;
  $('panel-catalog').replaceChildren(collection ? productsView(collection) : collectionsView());
}
function collectionsView() {
  const cards = catalog.map(collection => h('article', { class: 'cat-card' },
    artBox(collection, 'cat-art'),
    h('div', { class: 'cat-body' },
      h('h3', { text: collection.title }),
      h('p', { text: collection.description }),
      h('p', { text: `${collection.products.length} product(s)` }),
      h('div', { class: 'cat-actions' },
        h('button', { class: 'ghost-btn small good', type: 'button', text: 'Products', onclick: () => { openCollectionId = collection.id; renderCatalog(); } }),
        h('button', { class: 'ghost-btn small', type: 'button', text: 'Edit', onclick: () => openCollectionForm(collection) }),
        h('button', { class: 'ghost-btn small danger', type: 'button', text: 'Delete', onclick: () => deleteCollection(collection) })))));
  return h('div', {},
    h('div', { class: 'panel-head' },
      h('div', {}, h('h2', { text: 'Collections' }), h('p', { text: 'These are the categories customers see on the shop home page. Changes go live immediately.' })),
      h('div', { class: 'head-actions' }, h('button', { class: 'black-btn', type: 'button', text: '＋ Add Collection', onclick: () => openCollectionForm(null) }))),
    cards.length ? h('div', { class: 'grid' }, cards) : h('p', { class: 'empty', text: 'No collections yet. Press “Add Collection”.' }));
}
function productsView(collection) {
  const rows = collection.products.map(product => h('div', { class: 'product-row' },
    artBox(product, 'thumb'),
    h('div', { class: 'product-info' },
      h('strong', { text: product.name }),
      h('small', { text: `Box: ${money(product.price)} · ${product.pieces} pieces per box` }),
      h('small', { text: `Carton: ${money(product.cartonPrice)} · ${product.boxesPerCarton} boxes per carton` }),
      h('span', { class: 'pill ' + (product.inStock === false ? 'cancelled' : 'delivered'), text: product.inStock === false ? 'Sold Out' : 'In stock' })),
    h('div', { class: 'row-actions' },
      h('button', { class: 'ghost-btn small', type: 'button', text: product.inStock === false ? 'Mark In Stock' : 'Mark Sold Out', onclick: () => toggleStock(collection, product) }),
      h('button', { class: 'ghost-btn small', type: 'button', text: 'Edit', onclick: () => openProductForm(collection, product) }),
      h('button', { class: 'ghost-btn small danger', type: 'button', text: 'Delete', onclick: () => deleteProduct(collection, product) }))));
  return h('div', {},
    h('button', { class: 'ghost-btn back-btn', type: 'button', text: '← All collections', onclick: () => { openCollectionId = null; renderCatalog(); } }),
    h('div', { class: 'panel-head' },
      h('div', {}, h('h2', { text: collection.title }), h('p', { text: `${collection.products.length} product(s) in this collection.` })),
      h('div', { class: 'head-actions' },
        h('button', { class: 'ghost-btn', type: 'button', text: 'Edit Collection', onclick: () => openCollectionForm(collection) }),
        h('button', { class: 'black-btn', type: 'button', text: '＋ Add Product', onclick: () => openProductForm(collection, null) }))),
    rows.length ? h('div', { class: 'product-list' }, rows) : h('p', { class: 'empty', text: 'No products yet. Press “Add Product”.' }));
}

/* =====================================================================
   CUSTOMERS
   ===================================================================== */
async function loadCustomers() {
  try {
    const data = await api('/api/owner/customers');
    renderCustomers(data.customers || []);
  } catch (error) { toast(error.message); }
}
async function resetPassword(customer) {
  const password = prompt(`New password for ${customer.name} (at least 6 characters):`);
  if (password === null) return;
  if (password.length < 6) return toast('Password must be at least 6 characters.');
  try {
    await api(`/api/owner/customers/${encodeURIComponent(customer.id)}/password`, { method: 'POST', body: { password } });
    toast('Password changed. Please tell the customer their new password.');
  } catch (error) { toast(error.message); }
}
function renderCustomers(list) {
  const rows = list.map(customer => h('tr', {},
    h('td', { text: customer.name }),
    h('td', {}, h('a', { href: 'tel:' + String(customer.phone).replace(/[^\d+]/g, ''), text: customer.phone })),
    h('td', { text: customer.location }),
    h('td', { text: fmtDate(customer.createdAt) }),
    h('td', { text: String(customer.orders) }),
    h('td', {}, h('button', { class: 'ghost-btn small', type: 'button', text: 'Reset password', onclick: () => resetPassword(customer) }))));
  $('panel-customers').replaceChildren(
    h('div', { class: 'panel-head' }, h('div', {}, h('h2', { text: 'Customers' }), h('p', { text: 'People who created an account on the shop. If someone forgets their password, set a new one here.' }))),
    list.length
      ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('tr', {}, ['Name', 'Phone', 'Location', 'Joined', 'Orders', ''].map(title => h('th', { text: title }))), rows))
      : h('p', { class: 'empty', text: 'No customers yet.' }));
}

/* =====================================================================
   PAYMENT SETTINGS
   ===================================================================== */
async function loadSettings() {
  try {
    const data = await api('/api/owner/settings');
    renderSettings(data.settings, data.defs);
  } catch (error) { toast(error.message); }
}
function renderSettings(settings, defs) {
  const inputs = {};
  const checks = {};
  const cards = defs.map(def => {
    const current = settings.payments[def.id] || {};
    checks[def.id] = h('input', { type: 'checkbox', checked: current.enabled === true });
    inputs[def.id] = {};
    const fields = def.fields.map(entry => {
      inputs[def.id][entry.key] = h('input', { type: 'text', maxlength: '60', value: current[entry.key] || '' });
      return field(entry.label, inputs[def.id][entry.key]);
    });
    return h('div', { class: 'pay-card' },
      h('h3', { text: def.label }),
      h('p', { text: def.id === 'cod' ? 'Customer pays cash to the delivery person.' : 'Customers see these details at checkout, send the money, and enter the payment Transaction ID (TID).' }),
      h('label', { class: 'switch' }, checks[def.id], 'Offer this payment method'),
      fields);
  });
  const note = h('input', { type: 'text', maxlength: '200', placeholder: 'e.g. Delivery within 1-2 days', value: settings.deliveryNote || '' });
  const save = h('button', { class: 'black-btn', type: 'submit', text: 'Save Settings' });
  const form = h('form', {
    class: 'settings-form',
    onsubmit: async event => {
      event.preventDefault();
      const payments = {};
      defs.forEach(def => {
        payments[def.id] = { enabled: checks[def.id].checked };
        def.fields.forEach(entry => { payments[def.id][entry.key] = inputs[def.id][entry.key].value.trim(); });
      });
      save.disabled = true;
      try {
        const data = await api('/api/owner/settings', { method: 'PUT', body: { payments, deliveryNote: note.value.trim() } });
        renderSettings(data.settings, data.defs);
        toast('Payment settings saved.');
      } catch (error) { toast(error.message); save.disabled = false; }
    }
  }, cards, h('div', { class: 'pay-card' }, field('Delivery note shown at checkout (optional)', note)), h('div', {}, save));
  $('panel-settings').replaceChildren(
    h('div', { class: 'panel-head' }, h('div', {}, h('h2', { text: 'Payment Settings' }), h('p', { text: 'Choose how customers can pay for their orders.' }))),
    form);
}

/* ---------- Start ---------- */
if (getToken()) startApp();
