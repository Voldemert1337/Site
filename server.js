import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "motoland-dev-secret-change-me";
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const COOKIE = "motoland_admin";
const storePath = join(__dirname, "data", "store.json");

// ---- Multer ----
const uploadDir = join(__dirname, "uploads");
if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '-' + file.originalname.replace(/\s/g, '_'));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use('/uploads', express.static(uploadDir));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(join(__dirname, "public"), { extensions: ["html"] }));

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

// ---- Helpers ----
function normalizeMoto(row) {
  let imageArray = [];
  if (row.image) {
    try {
      const parsed = JSON.parse(row.image);
      if (Array.isArray(parsed)) imageArray = parsed;
      else imageArray = [parsed];
    } catch {
      imageArray = String(row.image).split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    badge: row.badge || "",
    engine: row.engine,
    power: row.power,
    weight: row.weight,
    speed: row.speed,
    price: Number(row.price),
    old_price: row.old_price === null || row.old_price === undefined || row.old_price === "" ? null : Number(row.old_price),
    image: imageArray,
    description: row.description,
    active: row.active !== false
  };
}

async function readStore() {
  await mkdir(dirname(storePath), { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8"));
    return { motos: parsed.motos || [], leads: parsed.leads || [], reviews: parsed.reviews || [], hiddenMotoIds: parsed.hiddenMotoIds || [] };
  } catch {
    const fresh = { motos: [], leads: [], reviews: [], hiddenMotoIds: [] };
    await writeFile(storePath, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}
async function writeStore(store) { await writeFile(storePath, JSON.stringify(store, null, 2)); }

// ---- Init DB ----
async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS motos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      badge TEXT DEFAULT '',
      engine TEXT NOT NULL,
      power TEXT NOT NULL,
      weight TEXT NOT NULL,
      speed TEXT NOT NULL,
      price INTEGER NOT NULL,
      old_price INTEGER,
      image TEXT NOT NULL,
      description TEXT NOT NULL,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      model TEXT DEFAULT '',
      type TEXT NOT NULL,
      message TEXT DEFAULT '',
      status TEXT DEFAULT 'Новая',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      text TEXT NOT NULL,
      rating INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  const { rows } = await pool.query("SELECT to_regclass('reviews')");
  if (!rows[0].to_regclass) {
    await pool.query(`CREATE TABLE reviews ( id TEXT PRIMARY KEY, name TEXT NOT NULL, text TEXT NOT NULL, rating INTEGER NOT NULL, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT NOW() )`);
  }
  const { rows: countRows } = await pool.query("SELECT COUNT(*)::INT AS count FROM motos");
  if (countRows[0].count === 0) {
    const seedMotos = [
      { id: "xt-250", name: "XT 250", category: "enduro", badge: "Хит", engine: "250 cc", power: "21 л.с.", weight: "128 кг", speed: "120 км/ч", price: 219900, old_price: null, image: JSON.stringify(["https://images.unsplash.com/photo-1558981359-219d6364c9c8?auto=format&fit=crop&w=1200&q=85"]), description: "Универсальный эндуро для города, грунта и поездок выходного дня.", active: true },
      { id: "enduro-250", name: "Enduro 250", category: "enduro", badge: "Новинка", engine: "250 cc", power: "24 л.с.", weight: "119 кг", speed: "130 км/ч", price: 249900, old_price: null, image: JSON.stringify(["https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=85"]), description: "Легкая модель с длинноходной подвеской.", active: true },
      { id: "gl-200", name: "GL 200", category: "naked", badge: "Выгода", engine: "200 cc", power: "16 л.с.", weight: "112 кг", speed: "110 км/ч", price: 149900, old_price: 179900, image: JSON.stringify(["https://images.unsplash.com/photo-1517846693594-1567da72af75?auto=format&fit=crop&w=1200&q=85"]), description: "Простой городской нейкед для ежедневных поездок.", active: true },
      { id: "trip-250", name: "Trip 250", category: "touring", badge: "Туризм", engine: "250 cc", power: "22 л.с.", weight: "156 кг", speed: "140 км/ч", price: 289900, old_price: null, image: JSON.stringify(["https://images.unsplash.com/photo-1558980664-10e7170b5df9?auto=format&fit=crop&w=1200&q=85"]), description: "Туристический мотоцикл для дальних маршрутов.", active: true },
      { id: "scrambler-250", name: "Scrambler 250", category: "classic", badge: "Стиль", engine: "250 cc", power: "20 л.с.", weight: "135 кг", speed: "125 км/ч", price: 259900, old_price: null, image: JSON.stringify(["https://images.unsplash.com/photo-1558980394-0a06c463f961?auto=format&fit=crop&w=1200&q=85"]), description: "Классический мотоцикл с ретро-настроением.", active: true },
      { id: "xr-250", name: "XR 250", category: "sport", badge: "Хит", engine: "250 cc", power: "26 л.с.", weight: "145 кг", speed: "155 км/ч", price: 279900, old_price: null, image: JSON.stringify(["https://images.unsplash.com/photo-1558981001-7921d24fb421?auto=format&fit=crop&w=1200&q=85"]), description: "Динамичная спортивная модель.", active: true }
    ];
    for (const m of seedMotos) {
      await pool.query(
        `INSERT INTO motos (id,name,category,badge,engine,power,weight,speed,price,old_price,image,description,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [m.id, m.name, m.category, m.badge, m.engine, m.power, m.weight, m.speed, m.price, m.old_price, m.image, m.description, m.active]
      );
    }
  }
}

// ---- Мотоциклы ----
async function allMotos(includeInactive = false) {
  if (pool) {
    const { rows } = await pool.query(`SELECT * FROM motos ${includeInactive ? "" : "WHERE active = true"} ORDER BY created_at ASC`);
    return rows.map(normalizeMoto);
  }
  const store = await readStore();
  const custom = store.motos.map(normalizeMoto);
  const hidden = new Set(store.hiddenMotoIds || []);
  const seedMotos = [
    { id: "xt-250", name: "XT 250", category: "enduro", badge: "Хит", engine: "250 cc", power: "21 л.с.", weight: "128 кг", speed: "120 км/ч", price: 219900, old_price: null, image: ["https://images.unsplash.com/photo-1558981359-219d6364c9c8?auto=format&fit=crop&w=1200&q=85"], description: "Универсальный эндуро для города, грунта и поездок выходного дня.", active: true },
    { id: "enduro-250", name: "Enduro 250", category: "enduro", badge: "Новинка", engine: "250 cc", power: "24 л.с.", weight: "119 кг", speed: "130 км/ч", price: 249900, old_price: null, image: ["https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=1200&q=85"], description: "Легкая модель с длинноходной подвеской.", active: true },
    { id: "gl-200", name: "GL 200", category: "naked", badge: "Выгода", engine: "200 cc", power: "16 л.с.", weight: "112 кг", speed: "110 км/ч", price: 149900, old_price: 179900, image: ["https://images.unsplash.com/photo-1517846693594-1567da72af75?auto=format&fit=crop&w=1200&q=85"], description: "Простой городской нейкед для ежедневных поездок.", active: true },
    { id: "trip-250", name: "Trip 250", category: "touring", badge: "Туризм", engine: "250 cc", power: "22 л.с.", weight: "156 кг", speed: "140 км/ч", price: 289900, old_price: null, image: ["https://images.unsplash.com/photo-1558980664-10e7170b5df9?auto=format&fit=crop&w=1200&q=85"], description: "Туристический мотоцикл для дальних маршрутов.", active: true },
    { id: "scrambler-250", name: "Scrambler 250", category: "classic", badge: "Стиль", engine: "250 cc", power: "20 л.с.", weight: "135 кг", speed: "125 км/ч", price: 259900, old_price: null, image: ["https://images.unsplash.com/photo-1558980394-0a06c463f961?auto=format&fit=crop&w=1200&q=85"], description: "Классический мотоцикл с ретро-настроением.", active: true },
    { id: "xr-250", name: "XR 250", category: "sport", badge: "Хит", engine: "250 cc", power: "26 л.с.", weight: "145 кг", speed: "155 км/ч", price: 279900, old_price: null, image: ["https://images.unsplash.com/photo-1558981001-7921d24fb421?auto=format&fit=crop&w=1200&q=85"], description: "Динамичная спортивная модель.", active: true }
  ];
  const seeded = seedMotos.map(moto => ({ ...moto, active: moto.active && !hidden.has(moto.id) }));
  const all = [...seeded, ...custom];
  return includeInactive ? all : all.filter(m => m.active);
}

async function saveMoto(moto) {
  const imageJson = JSON.stringify(moto.image || []);
  if (pool) {
    await pool.query(
      `INSERT INTO motos (id,name,category,badge,engine,power,weight,speed,price,old_price,image,description,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
       ON CONFLICT (id) DO UPDATE SET
         name=$2, category=$3, badge=$4, engine=$5, power=$6, weight=$7, speed=$8,
         price=$9, old_price=$10, image=$11, description=$12`,
      [moto.id, moto.name, moto.category, moto.badge, moto.engine, moto.power,
       moto.weight, moto.speed, moto.price, moto.old_price, imageJson, moto.description]
    );
    return;
  }
  const store = await readStore();
  store.motos = [{ ...moto, image: imageJson }, ...store.motos.filter(m => m.id !== moto.id)];
  await writeStore(store);
}

async function removeMoto(id) {
  if (pool) {
    await pool.query("UPDATE motos SET active = false WHERE id = $1", [id]);
    return;
  }
  const store = await readStore();
  const customExists = store.motos.some(m => m.id === id);
  store.motos = store.motos.filter(m => m.id !== id);
  if (!customExists && [
    "xt-250", "enduro-250", "gl-200", "trip-250", "scrambler-250", "xr-250"
  ].includes(id)) {
    store.hiddenMotoIds = Array.from(new Set([...(store.hiddenMotoIds || []), id]));
  }
  await writeStore(store);
}

// ---- Заявки ----
async function getLeadsWithFilters(from, to) {
  if (pool) {
    let sql = `SELECT * FROM leads`;
    const params = [];
    const conditions = [];
    if (from) {
      conditions.push(`created_at >= $${params.length + 1}`);
      params.push(from + ' 00:00:00');
    }
    if (to) {
      conditions.push(`created_at <= $${params.length + 1}`);
      params.push(to + ' 23:59:59');
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, params);
    return rows.map(r => ({
      ...r,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
    }));
  }
  const store = await readStore();
  let leads = store.leads || [];
  if (from) {
    const fromDate = new Date(from);
    fromDate.setHours(0,0,0,0);
    leads = leads.filter(l => {
      const created = new Date(l.created_at);
      return created >= fromDate;
    });
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23,59,59,999);
    leads = leads.filter(l => {
      const created = new Date(l.created_at);
      return created <= toDate;
    });
  }
  return leads;
}

async function saveLead(lead) {
  if (pool) {
    await pool.query(
      `INSERT INTO leads (id,name,phone,model,type,message,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [lead.id, lead.name, lead.phone, lead.model, lead.type, lead.message, lead.status]
    );
    return;
  }
  const store = await readStore();
  store.leads = [lead, ...store.leads];
  await writeStore(store);
}

async function updateLeadStatus(id, status) {
  if (pool) {
    await pool.query("UPDATE leads SET status = $2 WHERE id = $1", [id, status]);
    return;
  }
  const store = await readStore();
  store.leads = store.leads.map(lead => lead.id === id ? { ...lead, status } : lead);
  await writeStore(store);
}

async function deleteLead(id) {
  if (pool) {
    await pool.query("DELETE FROM leads WHERE id = $1", [id]);
    return;
  }
  const store = await readStore();
  store.leads = store.leads.filter(lead => lead.id !== id);
  await writeStore(store);
}

// ---- Отзывы ----
async function getReviews(status = null) {
  if (pool) {
    let sql = `SELECT * FROM reviews`;
    const params = [];
    if (status) {
      sql += ` WHERE status = $1`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(sql, params);
    return rows.map(r => ({
      ...r,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at
    }));
  }
  const store = await readStore();
  let reviews = store.reviews || [];
  if (status) {
    reviews = reviews.filter(r => r.status === status);
  }
  return reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function saveReview(review) {
  if (pool) {
    await pool.query(
      `INSERT INTO reviews (id, name, text, rating, status) VALUES ($1, $2, $3, $4, $5)`,
      [review.id, review.name, review.text, review.rating, review.status]
    );
    return;
  }
  const store = await readStore();
  store.reviews = [review, ...(store.reviews || [])];
  await writeStore(store);
}

async function updateReviewStatus(id, status) {
  if (pool) {
    await pool.query("UPDATE reviews SET status = $2 WHERE id = $1", [id, status]);
    return;
  }
  const store = await readStore();
  store.reviews = store.reviews.map(r => r.id === id ? { ...r, status } : r);
  await writeStore(store);
}

async function deleteReview(id) {
  if (pool) {
    await pool.query("DELETE FROM reviews WHERE id = $1", [id]);
    return;
  }
  const store = await readStore();
  store.reviews = store.reviews.filter(r => r.id !== id);
  await writeStore(store);
}

// ---- Auth ----
function auth(req, res, next) {
  try {
    jwt.verify(req.cookies[COOKIE], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Необходим вход в админку" });
  }
}

function panelAuth(req, res, next) {
  try {
    jwt.verify(req.cookies[COOKIE], JWT_SECRET);
    next();
  } catch {
    res.redirect("/control");
  }
}

// ---- Публичные эндпоинты ----
app.get("/api/motos", async (req, res) => {
  const motos = await allMotos(false);
  res.json(motos);
});

app.post("/api/leads", async (req, res) => {
  const { name, phone, model = "", type = "Консультация", message = "" } = req.body || {};
  if (!String(name || "").trim() || !String(phone || "").trim()) {
    return res.status(400).json({ error: "Имя и телефон обязательны" });
  }
  const lead = {
    id: String(Date.now()),
    name: String(name).trim(),
    phone: String(phone).trim(),
    model: String(model || "").trim(),
    type: String(type || "Консультация").trim(),
    message: String(message || "").trim(),
    status: "Новая",
    created_at: new Date().toISOString()
  };
  await saveLead(lead);
  res.status(201).json(lead);
});

app.get("/api/reviews", async (req, res) => {
  const reviews = await getReviews('approved');
  res.json(reviews);
});

app.post("/api/reviews", async (req, res) => {
  const { name, text, rating } = req.body;
  if (!name?.trim() || !text?.trim() || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Все поля обязательны, рейтинг от 1 до 5" });
  }
  const review = {
    id: String(Date.now()),
    name: name.trim(),
    text: text.trim(),
    rating: Number(rating),
    status: 'pending',
    created_at: new Date().toISOString()
  };
  await saveReview(review);
  res.status(201).json(review);
});

// ---- Админские эндпоинты ----
app.post("/api/admin/login", async (req, res) => {
  const { login, password } = req.body || {};
  const okLogin = login === ADMIN_LOGIN;
  const okPass = ADMIN_PASSWORD.startsWith("$2") ? await bcrypt.compare(password || "", ADMIN_PASSWORD) : password === ADMIN_PASSWORD;
  if (!okLogin || !okPass) return res.status(401).json({ error: "Неверный логин или пароль" });
  const token = jwt.sign({ login: ADMIN_LOGIN }, JWT_SECRET, { expiresIn: "8h" });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "strict", maxAge: 8 * 60 * 60 * 1000 });
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get("/api/admin/session", auth, (req, res) => res.json({ ok: true }));

// Заявки (админ)
app.get("/api/admin/leads", auth, async (req, res) => {
  const { from, to } = req.query;
  const leads = await getLeadsWithFilters(from, to);
  const formatted = leads.map(l => ({
    ...l,
    created_display: l.created_at ? new Date(l.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '',
    created_at: l.created_at
  }));
  res.json(formatted);
});

app.patch("/api/admin/leads/:id", auth, async (req, res) => {
  await updateLeadStatus(req.params.id, String(req.body.status || "Новая"));
  res.json({ ok: true });
});

app.delete("/api/admin/leads/:id", auth, async (req, res) => {
  await deleteLead(req.params.id);
  res.json({ ok: true });
});

// Мотоциклы (админ)
app.get("/api/admin/motos", auth, async (req, res) => {
  const motos = await allMotos(false);
  res.json(motos);
});

app.post("/api/admin/motos", auth, upload.array('images', 10), async (req, res) => {
  try {
    const { name, category, badge, price, old_price, engine, power, weight, speed, description } = req.body;
    const imageUrls = req.files.map(file => `/uploads/${file.filename}`);
    if (imageUrls.length === 0 && req.body.image) {
      const urls = String(req.body.image).split(',').map(s => s.trim()).filter(Boolean);
      imageUrls.push(...urls);
    }
    if (!name || !category || !engine || !power || !weight || !speed || !price) {
      return res.status(400).json({ error: "Заполните все обязательные поля" });
    }
    const moto = {
      id: `moto-${Date.now()}`,
      name: String(name).trim(),
      category: String(category).trim(),
      badge: String(badge || "").trim(),
      engine: String(engine).trim(),
      power: String(power).trim(),
      weight: String(weight).trim(),
      speed: String(speed).trim(),
      price: Number(price),
      old_price: old_price ? Number(old_price) : null,
      image: imageUrls,
      description: String(description || "").trim(),
      active: true
    };
    await saveMoto(moto);
    res.status(201).json(moto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка при сохранении модели" });
  }
});

app.delete("/api/admin/motos/:id", auth, async (req, res) => {
  await removeMoto(req.params.id);
  res.json({ ok: true });
});

// Отзывы (админ)
app.get("/api/admin/reviews", auth, async (req, res) => {
  const { status } = req.query;
  const reviews = await getReviews(status || null);
  const formatted = reviews.map(r => ({
    ...r,
    created_display: r.created_at ? new Date(r.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '',
    created_at: r.created_at
  }));
  res.json(formatted);
});

app.patch("/api/admin/reviews/:id", auth, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "Неверный статус" });
  }
  await updateReviewStatus(req.params.id, status);
  res.json({ ok: true });
});

app.delete("/api/admin/reviews/:id", auth, async (req, res) => {
  await deleteReview(req.params.id);
  res.json({ ok: true });
});

// ---- Страницы админки ----
app.get("/control", (req, res) => {
  try {
    jwt.verify(req.cookies[COOKIE], JWT_SECRET);
    res.redirect("/control/panel");
  } catch {
    res.sendFile(join(__dirname, "admin", "login.html"));
  }
});
app.get("/control/panel", panelAuth, (req, res) => res.sendFile(join(__dirname, "admin", "admin.html")));
app.use("/control/assets", express.static(join(__dirname, "admin")));

// ---- Запуск ----
await initDb();
app.listen(PORT, () => {
  const storage = pool ? "PostgreSQL" : "JSON file";
  console.log(`MOTOLAND running on http://localhost:${PORT} (${storage})`);
  console.log(`Admin panel: http://localhost:${PORT}/control`);
});