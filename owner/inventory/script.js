const STORAGE_KEY = "rustamSuperMartInventoryV1";
const ACTIVITY_KEY = "rustamSuperMartActivityV1";
const $ = (id) => document.getElementById(id);
let products = load(STORAGE_KEY, []);
let activities = load(ACTIVITY_KEY, []);
let toastTimer;

function load(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; }
  catch { return fallback; }
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(activities));
}
function money(value) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 2 }).format(Number(value) || 0);
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function statusOf(p) {
  if (Number(p.qty) === 0) return ["Out of stock", "status-out"];
  if (Number(p.qty) <= Number(p.reorder)) return ["Low stock", "status-low"];
  return ["In stock", "status-in"];
}
function iconFor(category) {
  const c = String(category).toLowerCase();
  if (c.includes("beverage") || c.includes("drink")) return "◉";
  if (c.includes("biscuit") || c.includes("snack")) return "▧";
  if (c.includes("dairy")) return "◒";
  if (c.includes("personal")) return "✦";
  if (c.includes("house")) return "⌂";
  return "▤";
}
function recordActivity(type, product, detail) {
  activities.unshift({ id: Date.now() + Math.random(), type, name: product.name, detail, time: new Date().toISOString() });
  activities = activities.slice(0, 100);
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function renderStats() {
  $("statProducts").textContent = products.length;
  $("statUnits").textContent = products.reduce((sum, p) => sum + Number(p.qty || 0), 0).toLocaleString("en-PK");
  $("statValue").textContent = money(products.reduce((sum, p) => sum + Number(p.qty || 0) * Number(p.cost || 0), 0));
  $("statLow").textContent = products.filter(p => Number(p.qty) <= Number(p.reorder)).length;
  $("navProductCount").textContent = products.length;
  $("alertCount").textContent = products.filter(p => Number(p.qty) <= Number(p.reorder)).length;
}
function productRow(p, compact = false) {
  const [status, cls] = statusOf(p);
  return `<tr>
    <td><div class="product-cell"><div class="product-thumb">${iconFor(p.category)}</div><div><span class="product-name">${esc(p.name)}</span><span class="product-category">${esc(p.category)}</span></div></div></td>
    <td><span class="sku">${esc(p.sku)}</span></td>
    ${compact ? "" : `<td>${esc(p.category)}</td>`}
    <td><span class="quantity">${Number(p.qty).toLocaleString("en-PK")}</span></td>
    ${compact ? "" : `<td>${Number(p.reorder).toLocaleString("en-PK")}</td>`}
    <td>${money(p.cost)}</td>
    <td><span class="status-pill ${cls}">${status}</span></td>
    ${compact ? "" : `<td><div class="action-buttons"><button class="icon-btn" title="Adjust stock" data-action="adjust" data-id="${p.id}">±</button><button class="icon-btn" title="Edit product" data-action="edit" data-id="${p.id}">✎</button><button class="icon-btn delete" title="Delete product" data-action="delete" data-id="${p.id}">×</button></div></td>`}
  </tr>`;
}
function renderRecent() {
  const recent = [...products].sort((a,b) => b.updatedAt - a.updatedAt).slice(0,5);
  $("recentTable").innerHTML = recent.map(p => productRow(p, true)).join("");
  $("recentEmpty").classList.toggle("hidden", products.length > 0);
  $("recentTable").parentElement.parentElement.classList.toggle("hidden", products.length === 0);
}
function renderAlerts() {
  const alerts = products.filter(p => Number(p.qty) <= Number(p.reorder)).sort((a,b) => Number(a.qty)-Number(b.qty)).slice(0,5);
  $("alertList").innerHTML = alerts.map(p => `<div class="alert-item"><div class="alert-symbol">⚠</div><div class="alert-info"><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · Reorder at ${Number(p.reorder)}</small></div><span class="alert-qty">${Number(p.qty)} left</span></div>`).join("");
  $("alertsEmpty").classList.toggle("hidden", alerts.length > 0);
}
function renderActivities(targetId, emptyId, limit) {
  const list = limit ? activities.slice(0,limit) : activities;
  $(targetId).innerHTML = list.map(a => {
    const typeClass = a.type === "Deleted" ? "remove" : a.type === "Updated" || a.type === "Stock adjusted" ? "edit" : "";
    const symbol = a.type === "Deleted" ? "×" : a.type === "Updated" ? "✎" : a.type === "Stock adjusted" ? "±" : "+";
    const when = new Date(a.time);
    return `<div class="activity-row"><div class="activity-symbol ${typeClass}">${symbol}</div><div class="activity-copy"><strong>${esc(a.type)}: ${esc(a.name)}</strong><small>${esc(a.detail || "")}</small></div><span class="activity-time">${when.toLocaleDateString()} ${when.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></div>`;
  }).join("");
  $(emptyId).classList.toggle("hidden", list.length > 0);
}
function updateCategoryFilter() {
  const select = $("categoryFilter");
  const current = select.value;
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  select.innerHTML = `<option value="all">All categories</option>` + categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  select.value = categories.includes(current) ? current : "all";
}
function renderInventory() {
  updateCategoryFilter();
  const query = $("searchInput").value.trim().toLowerCase();
  const category = $("categoryFilter").value;
  const filter = $("stockFilter").value;
  const filtered = products.filter(p => {
    const matchesQuery = [p.name,p.sku,p.category].some(v => String(v).toLowerCase().includes(query));
    const matchesCategory = category === "all" || p.category === category;
    const [status] = statusOf(p);
    const matchesStock = filter === "all" || (filter === "healthy" && status === "In stock") || (filter === "low" && status === "Low stock") || (filter === "out" && status === "Out of stock");
    return matchesQuery && matchesCategory && matchesStock;
  }).sort((a,b) => a.name.localeCompare(b.name));
  $("inventoryTable").innerHTML = filtered.map(p => productRow(p, false)).join("");
  $("tableCount").textContent = filtered.length;
  $("inventoryEmpty").classList.toggle("hidden", filtered.length > 0);
  $("inventoryTable").parentElement.parentElement.classList.toggle("hidden", filtered.length === 0);
}
function renderAll() {
  renderStats(); renderRecent(); renderAlerts();
  renderActivities("dashboardActivity", "activityEmpty", 4);
  renderActivities("fullActivity", "fullActivityEmpty", 0);
  $("activityCount").textContent = `${activities.length} record${activities.length === 1 ? "" : "s"}`;
  renderInventory();
}
function openModal(product = null) {
  $("productForm").reset();
  $("formError").classList.add("hidden");
  $("productId").value = product?.id || "";
  $("modalTitle").textContent = product ? "Edit product" : "Add new product";
  $("productName").value = product?.name || "";
  $("productSku").value = product?.sku || "";
  $("productCategory").value = product?.category || "";
  $("productQty").value = product?.qty ?? "";
  $("productReorder").value = product?.reorder ?? 5;
  $("productCost").value = product?.cost ?? "";
  $("productPrice").value = product?.price ?? "";
  $("productSku").disabled = false;
  $("productModal").classList.remove("hidden");
  setTimeout(() => $("productName").focus(), 50);
}
function closeModal() { $("productModal").classList.add("hidden"); }
function saveProduct(event) {
  event.preventDefault();
  const id = $("productId").value;
  const product = {
    id: id || String(Date.now()),
    name: $("productName").value.trim(),
    sku: $("productSku").value.trim(),
    category: $("productCategory").value.trim(),
    qty: Number($("productQty").value),
    reorder: Number($("productReorder").value),
    cost: Number($("productCost").value),
    price: $("productPrice").value === "" ? 0 : Number($("productPrice").value),
    updatedAt: Date.now()
  };
  const error = $("formError");
  if (!product.name || !product.sku || !product.category) {
    error.textContent = "Please complete all required fields.";
    error.classList.remove("hidden"); return;
  }
  if ([product.qty,product.reorder,product.cost,product.price].some(v => !Number.isFinite(v) || v < 0)) {
    error.textContent = "Quantity, reorder level, and prices must be zero or greater.";
    error.classList.remove("hidden"); return;
  }
  if (products.some(p => p.sku.toLowerCase() === product.sku.toLowerCase() && p.id !== id)) {
    error.textContent = "That SKU already exists. Please use a unique SKU.";
    error.classList.remove("hidden"); return;
  }
  const old = products.find(p => p.id === id);
  if (old) {
    products = products.map(p => p.id === id ? product : p);
    recordActivity("Updated", product, `Product details saved · Stock: ${old.qty} → ${product.qty}`);
  } else {
    products.push(product);
    recordActivity("Added", product, `${product.qty} units added to inventory`);
  }
  persist(); renderAll(); closeModal(); showToast(old ? "Product updated successfully" : "Product added to inventory");
}
function editProduct(id) { const p = products.find(item => item.id === id); if (p) openModal(p); }
function deleteProduct(id) {
  const p = products.find(item => item.id === id);
  if (!p || !confirm(`Delete "${p.name}" from inventory? This cannot be undone.`)) return;
  products = products.filter(item => item.id !== id);
  recordActivity("Deleted", p, "Product removed from inventory");
  persist(); renderAll(); showToast("Product deleted");
}
function adjustStock(id) {
  const p = products.find(item => item.id === id);
  if (!p) return;
  const raw = prompt(`Adjust stock for ${p.name}.\nEnter a positive number to add or a negative number to remove. Current stock: ${p.qty}`, "5");
  if (raw === null) return;
  const delta = Number(raw);
  if (!Number.isInteger(delta) || delta === 0) { showToast("Enter a non-zero whole number"); return; }
  if (p.qty + delta < 0) { showToast("Stock cannot be less than zero"); return; }
  p.qty += delta; p.updatedAt = Date.now();
  recordActivity("Stock adjusted", p, `${delta > 0 ? "+" : ""}${delta} units · New stock: ${p.qty}`);
  persist(); renderAll(); showToast("Stock quantity updated");
}
function exportCSV() {
  if (!products.length) { showToast("There are no products to export"); return; }
  const rows = [["Product","SKU","Category","Quantity","Reorder Level","Unit Cost PKR","Selling Price PKR","Stock Status"], ...products.map(p => [p.name,p.sku,p.category,p.qty,p.reorder,p.cost,p.price,statusOf(p)[0]])];
  const csv = rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = "rustam-super-mart-inventory.csv"; link.click(); URL.revokeObjectURL(url);
  showToast("Inventory CSV exported");
}
function showView(view) {
  ["dashboard","inventory","transactions"].forEach(name => $(name+"View").classList.toggle("hidden", name !== view));
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  $("breadcrumbCurrent").textContent = view === "transactions" ? "Stock activity" : view[0].toUpperCase()+view.slice(1);
  $("sidebar").classList.remove("open");
  if (view === "inventory") renderInventory();
}
document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
["addProductTop","addProductInventory","emptyAdd"].forEach(id => $(id).addEventListener("click", () => openModal()));
$("closeModal").addEventListener("click", closeModal);
$("cancelModal").addEventListener("click", closeModal);
$("productModal").addEventListener("click", e => { if (e.target === $("productModal")) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
$("productForm").addEventListener("submit", saveProduct);
$("searchInput").addEventListener("input", renderInventory);
$("categoryFilter").addEventListener("change", renderInventory);
$("stockFilter").addEventListener("change", renderInventory);
$("exportBtn").addEventListener("click", exportCSV);
$("viewAllBtn").addEventListener("click", () => showView("inventory"));
$("activityViewAll").addEventListener("click", () => showView("transactions"));
$("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("clearActivityBtn").addEventListener("click", () => {
  if (!activities.length) { showToast("Activity history is already empty"); return; }
  if (confirm("Clear all stock activity history? Products will not be affected.")) {
    activities = []; persist(); renderAll(); showToast("Activity history cleared");
  }
});
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const {action,id} = btn.dataset;
  if (action === "edit") editProduct(id);
  if (action === "delete") deleteProduct(id);
  if (action === "adjust") adjustStock(id);
});
$("year").textContent = new Date().getFullYear();

