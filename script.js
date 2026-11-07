/*
  script.js - SHARED code, runs on EVERY page.
  Header (nav bar), footer, login / create account (phone + password), add-to-cart form,
  cart + checkout (payment method), toast and cart count sab yahin se banta hai,
  is liye saare pages par bilkul same rahta hai.
*/
const USER_KEY = 'rustamSuperMartAccountV2';
const CART_KEY = 'rustamSuperMartCartV1';
const ORDERS_KEY = 'rustamSuperMartOrdersV1';
const pageSearchPlaceholder = document.body.dataset.searchPlaceholder || 'Search...';

/* ---------- SHOP SETTINGS (owner yahan apni details likhe) ---------- */
// Orders server ke zariye "RS Online Orders" page (/owner) par jate hain.
// Social pages ke links (khali = abhi "coming soon" dikhega)
const SOCIAL_LINKS = { facebook: '', instagram: '', youtube: '' };
function socialIcon(key, label, symbol) {
  const url = SOCIAL_LINKS[key];
  return url
    ? `<a href="${url}" target="_blank" rel="noopener" aria-label="${label}">${symbol}</a>`
    : `<a href="#contact" data-soon="${label} page" aria-label="${label}">${symbol}</a>`;
}

/* ---------- Same header on every page ---------- */
const HEADER_HTML = `
<header class="site-header">
  <a class="brand" href="index.html#home" aria-label="Rustam Super Mart home">
    <span class="brand-mark">RS</span><span>Rustam Super Mart</span>
  </a>
  <label class="search-box"><span aria-hidden="true">⌕</span><input id="searchInput" type="search"
      placeholder="${pageSearchPlaceholder}" aria-label="Search"></label>
  <nav class="main-nav" id="mainNav">
    <a data-nav="home" href="index.html#home">Home</a><a data-nav="collections" href="index.html#collections">Collection</a><a
      data-nav="about" href="index.html#about">About</a><a data-nav="contact" href="#contact">Contact</a>
  </nav>
  <div class="header-actions"><button class="black-btn login-btn" type="button" id="loginBtn">Login</button><button
      class="cart-btn" type="button" id="cartBtn" aria-label="Shopping cart">🛒 <span id="cartCount">0</span></button></div>
  <button class="menu-toggle" id="menuToggle" aria-label="Toggle navigation" aria-expanded="false">☰</button>
</header>`;

/* ---------- Same footer on every page ---------- */
const FOOTER_HTML = `
<footer id="contact" class="site-footer">
  <div class="footer-main wrap">
    <div class="footer-brand"><span class="brand-mark">RS</span>
      <div><strong>Rustam Super Mart</strong>
        <p>Freshness <b>•</b> Quality <b>•</b> Convenience</p>
      </div>
    </div>
    <div class="footer-links"><strong>Quick Links</strong><a href="index.html#home">Home</a><a
        href="index.html#collections">Collection</a><a href="index.html#about">About</a><a href="#contact">Contact</a></div>
    <div class="footer-links"><strong>Customer Service</strong><a href="#contact" data-soon="FAQs">FAQs</a><a
        href="#contact" data-soon="Shipping info">Shipping</a><a href="#contact" data-soon="Returns info">Returns</a></div>
    <div class="footer-social"><strong>Follow Us</strong>
      <div class="social-icons">
        ${socialIcon('facebook', 'Facebook', 'f')}
        ${socialIcon('instagram', 'Instagram', '◎')}
        ${socialIcon('youtube', 'YouTube', '▶')}
      </div>
    </div>
  </div>
  <div class="copyright">© 2026 Rustam Super Mart. All Rights Reserved.</div>
</footer>`;

