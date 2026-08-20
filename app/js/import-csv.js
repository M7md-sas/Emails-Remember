// ---------------------------------------------------------------------------
//  استيراد ملف كلمات المرور المُصدَّر من المتصفح
//
//  عقد هذا الملف الذي لا يُخالَف:
//  عمود كلمة المرور يُمحى من الذاكرة فور التحليل وقبل بناء أي كائن، فلا يصل
//  إلى كائن ولا إلى تخزين ولا إلى شبكة. وكل التحليل يجري داخل المتصفح ولا
//  يُرفع الملف إلى أي مكان إطلاقاً.
// ---------------------------------------------------------------------------
import { rootDomain, displayName, looksLikeHost, normalize } from './search.js';
import { matchService } from './data.js';

/** محلّل CSV كامل: يحترم علامات الاقتباس والفواصل والأسطر داخل الحقول. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// أسماء الأعمدة تختلف بين كروم وسفاري وفَيَرفُكس ومديري كلمات المرور
const COLS = {
  url:      ['url', 'login_uri', 'website', 'web site', 'site', 'hostname', 'login url'],
  username: ['username', 'login_username', 'user name', 'user', 'email', 'login'],
  name:     ['name', 'title', 'display name'],
  note:     ['note', 'notes', 'comment'],
  password: ['password', 'login_password', 'passwd', 'pass'],
};

function indexOfCol(header, kind) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  for (const want of COLS[kind]) {
    const i = norm.indexOf(want);
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * يحوّل نص الملف إلى مدخلات نظيفة.
 * الخطوة الأولى بعد التحليل مباشرة هي مسح خانة كلمة المرور من كل صف.
 */
export function extractEntries(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { entries: [], skipped: 0, hadPasswords: false };

  const header = rows[0];
  const iPass = indexOfCol(header, 'password');

  // --- المسح الفوري: لا شيء بعد هذا السطر يرى كلمة مرور ---
  if (iPass !== -1) {
    for (let r = 1; r < rows.length; r++) {
      if (rows[r].length > iPass) rows[r][iPass] = '';
    }
  }

  const iUrl  = indexOfCol(header, 'url');
  const iUser = indexOfCol(header, 'username');
  const iName = indexOfCol(header, 'name');
  const iNote = indexOfCol(header, 'note');

  const pick = (row, i) => (i !== -1 && row[i] ? row[i].trim() : '');
  const entries = [];
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const url = pick(row, iUrl);
    const username = pick(row, iUser);
    const name = pick(row, iName);
    if (!url && !name) { skipped++; continue; }
    entries.push({
      url,
      domain: rootDomain(url),
      username,
      name: displayName(name, url),
      note: pick(row, iNote),
    });
  }

  return { entries, skipped, hadPasswords: iPass !== -1 };
}

const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s || '');

/**
 * يبني خطة الاستيراد بلا أي كتابة: كم خدمة جديدة، وكم حساباً، وكم اندمج.
 * تُعرض عليك أولاً ولا يُحفظ شيء قبل موافقتك.
 */
export function planImport(entries, items) {
  const groups = new Map();

  for (const e of entries) {
    const key = e.domain || normalize(e.name);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, { key, domain: e.domain, name: e.name, notes: new Set(), logins: new Map() });
    }
    const g = groups.get(key);
    // نفضّل الاسم المقروء دائماً، ولا نرقّي اسم مضيف لمجرد أنه أطول
    if (e.name && !looksLikeHost(e.name) && !/^https?:/i.test(e.name)) {
      if (looksLikeHost(g.name) || e.name.length > g.name.length) g.name = e.name;
    }
    if (e.note) g.notes.add(e.note);
    const id = normalize(e.username);
    if (id && !g.logins.has(id)) g.logins.set(id, e.username);
  }

  const plan = { newServices: [], newAccounts: 0, mergedServices: [], emptyLogins: 0 };

  for (const g of groups.values()) {
    const existing = matchService(items, g.domain || g.name);
    const logins = [...g.logins.values()];
    if (!logins.length) plan.emptyLogins++;

    const accounts = logins.map((login) => ({
      email: isEmail(login) ? login : null,
      username: isEmail(login) ? null : login,
      login_method: 'email',
      source: 'imported',
      confidence: 'imported',
      identity_id: null,
      note: g.notes.size ? [...g.notes].join(' — ') : null,
    }));

    plan.newAccounts += accounts.length;
    const record = { group: g, accounts, existing };
    if (existing) plan.mergedServices.push(record);
    else plan.newServices.push(record);
  }

  return plan;
}