// A small starter catalog makes the dashboard useful on first launch.
if (products.length === 0 && localStorage.getItem(STORAGE_KEY) === null) {
  const now = Date.now();
  products = [
    {id:"demo-1",name:"Milk 1 Litre",sku:"DAIRY-001",category:"Dairy",qty:18,reorder:8,cost:210,price:250,updatedAt:now-1000},
    {id:"demo-2",name:"Chocolate Biscuits",sku:"SNACK-014",category:"Biscuits & Snacks",qty:4,reorder:10,cost:45,price:60,updatedAt:now-2000},
    {id:"demo-3",name:"Mineral Water 1.5 L",sku:"BEV-022",category:"Beverages",qty:32,reorder:12,cost:70,price:100,updatedAt:now-3000},
    {id:"demo-4",name:"Dishwashing Liquid",sku:"HOME-008",category:"Household",qty:0,reorder:5,cost:180,price:230,updatedAt:now-4000},
    {id:"demo-5",name:"Tea 190 g",sku:"GROC-031",category:"Grocery",qty:15,reorder:6,cost:390,price:450,updatedAt:now-5000}
  ];
  recordActivity("Added", products[0], "18 units added to inventory");
  recordActivity("Added", products[1], "4 units added to inventory");
  persist();
}
renderAll();
