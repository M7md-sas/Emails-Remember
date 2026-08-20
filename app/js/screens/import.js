// ---------------------------------------------------------------------------
//  شاشة الاستيراد
//  التطبيق الذي يبدأ فاضياً يموت في أسبوع، ومشكلة المستخدم كلها في حساباته
//  القديمة. فهذه الشاشة ليست ميزة إضافية — هي شرط أن تنفع الفكرة أصلاً.
// ---------------------------------------------------------------------------
import { extractEntries, planImport } from '../import-csv.js';
import { loadAll, createService, addAliases, saveAccount } from '../data.js';
import { sync } from '../sync.js';
import { $, esc, back, toast } from '../ui.js';
import { render } from '../app.js';

export async function show(root) {
  const { items } = await loadAll();
  let plan = null;

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back">›</button>
      <h1 class="grow">استيراد من المتصفح</h1>
    </div>

    <div class="pad stack">
      <div class="card">
        <h3>كيف تطلّع الملف</h3>
        <ol class="steps">
          <li>افتح كروم أو إيدج، ثم إعدادات، ثم كلمات المرور</li>
          <li>من قائمة النقاط الثلاث اختر تصدير كلمات المرور</li>
          <li>يطلع ملف بامتداد <span class="mono">csv</span> — اختره تحت</li>
        </ol>
        <p class="tiny muted">
          على الآيفون يطلع من الإعدادات ثم كلمات المرور ثم تصدير، وعلى فَيَرفُكس
          من إدارة كلمات المرور. الملف يشتغل من أي واحد منهم.
        </p>
      </div>

      <div class="card danger-box">
        <h3>انتبه قبل ما تبدأ</h3>
        <p>
          الملف الذي يطلّعه المتصفح فيه <b>كلمات مرورك بنص واضح</b> على قرصك.
          التطبيق يمسح عمود كلمة المرور فور القراءة ولا يرفعه لأي مكان، لكن
          الملف نفسه يظل على جهازك — <b>احذفه فور انتهاء الاستيراد</b>.
        </p>
      </div>

      <label class="filedrop">
        <input id="file" type="file" accept=".csv,text/csv" hidden>
        <span class="btn primary big wide">اختر ملف csv</span>
      </label>

      <div id="preview"></div>
    </div>`;

  const preview = $('#preview', root);

  $('#file', root).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    preview.innerHTML = '<p class="muted center">جارٍ القراءة…</p>';
    try {
      const text = await file.text();
      const { entries, skipped, hadPasswords } = extractEntries(text);
      if (!entries.length) {
        preview.innerHTML = `<p class="error">ما لقيت سجلات في هذا الملف. تأكد أنه ملف كلمات المرور المُصدَّر من المتصفح.</p>`;
        return;
      }
      plan = planImport(entries, items);
      preview.innerHTML = summary(plan, skipped, hadPasswords);
    } catch (ex) {
      preview.innerHTML = `<p class="error">ما قدرت أقرأ الملف: ${esc(ex.message)}</p>`;
    }
  };

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'back') return back();

    if (btn.dataset.act === 'apply' && plan) {
      btn.disabled = true;
      btn.textContent = 'جارٍ الحفظ…';
      const n = await applyPlan(plan);
      toast(`اتحفظ ${n.services} خدمة و${n.accounts} حساباً`, 'ok');
      // الرفع قد يطول مع مئات الصفوف، فلا نحبس الشاشة عليه
      sync();
      location.hash = '#/review';
      return render();
    }
  };
}

function summary(plan, skipped, hadPasswords) {
  const merged = plan.mergedServices.length;
  return `
    <div class="card">
      <h3>قبل ما أحفظ شيئاً</h3>
      <div class="stats">
        <div class="stat"><b>${plan.newServices.length}</b><span>خدمة جديدة</span></div>
        <div class="stat"><b>${plan.newAccounts}</b><span>حساب</span></div>
        <div class="stat"><b>${merged}</b><span>اندمجت مع موجود</span></div>
      </div>
      <p class="tiny muted">
        ${hadPasswords
          ? 'لقيت عمود كلمة مرور في الملف وممسوح من الذاكرة قبل أي شيء آخر.'
          : 'ما فيه عمود كلمة مرور في هذا الملف أصلاً.'}
        ${skipped ? ` وتخطيت ${skipped} سطراً بلا موقع ولا اسم.` : ''}
      </p>
      <p class="tiny muted">
        كل حساب يُحفظ بعلامة "مستورد" وبلا هوية. تراجعه على مهلك من قائمة
        النواقص، أو يتأكّد وحده أول ما تستعمله وينجح الدخول.
      </p>
      <button class="btn primary big wide" data-act="apply">احفظها كلها</button>
    </div>`;
}

async function applyPlan(plan) {
  let services = 0;
  let accounts = 0;

  for (const rec of plan.newServices) {
    const aliases = [];
    if (rec.group.domain) aliases.push({ alias: rec.group.domain, kind: 'domain' });
    if (rec.group.name && rec.group.name !== rec.group.domain) {
      aliases.push({ alias: rec.group.name, kind: 'name' });
    }
    const service = await createService({ name: rec.group.name, aliases });
    services++;
    for (const a of rec.accounts) {
      await saveAccount({ ...a, service_id: service.id });
      accounts++;
    }
  }

  for (const rec of plan.mergedServices) {
    const service = rec.existing.service;
    const known = new Set(rec.existing.aliases.map((a) => a.alias.toLowerCase()));
    const fresh = [];
    if (rec.group.domain && !known.has(rec.group.domain.toLowerCase())) {
      fresh.push({ alias: rec.group.domain, kind: 'domain' });
    }
    if (fresh.length) await addAliases(service.id, fresh);

    // لا نكرر حساباً بنفس الإيميل داخل نفس الخدمة
    const have = new Set(
      rec.existing.accounts.map((a) => (a.email || a.username || '').toLowerCase())
    );
    for (const a of rec.accounts) {
      const key = (a.email || a.username || '').toLowerCase();
      if (key && have.has(key)) continue;
      await saveAccount({ ...a, service_id: service.id });
      accounts++;
    }
  }

  return { services, accounts };
}