/* ---------- Login / Create account + Add to Cart form + Cart + toast ---------- */
const MODALS_HTML = `
<div class="modal-backdrop" id="loginModal" hidden>
  <section class="modal" role="dialog" aria-modal="true" aria-labelledby="loginTitle">
    <button class="modal-close" id="closeLogin" type="button" aria-label="Close login form">×</button>

    <div id="authBox">
      <span class="modal-kicker" id="loginKicker">WELCOME BACK</span>
      <h2 id="loginTitle">Customer Login</h2>
      <p class="modal-intro" id="loginIntro">Login with your phone number and password.</p>
      <div class="auth-tabs">
        <button class="auth-tab active" type="button" data-mode="login">Login</button>
        <button class="auth-tab" type="button" data-mode="register">Create Account</button>
      </div>
      <form id="loginForm" novalidate>
        <label class="reg-only" for="loginName">Full name <span>*</span></label>
        <input class="reg-only" id="loginName" type="text" placeholder="e.g. Ali Khan" maxlength="50" autocomplete="name">
        <label for="loginPhone">Phone number <span>*</span></label>
        <input id="loginPhone" type="tel" placeholder="e.g. 0300 1234567" maxlength="20" autocomplete="tel">
        <label class="reg-only" for="loginLocation">Location <span>*</span></label>
        <input class="reg-only" id="loginLocation" type="text" placeholder="City, area and full address" maxlength="120" autocomplete="street-address">
        <label for="loginPassword">Password <span>*</span></label>
        <input id="loginPassword" type="password" placeholder="Your password" maxlength="100" autocomplete="current-password">
        <label class="reg-only" for="loginPassword2">Confirm password <span>*</span></label>
        <input class="reg-only" id="loginPassword2" type="password" placeholder="Type the password again" maxlength="100" autocomplete="new-password">
        <p class="form-error" id="loginError" role="alert" hidden></p>
        <div class="form-actions">
          <button class="cancel-btn" type="button" id="cancelLogin">Cancel</button>
          <button class="black-btn save-btn" type="submit" id="loginSubmit">Login <span>→</span></button>
        </div>
      </form>
      <p class="storage-note" id="loginNote">New here? Press “Create Account”. Your password is never saved in this browser.</p>
    </div>

    <div id="accountBox" hidden>
      <span class="modal-kicker">MY ACCOUNT</span>
      <h2>Hi, <span id="accName"></span></h2>
      <div class="account-summary">
        <span id="accPhone"></span>
        <span id="accLocation"></span>
      </div>
      <div class="form-actions">
        <button class="cancel-btn" type="button" id="closeAccount">Close</button>
        <button class="black-btn save-btn" type="button" id="logoutBtn">Logout</button>
      </div>
    </div>
  </section>
</div>

<div class="modal-backdrop" id="cartModal" hidden>
  <section class="modal" role="dialog" aria-modal="true" aria-labelledby="cartTitle">
    <button class="modal-close" id="closeCart" type="button" aria-label="Close order form">×</button>
    <span class="modal-kicker">ADD TO CART</span>
    <h2 id="cartTitle">Product</h2>
    <div class="cart-info">
      <div><small>Box unit price</small><strong id="ciBoxPrice">-</strong></div>
      <div><small>Pieces in 1 box</small><strong id="ciPieces">-</strong></div>
      <div><small>Carton price</small><strong id="ciCartonPrice">-</strong></div>
      <div><small>Boxes in 1 carton</small><strong id="ciPerCarton">-</strong></div>
    </div>
    <form id="cartForm" novalidate>
      <div class="field-row">
        <div>
          <label for="orderCartons">Cartons to order</label>
          <input id="orderCartons" type="number" min="0" step="1" value="0" inputmode="numeric">
        </div>
        <div>
          <label for="orderBoxes">Boxes to order</label>
          <input id="orderBoxes" type="number" min="0" step="1" value="1" inputmode="numeric">
        </div>
      </div>
      <div class="total-lines">
        <div><span>Boxes total</span><span id="orderBoxesTotal">Rs 0</span></div>
        <div><span>Cartons total</span><span id="orderCartonsTotal">Rs 0</span></div>
      </div>
      <div class="total-box"><span>Total price</span><strong id="orderTotal">Rs 0</strong></div>
      <p class="storage-note">Total = (box unit price × boxes) + (carton price × cartons)</p>
      <p class="form-error" id="cartError" role="alert" hidden></p>
      <div class="form-actions">
        <button class="cancel-btn" type="button" id="cancelCart">Cancel</button>
        <button class="black-btn save-btn" type="submit">Add to Cart <span>🛒</span></button>
      </div>
    </form>
  </section>
</div>

<div class="modal-backdrop" id="cartViewModal" hidden>
  <section class="modal cart-view" role="dialog" aria-modal="true" aria-labelledby="cartViewTitle">
    <button class="modal-close" id="closeCartView" type="button" aria-label="Close cart">×</button>
    <span class="modal-kicker">YOUR ORDERS</span>
    <h2 id="cartViewTitle">Shopping Cart</h2>
    <div class="cart-list" id="cartList"></div>
    <p class="empty-state" id="cartEmpty" hidden>Your cart is empty. Add some products first.</p>

    <div class="checkout" id="checkout">
      <h3>Delivery &amp; Payment</h3>
      <label for="checkoutAddress">Delivery address <span>*</span></label>
      <input id="checkoutAddress" type="text" maxlength="120" placeholder="City, area and full address" autocomplete="street-address">
      <p class="field-label">Payment method <span>*</span></p>
      <div class="pay-options" id="payOptions"><p class="storage-note">Loading payment methods...</p></div>
      <div class="pay-info" id="payInfo" hidden></div>
      <div id="txnBox" hidden>
        <label for="checkoutTxn">Transaction ID (TID) <span>*</span></label>
        <input id="checkoutTxn" type="text" maxlength="40" placeholder="e.g. 1234567890" autocomplete="off">
      </div>
      <label for="checkoutNote">Note for the shop (optional)</label>
      <input id="checkoutNote" type="text" maxlength="200" placeholder="e.g. Please call before delivery">
      <p class="storage-note" id="deliveryNote" hidden></p>
    </div>
    <p class="form-error" id="checkoutError" role="alert" hidden></p>

    <div class="cart-footer" id="cartFooter">
      <div class="cart-grand"><small>Total of all orders</small><strong id="cartGrandTotal">Rs 0</strong></div>
      <button class="black-btn save-btn" type="button" id="buyNowBtn">Buy Now <span>→</span></button>
    </div>
  </section>
</div>

<div class="toast" id="toast" role="status" aria-live="polite"></div>`;

