// ---------------------------------------------------------------------------
//  طبقة الاتصال بالخادم
//  مكتوبة على fetch مباشرة بلا أي مكتبة خارجية — يبقى التطبيق بلا خطوة بناء،
//  ويشتغل بدون نت لأن لا شيء هنا مطلوب لعرض الشاشات.
// ---------------------------------------------------------------------------
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const AUTH = SUPABASE_URL + '/auth/v1';
const REST = SUPABASE_URL + '/rest/v1';
const SESSION_KEY = 'daftar.session';
const PAGE = 1000;

let session = null;

// --- الجلسة ---------------------------------------------------------------

export function loadSession() {
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    session = null;
  }
  return session;
}

export function getSession() {
  return session;
}

export function isSignedIn() {
  return !!(session && session.refresh_token);
}

function store(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    // ننقص دقيقة كاملة احتياطاً حتى لا نستعمل رمزاً على وشك الانتهاء
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
    user: data.user || (session && session.user) || null,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

// --- الدخول ---------------------------------------------------------------

export async function signIn(email, password) {
  const res = await fetch(AUTH + '/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.error_description || data.msg || data.message || '';
    throw new Error(/invalid/i.test(msg) ? 'الإيميل أو كلمة المرور غير صحيحة' : msg || 'تعذّر الدخول');
  }
  return store(data);
}

async function refresh() {
  if (!session || !session.refresh_token) throw new Error('لا توجد جلسة');
  const res = await fetch(AUTH + '/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    // رمز التجديد نفسه بطل — الجلسة انتهت فعلاً
    clearSession();
    throw new Error('انتهت الجلسة، سجّل الدخول من جديد');
  }
  return store(await res.json());
}

async function freshToken() {
  if (!session) throw new Error('لا توجد جلسة');
  if (Date.now() >= session.expires_at) await refresh();
  return session.access_token;
}

// --- الطلبات --------------------------------------------------------------

async function rest(path, opts = {}) {
  const token = await freshToken();
  const res = await fetch(REST + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    // قد يكون الرمز بطل قبل وقته المتوقع — نجدد ونعيد مرة واحدة فقط
    await refresh();
    return rest(path, opts);
  }
  if (!res.ok) throw new Error('خطأ من الخادم ' + res.status + ' — ' + (await res.text()));
  return res.status === 204 ? null : res.json();
}

/** يسحب كل صف تغيّر بعد الوقت المعطى، مع الترقيم لأن الصفحة محدودة. */
export async function selectSince(table, sinceISO) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const q =
      '/' + table + '?select=*' +
      (sinceISO ? '&updated_at=gt.' + encodeURIComponent(sinceISO) : '') +
      '&order=updated_at.asc,id.asc&limit=' + PAGE + '&offset=' + offset;
    const page = await rest(q);
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

/** يرفع صفوفاً ويعيدها كما استقرت على الخادم، ومنها الطابع الزمني الرسمي. */
export async function upsert(table, rows) {
  if (!rows.length) return [];
  return rest('/' + table, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
}

/** معرّف المستخدم الحالي — نحتاجه لتعبئة user_id عند إنشاء الصفوف محلياً. */
export function currentUserId() {
  return session && session.user ? session.user.id : null;
}
