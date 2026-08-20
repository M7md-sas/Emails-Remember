// ---------------------------------------------------------------------------
//  طبقة البيانات
//  تجمع الجداول الأربعة في شكل واحد تستهلكه الشاشات، وتحمل قواعد المجال:
//  ما معنى أن حساباً يخالف قاعدته، وما معنى أنه ناقص.
// ---------------------------------------------------------------------------
import * as store from './store.js';
import { rootDomain, normalize } from './search.js';

export const LOGIN_METHODS = {
  email:  'إيميل وكلمة مرور',
  google: 'الدخول بحساب جوجل',
  apple:  'الدخول بحساب آبل',
  phone:  'برقم الجوال',
  other:  'طريقة أخرى',
};

export const STATUSES = {
  active:     'نشط',
  closed:     'مقفل',
  to_migrate: 'يحتاج نقل',
};

/** الشكل الذي تقرأه كل الشاشات: خدمة ومعها مرادفاتها وحساباتها. */
export async function loadAll() {
  const [identities, services, aliases, accounts] = await Promise.all([
    store.all('identities'),
    store.all('services'),
    store.all('service_aliases'),
    store.all('accounts'),
  ]);

  const byService = new Map(services.map((s) => [s.id, { service: s, aliases: [], accounts: [] }]));
  for (const a of aliases) byService.get(a.service_id)?.aliases.push(a);
  for (const a of accounts) byService.get(a.service_id)?.accounts.push(a);

  identities.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ar'));

  return { identities, items: [...byService.values()], accounts, services };
}

export function identityById(identities, id) {
  return identities.find((i) => i.id === id) || null;
}

export function defaultIdentity(identities) {
  return identities.find((i) => i.is_default) || identities[0] || null;
}

/** الحساب يخالف قاعدته إذا كان مربوطاً بهوية لكنه استعمل إيميلاً غيرها. */
export function deviates(account, identities) {
  if (!account.identity_id || !account.email) return false;
  const ident = identityById(identities, account.identity_id);
  if (!ident) return false;
  return normalize(ident.email) !== normalize(account.email);
}

/**
 * الطابور: ما لم تنظر إليه بعد، ولا شيء غيره.
 *
 * كان التعريف يشمل "بلا هوية" و"يخالف قاعدته"، وكان خطأً قاتلاً: شاشة
 * المراجعة لا تملك إزالة أيٍّ منهما، فيرجع السجل نفسه بعد كل حفظ ويبدو
 * الزر كأنه لا يعمل. الطابور الذي لا ينفد ليس طابوراً.
 *
 * الملاحظتان تحتهما لم تُلغَ — صارتا وصفاً يُعرض وقائمة تُتصفَّح، لا قيداً
 * يحبس السجل إلى الأبد.
 */
export function awaitingReview(account) {
  return account.confidence === 'imported';
}

export function missingIdentity(account) {
  return !account.identity_id;
}

/** كل ما يستحق نظرة، مقسّماً على أسبابه. الأقسام تتقاطع عمداً. */
export function reviewBuckets(accounts, identities) {
  const live = accounts.filter((a) => a.status !== 'closed');
  return {
    queue:    live.filter(awaitingReview),
    noIdent:  live.filter((a) => !awaitingReview(a) && missingIdentity(a)),
    deviant:  live.filter((a) => !awaitingReview(a) && deviates(a, identities)),
  };
}

/** يبحث عن خدمة قائمة بأي مرادف أو بالاسم — أساس منع الحسابات المكررة. */
export function matchService(items, text) {
  const q = normalize(text);
  const domain = rootDomain(text);
  if (!q && !domain) return null;
  return items.find((it) => {
    if (normalize(it.service.name) === q) return true;
    return it.aliases.some((a) => {
      if (normalize(a.alias) === q) return true;
      return a.kind === 'domain' && domain && rootDomain(a.alias) === domain;
    });
  }) || null;
}

// --- الكتابة --------------------------------------------------------------

export async function createService({ name, note = null, aliases = [] }) {
  const service = await store.save('services', {
    id: store.newId(),
    name: name.trim(),
    note: note || null,
    last_opened_at: null,
    created_at: new Date().toISOString(),
    deleted_at: null,
  });
  await addAliases(service.id, aliases);
  return service;
}

export async function addAliases(serviceId, aliases) {
  const rows = aliases
    .filter((a) => a && a.alias && a.alias.trim())
    .map((a) => ({
      id: store.newId(),
      service_id: serviceId,
      alias: a.alias.trim(),
      kind: a.kind || 'name',
      created_at: new Date().toISOString(),
      deleted_at: null,
    }));
  return store.saveMany('service_aliases', rows);
}

export async function saveAccount(account) {
  const now = new Date().toISOString();
  return store.save('accounts', {
    id: account.id || store.newId(),
    created_at: account.created_at || now,
    deleted_at: account.deleted_at || null,
    service_id: account.service_id,
    identity_id: account.identity_id || null,
    email: account.email ? account.email.trim() : null,
    username: account.username ? account.username.trim() : null,
    login_method: account.login_method || 'email',
    status: account.status || 'active',
    note: account.note || null,
    source: account.source || 'manual',
    confidence: account.confidence || 'confirmed',
    confirmed_at: account.confirmed_at || (account.confidence === 'imported' ? null : now),
  });
}

/** زر "نجح الدخول" — يحوّل المستورد إلى مؤكّد بضغطة واحدة أثناء الاستعمال. */
export async function confirmAccount(account) {
  return store.save('accounts', {
    ...account,
    confidence: 'confirmed',
    confirmed_at: new Date().toISOString(),
  });
}

/** يسجّل أنك فتحت هذه الخدمة — به يرتّب البحث ما تستعمله كثيراً. */
export async function touchService(service) {
  return store.save('services', { ...service, last_opened_at: new Date().toISOString() });
}

export const removeAccount = (id) => store.remove('accounts', id);
export const removeService = (id) => store.remove('services', id);

// هويات مقترحة تُعرض في الشاشة الفارغة — تعدّلها كما تشاء، وليست إلزامية
export const STARTER_IDENTITIES = [
  { name: 'شخصي',      why: 'حساباتي الخاصة التي أهتم بها فعلاً', color: '#2563eb' },
  { name: 'العمل',      why: 'كل ما يخص الشغل والمراسلات الرسمية', color: '#059669' },
  { name: 'تسوق',       why: 'المتاجر والتوصيل — الإيميل يمتلئ بالعروض', color: '#d97706' },
  { name: 'تجارب',      why: 'تسجيل سريع لتجربة شيء لا أنوي البقاء فيه', color: '#7c3aed' },
];
