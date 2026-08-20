// ---------------------------------------------------------------------------
//  التخزين المحلي
//  كل قراءة في التطبيق تجي من هنا وحدها — لهذا البحث فوري ويشتغل على وضع
//  الطيران. الخادم يُستعمل للمزامنة في الخلفية فقط، ولا تنتظره أي شاشة.
// ---------------------------------------------------------------------------
import { LOCAL_DB, LOCAL_DB_VERSION, TABLES } from './config.js';

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DB, LOCAL_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABLES) {
        if (!db.objectStoreNames.contains(t)) {
          const s = db.createObjectStore(t, { keyPath: 'id' });
          // المؤشّر على العلم المحلي وحده — به نعرف ما لم يُرفع بعد
          s.createIndex('by_dirty', '_dirty');
        }
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(db, stores, mode) {
  return db.transaction(stores, mode);
}

function done(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function ask(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- قراءة ----------------------------------------------------------------

/** كل الصفوف الحيّة. المحذوف ناعماً مستبعَد إلا إذا طُلب صراحةً. */
export async function all(table, { withDeleted = false } = {}) {
  const db = await open();
  const rows = await ask(tx(db, [table], 'readonly').objectStore(table).getAll());
  return withDeleted ? rows : rows.filter((r) => !r.deleted_at);
}

export async function one(table, id) {
  const db = await open();
  const row = await ask(tx(db, [table], 'readonly').objectStore(table).get(id));
  return row && !row.deleted_at ? row : null;
}

// --- كتابة ----------------------------------------------------------------

/** كتابة محليّة من المستخدم: تُعلَّم للرفع ويُختم وقتها محلياً للعرض فقط. */
export async function save(table, row) {
  const db = await open();
  const t = tx(db, [table], 'readwrite');
  const rec = { ...row, _dirty: 1, updated_at: new Date().toISOString() };
  t.objectStore(table).put(rec);
  await done(t);
  return rec;
}

export async function saveMany(table, rows) {
  if (!rows.length) return [];
  const db = await open();
  const t = tx(db, [table], 'readwrite');
  const stamp = new Date().toISOString();
  const recs = rows.map((r) => ({ ...r, _dirty: 1, updated_at: stamp }));
  for (const r of recs) t.objectStore(table).put(r);
  await done(t);
  return recs;
}

/** حذف ناعم — بدونه لا ينتشر الحذف بين الأجهزة ويرجع الصف من جهاز متأخر. */
export async function remove(table, id) {
  const db = await open();
  const cur = await ask(tx(db, [table], 'readonly').objectStore(table).get(id));
  if (!cur) return;
  return save(table, { ...cur, deleted_at: new Date().toISOString() });
}

/** كتابة قادمة من الخادم: تُحفظ كما هي ولا تُعلَّم للرفع. */
export async function acceptFromServer(table, rows) {
  if (!rows.length) return;
  const db = await open();
  const t = tx(db, [table], 'readwrite');
  const s = t.objectStore(table);
  for (const r of rows) s.put({ ...r, _dirty: 0 });
  await done(t);
}

export async function dirty(table) {
  const db = await open();
  const idx = tx(db, [table], 'readonly').objectStore(table).index('by_dirty');
  return ask(idx.getAll(1));
}

// --- أدوات ----------------------------------------------------------------

export async function meta(key, fallback = null) {
  const db = await open();
  const row = await ask(tx(db, ['meta'], 'readonly').objectStore('meta').get(key));
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  const db = await open();
  const t = tx(db, ['meta'], 'readwrite');
  t.objectStore('meta').put({ key, value });
  await done(t);
}

/** يفرّغ كل شيء محلياً — يُستعمل عند الخروج وعند الاستعادة من ملف. */
export async function wipe() {
  const db = await open();
  const stores = [...TABLES, 'meta'];
  const t = tx(db, stores, 'readwrite');
  for (const s of stores) t.objectStore(s).clear();
  await done(t);
}

export function newId() {
  return crypto.randomUUID();
}
