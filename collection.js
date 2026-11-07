/*
  collection.js - Collection page (collection.html) ka code.
  URL se pata chalta hai kaun si collection kholni hai, jaise collection.html?c=rice
  Products owner panel se aate hain (products.js ke zariye).
*/
const productGrid = document.getElementById('productGrid');
const productCount = document.getElementById('productCount');
const productEmpty = document.getElementById('emptyState');
const collectionTitle = document.getElementById('collectionTitle');
const productSearch = document.getElementById('searchInput');

const slug = new URLSearchParams(window.location.search).get('c');

function currentCollection() {
  return slug ? findCollection(slug) : null;
}

function makeProductCard(product, artClass) {
  const card = document.createElement('article');
  card.className = 'collection-card product-card';
  card.dataset.name = product.name.toLowerCase();
  card.dataset.id = product.id;

  const art = document.createElement('div');
  art.className = `product-art ${artClass || ''}`.trim();
  if (product.image) {
    const image = document.createElement('img');
    image.src = product.image;
    image.alt = product.name;
    image.loading = 'lazy';
    image.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:8px;';
    art.appendChild(image);
  } else {
    art.setAttribute('role', 'img');
    art.setAttribute('aria-label', product.name);
    art.textContent = product.emoji || '🛒';
  }

  const content = document.createElement('div');
  content.className = 'card-content';
  const title = document.createElement('h3');
  title.textContent = product.name;
  const price = document.createElement('p');
  price.className = 'price-tag';
  price.append(`${money(product.price)} `);
  const unit = document.createElement('small');
  unit.textContent = 'per box';
  price.appendChild(unit);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'black-btn collection-btn add-cart-btn';
  button.dataset.productId = product.id;
  if (product.inStock === false) {
    button.classList.add('sold-out-btn');
    button.disabled = true;
    button.textContent = 'Sold Out';
  } else {
    button.innerHTML = 'Add to Cart <span>🛒</span>';
  }
  content.append(title, price, button);

  card.append(art, content);
  return card;
}

function applyProductSearch() {
  const query = productSearch.value.trim().toLowerCase();
  const cards = productGrid.querySelectorAll('.product-card');
  let visible = 0;
  cards.forEach(card => {
    const matches = card.dataset.name.includes(query);
    card.hidden = !matches;
    if (matches) visible++;
  });
  const total = cards.length;
  productEmpty.textContent = total === 0
    ? 'No products have been added to this collection yet.'
    : 'No products match your search.';
  productEmpty.hidden = visible !== 0;
  productCount.textContent = total === 0
    ? 'No products yet'
    : query
      ? `${visible} of ${total} products found`
      : `${total} products available`;
}

function renderPage() {
  const collection = currentCollection();
  if (!collection) {
    collectionTitle.textContent = 'Collection not found';
    document.title = 'Collection | Rustam Super Mart';
    productGrid.replaceChildren();
    productCount.textContent = '';
    productEmpty.textContent = 'This collection does not exist. Please go back and choose a category.';
    productEmpty.hidden = false;
    return;
  }
  collectionTitle.textContent = collection.title;
  document.title = `${collection.title} | Rustam Super Mart`;
  productGrid.replaceChildren(...(collection.products || []).map(product => makeProductCard(product, collection.art)));
  applyProductSearch();
}

/* ---------- Search + card buttons ---------- */
productSearch.addEventListener('input', applyProductSearch);

productGrid.addEventListener('click', event => {
  const cartButton = event.target.closest('.add-cart-btn');
  if (cartButton) openCart(findProduct(cartButton.dataset.productId));
});

loadCatalog().then(renderPage).catch(() => {
  productCount.textContent = '';
  productEmpty.textContent = 'Could not load the products. Please refresh the page.';
  productEmpty.hidden = false;
});