function injectLayout(placeholderId, html) {
  const el = document.getElementById(placeholderId);
  if (el) el.outerHTML = html;
}
injectLayout('siteHeader', HEADER_HTML);
injectLayout('siteFooter', FOOTER_HTML);
injectLayout('siteModals', MODALS_HTML);

/* ---------- Helpers ---------- */
const toast = document.getElementById('toast');
let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}
function money(value) {
  return 'Rs ' + Number(value).toLocaleString('en-US');
}
function readStorage(key, fallback) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    return data === null || data === undefined ? fallback : data;
  } catch { return fallback; }
}
function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
/* Server se baat karne ka ek hi tareeqa (login token khud lag jata hai) */
async function apiRequest(url, options) {
  const opts = options || {};
  const headers = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const user = getUser();
  if (opts.auth && user) headers.Authorization = 'Bearer ' + user.token;
  let response;
  try {
    response = await fetch(url, {
      method: opts.method || 'GET', headers, cache: 'no-store',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
  } catch {
    const error = new Error('Could not reach the shop. Please check your internet and try again.');
    error.network = true;
    throw error;
  }
  let data = {};
  try { data = await response.json(); } catch { /* ignore */ }
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

/* ---------- Header: mobile menu ---------- */
const nav = document.getElementById('mainNav');
const menuToggle = document.getElementById('menuToggle');
menuToggle.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});
nav.addEventListener('click', event => {
  if (event.target.closest('a')) {
    nav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
});

/* ---------- Header: active nav link ---------- */
const navLinks = [...nav.querySelectorAll('a')];
const navSections = ['home', 'collections', 'about', 'contact']
  .map(id => document.getElementById(id))
  .filter(Boolean);
function updateActiveNav() {
  // Pages other than home (e.g. collection page) set data-active-nav on <body>
  let current = document.body.dataset.activeNav;
  if (!current) {
    current = 'home';
    navSections.forEach(section => {
      if (section.getBoundingClientRect().top <= 140) current = section.id;
    });
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atBottom) current = 'contact';
  }
  navLinks.forEach(link => link.classList.toggle('active', link.dataset.nav === current));
}
window.addEventListener('scroll', updateActiveNav, { passive: true });
window.addEventListener('resize', updateActiveNav);
updateActiveNav();

/* ---------- Footer links that are not ready yet ---------- */
document.querySelectorAll('[data-soon]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    showToast(`${link.dataset.soon} will be added soon.`);
  });
});

