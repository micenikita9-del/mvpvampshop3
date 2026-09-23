/* ============================================================
   КОНФИГ И СОСТОЯНИЕ
   ============================================================ */
const API = '/api';
let authToken = localStorage.getItem('vs_token') || '';
let currentUser = null;
let products = [];
let brands = [];
let categories = [];
let users = [];
let slides = [];
let contacts = {};
let orders = [];
let allBadges = [];

let activeCategory = null;
let activeSort = 'recommended';

let cart = JSON.parse(localStorage.getItem('vs_cart') || '[]');
let cartCount = 0;

let currentProduct = null;
let currentSize = null;
let currentQty = 1;
let currentPhotos = [];
let newSlideData = '';
let newBrandLogo = '';
let currentProductImages = [];
let currentImageIndex = 0;
let currentSlide = 0;
let slideInterval = null;

const cartCountElement = document.getElementById('cart-count');
const productGrid = document.getElementById('product-grid');
const mainView = document.getElementById('main-view');
const productView = document.getElementById('product-view');
const brandsView = document.getElementById('brands-view');
const brandView = document.getElementById('brand-view');
const cartView = document.getElementById('cart-view');
const contactsView = document.getElementById('contacts-view');
const adminView = document.getElementById('admin-view');
const myOrdersView = document.getElementById('my-orders-view');

/* ============================================================
   УВЕДОМЛЕНИЯ
   ============================================================ */
function showToast(message, type, duration) {
    type = type || 'info';
    duration = duration || 3500;
    const container = document.getElementById('toast-container');
    if (!container) { console.log(message); return; }
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    const icons = { success: '✓', error: '✕', info: 'ⓘ' };
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ⓘ') + '</span>' +
                      '<span class="toast-text">' + message + '</span>' +
                      '<button class="toast-close" onclick="this.parentElement.remove()">×</button>';
    container.appendChild(toast);
    setTimeout(function() {
        toast.classList.add('hiding');
        setTimeout(function() { toast.remove(); }, 300);
    }, duration);
}

