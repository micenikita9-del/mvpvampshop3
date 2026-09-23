const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');

/* Загрузчик .env */
(function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const s = line.trim();
        if (!s || s.startsWith('#')) continue;
        const i = s.indexOf('=');
        if (i === -1) continue;
        const key = s.slice(0, i).trim();
        let val = s.slice(i + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = val;
    }
})();

const app = express();
function generateSku(name, categoryId) {
    // префикс: 2-4 буквы из категории или из названия
    let prefix = 'VAMP';
    try {
        if (categoryId) {
            const c = db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId);
            if (c && c.name) {
                prefix = c.name.replace(/[^A-Za-zА-Яа-я]/g, '').slice(0,3).toUpperCase();
                if (!prefix) prefix = 'VAMP';
            }
        }
    } catch(e){}
    // номер: последний sku с таким префиксом + 1
    let n = 1;
    try {
        const last = db.prepare("SELECT sku FROM products WHERE sku LIKE ? ORDER BY id DESC LIMIT 1").get(prefix + '-%');
        if (last && last.sku) {
            const m = last.sku.match(/-(\d+)$/);
            if (m) n = parseInt(m[1], 10) + 1;
        } else {
            n = db.prepare('SELECT COUNT(*) as c FROM products').get().c + 1;
        }
    } catch(e){}
    return prefix + '-' + String(n).padStart(4, '0');
}

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vamp-shmot-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || '1276689';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || '';
if (!process.env.JWT_SECRET) {
    console.warn('ВНИМАНИЕ: используется секрет по умолчанию. Задайте JWT_SECRET в .env для продакшена.');
}

const db = new DatabaseSync(path.join(__dirname, 'database.db'));

/* ============================================================
   ТАБЛИЦЫ
   ============================================================ */
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        logo TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        description TEXT,
        sizes TEXT DEFAULT '[]',
        images TEXT DEFAULT '[]',
        brand_id INTEGER,
        category_id INTEGER,
        discount INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        icon TEXT DEFAULT '',
        color TEXT DEFAULT '#111111',
        text_color TEXT DEFAULT '#ffffff',
        auto INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS product_badges (
        product_id INTEGER NOT NULL,
        badge_id INTEGER NOT NULL,
        PRIMARY KEY (product_id, badge_id)
    );
    CREATE TABLE IF NOT EXISTS slides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        img TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        customer_name TEXT,
        phone TEXT,
        address TEXT,
        comment TEXT,
        items TEXT,
        total INTEGER,
        status TEXT DEFAULT 'new',
        created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        user_id INTEGER,
        user_name TEXT NOT NULL,
        rating INTEGER DEFAULT 5,
        text TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        user_name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        last_message_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        sender_role TEXT DEFAULT 'user',
        text TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        phone TEXT,
        email TEXT,
        address TEXT,
        instagram TEXT,
        telegram TEXT,
        whatsapp TEXT,
        work_hours TEXT
    );