/* ---------- Login / Create account (phone + password) ---------- */
const loginBtn = document.getElementById('loginBtn');
const loginModal = document.getElementById('loginModal');
const authBox = document.getElementById('authBox');
const accountBox = document.getElementById('accountBox');
const loginForm = document.getElementById('loginForm');
const loginName = document.getElementById('loginName');
const loginPhone = document.getElementById('loginPhone');
const loginLocation = document.getElementById('loginLocation');
const loginPassword = document.getElementById('loginPassword');
const loginPassword2 = document.getElementById('loginPassword2');
const loginError = document.getElementById('loginError');
const loginSubmit = document.getElementById('loginSubmit');
const loginTitle = document.getElementById('loginTitle');
const loginKicker = document.getElementById('loginKicker');
const loginIntro = document.getElementById('loginIntro');
const logoutBtn = document.getElementById('logoutBtn');
let authMode = 'login';
let afterLogin = null; // login ke baad kya karna hai (jaise cart kholna)

function getUser() {
  const user = readStorage(USER_KEY, null);
  return user && user.token ? user : null;
}
function refreshLoginButton() {
  const user = getUser();
  loginBtn.textContent = user ? `Hi, ${String(user.name).split(' ')[0]}` : 'Login';
}
function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));
  loginForm.querySelectorAll('.reg-only').forEach(el => { el.hidden = !registering; });
  loginTitle.textContent = registering ? 'Create Account' : 'Customer Login';
  loginKicker.textContent = registering ? 'JOIN US' : 'WELCOME BACK';
  loginIntro.textContent = registering
    ? 'Enter your details and choose a password (at least 6 characters).'
    : 'Login with your phone number and password.';
  loginSubmit.firstChild.textContent = registering ? 'Create Account ' : 'Login ';
  loginPassword.autocomplete = registering ? 'new-password' : 'current-password';
  loginError.hidden = true;
}
function openLogin() {
  const user = getUser();
  loginForm.reset();
  loginError.hidden = true;
  if (user) {
    document.getElementById('accName').textContent = user.name || '';
    document.getElementById('accPhone').textContent = `Phone: ${user.phone || ''}`;
    document.getElementById('accLocation').textContent = `Location: ${user.location || ''}`;
    authBox.hidden = true;
    accountBox.hidden = false;
  } else {
    authBox.hidden = false;
    accountBox.hidden = true;
    setAuthMode('login');
  }
  loginModal.hidden = false;
  document.body.style.overflow = 'hidden';
  if (!user) setTimeout(() => loginPhone.focus(), 50);
}
function closeLogin() {
  if (loginModal.hidden) return;
  loginModal.hidden = true;
  document.body.style.overflow = '';
  loginForm.reset();
  afterLogin = null;
}
function setLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = false;
}
loginBtn.addEventListener('click', openLogin);
document.getElementById('closeLogin').addEventListener('click', closeLogin);
document.getElementById('cancelLogin').addEventListener('click', closeLogin);
document.getElementById('closeAccount').addEventListener('click', closeLogin);
loginModal.addEventListener('click', event => { if (event.target === loginModal) closeLogin(); });
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
});
function logoutUser() {
  try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
  refreshLoginButton();
}
logoutBtn.addEventListener('click', () => {
  logoutUser();
  closeLogin();
  showToast('You are logged out.');
});
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.hidden = true;
  const phone = loginPhone.value.trim();
  const password = loginPassword.value;
  const phoneDigits = phone.replace(/\D/g, '');
  let url;
  let payload;

  if (authMode === 'register') {
    const name = loginName.value.trim();
    const location = loginLocation.value.trim();
    if (!name || !phone || !location || !password) return setLoginError('Please fill in all fields.');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) return setLoginError('Please enter a valid phone number.');
    if (location.length < 3) return setLoginError('Please enter your location.');
    if (password.length < 6) return setLoginError('Password must be at least 6 characters.');
    if (password !== loginPassword2.value) return setLoginError('The two passwords do not match.');
    url = '/api/customer/register';
    payload = { name, phone, location, password };
  } else {
    if (!phone || !password) return setLoginError('Please enter your phone number and password.');
    url = '/api/customer/login';
    payload = { phone, password };
  }

  loginSubmit.disabled = true;
  try {
    const data = await apiRequest(url, { method: 'POST', body: payload });
    const customer = data.customer || {};
    if (!writeStorage(USER_KEY, { token: data.token, name: customer.name, phone: customer.phone, location: customer.location })) {
      return setLoginError('Could not save your login in this browser.');
    }
    const next = afterLogin;
    afterLogin = null;
    closeLogin();
    refreshLoginButton();
    showToast(`Welcome, ${String(customer.name || '').split(' ')[0]}!`);
    if (next) next();
  } catch (error) {
    setLoginError(error.message);
  } finally {
    loginSubmit.disabled = false;
  }
});
refreshLoginButton();

