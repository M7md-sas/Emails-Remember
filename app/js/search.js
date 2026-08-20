// ---------------------------------------------------------------------------
//  البحث
//  دوال خالصة بلا حالة وبلا مكتبة. التطبيع يُطبَّق على المخزون وعلى ما تكتبه
//  بنفس الدالة تماماً — وإلا اختلف الطرفان وضاع التطابق.
// ---------------------------------------------------------------------------

// التشكيل والتطويل والعلامات فوق الحروف
const MARKS = /[\u0610-\u061A\u064B-\u0652\u0653-\u0656\u0670\u06D6-\u06ED\u0640]/g;
const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/**
 * يوحّد النص حتى يتطابق ما كتبه المستخدم مع ما خُزّن مهما اختلف الرسم.
 * الألف بأشكالها واحدة، والتاء المربوطة هاء، والألف المقصورة ياء.
 */
export function normalize(text) {
  if (!text) return '';
  return String(text)
    .replace(MARKS, '')
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// لواحق مركّبة شائعة — لولاها لظنّ المُجرِّد أن com.sa هو الجذر
const TWO_PART_TLDS = new Set([
  'com.sa', 'com.au', 'co.uk', 'co.nz', 'co.jp', 'co.kr', 'co.in', 'co.za',
  'com.br', 'com.mx', 'com.tr', 'com.eg', 'com.pk', 'com.cn', 'net.sa',
  'org.uk', 'gov.sa', 'edu.sa', 'com.qa', 'com.kw', 'com.bh', 'com.om',
]);

const HOST_NOISE = /^(www|m|mobile|login|signin|accounts?|auth|my|app|secure|portal)\./;

/**
 * يستخرج جذر النطاق من أي رابط — به نعرف أن عنوانين هما خدمة واحدة.
 * يرجع نصاً فارغاً لما لا يكون المدخل نطاقاً أصلاً.
 *
 * شرط النقطة ليس تجميلاً: بدونه يعتبر مُحلّل الروابط كلمةً مثل "إنستقرام"
 * اسم مضيف صالحاً ويحوّلها إلى ترميز غريب، فتُحفظ كنطاق وهمي.
 */
export function rootDomain(input) {
  if (!input) return '';
  let host = String(input).trim().toLowerCase();
  if (!host.includes('.')) return '';
  try {
    host = new URL(host.includes('://') ? host : 'https://' + host).hostname;
  } catch {
    host = host.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0];
  }
  host = host.replace(/:\d+$/, '');
  while (HOST_NOISE.test(host)) host = host.replace(HOST_NOISE, '');
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return '';
  if (parts.length === 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  return TWO_PART_TLDS.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

/** الاسم المقروء المشتق من نطاق: account.proton.me يصير Proton */
export function labelFromDomain(domain) {
  const root = rootDomain(domain);
  const first = root.split('.')[0] || root;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** هل هذا النص اسم مضيف متنكّر في هيئة اسم خدمة؟ */
export function looksLikeHost(text) {
  const t = String(text || '').trim();
  return !!t && !/\s/.test(t) && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(t);
}

/**
 * الاسم الذي يُعرض في القائمة.
 *
 * المتصفح يسمّي السجل باسم المضيف كاملاً — "account.proton.me" — وهذا
 * صحيح تقنياً وعديم الفائدة بصرياً: تقرؤه ثلاث مرات قبل أن تعرف أنه بروتون.
 * فإن كان الاسم مضيفاً اشتققنا منه اسماً مقروءاً، وإلا احترمنا ما كتبه
 * المستخدم كما هو.
 */
export function displayName(rawName, url) {
  const derived = labelFromDomain(url || rawName);
  if (!rawName) return derived;
  return looksLikeHost(rawName) && derived ? derived : String(rawName).trim();
}

function isSubsequence(needle, hay) {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** درجة تطابق حقل واحد. صفر يعني لا علاقة. */
function fieldScore(q, value) {
  const v = normalize(value);
  if (!v || !q) return 0;
  if (v === q) return 1000;
  if (v.startsWith(q)) return 700;
  if (v.split(' ').some((w) => w.startsWith(q))) return 600;
  if (v.includes(q)) return 400;
  // التطابق المتقطّع يمسك الأخطاء المطبعية والاختصارات، ولهذا وزنه الأدنى
  if (q.length >= 3 && isSubsequence(q, v)) return 150;
  return 0;
}

// وزن الحقل: الاسم أهم من المرادف، والمرادف أهم من الملاحظة
const WEIGHTS = { name: 1.0, alias: 0.9, email: 0.6, username: 0.6, note: 0.4 };

/**
 * يرتّب الخدمات حسب قربها مما كُتب.
 * كل عنصر: { service, aliases[], accounts[] }
 */
export function rank(query, items) {
  const q = normalize(query);
  if (!q) {
    // بلا بحث: آخر ما فتحت أولاً، ثم الأبجدي
    return [...items].sort((a, b) => {
      const t = (x) => x.service.last_opened_at || '';
      return t(b).localeCompare(t(a)) || a.service.name.localeCompare(b.service.name, 'ar');
    });
  }

  const scored = [];
  for (const item of items) {
    let best = fieldScore(q, item.service.name) * WEIGHTS.name;
    for (const a of item.aliases) best = Math.max(best, fieldScore(q, a.alias) * WEIGHTS.alias);
    if (item.service.note) best = Math.max(best, fieldScore(q, item.service.note) * WEIGHTS.note);
    for (const acc of item.accounts) {
      best = Math.max(best, fieldScore(q, acc.email) * WEIGHTS.email);
      best = Math.max(best, fieldScore(q, acc.username) * WEIGHTS.username);
      best = Math.max(best, fieldScore(q, acc.note) * WEIGHTS.note);
    }
    if (best > 0) scored.push({ item, score: best });
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const t = (x) => x.item.service.last_opened_at || '';
      return t(b).localeCompare(t(a)) ||
             a.item.service.name.localeCompare(b.item.service.name, 'ar');
    })
    .map((s) => s.item);
}
