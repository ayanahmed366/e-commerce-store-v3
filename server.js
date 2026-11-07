/*
  server.js - Rustam Super Mart ka chhota server (koi bahar ka package nahi chahiye, sirf Node 18+).

  Yeh kaam karta hai:
  1. Customer website ki files dikhata hai (index.html, collection.html, ...).
  2. Collections / products ko storage/catalog.json mein rakhta hai (owner panel se add-edit-delete hote hain).
  3. Customer accounts (phone + password) aur customer ke orders (storage/orders.json).
  4. Payment methods (Cash on Delivery, Easypaisa, JazzCash, Bank Transfer) ki settings.
  5. "RS Online Orders" owner website (/owner), jahan password se login ke baad sab kuch sambhalte hain.

  Chalane ka tareeqa:   OWNER_PASSWORD="apna-lamba-password" node server.js
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const util = require('util');
const scrypt = util.promisify(crypto.scrypt);

require('dotenv').config()


const PORT = Number(process.env.PORT) || 3000;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // hosting proxy ke peeche ho to 1 karein
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'storage');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');

if (OWNER_PASSWORD.length < 8) {
  console.error('\nOWNER_PASSWORD set nahi hai ya 8 se chhota hai.');
  console.error('Aise chalayen:  OWNER_PASSWORD="apna-lamba-password" node server.js\n');
  process.exit(1);
}

class UserError extends Error {
  constructor(message, status) { super(message); this.status = status || 400; }
}

/* ---------- Files jo bahar dikhayi ja sakti hain (baqi koi file kabhi nahi) ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png'
};
const IMG_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const PUBLIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/collection.html': 'collection.html',
  '/style.css': 'style.css',
  '/script.js': 'script.js',
  '/home.js': 'home.js',
  '/collection.js': 'collection.js',
  '/products.js': 'products.js',
  '/owner': 'owner/index.html',
  '/owner/': 'owner/index.html',
  '/owner/index.html': 'owner/index.html',
  '/owner/owner.js': 'owner/owner.js',
  '/owner/owner.css': 'owner/owner.css',
  // Billing + Khata (POS) - owner panel ke tabs mein dikhte hain
  '/owner/pos': 'owner/pos/index.html',
  '/owner/pos/': 'owner/pos/index.html',
  '/owner/pos/index.html': 'owner/pos/index.html',
  '/owner/pos/khata.html': 'owner/pos/khata.html',
  '/owner/pos/common.js': 'owner/pos/common.js',
  '/owner/pos/script.js': 'owner/pos/script.js',
  '/owner/pos/khata.js': 'owner/pos/khata.js',
  '/owner/pos/styles.css': 'owner/pos/styles.css',
  '/owner/pos/logo.png': 'owner/pos/logo.png',
  // Inventory - owner panel ka tab
  '/owner/inventory': 'owner/inventory/index.html',
  '/owner/inventory/': 'owner/inventory/index.html',
  '/owner/inventory/index.html': 'owner/inventory/index.html',
  '/owner/inventory/style.css': 'owner/inventory/style.css',
  '/owner/inventory/script.js': 'owner/inventory/script.js',
  '/owner/inventory/logo.png': 'owner/inventory/logo.png'
};

/* ---------- Storage helpers ---------- */
fs.mkdirSync(UPLOAD_DIR, { recursive: true }); // DATA_DIR bhi ban jata hai
function readJsonFile(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJsonFile(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file); // beech mein band ho jaye to purani file kharab nahi hoti
}

/* ---------- Text helpers ---------- */
function cleanText(value, max) {
  return String(value === undefined || value === null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function cleanEmoji(value, max) {
  return Array.from(cleanText(value, 100)).slice(0, max).join('');
}
function cleanId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new UserError('Invalid id.');
  return id;
}
function wholeNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 100000 ? number : -1;
}
function phoneKey(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) digits = '0' + digits.slice(2);
  if (digits.length === 10 && digits[0] === '3') digits = '0' + digits;
  return digits;
}

