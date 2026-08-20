// ---------------------------------------------------------------------------
//  المسار والإقلاع
// ---------------------------------------------------------------------------
import * as api from './api.js';
import { sync, syncSoon, watchConnection, onSyncChange } from './sync.js';
import { $, go, toast } from './ui.js';
import { backupIsDue } from './export.js';

import * as loginScreen      from './screens/login.js';
import * as homeScreen       from './screens/home.js';
import * as answerScreen     from './screens/answer.js';
import * as adviseScreen     from './screens/advise.js';
import * as accountScreen    from './screens/account.js';
import * as identitiesScreen from './screens/identities.js';
import * as importScreen     from './screens/import.js';
import * as settingsScreen   from './screens/settings.js';
import * as dashboardScreen  from './screens/dashboard.js';
import * as reviewScreen     from './screens/review.js';

const ROUTES = {
  '':           homeScreen,
  's':          answerScreen,
  'new':        adviseScreen,
  'account':    accountScreen,
  'identities': identitiesScreen,
  'import':     importScreen,
  'settings':   settingsScreen,
  'dashboard':  dashboardScreen,
  'review':     reviewScreen,
};

// القفل الرقمي حاجز سرعة أمام من يمسك جهازك، وليس تشفيراً — مكتوب في الإعدادات
let unlocked = false;

export function markUnlocked() {
  unlocked = true;
}

export function pinIsSet() {
  return !!localStorage.getItem('daftar.pin');
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return {
    route: parts[0] || '',
    id: parts[1] || null,
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}

export async function render() {
  const root = $('#view');

  if (!api.isSignedIn()) return loginScreen.show(root, { mode: 'signin' });
  if (pinIsSet() && !unlocked) return loginScreen.show(root, { mode: 'lock' });

  const { route, id, params } = parseHash();
  const screen = ROUTES[route];
  if (!screen) return go('#/');

  document.body.dataset.route = route || 'home';
  try {
    await screen.show(root, { id, ...params });
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="pad"><p class="error">صار خطأ غير متوقع: ${err.message}</p></div>`;
  }
}

/**
 * الوصول من قائمة مشاركة أندرويد: يصل الرابط كمعامل في العنوان، فنحوّله
 * فوراً إلى شاشة "وش أستعمل" معبّأة، ثم ننظّف العنوان حتى لا يتكرر عند التحديث.
 */
function handleShareTarget() {
  const q = new URLSearchParams(location.search);
  const shared = q.get('url') || q.get('text') || q.get('title');
  if (!shared) return;
  history.replaceState(null, '', location.pathname);
  location.hash = '#/new?q=' + encodeURIComponent(shared);
}

function wireSyncIndicator() {
  const dot = $('#syncdot');
  onSyncChange((state) => {
    dot.dataset.state = state;
    dot.title = { running: 'يزامن…', ok: 'متزامن', offline: 'بلا اتصال — يعمل محلياً' }[state] || '';
  });
}

async function boot() {
  api.loadSession();
  wireSyncIndicator();
  watchConnection();
  handleShareTarget();

  window.addEventListener('hashchange', render);
  await render();

  if (api.isSignedIn()) {
    sync().then(() => render());
    if (await backupIsDue()) {
      toast('مر شهر بلا نسخة احتياطية — صدّر من الإعدادات', 'warn');
    }
  }

  registerWorker();
}

/**
 * العامل الخدمي معطّل على الجهاز المحلي افتراضياً.
 *
 * وظيفته العمل بدون نت على النسخة المنشورة، أما أثناء التطوير فهو يقدّم
 * ملفات مخزّنة ويخفي كل تعديل تكتبه — فتُصلح شيئاً وتحلف أنه ما انصلح.
 * لتجربته محلياً أضف `?sw=1` إلى العنوان.
 */
function registerWorker() {
  if (!('serviceWorker' in navigator)) return;

  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has('sw')) {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    return;
  }

  navigator.serviceWorker.register('./sw.js').then(watchForUpdate).catch(() => {});
}

/**
 * التطبيق يقلع من مخزون الجهاز، فالنسخة الجديدة لا تظهر إلا بعد إعادة فتح.
 * بدون هذا التنبيه تظل على نسخة قديمة بلا أن تدري، وتحسب أن الإصلاح ما وصل.
 */
function watchForUpdate(registration) {
  if (!registration) return;
  registration.addEventListener('updatefound', () => {
    const fresh = registration.installing;
    if (!fresh) return;
    fresh.addEventListener('statechange', () => {
      // وجود مسيطر حالي يعني أن هذي ترقية لا تثبيتاً أول
      if (fresh.state === 'installed' && navigator.serviceWorker.controller) {
        toast('نزل تحديث — سكّر التطبيق وافتحه من جديد', 'ok');
      }
    });
  });
}

// تُستدعى من الشاشات بعد أي كتابة
export { syncSoon };

boot();
