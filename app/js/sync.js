// ---------------------------------------------------------------------------
//  المزامنة
//  الاتجاهان يشتغلان في الخلفية ولا تنتظرهما أي شاشة. لو ما فيه نت تفشل
//  بصمت ويظل التطبيق كامل الوظيفة على النسخة المحلية.
// ---------------------------------------------------------------------------
import { TABLES } from './config.js';
import * as api from './api.js';
import * as store from './store.js';

let running = false;
let queued = false;
const listeners = new Set();

export function onSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(state, detail) {
  for (const fn of listeners) fn(state, detail);
}

const cursorKey = (table) => 'cursor.' + table;

/**
 * السحب أولاً ثم الرفع.
 *
 * المؤشّر يتقدّم بأكبر updated_at رجع من الخادم، لا بساعة الجهاز — لأن ساعة
 * الجهاز قد تكون مغلوطة وتقفز فوق صفوف لن تُسحب أبداً بعدها.
 *
 * ولا يتقدّم المؤشّر بعد الرفع عمداً: الصفوف التي رفعناها سترجع في السحب
 * التالي، وهذا تكرار بلا ضرر مقابل ضمان أننا لا نتخطى تعديلاً من جهاز آخر
 * وقع بين رفعتنا والمؤشّر.
 */
export async function sync() {
  if (!api.isSignedIn()) return { skipped: 'لا توجد جلسة' };
  if (running) {
    queued = true;
    return { skipped: 'قيد التشغيل' };
  }
  running = true;
  emit('running');

  let pulled = 0;
  let pushed = 0;
  try {
    // --- السحب: الأصول قبل ما يعتمد عليها ---
    for (const table of TABLES) {
      const since = await store.meta(cursorKey(table));
      const rows = await api.selectSince(table, since);
      if (rows.length) {
        await store.acceptFromServer(table, rows);
        const newest = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), since || '');
        await store.setMeta(cursorKey(table), newest);
        pulled += rows.length;
      }
    }

    // --- الرفع: نفس الترتيب، وإلا رُفض حساب قبل خدمته ---
    for (const table of TABLES) {
      const mine = await store.dirty(table);
      if (!mine.length) continue;
      // نجرّد العلم المحلي والطابع المحلي — الخادم هو من يختم الوقت الرسمي
      const payload = mine.map(({ _dirty, updated_at, ...row }) => row);
      const saved = await api.upsert(table, payload);
      await store.acceptFromServer(table, saved);
      pushed += saved.length;
    }

    await store.setMeta('last_sync_ok', new Date().toISOString());
    emit('ok', { pulled, pushed });
    return { pulled, pushed };
  } catch (err) {
    // انقطاع النت هو الحالة الطبيعية هنا ولا يستحق إزعاج المستخدم
    emit('offline', { message: err.message });
    return { error: err.message };
  } finally {
    running = false;
    if (queued) {
      queued = false;
      setTimeout(sync, 400);
    }
  }
}

let timer = null;

/** يجمّع عدة تعديلات متتابعة في مزامنة واحدة بدل مزامنة لكل ضغطة. */
export function syncSoon(delay = 1200) {
  clearTimeout(timer);
  timer = setTimeout(sync, delay);
}

/** يعيد المحاولة تلقائياً لحظة رجوع النت. */
export function watchConnection() {
  window.addEventListener('online', () => sync());
}