/* ---------- Images (owner panel se aati hain, files ki tarah storage/uploads mein rakhi jati hain) ---------- */
const UPLOAD_NAME = /^[a-f0-9]{24}\.(?:jpg|png|webp|gif)$/;
const IMG_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
function removeUpload(name) {
  if (UPLOAD_NAME.test(name)) { try { fs.unlinkSync(path.join(UPLOAD_DIR, name)); } catch { /* ignore */ } }
}
function storeImage(value, created) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new UserError('Invalid image.');
  const existing = /^\/uploads\/([a-f0-9]{24}\.(?:jpg|png|webp|gif))$/.exec(value);
  if (existing) return fs.existsSync(path.join(UPLOAD_DIR, existing[1])) ? value : '';
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new UserError('Invalid image.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > 800 * 1024) {
    throw new UserError('Image is too large. Please choose a smaller picture.');
  }
  const name = crypto.randomBytes(12).toString('hex') + '.' + IMG_EXT[match[1]];
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  created.push(name);
  return '/uploads/' + name;
}
function cleanupUploads() {
  const used = new Set();
  catalog.forEach(collection => {
    if (collection.image) used.add(collection.image.slice(9));
    collection.products.forEach(product => { if (product.image) used.add(product.image.slice(9)); });
  });
  let files = [];
  try { files = fs.readdirSync(UPLOAD_DIR); } catch { /* ignore */ }
  files.forEach(name => { if (!used.has(name)) removeUpload(name); });
}

/* ---------- Catalog (collections + products) ---------- */
function sanitizeProduct(raw, ids, created) {
  if (!raw || typeof raw !== 'object') throw new UserError('Invalid product.');
  const id = cleanId(raw.id);
  if (ids.has(id)) throw new UserError('Duplicate product id.');
  ids.add(id);
  const name = cleanText(raw.name, 60);
  if (!name) throw new UserError('Product name is required.');
  const price = Math.round(Number(raw.price) * 100) / 100;
  const cartonPrice = Math.round(Number(raw.cartonPrice) * 100) / 100;
  const pieces = Number(raw.pieces);
  const boxesPerCarton = Number(raw.boxesPerCarton);
  if (!(price > 0 && price <= 10000000)) throw new UserError(`"${name}": please enter a valid box price.`);
  if (!(cartonPrice > 0 && cartonPrice <= 100000000)) throw new UserError(`"${name}": please enter a valid carton price.`);
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > 100000) throw new UserError(`"${name}": pieces in 1 box must be a whole number.`);
  if (!Number.isInteger(boxesPerCarton) || boxesPerCarton < 1 || boxesPerCarton > 100000) throw new UserError(`"${name}": boxes in 1 carton must be a whole number.`);
  return {
    id, name,
    emoji: cleanEmoji(raw.emoji, 8) || '🛒',
    image: storeImage(raw.image, created),
    price, pieces, boxesPerCarton, cartonPrice,
    inStock: raw.inStock !== false
  };
}
function sanitizeCatalog(input, created) {
  if (!Array.isArray(input) || input.length > 100) throw new UserError('Invalid collections list.');
  const collectionIds = new Set();
  const productIds = new Set();
  return input.map(raw => {
    if (!raw || typeof raw !== 'object') throw new UserError('Invalid collection.');
    const id = cleanId(raw.id);
    if (collectionIds.has(id)) throw new UserError('Duplicate collection id.');
    collectionIds.add(id);
    const title = cleanText(raw.title, 45);
    if (!title) throw new UserError('Collection name is required.');
    const products = Array.isArray(raw.products) ? raw.products : [];
    if (products.length > 500) throw new UserError('Too many products in one collection.');
    const art = String(raw.art || '');
    return {
      id, title,
      description: cleanText(raw.description, 180),
      art: /^[a-z-]{0,30}$/.test(art) ? art : '',
      emoji: cleanEmoji(raw.emoji, 16),
      image: storeImage(raw.image, created),
      products: products.map(product => sanitizeProduct(product, productIds, created))
    };
  });
}

