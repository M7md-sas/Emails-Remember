// ---------------------------------------------------------------------------
//  العامل الخدمي
//  مهمته واحدة: أن يفتح التطبيق وأنت على وضع الطيران. البيانات ليست هنا —
//  هي في IndexedDB — وهذا يخزّن هيكل التطبيق فقط.
//
//  ارفع الرقم عند كل نشر يغيّر ملفاً من القائمة، وإلا بقي القديم عند المستخدم.
// ---------------------------------------------------------------------------
const VERSION = 'daftar-v1';

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

  // التنقل يرجع للصفحة المخزّنة عند انقطاع الشبكة، ومنها يقلع التطبيق محلياً
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html', { ignoreSearch: true }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
