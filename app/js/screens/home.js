// ---------------------------------------------------------------------------
//  شاشة البحث
//
//  البطاقة ثلاثة أسطر بترتيب ثابت لا يتغيّر أبداً: الاسم، ثم الإيميل، ثم
//  الهوية. الثبات هو ما يجعل المسح بالعين ممكناً — عين تعرف أين تنظر تقرأ
//  عشرين بطاقة في ثانيتين، وعين تبحث عن السطر في كل مرة تتعب من الخامسة.
//
//  والنطاق لا يُعرض: هو تفصيل بحث لا تفصيل قراءة. تبحث به فيوصلك، لكنه لا
//  يزاحم الجواب على الشاشة.
// ---------------------------------------------------------------------------
import { loadAll, identityById, LOGIN_METHODS } from '../data.js';
import { rank } from '../search.js';
import { icon } from '../icons.js';
import { $, esc, go } from '../ui.js';

export async function show(root, params) {
  const { identities, items } = await loadAll();

  root.innerHTML = `
    <div class="search-head">
      <div class="search-field">
        ${icon('search')}
        <input id="q" type="search" placeholder="اسم الموقع أو التطبيق"
               autocomplete="off" enterkeyhint="search" aria-label="ابحث"
               value="${esc(params.q || '')}">
      </div>
    </div>
    <div id="results" class="list"></div>`;

  const input = $('#q', root);
  const out = $('#results', root);

  const draw = () => {
    if (!items.length) { out.innerHTML = firstRun(); return; }

    const q = input.value.trim();
    const found = rank(q, items);
    const rows = found.slice(0, 60).map((it) => card(it, identities)).join('');

    const ask = q
      ? `<button class="btn ghost wide" data-q="${esc(q)}" style="margin-top:var(--s2)">
           ${icon('wand', 's')} ${found.length ? 'مو هذا اللي تدوّر؟' : ''} وش أستعمل لـ ${esc(q)}؟
         </button>`
      : '';

    out.innerHTML = (rows || `<p class="muted center pad">ما فيه نتيجة</p>`) + ask;
  };

  input.oninput = draw;
  draw();

  // لا نركّز تلقائياً على الجوال حتى لا تقفز لوحة المفاتيح فوق النتائج
  if (window.matchMedia('(min-width: 720px)').matches) input.focus();

  out.onclick = (e) => {
    const ask = e.target.closest('[data-q]');
    if (ask) return go('#/new?q=' + encodeURIComponent(ask.dataset.q));
    const row = e.target.closest('[data-service]');
    if (row) go('#/s/' + row.dataset.service);
  };
}

function card(item, identities) {
  const { service, accounts } = item;
  const live = accounts.filter((a) => a.status !== 'closed');
  const shown = live.length ? live : accounts;
  const first = shown[0];

  let mail = '<span class="muted">ما فيه حساب مسجّل</span>';
  let meta = '';

  if (first) {
    // الجواب الحقيقي: العنوان إن كان الدخول بإيميل، وإلا طريقة الدخول نفسها
    mail = first.login_method === 'email'
      ? `<span class="mono">${esc(first.email || first.username || '—')}</span>`
      : esc(LOGIN_METHODS[first.login_method]);

    const ident = identityById(identities, first.identity_id);
    const bits = [];
    if (ident) {
      bits.push(`<span class="tag"><span class="dot" style="background:${esc(ident.color)}"></span>${esc(ident.name)}</span>`);
    }
    if (first.confidence === 'imported') bits.push('<span class="tag warn">ما راجعته</span>');
    if (shown.length > 1) bits.push(`<span class="tag">و${shown.length - 1} غيره</span>`);
    meta = bits.length ? `<div class="row-meta">${bits.join('')}</div>` : '';
  }

  return `
    <button class="row-card" data-service="${esc(service.id)}">
      <span class="grow">
        <span class="row-name">${esc(service.name)}</span>
        <span class="row-mail">${mail}</span>
        ${meta}
      </span>
      ${icon('chevron')}
    </button>`;
}

function firstRun() {
  return `
    <div class="empty">
      <span class="glyph">${icon('inbox')}</span>
      <h2>الدفتر فاضي</h2>
      <p>
        مشكلتك في الحسابات القديمة لا الجديدة، فابدأ باستيراد ما يحفظه متصفحك
        أصلاً — يطلع لك مئات السجلات دفعة واحدة.
      </p>
      <a class="btn primary big" href="#/import">${icon('upload', 's')} استيراد من المتصفح</a>
      <a class="btn ghost" href="#/identities">أو عرّف هوياتك أولاً</a>
    </div>`;
}