/* ---------- Cart ---------- */
const cartBtn = document.getElementById('cartBtn');
const cartCount = document.getElementById('cartCount');
const cartModal = document.getElementById('cartModal');
const cartForm = document.getElementById('cartForm');
const cartTitle = document.getElementById('cartTitle');
const orderCartons = document.getElementById('orderCartons');
const orderBoxes = document.getElementById('orderBoxes');
const orderTotal = document.getElementById('orderTotal');
const cartError = document.getElementById('cartError');
let currentProduct = null;

function getCart() {
  const items = readStorage(CART_KEY, []);
  return Array.isArray(items) ? items : [];
}
function refreshCartCount() {
  cartCount.textContent = String(getCart().length);
}
function wholeNumber(input) {
  const value = Math.floor(Number(input.value));
  return Number.isFinite(value) && value > 0 ? Math.min(value, 100000) : 0;
}
function updateOrderTotal() {
  // Total = (box unit price x boxes) + (carton price x cartons)
  const boxes = wholeNumber(orderBoxes);
  const cartons = wholeNumber(orderCartons);
  const boxesTotal = currentProduct ? currentProduct.price * boxes : 0;
  const cartonsTotal = currentProduct ? currentProduct.cartonPrice * cartons : 0;
  document.getElementById('orderBoxesTotal').textContent = money(boxesTotal);
  document.getElementById('orderCartonsTotal').textContent = money(cartonsTotal);
  orderTotal.textContent = money(boxesTotal + cartonsTotal);
}
function openCart(product) {
  if (!product) return;
  if (product.inStock === false) return showToast('Sorry, this product is sold out right now.');
  currentProduct = product;
  cartTitle.textContent = product.name;
  document.getElementById('ciBoxPrice').textContent = money(product.price);
  document.getElementById('ciPieces').textContent = `${product.pieces} pieces`;
  document.getElementById('ciCartonPrice').textContent = money(product.cartonPrice);
  document.getElementById('ciPerCarton').textContent = `${product.boxesPerCarton} boxes`;
  orderCartons.value = 0;
  orderBoxes.value = 1;
  cartError.hidden = true;
  updateOrderTotal();
  cartModal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => orderBoxes.focus(), 50);
}
function closeCart() {
  if (cartModal.hidden) return;
  cartModal.hidden = true;
  document.body.style.overflow = '';
  currentProduct = null;
}
orderBoxes.addEventListener('input', updateOrderTotal);
orderCartons.addEventListener('input', updateOrderTotal);
document.getElementById('closeCart').addEventListener('click', closeCart);
document.getElementById('cancelCart').addEventListener('click', closeCart);
cartModal.addEventListener('click', event => { if (event.target === cartModal) closeCart(); });
cartForm.addEventListener('submit', event => {
  event.preventDefault();
  cartError.hidden = true;
  const cartons = wholeNumber(orderCartons);
  const boxes = wholeNumber(orderBoxes);
  if (cartons === 0 && boxes === 0) {
    cartError.textContent = 'Please enter how many cartons or boxes you want to order.';
    cartError.hidden = false;
    return;
  }
  const items = getCart();
  const existing = items.find(item => item.id === currentProduct.id);
  if (existing) {
    // Same product dobara add ho to alag row nahi, pehli row mein jama ho jaye
    existing.cartons = Math.min((Number(existing.cartons) || 0) + cartons, 100000);
    existing.boxes = Math.min((Number(existing.boxes) || 0) + boxes, 100000);
    existing.name = currentProduct.name;
    existing.boxPrice = currentProduct.price;
    existing.cartonPrice = currentProduct.cartonPrice;
  } else {
    items.push({
      id: currentProduct.id,
      name: currentProduct.name,
      cartons,
      boxes,
      boxPrice: currentProduct.price,
      cartonPrice: currentProduct.cartonPrice
    });
  }
  if (!writeStorage(CART_KEY, items)) {
    cartError.textContent = 'Could not save your cart in this browser.';
    cartError.hidden = false;
    return;
  }
  const name = currentProduct.name;
  closeCart();
  refreshCartCount();
  showToast(`${name} added to cart.`);
});
refreshCartCount();