`);

/* ============================================================
   МИГРАЦИИ
   ============================================================ */
try {
    const cols = db.prepare("PRAGMA table_info(products)").all();
    const names = cols.map(c => c.name);
    if (!names.includes('brand_id')) {
        db.exec('ALTER TABLE products ADD COLUMN brand_id INTEGER');
        console.log('Миграция: +brand_id');
    }
    if (!names.includes('category_id')) {
        db.exec('ALTER TABLE products ADD COLUMN category_id INTEGER');
        console.log('Миграция: +category_id');
    }
    if (!names.includes('discount')) {
        db.exec('ALTER TABLE products ADD COLUMN discount INTEGER DEFAULT 0');
        db.exec('ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0');
        db.exec("ALTER TABLE products ADD COLUMN stock_status TEXT DEFAULT 'in_stock'");
        console.log('Миграция: +discount');
    }
} catch (e) { console.error(e); }

/* ============================================================
   НАЧАЛЬНЫЕ ДАННЫЕ
   ============================================================ */
{
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin');
    if (!admin) {
        const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
        db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
          .run('Администратор', 'admin', hash, 'admin');
        console.log('Админ: admin / ' + ADMIN_PASSWORD);
    }
}

/* Категории */
{
    const count = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)');
        const cats = [
            ['Верхняя одежда', 'verhnyaya-odezhda', 1],
            ['Толстовки', 'tolstovki', 2],
            ['Кофты', 'kofty', 3],
            ['Рубашки', 'rubashki', 4],
            ['Футболки', 'futbolki', 5],
            ['Топы', 'topy', 6],
            ['Костюмы', 'kostyumy', 7],
            ['Штаны', 'shtany', 8],
            ['Шорты', 'shorty', 9],
            ['Аксессуары', 'aksessuary', 10]
        ];
        for (const c of cats) insert.run(c[0], c[1], c[2]);
        console.log('Добавлены категории');
    }
}

/* Бренды */
{
    const count = db.prepare('SELECT COUNT(*) as c FROM brands').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO brands (name, description, logo) VALUES (?, ?, ?)');
        insert.run('Vamp Shmot', 'Собственный бренд магазина', '');
        insert.run('Noir Atelier', 'Петербургский бренд кожаных изделий', '');
        insert.run('Moscow Dark', 'Московский бренд альтернативной одежды', '');
        console.log('Добавлены бренды');
    }
}

/* Товары */
{
    const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO products (name, price, description, sizes, images, brand_id, category_id, discount, stock, stock_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const defaults = [
            { name: "Кожаный плащ Ночная тень", price: 25000, description: "Длинный кожаный плащ.", sizes: ["S","M","L","XL"], images: ["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=1200"], brand: 1, cat: 1, disc: 0 },
            { name: "Чокер с шипами", price: 3500, description: "Кожаный чокер.", sizes: ["ONE SIZE"], images: ["https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=1200"], brand: 1, cat: 10, disc: 10 },
            { name: "Структурный корсет", price: 12000, description: "Корсет с вышивкой.", sizes: ["XS","S","M","L"], images: ["https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=1200"], brand: 2, cat: 6, disc: 0 },
            { name: "Длинные перчатки", price: 4500, description: "Кожаные перчатки.", sizes: ["S","M","L"], images: ["https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=1200"], brand: 2, cat: 10, disc: 15 },
            { name: "Юбка-макси", price: 8900, description: "Юбка в пол.", sizes: ["XS","S","M","L","XL"], images: ["https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?w=1200"], brand: 3, cat: 7, disc: 0 },
            { name: "Ботинки на платформе", price: 18000, description: "Высокие ботинки.", sizes: ["36","37","38","39","40","41"], images: ["https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=1200"], brand: 3, cat: 10, disc: 0 }
        ];
        for (const p of defaults) {
            insert.run(p.name, p.price, p.description, JSON.stringify(p.sizes), JSON.stringify(p.images), p.brand, p.cat, p.disc);
        }
        console.log('Добавлены товары');
    }
}

/* Слайды */
{
    const count = db.prepare('SELECT COUNT(*) as c FROM slides').get().c;
    if (count === 0) {
        const insert = db.prepare('INSERT INTO slides (img) VALUES (?)');
        [
            "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600",
            "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600",
            "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600"
        ].forEach(img => insert.run(img));
        console.log('Добавлены слайды');
    }
}

/* Бейджи по умолчанию */
{
    const cnt = db.prepare('SELECT COUNT(*) as c FROM badges').get().c;
    if (cnt === 0) {
        const insert = db.prepare('INSERT INTO badges (code, label, icon, color, text_color, auto, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
        insert.run('new_badge', 'Новинка', '✨', '#111111', '#ffffff', 1, 1);
        insert.run('coming_soon', 'Скоро в наличии', '⏳', '#b8860b', '#ffffff', 0, 2);
        insert.run('hit', 'Хит продаж', '🔥', '#8b0000', '#ffffff', 0, 3);
        insert.run('sale', 'Скидка', '🏷️', '#c0392b', '#ffffff', 1, 4);
        insert.run('recommended', 'Рекомендуем', '⭐', '#2d7a2d', '#ffffff', 0, 5);
        console.log('Добавлены бейджи по умолчанию');
    }
}

{
    const cnt = db.prepare('SELECT COUNT(*) as c FROM badges').get().c;
    if (cnt === 0) {
        const insert = db.prepare('INSERT INTO badges (code, label, icon, color, text_color, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
        insert.run('new_badge', 'Новинка', '✨', '#111111', '#ffffff', 1);
        insert.run('hit', 'Хит продаж', '🔥', '#8b0000', '#ffffff', 2);
        insert.run('sale', 'Скидка', '🏷️', '#c0392b', '#ffffff', 3);
        insert.run('recommended', 'Рекомендуем', '⭐', '#2d7a2d', '#ffffff', 4);
        insert.run('coming_soon', 'Скоро в наличии', '⏳', '#b8860b', '#ffffff', 5);
        insert.run('out_of_stock', 'Нет в наличии', '❌', '#555555', '#ffffff', 6);
        console.log('Добавлены бейджи по умолчанию');
    }
}

/* Контакты */
{
    const c = db.prepare('SELECT id FROM contacts WHERE id = 1').get();
    if (!c) {
        db.prepare(`INSERT INTO contacts (id, phone, email, address, instagram, telegram, whatsapp, work_hours)
                    VALUES (1, ?, ?, ?, ?, ?, ?, ?)`)
          .run('+7 (999) 123-45-67', 'info@vampshmot.ru', 'Москва, ул. Тверская, 1',
               '@vampshmot', '@vampshmot', '+79991234567', 'Пн–Вс: 10:00–22:00');
        console.log('Добавлены контакты');
    }
}

/* ============================================================
   ФАЙЛЫ
   ============================================================ */
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, 'img_' + Date.now() + '_' + Math.round(Math.random() * 1e9) + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Только изображения'));
    }
});

/* ============================================================
   MIDDLEWARE
   ============================================================ */
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'Нет токена' });
    try {
        req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Неверный токен' });
    }
}
function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Только для админа' });
    next();
}

/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email уже занят' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
                     .run(name, email, hash, 'user');
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user, token });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Заполните все поля' });
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ error: 'Неверный email или пароль' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at }, token });
});

app.get('/api/me', authMiddleware, (req, res) => {
    const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Не найден' });
    res.json(user);
});

app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
    res.json(db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC').all());
});

/* ============================================================
   БРЕНДЫ
   ============================================================ */
app.get('/api/brands', (req, res) => {
    res.json(db.prepare('SELECT * FROM brands ORDER BY name ASC').all());
});
app.get('/api/brands/:id', (req, res) => {
    const b = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
    if (!b) return res.status(404).json({ error: 'Бренд не найден' });
    res.json(b);
});
app.post('/api/brands', authMiddleware, adminMiddleware, (req, res) => {
    const { name, description, logo } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    const r = db.prepare('INSERT INTO brands (name, description, logo) VALUES (?, ?, ?)')
                .run(name, description || '', logo || '');
    res.json(db.prepare('SELECT * FROM brands WHERE id = ?').get(r.lastInsertRowid));
});
app.put('/api/brands/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { name, description, logo } = req.body;
    const existing = db.prepare('SELECT id FROM brands WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Бренд не найден' });
    db.prepare('UPDATE brands SET name = ?, description = ?, logo = ? WHERE id = ?')
      .run(name, description || '', logo || '', req.params.id);
    res.json(db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id));
});
app.delete('/api/brands/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Не найден' });
    res.json({ ok: true });
});

/* ============================================================
   КАТЕГОРИИ
   ============================================================ */
app.get('/api/categories', (req, res) => {
    res.json(db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all());
});

/* ============================================================
   БЕЙДЖИ
   ============================================================ */
app.get('/api/badges', (req, res) => {
    const rows = db.prepare('SELECT * FROM badges ORDER BY sort_order ASC, id ASC').all();
    res.json(rows);
});

app.post('/api/badges', authMiddleware, adminMiddleware, (req, res) => {
    const { code, label, icon, color, text_color, auto, sort_order } = req.body;
    if (!code || !label) return res.status(400).json({ error: 'Код и название обязательны' });
    try {
        const r = db.prepare('INSERT INTO badges (code, label, icon, color, text_color, auto, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
                    .run(code, label, icon || '', color || '#111111', text_color || '#ffffff', auto ? 1 : 0, sort_order || 0);
        res.json(db.prepare('SELECT * FROM badges WHERE id = ?').get(r.lastInsertRowid));
    } catch (e) {
        res.status(400).json({ error: 'Код уже существует или ошибка БД' });
    }
});

app.put('/api/badges/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { code, label, icon, color, text_color, auto, sort_order } = req.body;
    const existing = db.prepare('SELECT id FROM badges WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найден' });
    db.prepare('UPDATE badges SET code = ?, label = ?, icon = ?, color = ?, text_color = ?, auto = ?, sort_order = ? WHERE id = ?')
      .run(code, label, icon || '', color || '#111111', text_color || '#ffffff', auto ? 1 : 0, sort_order || 0, req.params.id);
    res.json(db.prepare('SELECT * FROM badges WHERE id = ?').get(req.params.id));
});

app.delete('/api/badges/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM badges WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Не найден' });
    db.prepare('DELETE FROM product_badges WHERE badge_id = ?').run(req.params.id);
    res.json({ ok: true });
});
/* ============================================================
   ТОВАРЫ
   ============================================================ */
function enrichProduct(p) {
    try {
        p.images = JSON.parse(p.images || '[]');
        p.sizes = JSON.parse(p.sizes || '[]');
        p.specs = JSON.parse(p.specs || '[]');
    } catch { p.images = []; p.sizes = []; }
    p.img = p.images[0] || '';
    if (p.brand_id) {
        const b = db.prepare('SELECT id, name FROM brands WHERE id = ?').get(p.brand_id);
        p.brand = b || null;
    } else {
        p.brand = null;
    }
    if (p.category_id) {
        const c = db.prepare('SELECT id, name, slug FROM categories WHERE id = ?').get(p.category_id);
        p.category = c || null;
    } else {
        p.category = null;
    }
    p.discount = p.discount || 0;
    // Итоговая цена со скидкой
    if (p.discount > 0) {
        p.final_price = Math.round(p.price * (1 - p.discount / 100));
    } else {
        p.final_price = p.price;
    }
    // Новинка — младше 30 дней
    const created = new Date(p.created_at + ' UTC');
    const days = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    p.is_new = days < 30;
    p.badges = [];
    try {
        const rows = db.prepare('SELECT b.* FROM badges b INNER JOIN product_badges pb ON pb.badge_id = b.id WHERE pb.product_id = ? ORDER BY b.sort_order ASC').all(p.id);
        p.badges = rows;
    } catch (e) {}
    if (p.is_new) {
        const nb = db.prepare("SELECT * FROM badges WHERE code = 'new_badge'").get();
        if (nb && !p.badges.find(x => x.code === 'new_badge')) p.badges.push(nb);
    }
    if (p.discount > 0) {
        const sb = db.prepare("SELECT * FROM badges WHERE code = 'sale'").get();
        if (sb && !p.badges.find(x => x.code === 'sale')) p.badges.push(sb);
    }
    if (p.stock_status === 'coming_soon') {
        const cb = db.prepare("SELECT * FROM badges WHERE code = 'coming_soon'").get();
        if (cb && !p.badges.find(x => x.code === 'coming_soon')) p.badges.push(cb);
    }
    if (p.stock_status === 'out_of_stock' || (p.stock === 0 && p.stock_status !== 'coming_soon')) {
        const ob = db.prepare("SELECT * FROM badges WHERE code = 'out_of_stock'").get();
        if (ob && !p.badges.find(x => x.code === 'out_of_stock')) p.badges.push(ob);
    }
    return p;
}

app.get('/api/products', (req, res) => {
    const { brand, category, sort } = req.query;
    let sql = 'SELECT * FROM products';
    const conditions = [];
    const params = [];
    if (brand) {
        conditions.push('brand_id = ?');
        params.push(brand);
    }
    if (category) {
        conditions.push('category_id = ?');
        params.push(category);
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');

    // Сортировка
    switch (sort) {
        case 'cheap':
            sql += ' ORDER BY (price * (100 - COALESCE(discount,0)) / 100) ASC';
            break;
        case 'expensive':
            sql += ' ORDER BY (price * (100 - COALESCE(discount,0)) / 100) DESC';
            break;
        case 'new':
            sql += ' ORDER BY id DESC';
            break;
        case 'discount':
            sql += ' ORDER BY COALESCE(discount,0) DESC, id DESC';
            break;
        case 'recommended':
        default:
            // Простая рекомендация: сначала скидки, потом новые
            sql += ' ORDER BY COALESCE(discount,0) DESC, id DESC';
            break;
    }

    const rows = db.prepare(sql).all(...params);
    res.json(rows.map(enrichProduct));
});

app.get('/api/products/:id', (req, res) => {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!p) return res.status(404).json({ error: 'Не найден' });
    res.json(enrichProduct(p));
});

app.post('/api/products', authMiddleware, adminMiddleware, (req, res) => {
    const { name, price, description, sizes, images, brand_id, category_id, discount, stock, stock_status, badge_ids } = req.body;
    if (!name || !price) return res.status(400).json({ error: 'Название и цена обязательны' });
    if (!images || !images.length) return res.status(400).json({ error: 'Добавьте фото' });
    const r = db.prepare('INSERT INTO products (name, price, description, sizes, images, brand_id, category_id, discount, stock, stock_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                .run(name, price, description || '', JSON.stringify(sizes || ['ONE SIZE']), JSON.stringify(images), brand_id || null, category_id || null, discount || 0, stock || 0, stock_status || 'in_stock');
    const newId = r.lastInsertRowid;
    try { if (badge_ids && badge_ids.length) { const stmt = db.prepare('INSERT OR IGNORE INTO product_badges (product_id, badge_id) VALUES (?, ?)'); for (const bid of badge_ids) stmt.run(newId, bid); } } catch (e) { console.error('badges insert:', e.message); }
    res.json(enrichProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(newId)));
});

app.put('/api/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { name, price, description, sizes, images, brand_id, category_id, discount, stock, stock_status, badge_ids, sku, specs } = req.body;
    const existing = db.prepare('SELECT id, sku FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найден' });
    let finalSku = (sku || '').trim();
    if (!finalSku) finalSku = existing.sku || generateSku(name, category_id);
    db.prepare('UPDATE products SET name = ?, price = ?, description = ?, sizes = ?, images = ?, brand_id = ?, category_id = ?, discount = ?, stock = ?, stock_status = ?, sku = ?, specs = ? WHERE id = ?')
      .run(name, price, description || '', JSON.stringify(sizes || ['ONE SIZE']), JSON.stringify(images || []), brand_id || null, category_id || null, discount || 0, stock || 0, stock_status || 'in_stock', finalSku, JSON.stringify(specs || []), req.params.id);
    try { db.prepare('DELETE FROM product_badges WHERE product_id = ?').run(req.params.id); if (badge_ids && badge_ids.length) { const stmt = db.prepare('INSERT OR IGNORE INTO product_badges (product_id, badge_id) VALUES (?, ?)'); for (const bid of badge_ids) stmt.run(req.params.id, bid); } } catch (e) { console.error('badges update:', e.message); }
    res.json(enrichProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
});

/* === REVIEWS (start) === */
app.get('/api/products/:id/reviews', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC').all(req.params.id);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products/:id/reviews', authMiddleware, (req, res) => {
    const { rating, text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Введите текст отзыва' });
    const r = parseInt(rating, 10) || 5;
    if (r < 1 || r > 5) return res.status(400).json({ error: 'Оценка от 1 до 5' });
    const userName = req.user.name || req.user.email || 'Пользователь';
    try {
        const ins = db.prepare('INSERT INTO reviews (product_id, user_id, user_name, rating, text) VALUES (?, ?, ?, ?, ?)')
          .run(req.params.id, req.user.id, userName, r, text.trim());
        res.json(db.prepare('SELECT * FROM reviews WHERE id = ?').get(ins.lastInsertRowid));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/reviews/:id', authMiddleware, (req, res) => {
    const rv = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
    if (!rv) return res.status(404).json({ error: 'Не найден' });
    if (rv.user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Нет прав' });
    }
    db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
});

/* === RELATED (start) === */
app.get('/api/products/:id/related', (req, res) => {
    const id = req.params.id;
    const me = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!me) return res.status(404).json({ error: 'Не найден' });
    const LIMIT = 8;
    let out = [];

    // 1) та же категория
    if (me.category_id) {
        out = db.prepare('SELECT * FROM products WHERE category_id = ? AND id != ? ORDER BY RANDOM() LIMIT ?')
                .all(me.category_id, id, LIMIT);
    }
    // 2) дополнить брендом
    if (out.length < LIMIT && me.brand_id) {
        const need = LIMIT - out.length;
        const have = new Set(out.map(x => x.id));
        const more = db.prepare('SELECT * FROM products WHERE brand_id = ? AND id != ? ORDER BY RANDOM() LIMIT ?')
                       .all(me.brand_id, id, need + have.size);
        for (const x of more) {
            if (!have.has(x.id) && out.length < LIMIT) { out.push(x); have.add(x.id); }
        }
    }
    // 3) дополнить любыми другими
    if (out.length < LIMIT) {
        const need = LIMIT - out.length;
        const have = new Set(out.map(x => x.id));
        have.add(parseInt(id, 10));
        const more = db.prepare('SELECT * FROM products ORDER BY RANDOM() LIMIT ?').all(LIMIT * 2);
        for (const x of more) {
            if (!have.has(x.id) && out.length < LIMIT) { out.push(x); have.add(x.id); }
        }
    }
    res.json(out.map(enrichProduct));
});
/* === RELATED (end) === */
/* === REVIEWS (end) === */
/* === CHAT (SSE) (start) === */
// Хранилище SSE-клиентов: Map<chatId, Set<res>>
const sseClients = new Map();

function sseSend(chatId, payload) {
    const set = sseClients.get(chatId);
    if (!set) return;
    const data = 'data: ' + JSON.stringify(payload) + '\n\n';
    for (const res of set) {
        try { res.write(data); } catch (e) { set.delete(res); }
    }
}

// Найти или создать чат текущего пользователя
function getOrCreateChat(user) {
    let chat = db.prepare('SELECT * FROM chats WHERE user_id = ?').get(user.id);
    if (!chat) {
        const r = db.prepare('INSERT INTO chats (user_id, user_name) VALUES (?, ?)')
                    .run(user.id, user.name || user.email || 'Пользователь');
        chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(r.lastInsertRowid);
    }
    return chat;
}

// Мой чат
app.get('/api/chats/me', authMiddleware, (req, res) => {
    const chat = getOrCreateChat(req.user);
    const unread = db.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_id = ? AND sender_role != ? AND (read_at IS NULL)')
                     .get(chat.id, req.user.role === 'admin' ? 'admin' : 'user').c;
    res.json({ chat, unread });
});

// Все чаты (только админ)
app.get('/api/chats', authMiddleware, adminMiddleware, (req, res) => {
    const rows = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.sender_role = 'user' AND m.read_at IS NULL) as unread,
          (SELECT text FROM messages m WHERE m.chat_id = c.id ORDER BY id DESC LIMIT 1) as last_text
        FROM chats c
        ORDER BY c.last_message_at DESC
    `).all();
    res.json(rows);
});

