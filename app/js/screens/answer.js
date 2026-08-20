// ---------------------------------------------------------------------------
//  شاشة الجواب
//
//  الفعل الحقيقي هنا هو اللصق في حقل الدخول، فالإيميل أكبر شيء وزر النسخ
//  ملاصق له. وطريقة الدخول تحته مباشرة لأن "دخلت بحساب جوجل" تلغي الإيميل.
//
//  والملاحظة التي كتبتها بيدك تُعرض كاملة وبارزة — هي سبب سؤال "ليش اخترت
//  هذا الإيميل"، ولا تُخفى خلف زر.
// ---------------------------------------------------------------------------
import { loadAll, identityById, confirmAccount, touchService, removeService,
         deviates, LOGIN_METHODS, STATUSES } from '../data.js';
import { syncSoon } from '../sync.js';
import { icon } from '../icons.js';
import { esc, go, back, toast, copyText, relativeDays, confirmDialog } from '../ui.js';
import { render } from '../app.js';

export async function show(root, { id }) {
  const { identities, items } = await loadAll();
  const item = items.find((i) => i.service.id === id);
  if (!item) return go('#/');

  const { service, aliases, accounts } = item;
  touchService(service).then(syncSoon);

  const live = accounts.filter((a) => a.status !== 'closed');
  const closed = accounts.filter((a) => a.status === 'closed');
  const domains = aliases.filter((a) => a.kind === 'domain');

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back" aria-label="رجوع">${icon('back')}</button>
      <h1>${esc(service.name)}</h1>
      <a class="icon" href="#/account/new?service=${esc(service.id)}" aria-label="أضف حساباً">${icon('plus')}</a>
    </div>

    <div class="pad stack">
      ${service.note ? `<p class="note">${esc(service.note)}</p>` : ''}

      ${live.map((a) => answerCard(a, identities)).join('') ||
        `<p class="muted center">ما فيه حساب نشط.
          <a href="#/account/new?service=${esc(service.id)}" style="color:var(--brand)">أضف واحداً</a></p>`}

      ${closed.length ? `
        <details class="card">
          <summary>${closed.length} حساب مقفل ${icon('caret', 's')}</summary>
          ${closed.map((a) => answerCard(a, identities)).join('')}
        </details>` : ''}

      ${domains.length ? `
        <div class="chips">
          ${domains.map((a) => `<span class="chip mono" dir="ltr">${esc(a.alias)}</span>`).join('')}
        </div>` : ''}

      <button class="btn ghost danger wide" data-act="del-service">
        ${icon('trash', 's')} حذف الخدمة كاملة
      </button>
    </div>`;

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'back') return back();

    if (act === 'copy') {
      const ok = await copyText(btn.dataset.value);
      toast(ok ? 'اننسخ' : 'ما قدرت أنسخ — انسخه يدوياً', ok ? 'ok' : 'warn');
      return;
    }

    if (act === 'confirm') {
      await confirmAccount(accounts.find((a) => a.id === btn.dataset.id));
      syncSoon();
      toast('صار مؤكّداً', 'ok');
      return render();
    }

    if (act === 'del-service') {
      const yes = await confirmDialog({
        title: 'حذف ' + service.name + '؟',
        body: 'راح تنحذف الخدمة وكل حساباتها من كل أجهزتك.',
        confirmLabel: 'احذف',
        danger: true,
      });
      if (!yes) return;
      await removeService(service.id);
      syncSoon();
      toast('انحذفت');
      return go('#/');
    }
  };
}

function answerCard(account, identities) {
  const ident = identityById(identities, account.identity_id);
  const byEmail = account.login_method === 'email';
  const value = account.email || account.username || '';
  const headline = byEmail ? value : LOGIN_METHODS[account.login_method];

  const trust = account.confidence === 'confirmed'
    ? `<span class="tag ok">${icon('check', 's')} مؤكّد ${esc(relativeDays(account.confirmed_at))}</span>`
    : `<span class="tag warn">${icon('alert', 's')} مستورد — ما راجعته</span>`;

  return `
    <div class="answer">
      <div class="answer-main">
        <div class="big mono" dir="ltr">${esc(headline)}</div>
        ${value ? `<button class="btn primary copy" data-act="copy" data-value="${esc(value)}">
          ${icon('copy', 's')} نسخ</button>` : ''}
      </div>

      <div class="answer-meta">
        ${byEmail ? `<span class="tag">${esc(LOGIN_METHODS[account.login_method])}</span>` : ''}
        ${ident
          ? `<span class="tag"><span class="dot" style="background:${esc(ident.color)}"></span>${esc(ident.name)}</span>`
          : `<span class="tag">بلا هوية</span>`}
        ${trust}
        ${account.status !== 'active' ? `<span class="tag">${esc(STATUSES[account.status])}</span>` : ''}
      </div>

      ${!byEmail && value ? `<p class="tiny muted">الحساب المربوط:
        <span class="mono" dir="ltr">${esc(value)}</span></p>` : ''}
      ${account.username && byEmail ? `<p class="tiny muted">اسم المستخدم:
        <span class="mono" dir="ltr">${esc(account.username)}</span></p>` : ''}

      ${account.note ? `<p class="note">${esc(account.note)}</p>` : ''}
      ${ident && ident.why && !account.note
        ? `<p class="note muted">${esc(ident.why)}</p>` : ''}

      ${deviates(account, identities)
        ? `<p class="tiny warn-text">${icon('alert', 's')} مربوط بهوية
           «${esc(ident.name)}» لكنه يستعمل إيميلاً غيرها</p>` : ''}

      <div class="row end">
        ${account.confidence === 'imported'
          ? `<button class="btn small" data-act="confirm" data-id="${esc(account.id)}">نجح الدخول — أكّده</button>`
          : ''}
        <a class="btn small ghost" href="#/account/${esc(account.id)}">تعديل</a>
      </div>
    </div>`;
}