/* ---------- Cart view: all orders + grand total + payment + Buy Now ---------- */
const cartViewModal = document.getElementById('cartViewModal');
const cartList = document.getElementById('cartList');
const cartEmpty = document.getElementById('cartEmpty');
const cartFooter = document.getElementById('cartFooter');
const cartGrandTotal = document.getElementById('cartGrandTotal');
const checkout = document.getElementById('checkout');
const checkoutAddress = document.getElementById('checkoutAddress');
const checkoutTxn = document.getElementById('checkoutTxn');
const checkoutNote = document.getElementById('checkoutNote');
const checkoutError = document.getElementById('checkoutError');
const payOptions = document.getElementById('payOptions');
const payInfo = document.getElementById('payInfo');
const txnBox = document.getElementById('txnBox');
const deliveryNote = document.getElementById('deliveryNote');

let paySettings = { payments: [], deliveryNote: '' };
let selectedPay = '';

// Total of one order = (box price x boxes) + (carton price x cartons)
function itemTotals(item) {
  const boxesTotal = (Number(item.boxPrice) || 0) * (Number(item.boxes) || 0);
  const cartonsTotal = (Number(item.cartonPrice) || 0) * (Number(item.cartons) || 0);
  return { boxesTotal, cartonsTotal, total: boxesTotal + cartonsTotal };
}
function cartGrand(items) {
  return items.reduce((sum, item) => sum + itemTotals(item).total, 0);
}
function makeCartRow(item, index) {
  const { boxesTotal, cartonsTotal, total } = itemTotals(item);
  const row = document.createElement('div');
  row.className = 'cart-row';

  const info = document.createElement('div');
  info.className = 'cart-row-info';
  const title = document.createElement('strong');
  title.textContent = item.name;
  info.appendChild(title);
  if (item.cartons > 0) {
    const line = document.createElement('small');
    line.textContent = `${item.cartons} carton(s) × ${money(item.cartonPrice || 0)} = ${money(cartonsTotal)}`;
    info.appendChild(line);
  }
  if (item.boxes > 0) {
    const line = document.createElement('small');
    line.textContent = `${item.boxes} box(es) × ${money(item.boxPrice || 0)} = ${money(boxesTotal)}`;
    info.appendChild(line);
  }

  const price = document.createElement('span');
  price.className = 'cart-row-total';
  price.textContent = money(total);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'cart-remove';
  remove.dataset.index = String(index);
  remove.setAttribute('aria-label', `Remove ${item.name} from cart`);
  remove.title = 'Remove';
  remove.textContent = '×';

  row.append(info, price, remove);
  return row;
}