// Сообщения чата
app.get('/api/chats/:id/messages', authMiddleware, (req, res) => {
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (req.user.role !== 'admin' && chat.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Нет доступа' });
    }
    const rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC').all(req.params.id);
    // отметить прочитанными чужие
    const myRole = req.user.role === 'admin' ? 'admin' : 'user';
    db.prepare("UPDATE messages SET read_at = datetime('now') WHERE chat_id = ? AND sender_role != ? AND read_at IS NULL")
      .run(req.params.id, myRole);
    res.json(rows);
});

// Отправить сообщение
app.post('/api/chats/:id/messages', authMiddleware, (req, res) => {
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    if (req.user.role !== 'admin' && chat.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Нет доступа' });
    }
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
    const myRole = req.user.role === 'admin' ? 'admin' : 'user';
    const r = db.prepare('INSERT INTO messages (chat_id, sender_id, sender_role, text) VALUES (?, ?, ?, ?)')
                .run(req.params.id, req.user.id, myRole, text);
    db.prepare("UPDATE chats SET last_message_at = datetime('now') WHERE id = ?").run(req.params.id);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(r.lastInsertRowid);
    // Разослать всем подписчикам чата
    sseSend(req.params.id, { type: 'message', message: msg });
    res.json(msg);
});

// SSE-поток
app.get('/api/chats/:id/stream', (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(401).end();
    let user;
    try {
        user = require('jsonwebtoken').verify(token, JWT_SECRET);
    } catch (e) { return res.status(401).end(); }
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(req.params.id);
    if (!chat) return res.status(404).end();
    if (user.role !== 'admin' && chat.user_id !== user.id) return res.status(403).end();

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    res.flushHeaders && res.flushHeaders();
    res.write('retry: 3000\n\n');

    const chatId = parseInt(req.params.id, 10);
    if (!sseClients.has(chatId)) sseClients.set(chatId, new Set());
    sseClients.get(chatId).add(res);

    // heartbeat
    const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch(e){} }, 25000);

    req.on('close', () => {
        clearInterval(hb);
        const set = sseClients.get(chatId);
        if (set) set.delete(res);
    });
});

