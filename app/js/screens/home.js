// ---------------------------------------------------------------------------
//  شاشة البحث
//  تقرأ من المحلي وحده فتظهر النتائج وأنت تكتب، وبدون نت.
// ---------------------------------------------------------------------------
import { loadAll, identityById, LOGIN_METHODS } from '../data.js';
import { rank } from '../search.js';
import { $, esc, go } from '../ui.js';

export async function show(root, params) {
  const { identities, items } = await loadAll();

  root.innerHTML = `
    <div class="search-head">
      <input id="q" type="search" placeholder="اكتب اسم الموقع أو التطبيق…"
             autocomplete="off" enterkeyhint="search" value="${esc(params.q || '')}">
    </div>
    <div id="results" class="list"></div>`;

  const input = $('#q', root);
  const out = $('#results', root);

  const draw = () => {
    const q = input.value.trim();
    const found = rank(q, items);

    if (!items.length) {
      out.innerHTML = emptyFirstRun();
      return;
    }

    const rows = found.slice(0, 60).map((it) => card(it, identities)).join('');
    // الباب الخلفي المهم: ما لقيت شيئاً؟ إذاً هو تسجيل جديد — اسأل وش تستعمل
    const ask = q
      ? `<button class="btn ghost wide ask" data-q="${esc(q)}">
           ${found.length ? 'مو هذا اللي تدوّر؟ ' : ''}وش أستعمل لـ <b>${esc(q)}</b>؟
         </button>`
      : '';

    out.innerHTML = (rows || `<p class="muted pad center">ما فيه نتيجة</p>`) + ask;
  };

  input.oninput = draw;
  draw();

  // لا نركّز تلقائياً على الجوال حتى لا تقفز لوحة المفاتيح فوق النتائج
  if (window.matchMedia('(min-width: 720px)').matches) input.focus();

  out.onclick = (e) => {
    const ask = e.target.closest('.ask');
    if (ask) return go('#/new?q=' + encodeURIComponent(ask.dataset.q));
    const card = e.target.closest('[data-service]');
    if (card) go('#/s/' + card.dataset.service);
  };
}

function card(item, identities) {
  const { service, aliases, accounts } = item;
  const live = accounts.filter((a) => a.status !== 'closed');
  const shown = live.length ? live : accounts;

  const lines = shown.slice(0, 3).map((a) => {
    const ident = identityById(identities, a.identity_id);
    const dot = ident
      ? `<span class="dot" style="background:${esc(ident.color)}"></span>`
      : `<span class="dot none"></span>`;
    const what = a.login_method === 'email'
      ? (a.email || a.username || '—')
      : LOGIN_METHODS[a.login_method];
    const flag = a.confidence === 'imported' ? `<span class="tag soft">مستورد</span>` : '';
    return `<div class="line">${dot}<span class="mono">${esc(what)}</span>${flag}</div>`;
  }).join('');

  const domain = aliases.find((a) => a.kind === 'domain');

  return `
    <button class="row-card" data-service="${esc(service.id)}">
      <div class="grow">
        <div class="title">${esc(service.name)}</div>
        ${domain ? `<div class="sub mono">${esc(domain.alias)}</div>` : ''}
        ${lines || '<div class="sub muted">ما فيه حساب مسجّل</div>'}
        ${shown.length > 3 ? `<div class="sub muted">و${shown.length - 3} غيرها</div>` : ''}
      </div>
      <span class="chev">‹</span>
    </button>`;
}

function emptyFirstRun() {
  return `
    <div class="empty">
      <h2>الدفتر فاضي</h2>
      <p class="muted">
        مشكلتك في الحسابات القديمة لا الجديدة، فابدأ باستيراد ما يحفظه متصفحك
        أصلاً — يطلع لك مئات السجلات دفعة واحدة.
      </p>
      <a class="btn primary big" href="#/import">استيراد من المتصفح</a>
      <a class="btn ghost" href="#/identities">أو عرّف هوياتك أولاً</a>
    </div>`;
}
