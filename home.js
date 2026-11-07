/*
  home.js - sirf Home page (index.html) ka code: collection cards aur search.
  Collections owner panel se aati hain (products.js ke zariye).
  Shared cheezein (toast, login, cart, nav) script.js mein hain.
*/
const grid = document.getElementById('collectionGrid');
const searchInput = document.getElementById('searchInput');
const countText = document.getElementById('collectionCount');
const emptyState = document.getElementById('emptyState');

/* ---------- Count text (updates with search) ---------- */
function updateCount() {
  const cards = grid.querySelectorAll('.collection-card');
  const total = cards.length;
  const visible = [...cards].filter(card => !card.hidden).length;
  const query = searchInput.value.trim();
  countText.textContent = total === 0
    ? ''
    : query
      ? `${visible} of ${total} collections found`
      : `${total} collections to explore`;
}

/* ---------- Build a card for a collection ---------- */
function makeCollectionCard(item) {
  const card = document.createElement('article');
  card.className = 'collection-card';
  card.dataset.name = `${item.title} ${item.description}`.toLowerCase();
  card.dataset.id = item.id;

  const art = document.createElement('div');
  art.className = `product-art ${item.art || ''}`.trim();
  if (item.image) {
    art.classList.add('uploaded-art');
    const image = document.createElement('img');
    image.src = item.image;
    image.alt = item.title;
    image.loading = 'lazy';
    image.style.cssText = 'width:100%;height:100%;max-height:145px;object-fit:contain;border-radius:8px;';
    art.appendChild(image);
  } else {
    art.setAttribute('role', 'img');
    art.setAttribute('aria-label', item.title);
    art.textContent = item.emoji || '🛒';
  }

  const content = document.createElement('div');
  content.className = 'card-content';
  const title = document.createElement('h3');
  title.textContent = item.title;
  const desc = document.createElement('p');
  desc.textContent = item.description;
  const button = document.createElement('a');
  button.className = 'black-btn collection-btn';
  button.href = `collection.html?c=${encodeURIComponent(item.id)}`;
  button.innerHTML = 'View Collection <span>→</span>';
  content.append(title, desc, button);

  card.append(art, content);
  return card;
}

function renderCollections() {
  grid.replaceChildren(...getCatalog().map(makeCollectionCard));
  applySearch();
}

/* ---------- Search ---------- */
function applySearch() {
  const query = searchInput.value.trim().toLowerCase();
  const cards = grid.querySelectorAll('.collection-card');
  let visible = 0;
  cards.forEach(card => {
    const matches = card.dataset.name.includes(query);
    card.hidden = !matches;
    if (matches) visible++;
  });
  emptyState.textContent = cards.length === 0
    ? 'No collections yet. Please check back soon.'
    : 'No collections match your search.';
  emptyState.hidden = visible !== 0;
  updateCount();
}
searchInput.addEventListener('input', applySearch);

loadCatalog().then(renderCollections).catch(() => {
  countText.textContent = '';
  emptyState.textContent = 'Could not load the collections. Please refresh the page.';
  emptyState.hidden = false;
});