// Плавающая кнопка чата — количество непрочитанных
app.get('/api/chats/me/unread', authMiddleware, (req, res) => {
    const chat = db.prepare('SELECT * FROM chats WHERE user_id = ?').get(req.user.id);
    if (!chat) return res.json({ unread: 0 });
    const unread = db.prepare("SELECT COUNT(*) as c FROM messages WHERE chat_id = ? AND sender_role = 'admin' AND read_at IS NULL")
                     .get(chat.id).c;
    res.json({ unread });
});
/* === CHAT (SSE) (end) === */
app.delete('/api/products/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Не найден' });
    res.json({ ok: true });
});

/* ============================================================
   ЗАГРУЗКА
   ============================================================ */
app.post('/api/upload', authMiddleware, adminMiddleware, upload.array('photos', 20), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Файлы не загружены' });
    res.json({ urls: req.files.map(f => '/uploads/' + f.filename) });
});

/* ============================================================
   СЛАЙДЫ
   ============================================================ */
app.get('/api/slides', (req, res) => {
    res.json(db.prepare('SELECT * FROM slides ORDER BY id DESC').all());
});
app.post('/api/slides', authMiddleware, adminMiddleware, (req, res) => {
    const { img } = req.body;
    if (!img) return res.status(400).json({ error: 'URL обязателен' });
    const r = db.prepare('INSERT INTO slides (img) VALUES (?)').run(img);
    res.json(db.prepare('SELECT * FROM slides WHERE id = ?').get(r.lastInsertRowid));
});
app.delete('/api/slides/:id', authMiddleware, adminMiddleware, (req, res) => {
    const r = db.prepare('DELETE FROM slides WHERE id = ?').run(req.params.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Не найден' });
    res.json({ ok: true });
});

/* ============================================================
   ЗАКАЗЫ
   ============================================================ */
app.post('/api/orders', authMiddleware, (req, res) => {
    const { customer_name, phone, address, comment, items, total } = req.body;
    if (!customer_name || !phone || !address) return res.status(400).json({ error: 'Заполните имя, телефон и адрес' });
    if (!items || !items.length) return res.status(400).json({ error: 'Корзина пуста' });
    const r = db.prepare(`INSERT INTO orders (user_id, customer_name, phone, address, comment, items, total, status)
                          VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`)
                .run(req.user.id, customer_name, phone, address, comment || '', JSON.stringify(items), total || 0);
    res.json({ id: r.lastInsertRowid, ok: true });
});
app.get('/api/orders/my', authMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    rows.forEach(o => { try { o.items = JSON.parse(o.items || '[]'); } catch { o.items = []; } });
    res.json(rows);
});
app.get('/api/orders', authMiddleware, adminMiddleware, (req, res) => {
    const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    rows.forEach(o => { try { o.items = JSON.parse(o.items || '[]'); } catch { o.items = []; } });
    res.json(rows);
});
app.put('/api/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Статус обязателен' });
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
});

/* ============================================================
   КОНТАКТЫ
   ============================================================ */
app.get('/api/contacts', (req, res) => {
    const c = db.prepare('SELECT * FROM contacts WHERE id = 1').get();
    res.json(c || {});
});
app.put('/api/contacts', authMiddleware, adminMiddleware, (req, res) => {
    const { phone, email, address, instagram, telegram, whatsapp, work_hours } = req.body;
    db.prepare(`UPDATE contacts SET phone = ?, email = ?, address = ?, instagram = ?, telegram = ?, whatsapp = ?, work_hours = ?
                WHERE id = 1`)
      .run(phone || '', email || '', address || '', instagram || '', telegram || '', whatsapp || '', work_hours || '');
    res.json(db.prepare('SELECT * FROM contacts WHERE id = 1').get());
});

/* ============================================================
   ОШИБКИ
   ============================================================ */
app.use((err, req, res, next) => {
    if (err) {
        console.error(err);
        return res.status(400).json({ error: err.message || 'Ошибка сервера' });
    }
    next();
});


/* * ============================================================
   SPA
   ============================================================ */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log('\nСервер запущен: http://localhost:' + PORT + '\n');
});
