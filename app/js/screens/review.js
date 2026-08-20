// ---------------------------------------------------------------------------
//  قائمة الناقص
//  بعد الاستيراد تكون مئات السجلات بلا هوية وغير مؤكّدة. هذه الشاشة تعرضها
//  واحداً واحداً بأزرار سريعة، فتنظّفها على فترات بدل ما تواجه كومة كاملة.
// ---------------------------------------------------------------------------
import { loadAll, needsReview, deviates, saveAccount, confirmAccount,
         identityById, LOGIN_METHODS } from '../data.js';
import { syncSoon } from '../sync.js';
import { $, esc, back, toast, countRemaining } from '../ui.js';
import { render } from '../app.js';

export async function show(root) {
  const { identities, items, accounts } = await loadAll();
  const serviceOf = new Map(items.map((i) => [i.service.id, i.service]));
  const pending = accounts.filter((a) => needsReview(a, identities) && a.status !== 'closed');

  if (!pending.length) {
    root.innerHTML = `
      <div class="topbar">
        <button class="icon" data-act="back">›</button>
        <h1 class="grow">قائمة الناقص</h1>
      </div>
      <div class="empty">
        <h2>ما فيه شيء ناقص</h2>
        <p class="muted">كل حساباتك مربوطة بهوية ومؤكّدة.</p>
        <a class="btn ghost" href="#/">رجوع للبحث</a>
      </div>`;
    root.onclick = (e) => {
      if (e.target.closest('[data-act="back"]')) back();
    };
    return;
  }

  const current = pending[0];
  const service = serviceOf.get(current.service_id);
  const shown = current.email || current.username || LOGIN_METHODS[current.login_method];

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back">›</button>
      <h1 class="grow">قائمة الناقص</h1>
      <span class="tag soft">${esc(countRemaining(pending.length))}</span>
    </div>

    <div class="pad stack">
      <div class="card">
        <div class="title">${esc(service ? service.name : '—')}</div>
        <div class="big mono" dir="ltr">${esc(shown)}</div>
        ${reason(current, identities)}

        <label>اربطه بهوية
          <select id="ident">
            <option value="">بلا هوية</option>
            ${identities.map((i) =>
              `<option value="${esc(i.id)}"${i.id === current.identity_id ? ' selected' : ''}>${esc(i.name)} — ${esc(i.email)}</option>`
            ).join('')}
          </select>
        </label>

        <div class="row gap">
          <button class="btn ghost grow" data-act="skip">تخطَّ</button>
          <button class="btn primary grow" data-act="save">احفظ وأكّد</button>
        </div>
        <a class="btn small ghost wide" href="#/account/${esc(current.id)}">فتح التعديل الكامل</a>
      </div>
    </div>`;

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'back') return back();

    if (act === 'skip') {
      // التخطي يؤكّده كما هو، وإلا رجع في الدورة القادمة بلا نهاية
      await confirmAccount(current);
      syncSoon();
      return render();
    }

    if (act === 'save') {
      const identityId = $('#ident', root).value || null;
      const ident = identityById(identities, identityId);
      await saveAccount({
        ...current,
        identity_id: identityId,
        // لو ما فيه إيميل مسجّل نأخذه من الهوية — هذا أكثر الناقص شيوعاً
        email: current.email || (ident ? ident.email : null),
        confidence: 'confirmed',
        confirmed_at: new Date().toISOString(),
      });
      syncSoon();
      toast('اتأكّد');
      return render();
    }
  };
}

function reason(account, identities) {
  const bits = [];
  if (!account.identity_id) bits.push('بلا هوية');
  if (account.confidence === 'imported') bits.push('مستورد وما راجعته');
  if (deviates(account, identities)) {
    const ident = identityById(identities, account.identity_id);
    bits.push(`يخالف قاعدة ${ident.name} وإيميلها ${ident.email}`);
  }
  return `<p class="tiny warn-text">${esc(bits.join(' — '))}</p>`;
}