let catalog = readJsonFile(CATALOG_FILE, null);
if (!Array.isArray(catalog)) {
  // Pehli dafa: data.js se shuru ke collections / products le lo
  catalog = [];
  try {
    const code = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8') + '\n;DEFAULT_COLLECTIONS;';
    const seed = vm.runInNewContext(code, {}, { timeout: 1000 });
    catalog = sanitizeCatalog(seed, []);
    writeJsonFile(CATALOG_FILE, catalog);
  } catch (error) {
    console.error('data.js se products nahi parhe ja sake:', error.message);
    catalog = [];
  }
}

/* ---------- Payment settings ---------- */
const PAYMENT_DEFS = {
  cod: { label: 'Cash on Delivery', fields: [], labels: {} },
  easypaisa: { label: 'Easypaisa', fields: ['accountTitle', 'number'], labels: { accountTitle: 'Account title', number: 'Mobile number' } },
  jazzcash: { label: 'JazzCash', fields: ['accountTitle', 'number'], labels: { accountTitle: 'Account title', number: 'Mobile number' } },
  bank: { label: 'Bank Transfer', fields: ['bankName', 'accountTitle', 'number'], labels: { bankName: 'Bank', accountTitle: 'Account title', number: 'Account no. / IBAN' } }
};
function defaultSettings() {
  const payments = {};
  Object.keys(PAYMENT_DEFS).forEach(id => {
    payments[id] = { enabled: id === 'cod' };
    PAYMENT_DEFS[id].fields.forEach(field => { payments[id][field] = ''; });
  });
  return { payments, deliveryNote: '' };
}
function sanitizeSettings(input) {
  const out = defaultSettings();
  const source = (input && input.payments) || {};
  let anyEnabled = false;
  Object.keys(PAYMENT_DEFS).forEach(id => {
    const def = PAYMENT_DEFS[id];
    const src = source[id] || {};
    out.payments[id].enabled = src.enabled === true;
    def.fields.forEach(field => { out.payments[id][field] = cleanText(src[field], 60); });
    if (id !== 'cod' && out.payments[id].enabled && !out.payments[id].number) {
      throw new UserError(`${def.label}: please enter the ${def.labels.number.toLowerCase()} before turning it on.`);
    }
    if (out.payments[id].enabled) anyEnabled = true;
  });
  if (!anyEnabled) throw new UserError('Please keep at least one payment method turned on.');
  out.deliveryNote = cleanText(input && input.deliveryNote, 200);
  return out;
}
let settings;
try { settings = sanitizeSettings(readJsonFile(SETTINGS_FILE, null)); } catch { settings = defaultSettings(); }
function publicSettings() {
  return {
    payments: Object.keys(PAYMENT_DEFS).filter(id => settings.payments[id].enabled).map(id => {
      const def = PAYMENT_DEFS[id];
      return {
        id, label: def.label, needsTxn: id !== 'cod',
        lines: def.fields.filter(field => settings.payments[id][field]).map(field => `${def.labels[field]}: ${settings.payments[id][field]}`)
      };
    }),
    deliveryNote: settings.deliveryNote
  };
}
function settingsDefs() {
  return Object.keys(PAYMENT_DEFS).map(id => ({
    id, label: PAYMENT_DEFS[id].label,
    fields: PAYMENT_DEFS[id].fields.map(key => ({ key, label: PAYMENT_DEFS[id].labels[key] }))
  }));
}

/* ---------- Secret (customer login tokens ke liye) ---------- */
let SECRET = '';
try { SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { /* pehli dafa */ }
if (SECRET.length < 32) {
  SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 });
}

