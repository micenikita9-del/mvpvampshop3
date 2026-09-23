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

const ORDER_STATUS_LABELS = {
    new: 'Новый',
    processing: 'В обработке',
    shipped: 'Отправлен',
    done: 'Выполнен',
    cancelled: 'Отменён'
};

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
                return '<span class="badge-item" style="background:' + (b.color || '#111') + ';color:' + (b.text_color || '#fff') + ';">' + (b.label || '') + '</span>';
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
            '<td>' + p.name + '</td>' +
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
    const payload = {
        name: name, price: price, description: desc, sizes: sizes, images: images,
        brand_id: brand_id ? parseInt(brand_id) : null,
        category_id: category_id ? parseInt(category_id) : null,
        discount: discount,
        stock: stock,
        stock_status: stock_status
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
    ['edit-id','f-name','f-price','f-desc','f-sizes','f-img-url'].forEach(function(i) {
        const el = document.getElementById(i); if (el) el.value = '';
    });
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
