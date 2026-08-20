// ---------------------------------------------------------------------------
//  لوحة التوزيع
//  تجاوب سؤالاً واحداً: كم حساباً على كل إيميل، وأي إيميل محمّل زيادة.
//  قيمتها الحقيقية تظهر لو قررت توحيد إيميلاتك لاحقاً.
// ---------------------------------------------------------------------------
import { loadAll, identityById, LOGIN_METHODS } from '../data.js';
import { normalize } from '../search.js';
import { esc, back } from '../ui.js';

export async function show(root) {
  const { identities, accounts, items } = await loadAll();
  const serviceName = new Map(items.map((i) => [i.service.id, i.service.name]));

  const byEmail = new Map();
  for (const a of accounts) {
    if (a.status === 'closed') continue;
    const key = normalize(a.email) || 'no-email';
    if (!byEmail.has(key)) {
      byEmail.set(key, { label: a.email || 'بلا إيميل', count: 0, services: [], identity: null });
    }
    const group = byEmail.get(key);
    group.count++;
    if (group.services.length < 8) group.services.push(serviceName.get(a.service_id) || '—');
    if (!group.identity && a.identity_id) group.identity = identityById(identities, a.identity_id);
  }

  const groups = [...byEmail.values()].sort((a, b) => b.count - a.count);
  const max = groups.length ? groups[0].count : 1;

  const methods = new Map();
  for (const a of accounts) {
    if (a.status === 'closed') continue;
    methods.set(a.login_method, (methods.get(a.login_method) || 0) + 1);
  }

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back">›</button>
      <h1 class="grow">توزيع الحسابات</h1>
    </div>

    <div class="pad stack">
      ${groups.length ? '' : '<p class="muted center">ما فيه حسابات بعد</p>'}

      ${groups.map((g) => `
        <div class="card">
          <div class="row">
            ${g.identity ? `<span class="dot" style="background:${esc(g.identity.color)}"></span>` : ''}
            <div class="grow mono" dir="ltr">${esc(g.label)}</div>
            <b>${g.count}</b>
          </div>
          <div class="bar"><span style="width:${Math.round((g.count / max) * 100)}%"></span></div>
          <p class="tiny muted">${esc(g.services.join('، '))}${g.count > g.services.length ? ' …' : ''}</p>
        </div>`).join('')}

      ${methods.size ? `<div class="card">
        <h3>طرق الدخول</h3>
        ${[...methods.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) =>
          `<div class="row"><div class="grow">${esc(LOGIN_METHODS[m])}</div><b>${n}</b></div>`).join('')}
      </div>` : ''}
    </div>`;

  root.onclick = (e) => {
    if (e.target.closest('[data-act="back"]')) back();
  };
}