function showSuccessPage(text) {
    hideAllViews();
    const view = document.getElementById('success-view');
    if (!view) return;
    const txt = document.getElementById('success-text');
    if (txt) txt.textContent = text || 'Мы свяжемся с вами для подтверждения.';
    view.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   API
   ============================================================ */
async function api(path, options) {
    options = options || {};
    const opts = {
        headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    };
    Object.keys(options).forEach(function(k) { opts[k] = options[k]; });
    if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
    const res = await fetch(API + path, opts);
    if (!res.ok) {
        let err = 'Ошибка';
        try { err = (await res.json()).error || err; } catch (e) {}
        throw new Error(err);
    }
    return res.json();
}

/* ============================================================
   НАВИГАЦИЯ
   ============================================================ */
function hideAllViews() {
    const views = [mainView, productView, brandsView, brandView, cartView, contactsView, adminView, myOrdersView];
    const sv = document.getElementById('success-view');
    if (sv) views.push(sv);
    mainView.style.display = 'none';
    views.forEach(function(v) { if (v) v.classList.remove('active'); });
}
function showCatalog() {
    hideAllViews();
    mainView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showCart() {
    hideAllViews();
    cartView.classList.add('active');
    renderCart();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showContacts() {
    hideAllViews();
    contactsView.classList.add('active');
    loadContacts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function showBrands() {
    hideAllViews();
    brandsView.classList.add('active');
    await loadBrands();
    renderBrands();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function showMyOrders() {
    if (!currentUser) { openAuthModal(); return; }
    hideAllViews();
    myOrdersView.classList.add('active');
    const box = document.getElementById('my-orders-content');
    box.innerHTML = '<p style="color:#888;">Загрузка...</p>';
    try {
        const myOrders = await api('/orders/my');
        if (myOrders.length === 0) {
            box.innerHTML = '<div class="cart-empty">У вас пока нет заказов 📦<br><br><button class="btn" onclick="showCatalog()">Перейти в каталог</button></div>';
        } else {
            box.innerHTML = myOrders.map(function(o) {
                return '<div class="cart-item" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
                    '<div style="display:flex;justify-content:space-between;width:100%;flex-wrap:wrap;gap:8px;">' +
                    '<strong>Заказ №' + o.id + '</strong>' +
                    '<span>' + new Date(o.created_at).toLocaleDateString('ru-RU') + '</span>' +
                    '<span>' + (ORDER_STATUS_LABELS[o.status] || o.status) + '</span>' +
                    '</div>' +
                    '<div class="cart-meta">' + o.items.map(function(i) { return i.name + ' (' + i.size + ') ×' + i.qty; }).join(', ') + '</div>' +
                    '<div class="cart-price">' + o.total.toLocaleString('ru-RU') + ' ₽</div>' +
                '</div>';
            }).join('');
        }
    } catch (e) {
        box.innerHTML = '<p style="color:#888;">Не удалось загрузить заказы</p>';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function showBrand(id) {
    hideAllViews();
    brandView.classList.add('active');
    await loadBrands();
    const b = brands.find(function(x) { return x.id === id; });
    if (!b) return;
    document.getElementById('bv-logo').src = b.logo || '';
    document.getElementById('bv-name').textContent = b.name;
    document.getElementById('bv-desc').textContent = b.description || '';
    const list = await api('/products?brand=' + id);
    document.getElementById('brand-products').innerHTML = list.length
        ? list.map(productCardHtml).join('')
        : '<p style="grid-column:1/-1;text-align:center;color:#888;">У этого бренда пока нет товаров</p>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   КАТЕГОРИИ И СОРТИРОВКА
   ============================================================ */
async function loadCategories() {
    try {
        categories = await api('/categories');
        renderCategorySelect();
    } catch (e) { console.error(e); }
}
function renderCategorySelect() {
    const sel = document.getElementById('category-select');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Все категории</option>' +
        categories.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
    sel.value = cur;
}
function onCategoryChange(value) {
    activeCategory = value ? parseInt(value) : null;
    loadProducts();
}
function onSortChange(value) {
    activeSort = value;
    loadProducts();
}
function resetFilters() {
    activeCategory = null;
    activeSort = 'recommended';
    const catSel = document.getElementById('category-select');
    const sortSel = document.getElementById('sort-select');
    if (catSel) catSel.value = '';
    if (sortSel) sortSel.value = 'recommended';
    loadProducts();
}

/* ============================================================
   КАТАЛОГ
   ============================================================ */
async function loadProducts() {
    try {
        const params = new URLSearchParams();
        if (activeCategory) params.append('category', activeCategory);
        if (activeSort) params.append('sort', activeSort);
        const qs = params.toString();
        products = await api('/products' + (qs ? '?' + qs : ''));
        renderProducts();
        updateFilterInfo();
    } catch (e) { console.error(e); }
}
function updateFilterInfo() {
    const info = document.getElementById('filter-info');
    if (!info) return;
    const parts = [];
    if (activeCategory) {
        const cat = categories.find(function(c) { return c.id === activeCategory; });
        if (cat) parts.push('Категория: ' + cat.name);
    }
    if (activeSort && activeSort !== 'recommended') {
        const sortNames = { cheap: 'сначала дешёвые', expensive: 'сначала дорогие', new: 'новинки', discount: 'со скидкой' };
        parts.push('Сортировка: ' + (sortNames[activeSort] || activeSort));
    }
    if (parts.length === 0) {
        info.textContent = '';
    } else {
        info.textContent = 'Найдено: ' + products.length + ' • ' + parts.join(' • ');
    }
}
function productCardHtml(p) {
    const hasDiscount = (p.discount || 0) > 0;
    const finalPrice = p.final_price || p.price;
    const stock = p.stock || 0;
    const status = p.stock_status || 'in_stock';
    const isNew = p.is_new;

    let badgesHtml = '';
    if (Array.isArray(p.badges) && p.badges.length) {
        badgesHtml = '<div class="product-badges">' +
            p.badges.map(function(b) {
                const _ic = window.badgeIconHtml ? window.badgeIconHtml(b.icon, 13) : '';
                return '<span class="badge-item" style="background:' + (b.color || '#111') + ';color:' + (b.text_color || '#fff') + ';">' + _ic + '<span>' + (b.label || '') + '</span></span>';
            }).join('') + '</div>';
    }

    let stockLine = '';
    if (status === 'coming_soon') stockLine = '<div class="stock-line soon">Скоро в наличии</div>';
    else if (status === 'out_of_stock' || stock === 0) stockLine = '<div class="stock-line out">Нет в наличии</div>';
    else stockLine = '<div class="stock-line in">В наличии: ' + stock + ' шт.</div>';

    return '<div class="product-card" onclick="openProduct(' + p.id + ')">' +
        badgesHtml +
        '<img src="' + p.img + '" alt="' + p.name + '">' +
        '<h3>' + p.name + '</h3>' +
        '<div class="price">' +
            (hasDiscount ? '<span class="price-old">' + p.price.toLocaleString('ru-RU') + ' ₽</span>' : '') +
            '<span class="' + (hasDiscount ? 'price-new' : '') + '">' + finalPrice.toLocaleString('ru-RU') + ' ₽</span>' +
        '</div>' +
        stockLine +
        '<button class="btn" onclick="event.stopPropagation();openProduct(' + p.id + ')">Подробнее</button>' +
    '</div>';
}
function renderProducts() {
    if (!productGrid) return;
    if (products.length === 0) {
        productGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#888;">Товаров не найдено</p>';
        return;
    }
    productGrid.innerHTML = products.map(productCardHtml).join('');
}

/* ============================================================
   СТРАНИЦА ТОВАРА
   ============================================================ */
function openProduct(id) {
    currentProduct = products.find(function(p) { return p.id === id; });
    if (!currentProduct) return;
    currentProductImages = currentProduct.images || [];
    currentImageIndex = 0;
    currentSize = (currentProduct.sizes && currentProduct.sizes[0]) || 'ONE SIZE';
    currentQty = 1;
    document.getElementById('pv-name').textContent = currentProduct.name;
    const finalPrice = currentProduct.final_price || currentProduct.price;
    const hasDiscount = (currentProduct.discount || 0) > 0;
    document.getElementById('pv-price').innerHTML = hasDiscount
        ? '<span class="price-old">' + currentProduct.price.toLocaleString('ru-RU') + ' ₽</span> <span class="price-new">' + finalPrice.toLocaleString('ru-RU') + ' ₽</span>'
        : currentProduct.price.toLocaleString('ru-RU') + ' ₽';
    document.getElementById('pv-description').textContent = currentProduct.description || '';
    document.getElementById('pv-qty').textContent = currentQty;
    // Артикул под ценой
    let skuEl = document.getElementById('pv-sku');
    if (!skuEl) {
        skuEl = document.createElement('div');
        skuEl.id = 'pv-sku';
        skuEl.className = 'product-sku';
        const priceEl = document.getElementById('pv-price');
        if (priceEl && priceEl.parentNode) priceEl.parentNode.insertBefore(skuEl, priceEl.nextSibling);
    }
    skuEl.textContent = currentProduct.sku ? ('Артикул: ' + currentProduct.sku) : '';

    const stockEl = document.getElementById('pv-stock');
    if (stockEl) {
        const stock = currentProduct.stock || 0;
        const status = currentProduct.stock_status || 'in_stock';
        if (status === 'coming_soon') stockEl.innerHTML = '<span style="color:#8b0000;">Скоро в наличии</span>';
        else if (stock > 0) stockEl.innerHTML = '<span style="color:#2d7a2d;">В наличии: ' + stock + ' шт.</span>';
        else stockEl.innerHTML = '<span style="color:#999;">Нет в наличии</span>';
    }

    const brandEl = document.getElementById('pv-brand');
    if (currentProduct.brand) {
        brandEl.textContent = 'Бренд: ' + currentProduct.brand.name;
        brandEl.onclick = function() { showBrand(currentProduct.brand.id); };
        brandEl.style.display = 'block';
    } else {
        brandEl.style.display = 'none';
    }
    renderProductGallery();
    document.getElementById('pv-sizes').innerHTML = (currentProduct.sizes || []).map(function(size) {
        return '<button class="size-btn ' + (size === currentSize ? 'selected' : '') + '" onclick="selectSize(\'' + size + '\',this)">' + size + '</button>';
    }).join('');
    hideAllViews();
    productView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderProductGallery() {
    const img = document.getElementById('pv-image');
    const thumbs = document.getElementById('pv-thumbs');
    if (currentProductImages.length === 0) { img.src = ''; thumbs.innerHTML = ''; return; }
    img.src = currentProductImages[currentImageIndex];
    document.querySelectorAll('.gallery-arrow').forEach(function(a) { a.style.display = currentProductImages.length > 1 ? 'block' : 'none'; });
    thumbs.innerHTML = currentProductImages.length > 1
        ? currentProductImages.map(function(src, i) {
            return '<img class="thumb ' + (i === currentImageIndex ? 'active' : '') + '" src="' + src + '" onclick="goToProductImage(' + i + ')" alt="">';
          }).join('')
        : '';
}
function goToProductImage(i) { currentImageIndex = i; renderProductGallery(); }
function nextProductImage() { if (currentProductImages.length <= 1) return; currentImageIndex = (currentImageIndex + 1) % currentProductImages.length; renderProductGallery(); }
function prevProductImage() { if (currentProductImages.length <= 1) return; currentImageIndex = (currentImageIndex - 1 + currentProductImages.length) % currentProductImages.length; renderProductGallery(); }
function selectSize(size, btn) {
    currentSize = size;
    document.querySelectorAll('.size-btn').forEach(function(b) { b.classList.remove('selected'); });
    btn.classList.add('selected');
}
function changeQty(d) {
    currentQty += d;
    if (currentQty < 1) currentQty = 1;
    if (currentQty > 99) currentQty = 99;
    document.getElementById('pv-qty').textContent = currentQty;
}

/* ============================================================
   КОРЗИНА
   ============================================================ */
function saveCart() {
    localStorage.setItem('vs_cart', JSON.stringify(cart));
    updateCartCount();
}
function updateCartCount() {
    cartCount = cart.reduce(function(s, i) { return s + i.qty; }, 0);
    if (cartCountElement) cartCountElement.textContent = cartCount;
}
function addCurrentToCart() {
    if (!currentProduct) return;
    const key = currentProduct.id + '|' + currentSize;
    const existing = cart.find(function(i) { return i.key === key; });
    const finalPrice = currentProduct.final_price || currentProduct.price;
    if (existing) {
        existing.qty += currentQty;
    } else {
        cart.push({
            key: key, id: currentProduct.id, name: currentProduct.name,
            price: finalPrice, size: currentSize, qty: currentQty,
            img: (currentProduct.images && currentProduct.images[0]) || ''
        });
    }
    saveCart();
    showToast('Товар добавлен в корзину', 'success');
}
function removeFromCart(key) {
    cart = cart.filter(function(i) { return i.key !== key; });
    saveCart();
    renderCart();
}
function renderCart() {
    const box = document.getElementById('cart-content');
    if (!box) return;
    if (cart.length === 0) {
        box.innerHTML = '<div class="cart-empty">Корзина пуста 🛒<br><br><button class="btn" onclick="showCatalog()">Перейти в каталог</button></div>';
        return;
    }
    const total = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);

    const SVG_CARD = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>';
    const SVG_CASH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>';

    box.innerHTML = cart.map(function(i) {
        return '<div class="cart-item">' +
            '<img src="' + i.img + '" alt="">' +
            '<div>' +
                '<div class="cart-name">' + i.name + '</div>' +
                '<div class="cart-meta">Размер: ' + i.size + ' • Кол-во: ' + i.qty + '</div>' +
            '</div>' +
            '<div class="cart-price">' + (i.price * i.qty).toLocaleString('ru-RU') + ' ₽</div>' +
            '<button class="cart-remove" onclick="removeFromCart(\'' + i.key + '\')">Удалить</button>' +
        '</div>';
    }).join('') +
        '<div class="cart-total">Итого: ' + total.toLocaleString('ru-RU') + ' ₽</div>' +
        '<div class="cart-form">' +
            '<h3>Оформление заказа</h3>' +
            '<div class="form-group"><label>Номер телефона *</label><input type="tel" id="o-phone" placeholder="+7 (___) ___-__-__"></div>' +
            '<div class="form-group"><label>Адрес доставки *</label><input type="text" id="o-address" placeholder="Город, улица, дом"></div>' +
            '<div class="form-group"><label>Комментарий к заказу</label><textarea id="o-comment" placeholder="Например: позвонить за час"></textarea></div>' +
            '<div class="payment-title">Способ оплаты</div>' +
            '<div class="payment-methods">' +
                '<button class="pay-btn pay-online" onclick="checkout(\'online\')">' +
                    '<span class="pay-icon">' + SVG_CARD + '</span>' +
                    '<span class="pay-label">Оплатить картой / СБП</span>' +
                '</button>' +
                '<button class="pay-btn pay-cash" onclick="checkout(\'cash\')">' +
                    '<span class="pay-icon">' + SVG_CASH + '</span>' +
                    '<span class="pay-label">Наличными при получении</span>' +
                '</button>' +
            '</div>' +
        '</div>';
}
async function checkout(paymentMethod) {
    if (!currentUser) {
        showToast('Чтобы оформить заказ, войдите в аккаунт', 'info');
        openAuthModal();
        return;
    }
    const phoneEl = document.getElementById('o-phone');
    const addressEl = document.getElementById('o-address');
    const commentEl = document.getElementById('o-comment');
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const address = addressEl ? addressEl.value.trim() : '';
    const comment = commentEl ? commentEl.value.trim() : '';
    if (!phone || !address) { showToast('Заполните телефон и адрес', 'error'); return; }
    const total = cart.reduce(function(s, i) { return s + i.price * i.qty; }, 0);

    if (paymentMethod === 'cash') {
        try {
            await api('/orders', {
                method: 'POST',
                body: JSON.stringify({
                    customer_name: phone, phone: phone, address: address, comment: comment,
                    items: cart.map(function(i) { return { id: i.id, name: i.name, price: i.price, size: i.size, qty: i.qty }; }),
                    total: total
                })
            });
            cart = [];
            saveCart();
            showSuccessPage('Заказ оформлен! Оплата наличными при получении. Мы свяжемся с вами для подтверждения.');
        } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
        return;
    }

    try {
        const data = await api('/payment/create', {
            method: 'POST',
            body: JSON.stringify({
                phone: phone, address: address, comment: comment,
                payment_method: 'online',
                items: cart.map(function(i) { return { id: i.id, name: i.name, price: i.price, size: i.size, qty: i.qty }; }),
                total: total
            })
        });
        if (data.confirmation_url) {
            window.location.href = data.confirmation_url;
        } else {
            showToast('Не удалось создать платёж. Попробуйте оплату наличными.', 'error');
        }
    } catch (e) {
        showToast('Ошибка оплаты: ' + e.message, 'error');
    }
}

/* ============================================================
   БРЕНДЫ
   ============================================================ */
async function loadBrands() {
    try { brands = await api('/brands'); }
    catch (e) { console.error(e); brands = []; }
}
function renderBrands() {
    const grid = document.getElementById('brands-grid');
    if (!grid) return;
    if (brands.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#888;">Брендов пока нет</p>';
        return;
    }
    grid.innerHTML = brands.map(function(b) {
        return '<div class="brand-card" onclick="showBrand(' + b.id + ')">' +
            (b.logo ? '<img class="brand-logo" src="' + b.logo + '" alt="">' : '<div class="brand-logo" style="display:flex;align-items:center;justify-content:center;font-size:40px;">🏷️</div>') +
            '<h3>' + b.name + '</h3>' +
            '<p>' + (b.description || '') + '</p>' +
        '</div>';
    }).join('');
}

/* ============================================================
   КОНТАКТЫ
   ============================================================ */
async function loadContacts() {
    try { contacts = await api('/contacts'); } catch (e) { contacts = {}; }
    const box = document.getElementById('contacts-box');
    if (!box) return;
    box.innerHTML =
        '<div class="contact-row"><strong>Телефон</strong><a href="tel:' + contacts.phone + '">' + (contacts.phone || '—') + '</a></div>' +
        '<div class="contact-row"><strong>Email</strong><a href="mailto:' + contacts.email + '">' + (contacts.email || '—') + '</a></div>' +
        '<div class="contact-row"><strong>Адрес</strong><span>' + (contacts.address || '—') + '</span></div>' +
        '<div class="contact-row"><strong>Instagram</strong><span>' + (contacts.instagram || '—') + '</span></div>' +
        '<div class="contact-row"><strong>Telegram</strong><span>' + (contacts.telegram || '—') + '</span></div>' +
        '<div class="contact-row"><strong>WhatsApp</strong><span>' + (contacts.whatsapp || '—') + '</span></div>' +
        '<div class="contact-row"><strong>Часы работы</strong><span>' + (contacts.work_hours || '—') + '</span></div>';
}

/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */
async function checkAuth() {
    if (!authToken) { renderUserArea(); return; }
    try { currentUser = await api('/me'); }
    catch (e) { authToken = ''; localStorage.removeItem('vs_token'); currentUser = null; }
    renderUserArea();
}
function renderUserArea() {
    const area = document.getElementById('user-area');
    if (!area) return;
    if (currentUser) {
        const adminBtn = currentUser.role === 'admin'
            ? '<button class="user-btn admin-btn" onclick="openAdmin()">Админка</button>' : '';
        area.innerHTML = '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<div class="user-info">Привет, <strong>' + currentUser.name + '</strong></div>' +
            '<button class="user-btn" onclick="showMyOrders()">Мои заказы</button>' +
            adminBtn +
            '<button class="user-btn" onclick="doLogout()">Выйти</button>' +
        '</div>';
    } else {
        area.innerHTML = '<button class="user-btn" onclick="openAuthModal()">Войти</button>';
    }
}
function openAuthModal() {
    document.getElementById('auth-modal').classList.add('active');
    switchAuthForm('login');
}
function closeAuthModal() {
    document.getElementById('auth-modal').classList.remove('active');
    document.getElementById('login-error').textContent = '';
    document.getElementById('reg-error').textContent = '';
}
function switchAuthForm(type) {
    const isLogin = type === 'login';
    document.getElementById('login-form').style.display = isLogin ? 'block' : 'none';
    document.getElementById('register-form').style.display = isLogin ? 'none' : 'block';
    document.getElementById('auth-title').textContent = isLogin ? 'Вход' : 'Регистрация';
}
async function doRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const errorEl = document.getElementById('reg-error');
    errorEl.textContent = '';
    try {
        const data = await api('/register', { method: 'POST', body: JSON.stringify({ name: name, email: email, password: password }) });
        authToken = data.token;
        localStorage.setItem('vs_token', authToken);
        currentUser = data.user;
        closeAuthModal();
        renderUserArea();
        showToast('Добро пожаловать, ' + name + '!', 'success');
    } catch (e) { errorEl.textContent = e.message; }
}
async function doLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    try {
        const data = await api('/login', { method: 'POST', body: JSON.stringify({ email: email, password: password }) });
        authToken = data.token;
        localStorage.setItem('vs_token', authToken);
        currentUser = data.user;
        closeAuthModal();
        renderUserArea();
        showToast('С возвращением, ' + currentUser.name + '!', 'success');
    } catch (e) { errorEl.textContent = e.message; }
}
function doLogout() {
    authToken = '';
    localStorage.removeItem('vs_token');
    currentUser = null;
    renderUserArea();
    showCatalog();
}

/* ============================================================
   АДМИНКА
   ============================================================ */
async function openAdmin() {
    if (!currentUser || currentUser.role !== 'admin') { showToast('Доступ только для администратора', 'error'); return; }
    hideAllViews();
    adminView.classList.add('active');
    try { await loadProducts(); renderAdminProducts(); } catch (e) { console.error(e); }
    try { await loadBrands(); renderAdminBrands(); fillBrandSelect(); } catch (e) { console.error(e); }
    try { await loadCategories(); fillCategorySelect(); } catch (e) { console.error(e); }
    try { await loadUsers(); renderAdminUsers(); } catch (e) { console.error(e); }
    try { await loadSlides(); renderAdminSlides(); } catch (e) { console.error(e); }
    try { await loadOrders(); renderAdminOrders(); } catch (e) { console.error(e); }
    try { await loadContacts(); fillContactsForm(); } catch (e) { console.error(e); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function switchAdminTab(tab, btn) {
    document.querySelectorAll('.admin-tab').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.admin-section').forEach(function(s) { s.classList.remove('active'); });
    const sec = document.getElementById('admin-' + tab);
    if (sec) sec.classList.add('active');
}
function renderAdminProducts() {
    const tbody = document.getElementById('admin-products-body');
    if (!tbody) return;
    tbody.innerHTML = products.map(function(p) {
        const cover = (p.images && p.images[0]) || '';
        const count = (p.images && p.images.length) || 0;
        return '<tr>' +
            '<td><img src="' + cover + '" alt="">' + (count > 1 ? '<div style="font-size:11px;color:#888;">' + count + ' фото</div>' : '') + '</td>' +
            '<td>' + p.name + (p.sku ? '<div style="font-size:11px;color:#888;letter-spacing:1px;">' + p.sku + '</div>' : '') + '</td>' +
            '<td>' + (p.category ? p.category.name : '—') + '</td>' +
            '<td>' + (p.brand ? p.brand.name : '—') + '</td>' +
            '<td>' + p.price.toLocaleString('ru-RU') + ' ₽</td>' +
            '<td>' + (p.discount > 0 ? '−' + p.discount + '%' : '—') + '</td>' +
            '<td>' + (p.stock || 0) + '</td>' +
            '<td><div class="admin-actions">' +
                '<button class="btn btn-small" onclick="editProduct(' + p.id + ')">Изменить</button>' +
                '<button class="btn btn-small btn-danger" onclick="deleteProduct(' + p.id + ')">Удалить</button>' +
            '</div></td>' +
        '</tr>';
    }).join('');
}
async function loadUsers() { try { users = await api('/users'); } catch (e) { users = []; } }
function renderAdminUsers() {
    const tbody = document.getElementById('admin-users-body');
    if (!tbody) return;
    tbody.innerHTML = users.map(function(u) {
        return '<tr><td>' + u.id + '</td><td>' + u.name + '</td><td>' + u.email + '</td>' +
        '<td>' + (u.role === 'admin' ? '👑 Админ' : 'Покупатель') + '</td>' +
        '<td>' + new Date(u.created_at).toLocaleDateString('ru-RU') + '</td></tr>';
    }).join('');
}

/* ============================================================
   АДМИНКА: ФОТО
   ============================================================ */
async function handleFileUpload(files) {
    const list = Array.from(files || []).filter(function(f) { return f.type.startsWith('image/'); });
    if (list.length === 0) return;
    list.forEach(function(file) {
        const reader = new FileReader();
        reader.onload = function(e) { currentPhotos.push({ local: e.target.result, file: file }); renderProductPhotos(); };
        reader.readAsDataURL(file);
    });
    const fd = new FormData();
    list.forEach(function(f) { fd.append('photos', f); });
    try {
        const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken }, body: fd });
        if (!res.ok) throw new Error('Ошибка загрузки');
        const data = await res.json();
        let i = 0;
        currentPhotos = currentPhotos.map(function(p) { return p.local && p.file ? data.urls[i++] : p; });
        renderProductPhotos();
    } catch (e) {
        showToast('Ошибка загрузки: ' + e.message, 'error');
        currentPhotos = currentPhotos.filter(function(p) { return typeof p === 'string'; });
        renderProductPhotos();
    }
}
function addUrlPhoto() {
    const input = document.getElementById('f-img-url');
    const url = input.value.trim();
    if (!url) return;
    currentPhotos.push(url);
    input.value = '';
    renderProductPhotos();
}
function renderProductPhotos() {
    const list = document.getElementById('product-photos-list');
    const ph = document.getElementById('upload-placeholder');
    if (!list) return;
    if (currentPhotos.length === 0) { list.innerHTML = ''; if (ph) ph.style.display = 'block'; return; }
    if (ph) ph.style.display = 'none';
    list.innerHTML = currentPhotos.map(function(photo, i) {
        const src = typeof photo === 'string' ? photo : photo.local;
        return '<div class="slide-item photo-item">' +
            '<img src="' + src + '" alt="">' +
            (i === 0 ? '<span class="main-badge">Главное</span>' : '') +
            (i !== 0 ? '<button class="make-main-btn" onclick="makeMainPhoto(' + i + ')">Сделать главным</button>' : '') +
            '<button class="slide-remove" onclick="removeProductPhoto(' + i + ')">×</button>' +
        '</div>';
    }).join('');
}
function removeProductPhoto(i) { currentPhotos.splice(i, 1); renderProductPhotos(); }
function makeMainPhoto(i) {
    if (i === 0) return;
    const p = currentPhotos.splice(i, 1)[0];
    currentPhotos.unshift(p);
    renderProductPhotos();
}
function fillBrandSelect() {
    const sel = document.getElementById('f-brand');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— без бренда —</option>' +
        brands.map(function(b) { return '<option value="' + b.id + '">' + b.name + '</option>'; }).join('');
    sel.value = cur;
}
function fillCategorySelect() {
    const sel = document.getElementById('f-category');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— без категории —</option>' +
        categories.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
    sel.value = cur;
}
async function saveProduct() {
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('f-name').value.trim();
    const price = parseInt(document.getElementById('f-price').value);
    const discountEl = document.getElementById('f-discount');
    const discount = discountEl ? (parseInt(discountEl.value) || 0) : 0;
    const desc = document.getElementById('f-desc').value.trim();
    const sizesStr = document.getElementById('f-sizes').value.trim();
    const brand_id = document.getElementById('f-brand').value || null;
    const category_id = document.getElementById('f-category').value || null;
    const stockEl = document.getElementById('f-stock');
    const stockStatusEl = document.getElementById('f-stock-status');
    const stock = stockEl ? (parseInt(stockEl.value) || 0) : 0;
    const stock_status = stockStatusEl ? (stockStatusEl.value || 'in_stock') : 'in_stock';

    if (!name || !price) { showToast('Заполните название и цену', 'error'); return; }
    const images = currentPhotos.map(function(p) { return typeof p === 'string' ? p : p.local; });
    if (images.length === 0) { showToast('Добавьте хотя бы одно фото', 'error'); return; }
    const sizes = sizesStr ? sizesStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : ['ONE SIZE'];
    const skuEl = document.getElementById('f-sku');
    const sku = skuEl ? skuEl.value.trim() : '';
    const specs = collectSpecs();
    const payload = {
        name: name, price: price, description: desc, sizes: sizes, images: images,
        brand_id: brand_id ? parseInt(brand_id) : null,
        category_id: category_id ? parseInt(category_id) : null,
        discount: discount,
        stock: stock,
        stock_status: stock_status,
        sku: sku,
        specs: specs
    };
    try {
        if (id) { await api('/products/' + id, { method: 'PUT', body: JSON.stringify(payload) }); showToast('Товар обновлён', 'success'); }
        else { await api('/products', { method: 'POST', body: JSON.stringify(payload) }); showToast('Товар добавлен', 'success'); }
        resetProductForm();
        await loadProducts(); renderAdminProducts();
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
function editProduct(id) {
    const p = products.find(function(x) { return x.id === id; });
    if (!p) return;
    document.getElementById('edit-id').value = p.id;
    document.getElementById('f-name').value = p.name;
    document.getElementById('f-price').value = p.price;
    const discountEl = document.getElementById('f-discount');
    if (discountEl) discountEl.value = p.discount || 0;
    document.getElementById('f-desc').value = p.description || '';
    document.getElementById('f-sizes').value = (p.sizes || []).join(', ');
    document.getElementById('form-title').textContent = 'Редактирование: ' + p.name;
    currentPhotos = (p.images || []).slice();
    renderProductPhotos();
    fillBrandSelect();
    fillCategorySelect();
    document.getElementById('f-brand').value = p.brand_id || '';
    document.getElementById('f-category').value = p.category_id || '';
    const stockEl = document.getElementById('f-stock');
    const stockStatusEl = document.getElementById('f-stock-status');
    if (stockEl) stockEl.value = p.stock || 0;
    if (stockStatusEl) stockStatusEl.value = p.stock_status || 'in_stock';
    const skuEl = document.getElementById('f-sku');
    if (skuEl) skuEl.value = p.sku || '';
    fillSpecs(p.specs || []);
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(function(b) { b.classList.remove('active'); });
    if (tabs[1]) tabs[1].classList.add('active');
    document.querySelectorAll('.admin-section').forEach(function(s) { s.classList.remove('active'); });
    document.getElementById('admin-add').classList.add('active');
}
async function deleteProduct(id) {
    if (!confirm('Удалить товар?')) return;
    try { await api('/products/' + id, { method: 'DELETE' }); await loadProducts(); renderAdminProducts(); }
    catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
function resetProductForm() {
    ['edit-id','f-name','f-price','f-desc','f-sizes','f-img-url','f-sku'].forEach(function(i) {
        const el = document.getElementById(i); if (el) el.value = '';
    });
    fillSpecs([]);
    const discountEl = document.getElementById('f-discount'); if (discountEl) discountEl.value = '0';
    const stockEl = document.getElementById('f-stock'); if (stockEl) stockEl.value = '0';
    const stockStatusEl = document.getElementById('f-stock-status'); if (stockStatusEl) stockStatusEl.value = 'in_stock';
    document.getElementById('form-title').textContent = 'Новый товар';
    const f = document.getElementById('f-file'); if (f) f.value = '';
    document.getElementById('f-brand').value = '';
    document.getElementById('f-category').value = '';
    currentPhotos = [];
    renderProductPhotos();
}

/* ============================================================
   АДМИНКА: БРЕНДЫ
   ============================================================ */
function renderAdminBrands() {
    const tbody = document.getElementById('admin-brands-body');
    if (!tbody) return;
    tbody.innerHTML = brands.map(function(b) {
        return '<tr>' +
            '<td>' + (b.logo ? '<img src="' + b.logo + '" alt="" style="width:50px;height:50px;">' : '—') + '</td>' +
            '<td>' + b.name + '</td>' +
            '<td>' + (b.description || '') + '</td>' +
            '<td><button class="btn btn-small btn-danger" onclick="deleteBrand(' + b.id + ')">Удалить</button></td>' +
        '</tr>';
    }).join('');
}
async function saveBrand() {
    const name = document.getElementById('b-name').value.trim();
    const description = document.getElementById('b-desc').value.trim();
    const logo = newBrandLogo || document.getElementById('b-logo-url').value.trim();
    if (!name) { showToast('Введите название бренда', 'error'); return; }
    try {
        await api('/brands', { method: 'POST', body: JSON.stringify({ name: name, description: description, logo: logo }) });
        document.getElementById('b-name').value = '';
        document.getElementById('b-desc').value = '';
        document.getElementById('b-logo-url').value = '';
        newBrandLogo = '';
        document.getElementById('brand-upload-preview').style.display = 'none';
        document.getElementById('brand-upload-placeholder').style.display = 'block';
        await loadBrands();
        renderAdminBrands();
        fillBrandSelect();
        showToast('Бренд добавлен', 'success');
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
async function deleteBrand(id) {
    if (!confirm('Удалить бренд? Товары останутся, но без бренда.')) return;
    try {
        await api('/brands/' + id, { method: 'DELETE' });
        await loadBrands();
        renderAdminBrands();
        fillBrandSelect();
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}

/* ============================================================
   АДМИНКА: СЛАЙДЕР
   ============================================================ */
async function loadSlides() { try { slides = await api('/slides'); renderSlider(); } catch (e) { console.error(e); } }
function renderSlider() {
    const slider = document.getElementById('hero-slider');
    const dotsContainer = document.getElementById('slider-dots');
    if (!slider) return;
    slider.querySelectorAll('.slide').forEach(function(s) { s.remove(); });
    if (slides.length === 0) { if (dotsContainer) dotsContainer.innerHTML = ''; return; }
    if (currentSlide >= slides.length) currentSlide = 0;
    slides.forEach(function(slide, i) {
        const div = document.createElement('div');
        div.className = 'slide' + (i === currentSlide ? ' active' : '');
        div.style.backgroundImage = "url('" + slide.img + "')";
        slider.insertBefore(div, slider.firstChild);
    });
    if (dotsContainer) dotsContainer.innerHTML = slides.map(function(_, i) {
        return '<span class="dot ' + (i === currentSlide ? 'active' : '') + '" onclick="goToSlide(' + i + ')"></span>';
    }).join('');
    if (slideInterval) clearInterval(slideInterval);
    if (slides.length > 1) slideInterval = setInterval(nextSlide, 5000);
}
function goToSlide(i) {
    currentSlide = i;
    document.querySelectorAll('#hero-slider .slide').forEach(function(s, idx) { s.classList.toggle('active', idx === i); });
    document.querySelectorAll('#slider-dots .dot').forEach(function(d, idx) { d.classList.toggle('active', idx === i); });
}
function nextSlide() { if (slides.length === 0) return; goToSlide((currentSlide + 1) % slides.length); }
function prevSlide() { if (slides.length === 0) return; goToSlide((currentSlide - 1 + slides.length) % slides.length); }
function renderAdminSlides() {
    const list = document.getElementById('slides-list');
    if (!list) return;
    if (slides.length === 0) { list.innerHTML = '<p style="color:#888;font-size:14px;">Слайдов нет</p>'; return; }
    list.innerHTML = slides.map(function(s) {
        return '<div class="slide-item"><img src="' + s.img + '" alt=""><button class="slide-remove" onclick="removeSlide(' + s.id + ')">×</button></div>';
    }).join('');
}
async function addSlide() {
    const url = document.getElementById('slide-url').value.trim();
    const img = newSlideData || url;
    if (!img) { showToast('Добавьте фото', 'error'); return; }
    try {
        await api('/slides', { method: 'POST', body: JSON.stringify({ img: img }) });
        newSlideData = '';
        document.getElementById('slide-upload-preview').style.display = 'none';
        document.getElementById('slide-upload-placeholder').style.display = 'block';
        document.getElementById('slide-upload-preview').src = '';
        document.getElementById('slide-file').value = '';
        document.getElementById('slide-url').value = '';
        await loadSlides(); renderAdminSlides();
        showToast('Слайд добавлен', 'success');
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
async function removeSlide(id) {
    if (!confirm('Удалить слайд?')) return;
    try { await api('/slides/' + id, { method: 'DELETE' }); await loadSlides(); renderAdminSlides(); }
    catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}
async function uploadSlideFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const fd = new FormData(); fd.append('photos', file);
    try {
        const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken }, body: fd });
        const data = await res.json();
        newSlideData = data.urls[0];
        document.getElementById('slide-upload-preview').src = newSlideData;
        document.getElementById('slide-upload-preview').style.display = 'block';
        document.getElementById('slide-upload-placeholder').style.display = 'none';
        document.getElementById('slide-url').value = '';
    } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}

/* ============================================================
   АДМИНКА: ЗАКАЗЫ
   ============================================================ */
async function loadOrders() { try { orders = await api('/orders'); } catch (e) { orders = []; } }
function renderAdminOrders() {
    const tbody = document.getElementById('admin-orders-body');
    if (!tbody) return;
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">Заказов нет</td></tr>';
        return;
    }
    tbody.innerHTML = orders.map(function(o) {
        return '<tr>' +
            '<td>' + o.id + '</td>' +
            '<td>' + (o.customer_name || o.phone || '—') + '</td>' +
            '<td>' + (o.phone || '—') + '</td>' +
            '<td>' + (o.address || '—') + '</td>' +
            '<td>' + (o.items || []).map(function(i) { return i.name + ' (' + i.size + ') ×' + i.qty; }).join('<br>') + '</td>' +
            '<td>' + (o.total || 0).toLocaleString('ru-RU') + ' ₽</td>' +
            '<td><select onchange="updateOrderStatus(' + o.id + ', this.value)">' +
                ['new','processing','shipped','done','cancelled'].map(function(s) {
                    return '<option value="' + s + '" ' + (s === o.status ? 'selected' : '') + '>' + ORDER_STATUS_LABELS[s] + '</option>';
                }).join('') +
            '</select></td>' +
        '</tr>';
    }).join('');
}
async function updateOrderStatus(id, status) {
    try { await api('/orders/' + id, { method: 'PUT', body: JSON.stringify({ status: status }) }); }
    catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}

/* ============================================================
   АДМИНКА: КОНТАКТЫ
   ============================================================ */
function fillContactsForm() {
    const set = function(id, v) { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('c-phone', contacts.phone);
    set('c-email', contacts.email);
    set('c-address', contacts.address);
    set('c-instagram', contacts.instagram);
    set('c-telegram', contacts.telegram);
    set('c-whatsapp', contacts.whatsapp);
    set('c-hours', contacts.work_hours);
}
async function saveContacts() {
    const payload = {
        phone: document.getElementById('c-phone').value,
        email: document.getElementById('c-email').value,
        address: document.getElementById('c-address').value,
        instagram: document.getElementById('c-instagram').value,
        telegram: document.getElementById('c-telegram').value,
        whatsapp: document.getElementById('c-whatsapp').value,
        work_hours: document.getElementById('c-hours').value
    };
    try { contacts = await api('/contacts', { method: 'PUT', body: JSON.stringify(payload) }); showToast('Контакты сохранены', 'success'); }
    catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
}

/* ============================================================
   СТАРТ
   ============================================================ */
document.addEventListener('DOMContentLoaded', function() {
    renderUserArea();
    updateCartCount();

    const uz = document.getElementById('upload-zone');
    const fi = document.getElementById('f-file');
    if (uz && fi) {
        uz.addEventListener('click', function() { fi.click(); });
        fi.addEventListener('change', function(e) { handleFileUpload(e.target.files); fi.value = ''; });
        uz.addEventListener('dragover', function(e) { e.preventDefault(); uz.classList.add('dragover'); });
        uz.addEventListener('dragleave', function() { uz.classList.remove('dragover'); });
        uz.addEventListener('drop', function(e) { e.preventDefault(); uz.classList.remove('dragover'); handleFileUpload(e.dataTransfer.files); });
    }

    const bz = document.getElementById('brand-upload-zone');
    const bf = document.getElementById('brand-logo-file');
    if (bz && bf) {
        bz.addEventListener('click', function() { bf.click(); });
        bf.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const fd = new FormData(); fd.append('photos', file);
            try {
                const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + authToken }, body: fd });
                const data = await res.json();
                newBrandLogo = data.urls[0];
                document.getElementById('brand-upload-preview').src = newBrandLogo;
                document.getElementById('brand-upload-preview').style.display = 'block';
                document.getElementById('brand-upload-placeholder').style.display = 'none';
                document.getElementById('b-logo-url').value = '';
            } catch (e) { showToast('Ошибка: ' + e.message, 'error'); }
        });
    }

    const sz = document.getElementById('slide-upload-zone');
    const sf = document.getElementById('slide-file');
    const su = document.getElementById('slide-url');
    if (sz && sf) {
        sz.addEventListener('click', function() { sf.click(); });
        sf.addEventListener('change', function(e) { uploadSlideFile(e.target.files[0]); });
        sz.addEventListener('dragover', function(e) { e.preventDefault(); sz.classList.add('dragover'); });
        sz.addEventListener('dragleave', function() { sz.classList.remove('dragover'); });
        sz.addEventListener('drop', function(e) { e.preventDefault(); sz.classList.remove('dragover'); uploadSlideFile(e.dataTransfer.files[0]); });
    }
    if (su) su.addEventListener('input', function(e) {
        if (e.target.value.trim()) {
            newSlideData = '';
            document.getElementById('slide-upload-preview').src = e.target.value.trim();
            document.getElementById('slide-upload-preview').style.display = 'block';
            document.getElementById('slide-upload-placeholder').style.display = 'none';
        }
    });

    checkAuth();
    loadCategories();
    loadProducts();
    loadSlides();
});
/* === BURGER FILTERS (start) === */
(function(){
  const burger   = document.getElementById('burgerBtn');
  const panel    = document.getElementById('filtersPanel');
  const backdrop = document.getElementById('filtersBackdrop');
  const closeBtn = document.getElementById('filtersClose');
  const resetBtn = document.getElementById('filtersReset');
  const selCat   = document.getElementById('filterCategory');
  const selSort  = document.getElementById('filterSort');

  if (!burger || !panel) return;

  function setOpen(open){
    burger.classList.toggle('is-open', open);
    panel.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  burger.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
  closeBtn?.addEventListener('click', () => setOpen(false));
  backdrop?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

  // Заполняем категории из уже отрисованных на странице элементов, если они есть.
  // Ищем ссылки/кнопки категорий и дублируем их в select.
  function fillCategories(){
    if (!selCat) return;
    const candidates = document.querySelectorAll('[data-category], .category, .categories a, .category-item');
    const seen = new Set();
    candidates.forEach(el => {
      const name = (el.dataset.category || el.textContent || '').trim();
      if (!name || seen.has(name)) return;
      seen.add(name);
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      selCat.appendChild(opt);
    });
  }
  fillCategories();

  // Применение фильтров: пробуем вызвать существующие функции, если они есть.
  function applyFilters(){
    const category = selCat?.value || '';
    const sort     = selSort?.value || 'recommended';

    // 1) если на сайте есть глобальная функция фильтрации — вызовем её
    if (typeof window.applyFilters === 'function') {
      window.applyFilters({ category, sort });
      return;
    }
    // 2) иначе — эмулируем клик по соответствующей кнопке категории
    if (category) {
      const link = document.querySelector(`[data-category="${category}"]`);
      if (link) { link.click(); return; }
    }
    // 3) иначе — хотя бы отсортируем карточки товаров на клиенте
    sortCards(sort);
  }

  function sortCards(sort){
    const grid = document.querySelector('.products, .product-grid, #products, .catalog');
    if (!grid) return;
    const cards = Array.from(grid.children);
    if (!cards.length) return;

    const priceOf = el => {
      const t = el.querySelector('.price, [data-price]')?.textContent || '';
      const n = parseInt(t.replace(/[^\d]/g,''),10);
      return isNaN(n) ? 0 : n;
    };

    cards.sort((a,b) => {
      if (sort === 'price_asc')  return priceOf(a) - priceOf(b);
      if (sort === 'price_desc') return priceOf(b) - priceOf(a);
      return 0;
    });
    cards.forEach(c => grid.appendChild(c));
  }

  selCat?.addEventListener('change', applyFilters);
  selSort?.addEventListener('change', applyFilters);
  resetBtn?.addEventListener('click', () => {
    if (selCat)  selCat.value = '';
    if (selSort) selSort.value = 'recommended';
    applyFilters();
  });
})();
/* === BURGER FILTERS (end) === */

/* === BADGE ICONS LIBRARY (start) === */
window.BADGE_ICONS = {
  'star':      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  'fire':      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 0.67s0.74 2.65 0.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l0.03-0.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>',
  'tag':       '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>',
  'new':       '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6z"/></svg>',
  'clock':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  'check':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  'cross':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  'heart':     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  'bolt':      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"/></svg>',
  'crown':     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/></svg>',
  'gift':      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
  'percent':   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  'eye':       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  'bookmark':  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>',
  'thumb':     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>',
  'sparkle':   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.6L19 9.4l-5.2 1.8L12 16.8l-1.8-5.6L5 9.4l5.2-1.8L12 2zM19 15l.9 2.8L22.7 19l-2.8.9L19 22.7l-.9-2.8L15.3 19l2.8-.9L19 15zM5 14l.7 2.1L7.8 17l-2.1.7L5 19.8l-.7-2.1L2.2 17l2.1-.9L5 14z"/></svg>',
  'vip':       '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6 6 .9-4.5 4.3 1.1 6.3L12 16.5 6.4 19.5l1.1-6.3L3 8.9 9 8l3-6z"/></svg>',
  'sale':      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-4-4 1.4-1.4L10 14.2l6.6-6.6L18 9l-8 8z"/></svg>',
  'no':        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>',
  'flag':      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>',
  'leaf':      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  'diamond':   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 9l10 13L22 9 12 2zm0 4.5L18 9l-6 8.5L6 9l6-2.5z"/></svg>',
};

/* Совместимость: эмодзи → имя иконки */
window.EMOJI_TO_ICON = {
  '✨': 'sparkle', '🔥': 'fire', '🏷️': 'tag', '⏳': 'clock', '⭐': 'star',
  '❤️': 'heart', '⚡': 'bolt', '👑': 'crown', '🎁': 'gift', '💎': 'diamond',
  '✅': 'check', '❌': 'cross', '👁️': 'eye', '🔖': 'bookmark', '👍': 'thumb',
  '🏆': 'crown', '%': 'percent', '💯': 'vip', '🌟': 'star', '🚩': 'flag',
  '🍃': 'leaf', '🆕': 'new', '🆗': 'check', '🔴': 'fire'
};

window.badgeIconHtml = function(icon, size) {
  if (!icon) return '';
  size = size || 13;
  // если это имя из библиотеки
  if (window.BADGE_ICONS[icon]) {
    return '<span style="display:inline-flex;width:'+size+'px;height:'+size+'px;">' + window.BADGE_ICONS[icon] + '</span>';
  }
  // если это эмодзи — попробуем смапить
  if (window.EMOJI_TO_ICON[icon]) {
    return '<span style="display:inline-flex;width:'+size+'px;height:'+size+'px;">' + window.BADGE_ICONS[window.EMOJI_TO_ICON[icon]] + '</span>';
  }
  // иначе — как есть (старое эмодзи)
  return '<span>' + icon + '</span>';
};

/* Рендер галереи иконок в админке */
window.renderBadgeIconGrid = function() {
  const grid = document.getElementById('badge-icon-grid');
  const hidden = document.getElementById('bd-icon');
  if (!grid || !hidden) return;
  const current = hidden.value || '';
  grid.innerHTML = Object.keys(window.BADGE_ICONS).map(function(name) {
    return '<button type="button" class="badge-icon-btn' + (current === name ? ' selected' : '') + '" data-icon="' + name + '" title="' + name + '">' + window.BADGE_ICONS[name] + '</button>';
  }).join('');
  grid.querySelectorAll('.badge-icon-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const name = btn.dataset.icon;
      hidden.value = name;
      grid.querySelectorAll('.badge-icon-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
};
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(window.renderBadgeIconGrid, 300);
});
/* === BADGE ICONS LIBRARY (end) === */

/* === BADGES ADMIN (start) === */
async function loadBadges() {
  try {
    allBadges = await api('/badges');
  } catch (e) {
    console.error('loadBadges:', e);
    allBadges = [];
  }
}

function renderAdminBadges() {
  const tbody = document.getElementById('admin-badges-body');
  if (!tbody) return;
  if (!allBadges.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#888;">Бейджей пока нет</td></tr>';
    return;
  }
  tbody.innerHTML = allBadges.map(function(b) {
    const iconHtml = window.badgeIconHtml ? window.badgeIconHtml(b.icon, 22) : (b.icon || '');
    const colorBox = '<span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:' + (b.color || '#111') + ';margin-right:4px;vertical-align:middle;"></span>'
                   + '<span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:' + (b.text_color || '#fff') + ';border:1px solid #ddd;vertical-align:middle;"></span>';
    return '<tr>' +
      '<td class="badge-icon-cell">' + iconHtml + '</td>' +
      '<td>' + (b.label || '') + '</td>' +
      '<td><code>' + (b.code || '') + '</code></td>' +
      '<td>' + colorBox + '</td>' +
      '<td>' + (b.auto ? '✅' : '—') + '</td>' +
      '<td>' + (b.sort_order || 0) + '</td>' +
      '<td><button class="btn btn-small btn-danger" onclick="deleteBadge(' + b.id + ')">Удалить</button></td>' +
    '</tr>';
  }).join('');
}

async function saveBadge() {
  const code      = (document.getElementById('bd-code')?.value || '').trim();
  const label     = (document.getElementById('bd-label')?.value || '').trim();
  const icon      = (document.getElementById('bd-icon')?.value || '').trim();
  const color     = (document.getElementById('bd-color')?.value || '#111111').trim();
  const textColor = (document.getElementById('bd-text-color')?.value || '#ffffff').trim();
  const auto      = document.getElementById('bd-auto')?.checked ? 1 : 0;
  const sortOrder = parseInt(document.getElementById('bd-sort')?.value || '0', 10) || 0;

  if (!code)  { showToast('Введите код бейджа (латиницей)', 'error'); return; }
  if (!label) { showToast('Введите название бейджа', 'error'); return; }
  if (!/^[a-z0-9_\-]+$/i.test(code)) {
    showToast('Код может содержать только латиницу, цифры, _ и -', 'error');
    return;
  }

  try {
    await api('/badges', {
      method: 'POST',
      body: JSON.stringify({
        code: code, label: label, icon: icon,
        color: color, text_color: textColor,
        auto: auto, sort_order: sortOrder
      })
    });
    // очистка формы
    document.getElementById('bd-code').value = '';
    document.getElementById('bd-label').value = '';
    const iconEl = document.getElementById('bd-icon');
    if (iconEl) iconEl.value = '';
    document.querySelectorAll('.badge-icon-btn').forEach(b => b.classList.remove('selected'));
    if (document.getElementById('bd-sort')) document.getElementById('bd-sort').value = '0';
    if (document.getElementById('bd-auto')) document.getElementById('bd-auto').checked = false;

    await loadBadges();
    renderAdminBadges();
    if (typeof fillBadgeCheckboxes === 'function') fillBadgeCheckboxes();
    if (typeof renderBadgeIconGrid === 'function') renderBadgeIconGrid();
    showToast('Бейдж добавлен', 'success');
  } catch (e) {
    console.error('saveBadge:', e);
    showToast('Ошибка: ' + (e.message || e), 'error');
  }
}

async function deleteBadge(id) {
  if (!confirm('Удалить бейдж?')) return;
  try {
    await api('/badges/' + id, { method: 'DELETE' });
    await loadBadges();
    renderAdminBadges();
    if (typeof fillBadgeCheckboxes === 'function') fillBadgeCheckboxes();
    showToast('Бейдж удалён', 'success');
  } catch (e) {
    showToast('Ошибка: ' + (e.message || e), 'error');
  }
}

/* Чекбоксы бейджей в форме товара */
function fillBadgeCheckboxes(selectedIds) {
  const box = document.getElementById('f-badges');
  if (!box) return;
  const sel = new Set((selectedIds || []).map(String));
  if (!allBadges.length) { box.innerHTML = '<span style="color:#888;">Бейджей нет</span>'; return; }
  box.innerHTML = allBadges.map(function(b) {
    const ic = window.badgeIconHtml ? window.badgeIconHtml(b.icon, 14) : (b.icon || '');
    return '<label class="badge-checkbox" style="display:inline-flex;align-items:center;gap:5px;margin:4px 10px 4px 0;">' +
      '<input type="checkbox" value="' + b.id + '"' + (sel.has(String(b.id)) ? ' checked' : '') + '> ' +
      ic + ' <span>' + (b.label || '') + '</span>' +
    '</label>';
  }).join('');
}

/* Автозагрузка при открытии админки */
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(async function() {
    if (typeof allBadges !== 'undefined' && !allBadges.length) {
      await loadBadges();
      renderAdminBadges();
      fillBadgeCheckboxes();
    }
  }, 400);
});

/* Экспорт в window, чтобы onclick="saveBadge()" работал */
window.saveBadge = saveBadge;
window.deleteBadge = deleteBadge;
window.renderAdminBadges = renderAdminBadges;
window.loadBadges = loadBadges;
window.fillBadgeCheckboxes = fillBadgeCheckboxes;
/* === BADGES ADMIN (end) === */

/* === PRODUCT UPGRADE (start) === */
let currentReviewRating = 5;
let currentRelatedOffset = 0;

/* Аккордеон */
function toggleAccordion(btn){
  const item = btn.closest('.accordion-item');
  if (!item) return;
  const body = item.querySelector('.accordion-body');
  const isOpen = item.classList.contains('open');
  if (isOpen){
    item.classList.remove('open');
    body.style.maxHeight = '0px';
  } else {
    item.classList.add('open');
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

/* Звёзды */
function initReviewStars(){
  const wrap = document.getElementById('review-stars');
  if (!wrap) return;
  const stars = wrap.querySelectorAll('span');
  function paint(n){
    stars.forEach(function(s,i){ s.classList.toggle('active', i < n); });
  }
  paint(currentReviewRating);
  stars.forEach(function(s){
    s.addEventListener('click', function(){
      currentReviewRating = parseInt(s.dataset.r,10) || 5;
      paint(currentReviewRating);
    });
    s.addEventListener('mouseenter', function(){
      const n = parseInt(s.dataset.r,10);
      stars.forEach(function(x,i){ x.classList.toggle('active', i < n); });
    });
  });
  wrap.addEventListener('mouseleave', function(){ paint(currentReviewRating); });
}

/* Загрузка отзывов */
async function loadReviews(productId){
  const list = document.getElementById('reviews-list');
  const countEl = document.getElementById('rv-count');
  const avgEl = document.getElementById('rv-avg');
  if (!list) return;
  try {
    const items = await api('/products/' + productId + '/reviews');
    if (countEl) countEl.textContent = '(' + items.length + ')';
    if (avgEl){
      if (!items.length){ avgEl.textContent = ''; }
      else {
        const avg = (items.reduce(function(s,x){return s + (x.rating||0);},0) / items.length).toFixed(1);
        avgEl.innerHTML = '★ ' + avg + ' / 5';
      }
    }
    if (!items.length){
      list.innerHTML = '<div class="reviews-empty">Пока нет отзывов. Будьте первым!</div>';
      return;
    }
    const me = (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    list.innerHTML = items.map(function(r){
      const stars = '★'.repeat(r.rating||0) + '☆'.repeat(5 - (r.rating||0));
      const date = (r.created_at || '').slice(0,10);
      const canDel = me && (me.id === r.user_id || me.role === 'admin');
      return '<div class="review-item">' +
        '<div class="review-item__head">' +
          '<div class="review-item__name">' + (r.user_name || 'Пользователь') + '</div>' +
          '<div class="review-item__date">' + date + '</div>' +
        '</div>' +
        '<div class="review-item__stars">' + stars + '</div>' +
        '<div class="review-item__text">' + (r.text || '') + '</div>' +
        (canDel ? '<div style="text-align:right;"><button class="review-item__del" onclick="deleteReview(' + r.id + ')">✕</button></div>' : '') +
      '</div>';
    }).join('');
  } catch (e){
    list.innerHTML = '<div class="reviews-empty">Не удалось загрузить отзывы</div>';
  }
}

async function submitReview(ev){
  ev.preventDefault();
  const textEl = document.getElementById('review-text');
  const note = document.getElementById('review-note');
  if (!currentProduct) return;
  const token = (typeof authToken !== 'undefined' && authToken) ? authToken : null;
  if (!token){
    if (note){ note.textContent = 'Войдите, чтобы оставить отзыв'; note.classList.add('err'); }
    return;
  }
  const text = (textEl?.value || '').trim();
  if (!text){ if (note){ note.textContent = 'Введите текст отзыва'; note.classList.add('err'); } return; }
  try {
    await api('/products/' + currentProduct.id + '/reviews', {
      method: 'POST',
      body: JSON.stringify({ rating: currentReviewRating, text: text })
    });
    if (textEl) textEl.value = '';
    currentReviewRating = 5;
    initReviewStars();
    if (note){ note.textContent = ''; note.classList.remove('err'); }
    await loadReviews(currentProduct.id);
    showToast('Отзыв добавлен', 'success');
  } catch (e){
    if (note){ note.textContent = 'Ошибка: ' + (e.message || e); note.classList.add('err'); }
  }
}

async function deleteReview(id){
  if (!confirm('Удалить отзыв?')) return;
  try {
    await api('/reviews/' + id, { method: 'DELETE' });
    if (currentProduct) await loadReviews(currentProduct.id);
  } catch (e){ showToast('Ошибка: ' + (e.message || e), 'error'); }
}

/* Похожие товары */
async function loadRelated(productId){
  const track = document.getElementById('related-track');
  if (!track) return;
  try {
    const items = await api('/products/' + productId + '/related');
    if (!items.length){
      track.innerHTML = '<div class="reviews-empty">Нет похожих товаров</div>';
      return;
    }
    track.innerHTML = items.map(productCardHtml).join('');
    currentRelatedOffset = 0;
  } catch (e){
    track.innerHTML = '';
  }
}

function scrollRelated(dir){
  const track = document.getElementById('related-track');
  if (!track) return;
  const step = track.clientWidth * 0.8;
  track.scrollBy({ left: dir * step, behavior: 'smooth' });
}

/* Обновлённый рендер страницы товара (вызывается из openProduct) */
function renderProductExtras(){
  if (!currentProduct) return;
  // Аккордеон: описание и характеристики
  const d = document.getElementById('pv-description');
  if (d) d.textContent = currentProduct.description || 'Описание не указано.';
  const specs = document.getElementById('pv-specs');
  if (specs){
    const rows = [];
    if (currentProduct.brand)    rows.push(['Бренд', currentProduct.brand.name]);
    if (currentProduct.category) rows.push(['Категория', currentProduct.category.name]);
    if (Array.isArray(currentProduct.sizes) && currentProduct.sizes.length)
      rows.push(['Размеры', currentProduct.sizes.join(', ')]);
    rows.push(['Артикул', '#' + currentProduct.id]);
    specs.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
      rows.map(function(r){ return '<tr><td style="padding:6px 0;color:#999;width:120px;">' + r[0] + '</td><td style="padding:6px 0;">' + r[1] + '</td></tr>'; }).join('') +
    '</table>';
  }
  // Отзывы и похожие
  loadReviews(currentProduct.id);
  loadRelated(currentProduct.id);

  // Форма отзыва — доступность по токену
  const note = document.getElementById('review-note');
  const token = (typeof authToken !== 'undefined' && authToken) ? authToken : null;
  if (note){
    if (token){ note.textContent = ''; note.classList.remove('err'); }
    else { note.textContent = 'Войдите, чтобы оставить отзыв'; }
  }
}

document.addEventListener('DOMContentLoaded', function(){
  initReviewStars();
  // перехватываем openProduct — оборачиваем
  if (typeof window.openProduct === 'function' && !window.__openProductWrapped){
    const orig = window.openProduct;
    window.openProduct = function(id){
      const r = orig.apply(this, arguments);
      try { renderProductExtras(); } catch(e){ console.error(e); }
      return r;
    };
    window.__openProductWrapped = true;
  }
});
window.toggleAccordion = toggleAccordion;
window.submitReview = submitReview;
window.deleteReview = deleteReview;
window.scrollRelated = scrollRelated;
/* === PRODUCT UPGRADE (end) === */

/* === SKU + SPECS (start) === */
function addSpecRow(key, val) {
  const list = document.getElementById('f-specs-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'specs-row';
  row.innerHTML =
    '<input type="text" class="specs-key" placeholder="Характеристика" value="' + (key || '').replace(/"/g,'&quot;') + '">' +
    '<input type="text" class="specs-val" placeholder="Значение" value="' + (val || '').replace(/"/g,'&quot;') + '">' +
    '<button type="button" class="specs-del" onclick="this.parentNode.remove()">✕</button>';
  list.appendChild(row);
}

function collectSpecs() {
  const list = document.getElementById('f-specs-list');
  if (!list) return [];
  const out = [];
  list.querySelectorAll('.specs-row').forEach(function(row){
    const k = (row.querySelector('.specs-key')?.value || '').trim();
    const v = (row.querySelector('.specs-val')?.value || '').trim();
    if (k) out.push({ key: k, value: v });
  });
  return out;
}

function fillSpecs(arr) {
  const list = document.getElementById('f-specs-list');
  if (!list) return;
  list.innerHTML = '';
  if (!Array.isArray(arr)) arr = [];
  arr.forEach(function(sp){ addSpecRow(sp.key, sp.value); });
}

window.addSpecRow = addSpecRow;
/* === SKU + SPECS (end) === */

/* === MY ORDERS + FOOTER + CHAT (start) === */
const ORDER_STATUS_LABELS = window.ORDER_STATUS_LABELS || {
  new: 'Новый',
  processing: 'В обработке',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён'
};

/* Красивый рендер "Мои заказы" */
window.renderMyOrders = function(myOrders) {
  const box = document.getElementById('my-orders-content');
  if (!box) return;
  if (!myOrders.length) {
    box.innerHTML =
      '<div class="cart-empty" style="text-align:center;padding:60px 20px;">' +
        '<div style="font-size:52px;margin-bottom:16px;">📦</div>' +
        '<p style="color:#888;margin-bottom:24px;">У вас пока нет заказов</p>' +
        '<button class="btn" onclick="showCatalog()">Перейти в каталог</button>' +
      '</div>';
    return;
  }
  box.innerHTML = myOrders.map(function(o){
    const status = o.status || 'new';
    const statusLabel = ORDER_STATUS_LABELS[status] || status;
    const statusCls = ORDER_STATUS_CLASSES[status] || 'order-status--new';
    const date = new Date((o.created_at || '').replace(' ','T') + 'Z').toLocaleString('ru-RU', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

    const itemsHtml = (o.items || []).map(function(it){
      const img = it.img || (it.images && it.images[0]) || '';
      return '<div class="order-item">' +
        (img ? '<img class="order-item__img" src="' + img + '" alt="">' : '<div class="order-item__img" style="display:flex;align-items:center;justify-content:center;font-size:20px;">👕</div>') +
        '<div class="order-item__body">' +
          '<div class="order-item__name">' + (it.name || '') + '</div>' +
          '<div class="order-item__meta">Размер: ' + (it.size || '—') + ' • Кол-во: ' + (it.qty || 1) + '</div>' +
        '</div>' +
        '<div class="order-item__price">' + ((it.price || 0) * (it.qty || 1)).toLocaleString('ru-RU') + ' ₽</div>' +
      '</div>';
    }).join('');

    return '<div class="order-card">' +
      '<div class="order-card__head">' +
        '<div>' +
          '<div class="order-card__id">Заказ №' + o.id + '</div>' +
          '<div class="order-card__date">' + date + '</div>' +
        '</div>' +
        '<span class="order-status ' + statusCls + '">' + statusLabel + '</span>' +
      '</div>' +
      '<div class="order-items">' + itemsHtml + '</div>' +
      '<div class="order-card__foot">' +
        '<div class="order-total"><span>Итого</span>' + (o.total || 0).toLocaleString('ru-RU') + ' ₽</div>' +
        '<div class="order-actions">' +
          '<button class="btn-chat" onclick="openChatForOrder(' + o.id + ')">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
            'Связаться с продавцом' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};

/* Обёртка showMyOrders */
(function(){
  if (typeof window.showMyOrders === 'function' && !window.__showMyOrdersWrapped) {
    const orig = window.showMyOrders;
    window.showMyOrders = async function(){
      await orig.apply(this, arguments);
      // после отрисовки — перерисуем в новом стиле
      const box = document.getElementById('my-orders-content');
      if (!box || !currentUser) return;
      try {
        const myOrders = await api('/orders/my');
        window.renderMyOrders(myOrders);
      } catch(e){}
    };
    window.__showMyOrdersWrapped = true;
  }
})();

/* === Юридические модалки === */
const LEGAL_TEXTS = {
  privacy: {
    title: 'Политика конфиденциальности',
    html: '<p>Настоящая Политика конфиденциальности описывает, как интернет-магазин Vamp Shmot (далее — «Магазин») собирает, использует и защищает персональные данные пользователей сайта.</p>' +
          '<h3>1. Какие данные мы собираем</h3>' +
          '<ul><li>Имя и контактные данные (телефон, email)</li><li>Адрес доставки</li><li>История заказов</li><li>Технические данные (IP, cookies)</li></ul>' +
          '<h3>2. Как мы используем данные</h3>' +
          '<ul><li>Оформление и доставка заказов</li><li>Связь с покупателем по вопросам заказа</li><li>Улучшение работы сайта</li></ul>' +
          '<h3>3. Защита данных</h3>' +
          '<p>Мы принимаем необходимые меры для защиты персональных данных от несанкционированного доступа. Данные не передаются третьим лицам, кроме служб доставки.</p>' +
          '<h3>4. Ваши права</h3>' +
          '<p>Вы можете запросить удаление или изменение своих данных, обратившись по контактам, указанным в футере.</p>'
  },
  terms: {
    title: 'Пользовательское соглашение',
    html: '<p>Используя сайт Vamp Shmot, вы соглашаетесь с условиями настоящего соглашения.</p>' +
          '<h3>1. Общие положения</h3>' +
          '<p>Сайт является интернет-магазином одежды и аксессуаров. Все товары представлены в ознакомительных целях и могут быть изменены.</p>' +
          '<h3>2. Оформление заказа</h3>' +
          '<ul><li>Заказ считается оформленным после подтверждения продавцом</li><li>Цены указаны в рублях и могут меняться</li><li>Продавец вправе отменить заказ при отсутствии товара</li></ul>' +
          '<h3>3. Ответственность</h3>' +
          '<p>Магазин не несёт ответственности за задержки доставки по вине третьих лиц (почтовых служб).</p>'
  },
  return: {
    title: 'Возврат и обмен',
    html: '<h3>Условия возврата</h3>' +
          '<p>Вы можете вернуть или обменять товар в течение 14 дней с момента получения, если:</p>' +
          '<ul><li>товар не был в использовании</li><li>сохранены бирки и упаковка</li><li>есть подтверждение покупки</li></ul>' +
          '<h3>Как вернуть</h3>' +
          '<p>Свяжитесь с продавцом через Telegram или по телефону, указанному в футере. Мы согласуем способ возврата.</p>' +
          '<h3>Возврат денег</h3>' +
          '<p>Деньги возвращаются в течение 3–10 рабочих дней после получения товара обратно.</p>'
  },
  delivery: {
    title: 'Доставка и оплата',
    html: '<h3>Доставка</h3>' +
          '<ul><li>По Мариуполю — бесплатно</li><li>По России — от 3 до 7 дней, стоимость рассчитывается индивидуально</li><li>Самовывоз: Центральный рынок, Мариуполь</li></ul>' +
          '<h3>Оплата</h3>' +
          '<ul><li>Наличными при получении</li><li>Переводом на карту</li><li>Через СБП</li></ul>' +
          '<p>По вопросам доставки — @yulya_lavrinenko</p>'
  }
};

window.openLegal = function(key){
  const t = LEGAL_TEXTS[key];
  if (!t) return;
  document.getElementById('legal-title').textContent = t.title;
  document.getElementById('legal-body').innerHTML = t.html;
  document.getElementById('legal-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};
window.closeLegal = function(){
  document.getElementById('legal-modal').classList.remove('open');
  document.body.style.overflow = '';
};

/* === ЧАТ (SSE) === */
let chatState = { chatId: null, es: null, open: false, unread: 0, loading: false };

async function loadMyChat(){
  if (!authToken) return null;
  try {
    const r = await api('/chats/me');
    chatState.chatId = r.chat.id;
    chatState.unread = r.unread || 0;
    updateChatUnread();
    return r.chat;
  } catch (e){ return null; }
}

function updateChatUnread(){
  const el = document.getElementById('chat-unread');
  if (!el) return;
  if (chatState.unread > 0){
    el.style.display = 'inline-block';
    el.textContent = chatState.unread > 99 ? '99+' : chatState.unread;
  } else {
    el.style.display = 'none';
  }
}

async function loadChatMessages(){
  if (!chatState.chatId) return;
  const body = document.getElementById('chat-body');
  if (!body) return;
  try {
    const list = await api('/chats/' + chatState.chatId + '/messages');
    body.innerHTML = list.map(renderChatMessage).join('') ||
      '<div style="text-align:center;color:#999;font-size:13px;padding:20px;">Напишите первым 👋</div>';
    body.scrollTop = body.scrollHeight;
    chatState.unread = 0;
    updateChatUnread();
  } catch (e){}
}


function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


window.toggleChat = async function(force){
  const win = document.getElementById('chat-window');
  const icoOpen = document.querySelector('.chat-ico--open');
  const icoClose = document.querySelector('.chat-ico--close');
  const widget = document.getElementById('chat-widget');
  if (!win) return;

  const willOpen = (typeof force === 'boolean') ? force : !chatState.open;
  chatState.open = willOpen;
  win.classList.toggle('open', willOpen);
  if (icoOpen)  icoOpen.style.display  = willOpen ? 'none' : 'block';
  if (icoClose) icoClose.style.display = willOpen ? 'block' : 'none';

  // если не авторизован — показать "войдите"
  if (widget){
    if (!authToken) widget.classList.add('chat-widget--locked');
    else widget.classList.remove('chat-widget--locked');
  }

  if (!willOpen) return;
  if (!authToken) return;

  if (!chatState.chatId){
    await loadMyChat();
  }
  if (chatState.chatId){
    await loadChatMessages();
    connectChatSSE();
  }
};

window.openChatForOrder = function(orderId){
  if (!currentUser){ openAuthModal(); return; }
  toggleChat(true);
};


/* Загрузка непрочитанных при старте */
document.addEventListener('DOMContentLoaded', function(){
  // Периодически проверяем непрочитанные (fallback, если SSE не подключён)
  setInterval(async function(){
    if (!authToken) return;
    try {
      const r = await api('/chats/me/unread');
      if (!chatState.open && r.unread > 0){
        chatState.unread = r.unread;
        updateChatUnread();
      }
    } catch(e){}
  }, 15000);
});

window.renderMyOrders = window.renderMyOrders;
/* === MY ORDERS + FOOTER + CHAT (end) === */


/* === ORDER STATUS SAFE (auto-fix) === */
window.ORDER_STATUS_LABELS = window.ORDER_STATUS_LABELS || {
  new: 'Новый',
  processing: 'В обработке',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён'
};
window.ORDER_STATUS_CLASSES = window.ORDER_STATUS_CLASSES || {
  new: 'order-status--new',
  processing: 'order-status--processing',
  shipped: 'order-status--shipped',
  delivered: 'order-status--delivered',
  cancelled: 'order-status--cancelled'
};
/* === ORDER STATUS SAFE (end) === */

/* === ADMIN CHATS (start) === */
let adminChatState = { chats: [], activeChatId: null, es: null, pollTimer: null };

async function loadAdminChats(){
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    adminChatState.chats = await api('/chats');
    renderAdminChatsList();
    updateAdminChatBadge();
  } catch(e){ console.error('loadAdminChats:', e); }
}

function updateAdminChatBadge(){
  const total = (adminChatState.chats || []).reduce(function(s,c){ return s + (c.unread || 0); }, 0);
  const badge = document.getElementById('admin-chat-badge');
  if (badge){
    if (total > 0){ badge.style.display = 'inline-block'; badge.textContent = total; }
    else { badge.style.display = 'none'; }
  }
}

function renderAdminChatsList(){
  const box = document.getElementById('admin-chats-list-body');
  if (!box) return;
  if (!adminChatState.chats.length){
    box.innerHTML = '<div class="admin-chats-empty">Пока нет диалогов</div>';
    return;
  }
  box.innerHTML = adminChatState.chats.map(function(c){
    const active = c.id === adminChatState.activeChatId ? ' active' : '';
    const unread = c.unread > 0 ? '<span class="admin-chat-item__badge">' + c.unread + '</span>' : '';
    const preview = (c.last_text || 'Нет сообщений').slice(0, 60);
    return '<div class="admin-chat-item' + active + '" onclick="openAdminChat(' + c.id + ')">' +
      '<div class="admin-chat-item__main">' +
        '<div class="admin-chat-item__name">' + escapeHtml(c.user_name || ('Клиент #' + c.user_id)) + '</div>' +
        '<div class="admin-chat-item__preview">' + escapeHtml(preview) + '</div>' +
      '</div>' +
      unread +
    '</div>';
  }).join('');
}

async function openAdminChat(chatId){
  adminChatState.activeChatId = chatId;
  const chat = adminChatState.chats.find(function(c){ return c.id === chatId; });
  document.getElementById('admin-chats-empty').style.display = 'none';
  document.getElementById('admin-chats-active').style.display = 'flex';
  document.getElementById('admin-chat-name').textContent = chat ? (chat.user_name || ('Клиент #' + chat.user_id)) : '—';
  await loadAdminChatMessages(chatId);
  renderAdminChatsList();
  // SSE
  if (adminChatState.es){ try { adminChatState.es.close(); } catch(e){} adminChatState.es = null; }
  connectAdminChatSSE(chatId);
}

async function loadAdminChatMessages(chatId){
  const body = document.getElementById('admin-chat-body');
  if (!body) return;
  try {
    const list = await api('/chats/' + chatId + '/messages');
    body.innerHTML = list.length ? list.map(renderAdminChatMessage).join('') : '<div class="admin-chats-empty">Нет сообщений</div>';
    body.scrollTop = body.scrollHeight;
    // обновить счётчик непрочитанных
    const chat = adminChatState.chats.find(function(c){ return c.id === chatId; });
    if (chat){ chat.unread = 0; updateAdminChatBadge(); }
    renderAdminChatsList();
  } catch(e){ console.error(e); }
}




// Обёртка switchAdminTab — при переходе на chats загружаем список
(function(){
  if (typeof window.switchAdminTab === 'function' && !window.__switchAdminTabWrapped){
    const orig = window.switchAdminTab;
    window.switchAdminTab = function(tab, btn){
      orig.apply(this, arguments);
      if (tab === 'chats'){
        loadAdminChats();
      }
    };
    window.__switchAdminTabWrapped = true;
  }
})();

// Периодически обновляем список чатов (fallback)
document.addEventListener('DOMContentLoaded', function(){
  setInterval(function(){
    if (currentUser && currentUser.role === 'admin'){
      // грузим только если активна вкладка чатов или есть непрочитанные
      const sec = document.getElementById('admin-chats');
      if (sec && sec.classList.contains('active')) loadAdminChats();
    }
  }, 15000);
});

window.loadAdminChats = loadAdminChats;
window.openAdminChat = openAdminChat;
/* === ADMIN CHATS (end) === */

/* === CHAT FIX (start) === */

/* Универсальный рендер: автор + время + разные цвета */
function renderChatMsg(m, viewerRole){
  const meId = currentUser && currentUser.id;
  const isMine = m.sender_id === meId;
  const isAdminMsg = m.sender_role === 'admin';

  // Кто автор (для подписи)
  let author = '';
  if (isMine) author = 'Вы';
  else if (viewerRole === 'admin') author = 'Клиент';
  else author = 'Продавец';

  // Стиль
  const cls = isMine ? 'chat-msg--me' : 'chat-msg--them';

  const time = new Date((m.created_at || '').replace(' ','T') + 'Z')
    .toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' });

  return '<div class="chat-msg ' + cls + '">' +
    '<div class="chat-msg__author">' + escapeHtml(author) + '</div>' +
    '<div>' + escapeHtml(m.text) + '</div>' +
    '<span class="chat-msg__time">' + time + '</span>' +
  '</div>';
}

/* Заменить renderChatMessage и renderAdminChatMessage на общий */
window.renderChatMessage = function(m){ return renderChatMsg(m, 'user'); };
window.renderAdminChatMessage = function(m){ return renderChatMsg(m, 'admin'); };

/* === КЛИЕНТ: SSE + обновление === */
function connectChatSSE(){
  if (!chatState.chatId || !authToken) return;
  if (chatState.es){ try { chatState.es.close(); } catch(e){} }
  const url = '/api/chats/' + chatState.chatId + '/stream?token=' + encodeURIComponent(authToken);
  const es = new EventSource(url);
  es.onmessage = function(ev){
    try {
      const p = JSON.parse(ev.data);
      if (p.type === 'message'){
        addChatMessageToUI(p.message, 'user');
      }
    } catch(e){}
  };
  es.onerror = function(){
    es.close();
    chatState.es = null;
    setTimeout(function(){ if (authToken) connectChatSSE(); }, 3000);
  };
  chatState.es = es;
}

/* Добавляем сообщение в UI клиента */
function addChatMessageToUI(m, role){
  const body = document.getElementById('chat-body');
  if (!body) return;
  // защита от дубликатов
  if (body.querySelector('[data-msg-id="' + m.id + '"]')) return;
  const html = '<div data-msg-id="' + m.id + '">' + renderChatMsg(m, role) + '</div>';
  body.insertAdjacentHTML('beforeend', html);
  body.scrollTop = body.scrollHeight;

  const isMine = currentUser && m.sender_id === currentUser.id;
  if (!isMine && !chatState.open){
    chatState.unread++;
    updateChatUnread();
    playChatBeep();
  }
}

/* === АДМИН: SSE + обновление === */
function connectAdminChatSSE(chatId){
  if (!authToken) return;
  if (adminChatState.es){ try { adminChatState.es.close(); } catch(e){} }
  const url = '/api/chats/' + chatId + '/stream?token=' + encodeURIComponent(authToken);
  const es = new EventSource(url);
  es.onmessage = function(ev){
    try {
      const p = JSON.parse(ev.data);
      if (p.type === 'message'){
        addAdminChatMessageToUI(p.message);
        const chat = adminChatState.chats.find(function(c){ return c.id === chatId; });
        if (chat){ chat.last_text = p.message.text; chat.last_message_at = p.message.created_at; }
        renderAdminChatsList();
      }
    } catch(e){}
  };
  es.onerror = function(){
    es.close();
    adminChatState.es = null;
    setTimeout(function(){
      if (adminChatState.activeChatId === chatId) connectAdminChatSSE(chatId);
    }, 3000);
  };
  adminChatState.es = es;
}

function addAdminChatMessageToUI(m){
  const body = document.getElementById('admin-chat-body');
  if (!body) return;
  if (body.querySelector('[data-msg-id="' + m.id + '"]')) return;
  const html = '<div data-msg-id="' + m.id + '">' + renderChatMsg(m, 'admin') + '</div>';
  body.insertAdjacentHTML('beforeend', html);
  body.scrollTop = body.scrollHeight;

  const isMine = currentUser && m.sender_id === currentUser.id;
  if (!isMine){
    const chat = adminChatState.chats.find(function(c){ return c.id === adminChatState.activeChatId; });
    if (chat && chat.id !== adminChatState.activeChatId){ chat.unread = (chat.unread||0)+1; updateAdminChatBadge(); }
    playChatBeep();
  }
}

/* Простой звук "бип" через Web Audio (без файла) */
function playChatBeep(){
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    o.start();
    o.stop(ctx.currentTime + 0.22);
  } catch(e){}
}

/* === Отправка сообщения (клиент) === */
/* === Отправка сообщения (админ) === */
/* === Обеспечиваем переподключение SSE при открытии чата === */
(function(){
  // клиент
  if (typeof window.toggleChat === 'function' && !window.__toggleChatWrapped){
    const orig = window.toggleChat;
    window.toggleChat = async function(force){
      await orig.apply(this, arguments);
      if (chatState.open && chatState.chatId){
        connectChatSSE();
      }
    };
    window.__toggleChatWrapped = true;
  }
  // админ
  if (typeof window.openAdminChat === 'function' && !window.__openAdminChatWrapped){
    const orig = window.openAdminChat;
    window.openAdminChat = async function(id){
      await orig.apply(this, arguments);
      connectAdminChatSSE(id);
    };
    window.__openAdminChatWrapped = true;
  }
})();

/* === Дополнительный fallback: опрос каждые 4 сек === */
setInterval(function(){
  // клиент
  if (chatState.open && chatState.chatId){
    api('/chats/' + chatState.chatId + '/messages').then(function(list){
      const body = document.getElementById('chat-body');
      if (!body) return;
      // если пришло больше, чем отображено — перерисуем
      const rendered = body.querySelectorAll('[data-msg-id]').length;
      if (list.length !== rendered){
        body.innerHTML = list.length ? list.map(function(m){
          return '<div data-msg-id="' + m.id + '">' + renderChatMsg(m, 'user') + '</div>';
        }).join('') : '<div style="text-align:center;color:#999;font-size:13px;padding:20px;">Напишите первым 👋</div>';
        body.scrollTop = body.scrollHeight;
      }
    }).catch(function(){});
  }
  // админ
  const adminActive = document.getElementById('admin-chats-active');
  if (adminActive && adminActive.style.display !== 'none' && adminChatState.activeChatId){
    api('/chats/' + adminChatState.activeChatId + '/messages').then(function(list){
      const body = document.getElementById('admin-chat-body');
      if (!body) return;
      const rendered = body.querySelectorAll('[data-msg-id]').length;
      if (list.length !== rendered){
        body.innerHTML = list.length ? list.map(function(m){
          return '<div data-msg-id="' + m.id + '">' + renderChatMsg(m, 'admin') + '</div>';
        }).join('') : '<div class="admin-chats-empty">Нет сообщений</div>';
        body.scrollTop = body.scrollHeight;
      }
    }).catch(function(){});
  }
}, 4000);

/* === Уведомление о новых чатах админу (раз в 10 сек) === */
setInterval(function(){
  if (currentUser && currentUser.role === 'admin'){
    loadAdminChats().catch(function(){});
  }
}, 10000);

/* Переписываем loadAdminChatMessages и loadChatMessages, чтобы ставить data-msg-id */
window.loadAdminChatMessages = async function(chatId){
  const body = document.getElementById('admin-chat-body');
  if (!body) return;
  try {
    const list = await api('/chats/' + chatId + '/messages');
    body.innerHTML = list.length ? list.map(function(m){
      return '<div data-msg-id="' + m.id + '">' + renderChatMsg(m, 'admin') + '</div>';
    }).join('') : '<div class="admin-chats-empty">Нет сообщений</div>';
    body.scrollTop = body.scrollHeight;
    const chat = adminChatState.chats.find(function(c){ return c.id === chatId; });
    if (chat){ chat.unread = 0; updateAdminChatBadge(); }
    renderAdminChatsList();
  } catch(e){ console.error(e); }
};

window.loadChatMessages = async function(){
  if (!chatState.chatId) return;
  const body = document.getElementById('chat-body');
  if (!body) return;
  try {
    const list = await api('/chats/' + chatState.chatId + '/messages');
    body.innerHTML = list.length ? list.map(function(m){
      return '<div data-msg-id="' + m.id + '">' + renderChatMsg(m, 'user') + '</div>';
    }).join('') : '<div style="text-align:center;color:#999;font-size:13px;padding:20px;">Напишите первым 👋</div>';
    body.scrollTop = body.scrollHeight;
    chatState.unread = 0;
    updateChatUnread();
  } catch(e){}
};

/* Экспорт */
window.connectChatSSE = connectChatSSE;
window.connectAdminChatSSE = connectAdminChatSSE;
window.renderChatMsg = renderChatMsg;
/* === CHAT FIX (end) === */

/* === CHAT SEND — FINAL (start) === */
(function(){
  function getTextAndClear(inputId){
    const el = document.getElementById(inputId);
    if (!el) return null;
    const text = (el.value || '').trim();
    if (!text) return null;
    el.value = '';
    return text;
  }

  async function doSendClient(text){
    if (!chatState.chatId) { try { await loadMyChat(); } catch(e){} }
    if (!chatState.chatId) { showToast('Чат не найден', 'error'); return; }
    try {
      const msg = await api('/chats/' + chatState.chatId + '/messages', {
        method: 'POST',
        body: JSON.stringify({ text: text })
      });
      if (typeof addChatMessageToUI === 'function') addChatMessageToUI(msg, 'user');
    } catch(e){ showToast('Ошибка: ' + (e.message || e), 'error'); }
  }

  async function doSendAdmin(text){
    if (!adminChatState.activeChatId) { showToast('Выберите диалог', 'error'); return; }
    try {
      const msg = await api('/chats/' + adminChatState.activeChatId + '/messages', {
        method: 'POST',
        body: JSON.stringify({ text: text })
      });
      if (typeof addAdminChatMessageToUI === 'function') addAdminChatMessageToUI(msg);
    } catch(e){ showToast('Ошибка: ' + (e.message || e), 'error'); }
  }

  // Единый обработчик submit — preventDefault ПЕРВЫМ делом
  function onClientSubmit(e){
    e.preventDefault();
    e.stopPropagation();
    const text = getTextAndClear('chat-input');
    if (text) doSendClient(text);
    return false;
  }
  function onAdminSubmit(e){
    e.preventDefault();
    e.stopPropagation();
    const text = getTextAndClear('admin-chat-input');
    if (text) doSendAdmin(text);
    return false;
  }

  // Привязка
  function bind(){
    const cf = document.getElementById('chat-form');
    if (cf && !cf.__chatBound){
      cf.addEventListener('submit', onClientSubmit);
      cf.__chatBound = true;
      console.log('[chat] форма клиента привязана');
    }
    const af = document.getElementById('admin-chat-form') ||
               document.querySelector('form.admin-chats-room__form');
    if (af){
      if (!af.id) af.id = 'admin-chat-form';
      if (!af.__chatBound){
        af.addEventListener('submit', onAdminSubmit);
        af.__chatBound = true;
        console.log('[chat] форма админа привязана');
      }
    }
    // Enter в полях
    const ci = document.getElementById('chat-input');
    if (ci && !ci.__enterBound){
      ci.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && !e.shiftKey){
          e.preventDefault();
          const text = getTextAndClear('chat-input');
          if (text) doSendClient(text);
        }
      });
      ci.__enterBound = true;
    }
    const ai = document.getElementById('admin-chat-input');
    if (ai && !ai.__enterBound){
      ai.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && !e.shiftKey){
          e.preventDefault();
          const text = getTextAndClear('admin-chat-input');
          if (text) doSendAdmin(text);
        }
      });
      ai.__enterBound = true;
    }
  }

  // Экспорт (для onclick в HTML, если где-то остался)
  window.sendChatMessage = function(ev){
    if (ev && ev.preventDefault) ev.preventDefault();
    const text = getTextAndClear('chat-input');
    if (text) doSendClient(text);
    return false;
  };
  window.sendAdminChatMessage = function(ev){
    if (ev && ev.preventDefault) ev.preventDefault();
    const text = getTextAndClear('admin-chat-input');
    if (text) doSendAdmin(text);
    return false;
  };

  // Привязываем сразу + периодически
  document.addEventListener('DOMContentLoaded', function(){
    bind();
    setTimeout(bind, 300);
    setTimeout(bind, 1000);
    setTimeout(bind, 2500);
  });

  // Периодически (на случай, если формы появляются позже)
  setInterval(bind, 3000);

  window.bindChatForms = bind;
})();
/* === CHAT SEND — FINAL (end) === */