/* Payment methods (owner panel ki Payment Settings se aate hain) */
function renderPayOptions() {
  const methods = paySettings.payments;
  if (!methods.some(method => method.id === selectedPay)) selectedPay = methods.length ? methods[0].id : '';
  payOptions.replaceChildren(...methods.map(method => {
    const label = document.createElement('label');
    label.className = 'pay-option' + (method.id === selectedPay ? ' selected' : '');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'payMethod';
    input.value = method.id;
    input.checked = method.id === selectedPay;
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = method.label;
    const hint = document.createElement('small');
    hint.textContent = method.needsTxn ? 'Pay online, then enter the transaction ID' : 'Pay in cash when your order arrives';
    text.append(title, hint);
    label.append(input, text);
    return label;
  }));
  updatePayInfo();
}
function updatePayInfo() {
  const method = paySettings.payments.find(entry => entry.id === selectedPay);
  payInfo.replaceChildren();
  deliveryNote.hidden = !paySettings.deliveryNote;
  deliveryNote.textContent = paySettings.deliveryNote || '';
  if (!method) {
    payInfo.hidden = true;
    txnBox.hidden = true;
    return;
  }
  const lines = [];
  if (method.needsTxn) {
    lines.push(`Send ${money(cartGrand(getCart()))} to this ${method.label} account:`);
    method.lines.forEach(line => lines.push(line));
    lines.push('Then type the Transaction ID (TID) below. We confirm your order after we receive the payment.');
  } else {
    lines.push('Pay cash to the delivery person when your order arrives.');
  }
  lines.forEach((line, index) => {
    const p = document.createElement('p');
    if (method.needsTxn && index > 0 && index <= method.lines.length) {
      const strong = document.createElement('strong');
      strong.textContent = line;
      p.appendChild(strong);
    } else {
      p.textContent = line;
    }
    payInfo.appendChild(p);
  });
  payInfo.hidden = false;
  txnBox.hidden = !method.needsTxn;
}
payOptions.addEventListener('change', event => {
  if (event.target.name !== 'payMethod') return;
  selectedPay = event.target.value;
  checkoutError.hidden = true;
  renderPayOptions();
});
async function loadPaySettings() {
  try {
    const data = await apiRequest('/api/settings');
    paySettings = {
      payments: Array.isArray(data.payments) ? data.payments : [],
      deliveryNote: data.deliveryNote || ''
    };
  } catch {
    paySettings = { payments: [], deliveryNote: '' };
  }
  if (!paySettings.payments.length) {
    paySettings.payments = [{ id: 'cod', label: 'Cash on Delivery', needsTxn: false, lines: [] }];
  }
  renderPayOptions();
}
function showCheckoutError(message) {
  checkoutError.textContent = message;
  checkoutError.hidden = false;
}

function renderCartView() {
  const items = getCart();
  cartList.replaceChildren(...items.map(makeCartRow));
  cartEmpty.hidden = items.length > 0;
  cartFooter.hidden = items.length === 0;
  checkout.hidden = items.length === 0;
  cartGrandTotal.textContent = money(cartGrand(items));
  updatePayInfo();
}
function openCartView() {
  const user = getUser();
  checkoutAddress.value = user ? (user.location || '') : '';
  checkoutTxn.value = '';
  checkoutNote.value = '';
  checkoutError.hidden = true;
  renderCartView();
  cartViewModal.hidden = false;
  document.body.style.overflow = 'hidden';
  loadPaySettings();
}
function closeCartView() {
  if (cartViewModal.hidden) return;
  cartViewModal.hidden = true;
  document.body.style.overflow = '';
}
cartBtn.addEventListener('click', openCartView);
document.getElementById('closeCartView').addEventListener('click', closeCartView);
cartViewModal.addEventListener('click', event => { if (event.target === cartViewModal) closeCartView(); });
cartList.addEventListener('click', event => {
  const remove = event.target.closest('.cart-remove');
  if (!remove) return;
  const items = getCart();
  items.splice(Number(remove.dataset.index), 1);
  writeStorage(CART_KEY, items);
  refreshCartCount();
  renderCartView();
});

