// ---------------------------------------------------------------------------
//  شاشة الجواب
//  الفعل الحقيقي هنا هو اللصق في حقل الدخول، فالإيميل كبير وزر النسخ أول شيء.
//  وطريقة الدخول تحته مباشرة لأن "دخلت بحساب جوجل" تلغي الإيميل تماماً.
// ---------------------------------------------------------------------------
import { loadAll, identityById, confirmAccount, touchService, removeService,
         deviates, LOGIN_METHODS, STATUSES } from '../data.js';
import { syncSoon } from '../sync.js';
import { $, esc, go, back, toast, copyText, relativeDays, confirmDialog } from '../ui.js';
import { render } from '../app.js';

export async function show(root, { id }) {
  const { identities, items } = await loadAll();
  const item = items.find((i) => i.service.id === id);
  if (!item) return go('#/');

  const { service, aliases, accounts } = item;
  touchService(service).then(syncSoon);

  const live = accounts.filter((a) => a.status !== 'closed');
  const closed = accounts.filter((a) => a.status === 'closed');

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back">›</button>
      <h1 class="grow">${esc(service.name)}</h1>
      <a class="icon" href="#/account/new?service=${esc(service.id)}" title="أضف حساباً">+</a>
    </div>

    ${aliases.length ? `<div class="chips pad">
      ${aliases.map((a) => `<span class="chip mono">${esc(a.alias)}</span>`).join('')}
    </div>` : ''}

    ${service.note ? `<p class="note pad">${esc(service.note)}</p>` : ''}

    <div class="stack pad">
      ${live.map((a) => answerCard(a, identities)).join('') ||
        `<p class="muted center">ما فيه حساب نشط. <a href="#/account/new?service=${esc(service.id)}">أضف واحداً</a></p>`}
      ${closed.length ? `<details class="closed">
          <summary>${closed.length} حساب مقفل</summary>
          ${closed.map((a) => answerCard(a, identities)).join('')}
        </details>` : ''}
    </div>

    <div class="pad">
      <button class="btn ghost danger wide" data-act="del-service">حذف الخدمة كاملة</button>
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
      const acc = accounts.find((a) => a.id === btn.dataset.id);
      await confirmAccount(acc);
      syncSoon();
      toast('صار مؤكّداً');
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

  // الجواب الأكبر: العنوان إذا الدخول بالإيميل، وإلا طريقة الدخول نفسها
  const headline = byEmail ? value : LOGIN_METHODS[account.login_method];

  const trust = account.confidence === 'confirmed'
    ? `<span class="tag ok">مؤكّد ${esc(relativeDays(account.confirmed_at))}</span>`
    : `<span class="tag warn">مستورد — ما راجعته</span>`;

  const off = deviates(account, identities)
    ? `<p class="tiny warn-text">ينبّهك: هذا الحساب مربوط بهوية "${esc(ident.name)}"
       لكنه يستعمل إيميلاً غيرها.</p>`
    : '';

  return `
    <div class="answer">
      <div class="answer-main">
        <div class="big mono" dir="ltr">${esc(headline)}</div>
        ${value ? `<button class="btn primary copy" data-act="copy" data-value="${esc(value)}">نسخ</button>` : ''}
      </div>

      <div class="answer-meta">
        ${byEmail ? `<span class="tag">${esc(LOGIN_METHODS[account.login_method])}</span>` : ''}
        ${ident ? `<span class="tag" style="--c:${esc(ident.color)}"><span class="dot" style="background:${esc(ident.color)}"></span>${esc(ident.name)}</span>` : `<span class="tag soft">بلا هوية</span>`}
        ${trust}
        ${account.status !== 'active' ? `<span class="tag soft">${esc(STATUSES[account.status])}</span>` : ''}
      </div>

      ${!byEmail && value ? `<p class="tiny muted">الحساب المربوط: <span class="mono" dir="ltr">${esc(value)}</span></p>` : ''}
      ${account.username && byEmail ? `<p class="tiny muted">اسم المستخدم: <span class="mono" dir="ltr">${esc(account.username)}</span></p>` : ''}
      ${account.note ? `<p class="note">${esc(account.note)}</p>` : ''}
      ${off}

      <div class="row gap end">
        ${account.confidence === 'imported'
          ? `<button class="btn small" data-act="confirm" data-id="${esc(account.id)}">نجح الدخول — أكّده</button>`
          : ''}
        <a class="btn small ghost" href="#/account/${esc(account.id)}">تعديل</a>
      </div>
    </div>`;
}
