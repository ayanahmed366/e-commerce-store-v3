/*
  products.js - Shop ka catalog (collections + products).
  Yeh server se aata hai (/api/catalog). Owner panel mein jo bhi badla jaye, customers ko wohi nazar aata hai.
*/
let catalogCache = null;

async function loadCatalog(force) {
  if (catalogCache && !force) return catalogCache;
  const response = await fetch('/api/catalog', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load products.');
  const data = await response.json();
  catalogCache = Array.isArray(data.collections) ? data.collections : [];
  return catalogCache;
}

function getCatalog() {
  return catalogCache || [];
}

function findCollection(id) {
  return getCatalog().find(collection => collection.id === id) || null;
}

function findProduct(id) {
  for (const collection of getCatalog()) {
    const product = (collection.products || []).find(item => item.id === id);
    if (product) return product;
  }
  return null;
}