/* Buy Now se pehle cart ko taaza catalog se milao (price badli ho ya product sold out ho gaya ho) */
function syncCartWithCatalog() {
  const next = [];
  let changed = false;
  getCart().forEach(item => {
    const product = findProduct(item.id);
    if (!product || product.inStock === false) { changed = true; return; }
    if (Number(item.boxPrice) !== Number(product.price) || Number(item.cartonPrice) !== Number(product.cartonPrice) || item.name !== product.name) {
      changed = true;
      next.push({ ...item, name: product.name, boxPrice: product.price, cartonPrice: product.cartonPrice });
      return;
    }
    next.push(item);
  });
  if (changed) {
    writeStorage(CART_KEY, next);
    refreshCartCount();
  }
  return changed;
}

let orderSending = false;
document.getElementById('buyNowBtn').addEventListener('click', async () => {
  if (orderSending) return;
  const items = getCart();
  if (!items.length) return;
  checkoutError.hidden = true;

  const user = getUser();
  if (!user) {
    // Order ke liye account (phone + password) zaroori hai
    closeCartView();
    afterLogin = openCartView;
    openLogin();
    setLoginError('Please login or create an account first. Your cart is saved.');
    return;
  }

  const address = checkoutAddress.value.trim();
  if (address.length < 3) return showCheckoutError('Please enter your delivery address.');
  const method = paySettings.payments.find(entry => entry.id === selectedPay);
  if (!method) return showCheckoutError('Please choose a payment method.');
  const txnId = checkoutTxn.value.replace(/\s+/g, '');
  if (method.needsTxn && !/^[A-Za-z0-9-]{6,40}$/.test(txnId)) {
    return showCheckoutError('Please enter the transaction ID (TID) of your payment.');
  }

  const buyBtn = document.getElementById('buyNowBtn');
  orderSending = true;
  buyBtn.disabled = true;
  buyBtn.firstChild.textContent = 'Sending... ';
  try {
    let fresh = false;
    try { await loadCatalog(true); fresh = true; } catch { /* server khud bhi check karta hai */ }
    if (fresh && syncCartWithCatalog()) {
      renderCartView();
      showCheckoutError('Some items in your cart changed (price or stock). Please check your cart and press Buy Now again.');
      return;
    }

    const data = await apiRequest('/api/orders', {
      method: 'POST',
      auth: true,
      body: {
        location: address,
        note: checkoutNote.value.trim(),
        paymentMethod: method.id,
        txnId: method.needsTxn ? txnId : '',
        items: getCart().map(item => ({
          id: item.id, cartons: item.cartons, boxes: item.boxes,
          boxPrice: item.boxPrice, cartonPrice: item.cartonPrice
        }))
      }
    });

    // Order shop tak pohanch gaya: ab cart khali karo (customer ka record yahan bhi rakho)
    const orders = readStorage(ORDERS_KEY, []);
    orders.push({ date: new Date().toISOString(), orderId: data.id, total: data.total });
    writeStorage(ORDERS_KEY, orders.slice(-50));
    writeStorage(CART_KEY, []);
    refreshCartCount();
    closeCartView();
    showToast(`Order ${data.id} placed! Total ${money(data.total)}. Thank you, ${String(user.name).split(' ')[0]}.`);
  } catch (error) {
    if (error.status === 401) {
      // Login ki muddat poori ho gayi
      logoutUser();
      closeCartView();
      afterLogin = openCartView;
      openLogin();
      setLoginError('Your login has ended. Please login again. Your cart is saved.');
    } else {
      // Cart wahi rehta hai, customer dobara koshish kar sakta hai
      showCheckoutError(error.message);
    }
  } finally {
    orderSending = false;
    buyBtn.disabled = false;
    buyBtn.firstChild.textContent = 'Buy Now ';
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeLogin(); closeCart(); closeCartView(); }
});
