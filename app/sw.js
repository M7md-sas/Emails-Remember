// ---------------------------------------------------------------------------
//  العامل الخدمي
//  مهمته واحدة: أن يفتح التطبيق وأنت على وضع الطيران. البيانات ليست هنا —
//  هي في IndexedDB — وهذا يخزّن هيكل التطبيق فقط.
//
//  الاستراتيجية: يقدّم المخزون فوراً فيفتح التطبيق بلا انتظار، ثم يجيب
//  النسخة الجديدة في الخلفية فتصير جاهزة للفتحة القادمة. الترتيب مقصود —
//  لو سألنا الشبكة أولاً لتعطّل الفتح على اتصال بطيء، وهذا يناقض سبب وجود
//  التطبيق: أن تلقى الجواب وأنت واقف على شاشة دخول.
//
//  ارفع الرقم عند كل نشر يغيّر ملفاً من القائمة. بدونه يُمسح المخزون القديم
//  ولا يُبنى الجديد، فيظل المستخدم على نسخة قديمة بلا أن يدري.
// ---------------------------------------------------------------------------
const VERSION = 'daftar-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/data.js',
  './js/export.js',
  './js/import-csv.js',
  './js/search.js',
  './js/store.js',
  './js/sync.js',
  './js/ui.js',
  './js/screens/account.js',
  './js/screens/advise.js',
  './js/screens/answer.js',
  './js/screens/dashboard.js',
  './js/screens/home.js',
  './js/screens/identities.js',
  './js/screens/import.js',
  './js/screens/login.js',
  './js/screens/review.js',
  './js/screens/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // لا نُسقط التثبيت كله لو تعذّر ملف واحد
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // طلبات الخادم لا تُخزَّن أبداً — البيانات القديمة أسوأ من غيابها
  if (url.origin !== self.location.origin) return;

  event.respondWith(handle(request));
});

async function handle(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });

  // التحديث في الخلفية: لا ننتظره ولا نُسقط الطلب إن فشل
  const fresh = fetch(request)
    .then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  if (hit) return hit;

  const res = await fresh;
  if (res) return res;

  // بلا شبكة وبلا نسخة: التنقل يرجع للصفحة المخزّنة فيقلع التطبيق محلياً
  if (request.mode === 'navigate') {
    const shell = await cache.match('./index.html', { ignoreSearch: true });
    if (shell) return shell;
  }
  return new Response('غير متاح بلا اتصال', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