/* ---------- Customers ---------- */
let customers = readJsonFile(CUSTOMERS_FILE, []);
if (!Array.isArray(customers)) customers = [];
function saveCustomers() { writeJsonFile(CUSTOMERS_FILE, customers); }
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
async function passwordHash(password, salt) {
  return (await scrypt(String(password), salt, 64)).toString('hex');
}
function hashesMatch(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function publicCustomer(customer) {
  return { id: customer.id, name: customer.name, phone: customer.phone, location: customer.location };
}
function makeCustomerToken(customer) {
  const payload = Buffer.from(JSON.stringify({
    id: customer.id, exp: Date.now() + 30 * 86400000, v: customer.hash.slice(0, 12)
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function customerFromReq(req) {
  const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(req.headers.authorization || ''));
  if (!match) return null;
  const expected = Buffer.from(crypto.createHmac('sha256', SECRET).update(match[1]).digest('base64url'));
  const given = Buffer.from(match[2]);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')); } catch { return null; }
  if (!data || !(data.exp > Date.now())) return null;
  const customer = customers.find(entry => entry.id === data.id);
  // Password badalne par purane tokens khud band ho jate hain
  return customer && customer.hash.slice(0, 12) === data.v ? customer : null;
}

/* ---------- Orders storage ---------- */
let orders = readJsonFile(ORDERS_FILE, []);
if (!Array.isArray(orders)) orders = [];
function saveOrders() { writeJsonFile(ORDERS_FILE, orders); }
function nextOrderNumber() {
  return orders.reduce((max, order) => Math.max(max, Number(order.number) || 0), 0) + 1;
}

/* ---------- Helpers ---------- */
function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readJson(req, res, limit) {
  const max = limit || 100 * 1024;
  return new Promise(resolve => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > max) {
        sendJson(res, 413, { error: 'Request too large.' });
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { sendJson(res, 400, { error: 'Invalid request.' }); resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}
function sha(text) { return crypto.createHash('sha256').update(String(text)).digest(); }
function passwordMatches(input) {
  return crypto.timingSafeEqual(sha(input), sha(OWNER_PASSWORD));
}

/* Rate limits: ek IP se kitni koshishein (memory mein, restart par reset) */
const hits = new Map();
function tooMany(key, limit, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter(time => now - time < windowMs);
  if (list.length >= limit) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  return false;
}

/* ---------- Owner login (token memory mein, server restart par dobara login) ---------- */
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  hits.forEach((list, key) => { if (!list.some(time => now - time < 3600000)) hits.delete(key); });
  sessions.forEach((expires, token) => { if (expires < now) sessions.delete(token); });
}, 600000).unref();
function isOwner(req) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(String(req.headers.authorization || ''));
  if (!match) return false;
  const expires = sessions.get(match[1]);
  if (!expires || expires < Date.now()) { sessions.delete(match[1]); return false; }
  return true;
}

/* ---------- Customer API ---------- */
async function handleRegister(req, res) {
  if (tooMany('register:' + clientIp(req), 10, 3600000)) {
    return sendJson(res, 429, { error: 'Too many new accounts from this device. Please try again later.' });
  }
  const body = await readJson(req, res);
  if (!body) return;
  const name = cleanText(body.name, 50);
  const phone = cleanText(body.phone, 20);
  const location = cleanText(body.location, 120);
  const password = typeof body.password === 'string' ? body.password : '';
  const key = phoneKey(phone);
  if (!name) return sendJson(res, 400, { error: 'Please enter your name.' });
  if (key.length < 10 || key.length > 15) return sendJson(res, 400, { error: 'Please enter a valid phone number.' });
  if (location.length < 3) return sendJson(res, 400, { error: 'Please enter your location.' });
  if (password.length < 6 || password.length > 100) return sendJson(res, 400, { error: 'Password must be at least 6 characters.' });
  if (customers.some(entry => entry.phoneKey === key)) {
    return sendJson(res, 409, { error: 'An account with this phone number already exists. Please login.' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await passwordHash(password, salt);
  if (customers.some(entry => entry.phoneKey === key)) { // hashing ke dauran koi aur bana gaya ho
    return sendJson(res, 409, { error: 'An account with this phone number already exists. Please login.' });
  }
  const customer = {
    id: 'c-' + crypto.randomBytes(6).toString('hex'),
    name, phone, phoneKey: key, location, salt, hash,
    createdAt: new Date().toISOString()
  };
  customers.push(customer);
  try { saveCustomers(); }
  catch {
    customers.pop();
    return sendJson(res, 500, { error: 'Could not create your account. Please try again.' });
  }
  sendJson(res, 201, { token: makeCustomerToken(customer), customer: publicCustomer(customer) });
}

async function handleCustomerLogin(req, res) {
  if (tooMany('clogin:' + clientIp(req), 15, 600000)) {
    return sendJson(res, 429, { error: 'Too many tries. Please wait 10 minutes.' });
  }
  const body = await readJson(req, res);
  if (!body) return;
  const key = phoneKey(body.phone);
  const password = typeof body.password === 'string' ? body.password : '';
  if (key && tooMany('clogin-phone:' + key, 10, 600000)) {
    return sendJson(res, 429, { error: 'Too many tries for this phone number. Please wait 10 minutes.' });
  }
  const customer = customers.find(entry => entry.phoneKey === key);
  const hash = await passwordHash(password.slice(0, 100), customer ? customer.salt : DUMMY_SALT);
  if (!customer || !hashesMatch(hash, customer.hash)) {
    return sendJson(res, 401, { error: 'Wrong phone number or password.' });
  }
  sendJson(res, 200, { token: makeCustomerToken(customer), customer: publicCustomer(customer) });
}

async function handleOrderCreate(req, res) {
  const customer = customerFromReq(req);
  if (!customer) return sendJson(res, 401, { error: 'Please login to place an order.' });
  if (tooMany('order:' + clientIp(req), 10, 3600000)) {
    return sendJson(res, 429, { error: 'Too many orders from this device. Please try again later.' });
  }
  const body = await readJson(req, res);
  if (!body) return;

  const typedLocation = cleanText(body.location, 120);
  const location = typedLocation.length >= 3 ? typedLocation : customer.location;
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
    return sendJson(res, 400, { error: 'Your cart is empty or too large.' });
  }

  // Payment method
  const methodId = String(body.paymentMethod || '');
  const def = PAYMENT_DEFS[methodId];
  if (!def || !settings.payments[methodId].enabled) {
    return sendJson(res, 400, { error: 'Please choose a payment method.' });
  }
  let txnId = '';
  if (methodId !== 'cod') {
    txnId = cleanText(body.txnId, 40).replace(/\s+/g, '');
    if (!/^[A-Za-z0-9-]{6,40}$/.test(txnId)) {
      return sendJson(res, 400, { error: 'Please enter the transaction ID (TID) of your payment.' });
    }
  }

  const products = new Map();
  catalog.forEach(collection => collection.products.forEach(product => products.set(product.id, product)));

  const merged = new Map();
  for (const raw of body.items) {
    const product = products.get(String(raw && raw.id));
    const cartons = wholeNumber(raw && raw.cartons);
    const boxes = wholeNumber(raw && raw.boxes);
    if (!product || cartons < 0 || boxes < 0 || cartons + boxes === 0) {
      return sendJson(res, 400, { error: 'One of the products in your cart is no longer available. Please remove it and try again.' });
    }
    if (product.inStock === false) {
      return sendJson(res, 409, { error: `Sorry, "${product.name}" is sold out right now. Please remove it from your cart.` });
    }
    if (Number(raw.boxPrice) !== Number(product.price) || Number(raw.cartonPrice) !== Number(product.cartonPrice)) {
      return sendJson(res, 409, { error: `The price of "${product.name}" has changed. Please remove it from your cart and add it again.` });
    }
    const entry = merged.get(product.id) || { id: product.id, name: product.name, cartons: 0, boxes: 0, boxPrice: product.price, cartonPrice: product.cartonPrice };
    entry.cartons += cartons;
    entry.boxes += boxes;
    merged.set(product.id, entry);
  }

  // Total hamesha server khud banata hai (customer ka bheja hua total kabhi nahi mana jata)
  const items = [...merged.values()].map(item => ({
    ...item,
    total: Math.round((item.boxPrice * item.boxes + item.cartonPrice * item.cartons) * 100) / 100
  }));
  const number = nextOrderNumber();
  const order = {
    id: 'RS-' + String(number).padStart(4, '0'),
    number,
    createdAt: new Date().toISOString(),
    status: 'new',
    customer: { id: customer.id, name: customer.name, phone: customer.phone, location },
    items,
    total: Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100,
    payment: { method: methodId, label: def.label, txnId, status: 'pending' },
    note: cleanText(body.note, 200)
  };
  orders.push(order);
  try { saveOrders(); }
  catch {
    orders.pop();
    return sendJson(res, 500, { error: 'Could not save your order. Please try again.' });
  }
  sendJson(res, 201, { id: order.id, total: order.total, paymentMethod: methodId });
}

/* ---------- Owner API ---------- */
async function handleLogin(req, res) {
  if (tooMany('login:' + clientIp(req), 8, 600000)) {
    return sendJson(res, 429, { error: 'Too many tries. Please wait 10 minutes.' });
  }
  const body = await readJson(req, res);
  if (!body) return;
  if (typeof body.password !== 'string' || !passwordMatches(body.password)) {
    return sendJson(res, 401, { error: 'Wrong password.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 12 * 3600000);
  sendJson(res, 200, { token });
}

const STATUSES = ['new', 'confirmed', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid'];
async function handleStatus(req, res, id) {
  const body = await readJson(req, res);
  if (!body) return;
  const hasStatus = body.status !== undefined;
  const hasPayment = body.paymentStatus !== undefined;
  if (!hasStatus && !hasPayment) return sendJson(res, 400, { error: 'Nothing to update.' });
  if (hasStatus && !STATUSES.includes(body.status)) return sendJson(res, 400, { error: 'Invalid status.' });
  if (hasPayment && !PAYMENT_STATUSES.includes(body.paymentStatus)) return sendJson(res, 400, { error: 'Invalid payment status.' });
  const order = orders.find(entry => entry.id === id);
  if (!order) return sendJson(res, 404, { error: 'Order not found.' });
  const before = JSON.stringify(order);
  if (hasStatus) order.status = body.status;
  if (hasPayment) order.payment = { ...(order.payment || { method: 'cod', label: 'Cash on Delivery', txnId: '' }), status: body.paymentStatus };
  order.updatedAt = new Date().toISOString();
  try { saveOrders(); }
  catch {
    const restored = JSON.parse(before);
    Object.keys(order).forEach(key => delete order[key]);
    Object.assign(order, restored);
    return sendJson(res, 500, { error: 'Could not save.' });
  }
  sendJson(res, 200, order);
}

async function handleCatalogSave(req, res) {
  const body = await readJson(req, res, 4 * 1024 * 1024);
  if (!body) return;
  const created = [];
  let next;
  try { next = sanitizeCatalog(body.collections, created); }
  catch (error) { created.forEach(removeUpload); throw error; }
  const previous = catalog;
  catalog = next;
  try { writeJsonFile(CATALOG_FILE, catalog); }
  catch {
    catalog = previous;
    created.forEach(removeUpload);
    return sendJson(res, 500, { error: 'Could not save. Please try again.' });
  }
  cleanupUploads();
  sendJson(res, 200, { collections: catalog });
}

async function handleSettingsSave(req, res) {
  const body = await readJson(req, res);
  if (!body) return;
  const next = sanitizeSettings(body);
  const previous = settings;
  settings = next;
  try { writeJsonFile(SETTINGS_FILE, settings); }
  catch {
    settings = previous;
    return sendJson(res, 500, { error: 'Could not save. Please try again.' });
  }
  sendJson(res, 200, { settings, defs: settingsDefs() });
}

async function handleCustomerPassword(req, res, id) {
  const body = await readJson(req, res);
  if (!body) return;
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 6 || password.length > 100) return sendJson(res, 400, { error: 'Password must be at least 6 characters.' });
  const customer = customers.find(entry => entry.id === id);
  if (!customer) return sendJson(res, 404, { error: 'Customer not found.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await passwordHash(password, salt);
  const before = { salt: customer.salt, hash: customer.hash };
  customer.salt = salt;
  customer.hash = hash;
  try { saveCustomers(); }
  catch {
    Object.assign(customer, before);
    return sendJson(res, 500, { error: 'Could not save.' });
  }
  sendJson(res, 200, { ok: true });
}

async function handleApi(req, res, pathname) {
  const method = req.method;
  // Public
  if (method === 'GET' && pathname === '/api/catalog') return sendJson(res, 200, { collections: catalog });
  if (method === 'GET' && pathname === '/api/settings') return sendJson(res, 200, publicSettings());
  if (method === 'POST' && pathname === '/api/customer/register') return handleRegister(req, res);
  if (method === 'POST' && pathname === '/api/customer/login') return handleCustomerLogin(req, res);
  if (method === 'GET' && pathname === '/api/customer/me') {
    const customer = customerFromReq(req);
    if (!customer) return sendJson(res, 401, { error: 'Please login.' });
    return sendJson(res, 200, { customer: publicCustomer(customer) });
  }
  if (method === 'POST' && pathname === '/api/orders') return handleOrderCreate(req, res);
  if (method === 'POST' && pathname === '/api/owner/login') return handleLogin(req, res);

  // Owner only
  if (!isOwner(req)) return sendJson(res, 401, { error: 'Please login.' });
  if (method === 'GET' && pathname === '/api/orders') return sendJson(res, 200, { orders: [...orders].reverse() });
  const orderMatch = /^\/api\/orders\/(RS-\d{4,})$/.exec(pathname);
  if (method === 'PATCH' && orderMatch) return handleStatus(req, res, orderMatch[1]);
  if (method === 'PUT' && pathname === '/api/owner/catalog') return handleCatalogSave(req, res);
  if (method === 'GET' && pathname === '/api/owner/settings') return sendJson(res, 200, { settings, defs: settingsDefs() });
  if (method === 'PUT' && pathname === '/api/owner/settings') return handleSettingsSave(req, res);
  if (method === 'GET' && pathname === '/api/owner/customers') {
    const counts = new Map();
    orders.forEach(order => {
      const id = order.customer && order.customer.id;
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return sendJson(res, 200, {
      customers: customers.map(entry => ({
        id: entry.id, name: entry.name, phone: entry.phone, location: entry.location,
        createdAt: entry.createdAt, orders: counts.get(entry.id) || 0
      })).reverse()
    });
  }
  const passwordMatch = /^\/api\/owner\/customers\/(c-[a-f0-9]+)\/password$/.exec(pathname);
  if (method === 'POST' && passwordMatch) return handleCustomerPassword(req, res, passwordMatch[1]);
  sendJson(res, 404, { error: 'Not found.' });
}

/* ---------- Server ---------- */
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { res.writeHead(400); return res.end('Bad request'); }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (pathname === '/owner/pos' || pathname.startsWith('/owner/pos/') ||
      pathname === '/owner/inventory' || pathname.startsWith('/owner/inventory/')) {
    // Billing / Khata / Inventory pages: Tailwind, icons aur fonts CDN se aate hain, aur yeh owner panel ke andar (iframe) khulte hain
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; " +
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
      "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; " +
      "img-src 'self' data: blob:; frame-ancestors 'self'");
  } else {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  }

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(error => {
      if (res.headersSent) return;
      if (error instanceof UserError) sendJson(res, error.status, { error: error.message });
      else sendJson(res, 500, { error: 'Something went wrong.' });
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  // Owner ki upload ki hui pictures
  const upload = /^\/uploads\/([a-f0-9]{24}\.(jpg|png|webp|gif))$/.exec(pathname);
  if (upload) {
    return fs.readFile(path.join(UPLOAD_DIR, upload[1]), (error, content) => {
      if (error) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
      res.writeHead(200, {
        'Content-Type': IMG_MIME[upload[2]],
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    });
  }

  const relative = PUBLIC_FILES[pathname];
  if (!relative) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  fs.readFile(path.join(ROOT, relative), (error, content) => {
    if (error) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    const noCache = relative.startsWith('owner/');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(relative)] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-store' : 'no-cache'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
});

server.listen(PORT, () => {
  console.log(`Rustam Super Mart chal raha hai:  http://localhost:${PORT}`);
  console.log(`RS Online Orders (owner):          http://localhost:${PORT}/owner`);
});
