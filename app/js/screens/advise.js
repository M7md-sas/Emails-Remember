// ---------------------------------------------------------------------------
//  شاشة "وش أستعمل"
//
//  هذه الشاشة هي الحل الفعلي للمشكلة. جملة المستخدم كانت "أختار إيميل بس
//  أنسى بعدين"، وفيها خطوتان: يختار، ثم يُفترض أن يسجّل. الثانية هي التي
//  تسقط دائماً. فهنا نضغط الخطوتين في واحدة: زر واحد ينسخ الإيميل ويحفظ
//  السجل معاً، فلا تبقى خطوة تُنسى أصلاً.
//
//  وتنبيه التعارض يجي مجاناً: قبل أن ننصح لازم نبحث، وإذا لقينا حساباً
//  قائماً عرضناه بدل النصيحة.
// ---------------------------------------------------------------------------
import { loadAll, matchService, defaultIdentity, createService, saveAccount,
         LOGIN_METHODS } from '../data.js';
import { rootDomain, labelFromDomain, normalize } from '../search.js';
import { syncSoon } from '../sync.js';
import { $, esc, go, back, toast, copyText, options } from '../ui.js';
import { icon } from '../icons.js';

export async function show(root, params) {
  const { identities, items } = await loadAll();

  if (!identities.length) {
    root.innerHTML = `
      <div class="topbar"><button class="icon" data-act="back" aria-label="رجوع">${icon('back')}</button><h1 class="grow">وش أستعمل</h1></div>
      <div class="empty">
        <h2>عرّف هوياتك أولاً</h2>
        <p class="muted">النصيحة تحتاج قاعدة تُبنى عليها — هوية أو أكثر بإيميلاتها.</p>
        <a class="btn primary big" href="#/identities">تعريف الهويات</a>
      </div>`;
    root.onclick = (e) => { if (e.target.closest('[data-act="back"]')) back(); };
    return;
  }

  let chosen = defaultIdentity(identities);

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back" aria-label="رجوع">${icon('back')}</button>
      <h1 class="grow">وش أستعمل</h1>
    </div>
    <div class="pad stack">
      <label>الموقع أو التطبيق
        <input id="q" type="text" placeholder="noon.com أو إنستقرام" value="${esc(params.q || '')}"
               autocomplete="off">
      </label>
      <div id="verdict"></div>
    </div>`;

  const input = $('#q', root);
  const verdict = $('#verdict', root);

  const draw = () => {
    const raw = input.value.trim();
    if (!raw) { verdict.innerHTML = ''; return; }

    const existing = matchService(items, raw);
    if (existing) { verdict.innerHTML = alreadyHave(existing); return; }
    verdict.innerHTML = advice(raw, chosen, identities);
  };

  input.oninput = draw;
  draw();
  if (!params.q) input.focus();

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'back') return back();
    if (act === 'open') return go('#/s/' + btn.dataset.id);

    if (act === 'save') {
      const raw = input.value.trim();
      if (!raw) return;
      btn.disabled = true;

      // ننسخ أولاً: النسخ يحتاج تفاعلاً مباشراً وقد يُرفض بعد انتظار الحفظ
      const copied = await copyText(chosen.email);

      const domain = rootDomain(raw);
      const name = domain ? labelFromDomain(domain) : raw;

      // النطاق وحده يُحفظ كنطاق. الرابط الكامل بمساره لا ينفع مرادفاً ولا
      // يطابق شيئاً، والاسم المقروء يُحفظ فقط إذا كان اسماً لا رابطاً.
      const aliases = [];
      if (domain) aliases.push({ alias: domain, kind: 'domain' });
      const rawIsUrl = /[/:]/.test(raw);
      if (!rawIsUrl && normalize(raw) !== normalize(domain)) {
        aliases.push({ alias: raw, kind: 'name' });
      }

      const service = await createService({ name, aliases });
      await saveAccount({
        service_id: service.id,
        identity_id: chosen.id,
        email: chosen.email,
        login_method: $('#method', root).value,
        source: 'manual',
        confidence: 'confirmed',
      });
      syncSoon();
      toast(copied ? 'اننسخ الإيميل واتسجّل' : 'اتسجّل — انسخ الإيميل يدوياً', copied ? 'ok' : 'warn');
      return go('#/s/' + service.id);
    }
  };

  root.addEventListener('change', (e) => {
    if (e.target.id === 'identity') {
      chosen = identities.find((i) => i.id === e.target.value) || chosen;
      draw();
    }
  });
}

function alreadyHave(item) {
  const rows = item.accounts.filter((a) => a.status !== 'closed');
  return `
    <div class="card warnbox">
      <h3>عندك حساب هنا أصلاً</h3>
      <p class="muted tiny">لا تفتح حساباً ثانياً بالغلط — هذا ما استعملته من قبل:</p>
      ${rows.map((a) => `<div class="big mono" dir="ltr">${esc(a.email || a.username || LOGIN_METHODS[a.login_method])}</div>`).join('')}
      <button class="btn primary wide" data-act="open" data-id="${esc(item.service.id)}">
        افتح ${esc(item.service.name)}
      </button>
    </div>`;
}

function advice(raw, chosen, identities) {
  return `
    <div class="card">
      <p class="muted tiny">جديد عليك. القاعدة تقول استعمل:</p>
      <div class="big mono" dir="ltr">${esc(chosen.email)}</div>
      ${chosen.why ? `<p class="note">${esc(chosen.why)}</p>` : ''}

      <label>الهوية
        <select id="identity">
          ${identities.map((i) =>
            `<option value="${esc(i.id)}"${i.id === chosen.id ? ' selected' : ''}>${esc(i.name)} — ${esc(i.email)}</option>`
          ).join('')}
        </select>
      </label>

      <label>طريقة الدخول
        <select id="method">${options(LOGIN_METHODS, 'email')}</select>
      </label>

      <button class="btn primary big wide" data-act="save">انسخ الإيميل وسجّله</button>
      <p class="tiny muted center">ضغطة واحدة تنسخ وتحفظ معاً — ما تبقى خطوة تُنسى</p>
    </div>`;
}
