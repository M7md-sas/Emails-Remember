// ---------------------------------------------------------------------------
//  التصدير والاستعادة
//  الملف الناتج هو طريق خروجك: يفتح بأي محرر، ويرجع للتطبيق كما هو. فلا
//  تنحبس في Supabase ولا يضيع شيء لو توقّف المشروع أو ضاع الحساب.
// ---------------------------------------------------------------------------
import { TABLES, BACKUP_REMINDER_DAYS } from './config.js';
import * as store from './store.js';

const FORMAT = 'daftar-hawiyat';
const VERSION = 1;

export async function buildBackup() {
  const tables = {};
  for (const t of TABLES) {
    // النسخة تشمل المحذوف ناعماً — وإلا رجع المحذوف حياً عند الاستعادة
    tables[t] = (await store.all(t, { withDeleted: true })).map(({ _dirty, ...row }) => row);
  }
  return {
    format: FORMAT,
    version: VERSION,
    exported_at: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    tables,
  };
}

export async function downloadBackup() {
  const backup = await buildBackup();
  const stamp = backup.exported_at.slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `دفتر-الهويات-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  await store.setMeta('last_backup_at', backup.exported_at);
  return backup.counts;
}

/**
 * يستبدل كل ما هو محلي بمحتوى الملف، ويعلّم كل صف للرفع حتى ينتشر للخادم
 * وللأجهزة الأخرى. المؤشّرات تُصفَّر عمداً ليُعاد بناء الحالة من الصفر.
 */
export async function restoreBackup(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.format !== FORMAT) {
    throw new Error('هذا ليس ملف نسخة احتياطية من دفتر الهويات');
  }

  await store.wipe();
  const counts = {};
  for (const t of TABLES) {
    const rows = data.tables[t] || [];
    await store.saveMany(t, rows);
    counts[t] = rows.length;
  }
  return counts;
}

export async function daysSinceBackup() {
  const last = await store.meta('last_backup_at');
  if (!last) return Infinity;
  return Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
}

export async function backupIsDue() {
  return (await daysSinceBackup()) >= BACKUP_REMINDER_DAYS;
}
