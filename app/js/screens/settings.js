// ---------------------------------------------------------------------------
//  الإعدادات
// ---------------------------------------------------------------------------
import * as api from '../api.js';
import * as store from '../store.js';
import { sync } from '../sync.js';
import { downloadBackup, restoreBackup, daysSinceBackup } from '../export.js';
import { loadAll, reviewBuckets, repairServiceNames } from '../data.js';
import { $, esc, back, toast, confirmDialog, fmtDate, countRemaining, countIn } from '../ui.js';
import { render, pinIsSet } from '../app.js';
import { hashPin } from './login.js';
import { icon } from '../icons.js';
import { looksLikeHost } from '../search.js';

export async function show(root) {
  const { items, accounts, identities } = await loadAll();
  const lastSync = await store.meta('last_sync_ok');
  const lastBackup = await store.meta('last_backup_at');
  const due = (await daysSinceBackup()) >= 30;
  const session = api.getSession();
  const who = session && session.user ? session.user.email : '';
  // العدّاد يعرض الطابور وحده — الملاحظات تحته لا تُعدّ نواقص عالقة
  const buckets = reviewBuckets(accounts, identities);
  const pendingCount = buckets.queue.length;
  const notesCount = buckets.noIdent.length + buckets.deviant.length;
  // أسماء دخلت من المتصفح كأسماء مضيفين: "account.proton.me" بدل "Proton"
  const messyNames = items.filter((it) => looksLikeHost(it.service.name)).length;

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back" aria-label="رجوع">${icon('back')}</button>
      <h1 class="grow">الإعدادات</h1>
    </div>

    <div class="pad stack">
      <div class="card">
        <div class="stats">
          <div class="stat"><b>${items.length}</b><span>خدمة</span></div>
          <div class="stat"><b>${accounts.length}</b><span>حساب</span></div>
          <div class="stat"><b>${identities.length}</b><span>هوية</span></div>
        </div>
        <p class="tiny muted">آخر مزامنة ناجحة: ${lastSync ? esc(fmtDate(lastSync)) : 'ما تمت بعد'}</p>
        <button class="btn ghost wide" data-act="sync">${icon('refresh', 's')} زامن الآن</button>
      </div>

      <div class="card">
        <h3>الأدوات</h3>
        <a class="btn ghost wide" href="#/import">${icon('upload', 's')} استيراد من المتصفح</a>
        <a class="btn ghost wide" href="#/review">
          قائمة النواقص${pendingCount ? ` — ${esc(countRemaining(pendingCount))}`
            : notesCount ? ` — ${notesCount} ملاحظة` : ''}
        </a>
        <a class="btn ghost wide" href="#/dashboard">توزيع الحسابات على الإيميلات</a>
        ${messyNames ? `<button class="btn ghost wide" data-act="tidy">
          نظّف أسماء الخدمات — ${esc(countIn(messyNames,
            ['اسم خام واحد', 'اسمان خامان', 'أسماء خام', 'اسماً خاماً']))}</button>` : ''}
      </div>

      <div class="card ${due ? 'warnbox' : ''}">
        <h3>النسخة الاحتياطية</h3>
        <p class="tiny muted">
          ${lastBackup
            ? `آخر نسخة: ${esc(fmtDate(lastBackup))}${due ? ' — صار لها أكثر من شهر' : ''}`
            : 'ما صدّرت نسخة أبداً بعد'}
        </p>
        <p class="tiny muted">
          الملف يفتح بأي محرر ويرجع للتطبيق كما هو، فما تنحبس في Supabase ولو
          توقّف المشروع أو ضاع الحساب.
        </p>
        <button class="btn primary wide" data-act="export">${icon('download', 's')} صدّر نسخة الآن</button>
        <label class="filedrop">
          <input id="restore" type="file" accept=".json,application/json" hidden>
          <span class="btn ghost wide">استعادة من ملف</span>
        </label>
      </div>

      <div class="card">
        <h3>القفل الرقمي</h3>
        <p class="tiny muted">
          ${pinIsSet() ? 'مفعّل — يُطلب عند كل فتح.' : 'غير مفعّل.'}
          هذا حاجز سرعة أمام من يمسك جهازك، وليس تشفيراً: البيانات محفوظة
          داخل المتصفح ويقدر يقراها من يعرف أدوات المطوّر.
        </p>
        ${pinIsSet()
          ? `<button class="btn ghost wide" data-act="pin-off">ألغِ الرمز</button>`
          : `<button class="btn ghost wide" data-act="pin-on">فعّل رمزاً</button>`}
      </div>

      <div class="card">
        <h3>الحساب</h3>
        <p class="tiny muted mono" dir="ltr">${esc(who)}</p>
        <button class="btn ghost danger wide" data-act="signout">${icon('logout', 's')} خروج من الحساب</button>
        <p class="tiny muted">
          الخروج يمسح النسخة المحلية من هذا الجهاز. بياناتك تبقى على الخادم
          وترجع عند الدخول من جديد — بشرط أنك زامنت.
        </p>
      </div>
    </div>`;

  $('#restore', root).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const yes = await confirmDialog({
      title: 'استعادة من ملف؟',
      body: 'راح يُستبدل كل ما هو موجود على هذا الجهاز بمحتوى الملف، ثم يُرفع للخادم.',
      confirmLabel: 'استعِد',
      danger: true,
    });
    if (!yes) return;
    try {
      const counts = await restoreBackup(await file.text());
      toast(`استعدت ${counts.accounts} حساباً`, 'ok');
      sync();
      render();
    } catch (ex) {
      toast(ex.message, 'warn');
    }
  };

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'back') return back();

    if (act === 'sync') {
      btn.disabled = true;
      btn.textContent = 'يزامن…';
      const r = await sync();
      toast(
        r.error ? 'ما فيه اتصال — التطبيق يشتغل محلياً' : `نزل ${r.pulled} وطلع ${r.pushed}`,
        r.error ? 'warn' : 'ok'
      );
      return render();
    }

    if (act === 'tidy') {
      btn.disabled = true;
      const n = await repairServiceNames(items);
      sync();
      toast(n ? `نظّفت ${n} اسماً` : 'ما فيه شيء يحتاج تنظيفاً', 'ok');
      return render();
    }

    if (act === 'export') {
      await downloadBackup();
      toast('نزّلت النسخة', 'ok');
      return render();
    }

    if (act === 'pin-on') {
      const pin = prompt('اكتب رمزاً من أربعة أرقام إلى ثمانية');
      if (!pin || !/^\d{4,8}$/.test(pin)) return toast('لازم أربعة إلى ثمانية أرقام', 'warn');
      localStorage.setItem('daftar.pin', await hashPin(pin));
      toast('اتفعّل');
      return render();
    }

    if (act === 'pin-off') {
      localStorage.removeItem('daftar.pin');
      toast('انلغى');
      return render();
    }

    if (act === 'signout') {
      const yes = await confirmDialog({
        title: 'خروج من الحساب؟',
        body: 'النسخة المحلية راح تنمسح من هذا الجهاز. صدّر نسخة أولاً إذا ما زامنت.',
        confirmLabel: 'اخرج',
        danger: true,
      });
      if (!yes) return;
      await store.wipe();
      api.clearSession();
      localStorage.removeItem('daftar.pin');
      location.hash = '#/';
      return render();
    }
  };
}
