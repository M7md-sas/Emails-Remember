// ---------------------------------------------------------------------------
//  قائمة النواقص
//
//  الشاشة قسمان مختلفان في طبيعتهما، والخلط بينهما كان أصل خلل قديم:
//
//  الطابور — ما لم تنظر إليه بعد. أي تصرّف منك يخرجه منه، فينفد حتماً.
//  القوائم — ملاحظات تستحق نظرة. تُتصفَّح ولا تُحبس، وتقصر كلما أصلحت شيئاً.
//
//  الخلل القديم أنه جعل "بلا هوية" و"يخالف قاعدته" شرطي بقاء في الطابور،
//  وشاشة المراجعة لا تملك إزالتهما، فكان السجل يرجع بعد كل حفظ ويبدو الزر
//  كأنه معطّل.
// ---------------------------------------------------------------------------
import { loadAll, reviewBuckets, deviates, saveAccount, confirmAccount,
         identityById, LOGIN_METHODS } from '../data.js';
import { syncSoon } from '../sync.js';
import { $, esc, back, toast, countIn } from '../ui.js';
import { render } from '../app.js';

const label = (account) =>
  account.email || account.username || LOGIN_METHODS[account.login_method];

export async function show(root) {
  const { identities, items, accounts } = await loadAll();
  const serviceOf = new Map(items.map((i) => [i.service.id, i.service]));
  const { queue, noIdent, deviant } = reviewBuckets(accounts, identities);
  const name = (a) => (serviceOf.get(a.service_id) || {}).name || '—';

  if (!queue.length && !noIdent.length && !deviant.length) {
    root.innerHTML = `
      <div class="topbar">
        <button class="icon" data-act="back">›</button>
        <h1 class="grow">قائمة النواقص</h1>
      </div>
      <div class="empty">
        <h2>ما فيه شيء ناقص</h2>
        <p class="muted">كل حساباتك مراجَعة ومربوطة بهوية.</p>
        <a class="btn ghost" href="#/">رجوع للبحث</a>
      </div>`;
    root.onclick = (e) => {
      if (e.target.closest('[data-act="back"]')) back();
    };
    return;
  }

  const current = queue[0] || null;

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back">›</button>
      <h1 class="grow">قائمة النواقص</h1>
      ${queue.length ? `<span class="tag soft">${esc(countIn(queue.length,
        ['واحد باقٍ', 'اثنان باقيان', 'باقية', 'باقياً']))}</span>` : ''}
    </div>

    <div class="pad stack">
      ${current ? card(current, name(current), identities) : ''}
      ${!current && (noIdent.length || deviant.length) ? `
        <div class="card">
          <h3>خلص الطابور</h3>
          <p class="tiny muted">راجعت كل ما استوردته. الباقي تحت ملاحظات لا تستعجل فيها.</p>
        </div>` : ''}
      ${list('بلا هوية', 'ما ربطتها بهوية، فما تُستعمل في النصيحة', noIdent, name, identities)}
      ${list('تخالف قاعدتها', 'مربوطة بهوية لكنها تستعمل إيميلاً غيرها', deviant, name, identities)}
    </div>`;

  const sel = $('#ident', root);
  const saveBtn = $('[data-act="save"]', root);

  // نص الزر يتبع اختيارك، فلا تؤكّد "بلا هوية" وأنت تحسب أنك ربطتها
  const syncLabel = () => {
    if (!sel || !saveBtn) return;
    saveBtn.textContent = sel.value ? 'احفظ وأكّد' : 'أكّد بلا هوية';
  };
  if (sel) sel.onchange = syncLabel;
  syncLabel();

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'back') return back();
    if (!current) return;

    if (act === 'skip') {
      await confirmAccount(current);
      syncSoon();
      done('تخطيته', queue.length);
      return render();
    }

    if (act === 'save') {
      const identityId = sel ? sel.value || null : null;
      const ident = identityById(identities, identityId);
      await saveAccount({
        ...current,
        identity_id: identityId,
        // لو ما فيه إيميل مسجّل نأخذه من الهوية — أكثر الناقص شيوعاً
        email: current.email || (ident ? ident.email : null),
        confidence: 'confirmed',
        confirmed_at: new Date().toISOString(),
      });
      syncSoon();
      done(ident ? `ربطته بهوية ${ident.name}` : 'أكّدته بلا هوية', queue.length);
      return render();
    }
  };
}

/** تأكيد مسموع لكل ضغطة، ومعه ما تبقّى — فلا تحتار هل صار شيء أو لا. */
function done(what, before) {
  const left = before - 1;
  toast(left ? `${what} — باقي ${left}` : `${what} — خلص الطابور`, 'ok');
}

function card(account, serviceName, identities) {
  return `
    <div class="card">
      <div class="title">${esc(serviceName)}</div>
      <div class="big mono" dir="ltr">${esc(label(account))}</div>
      ${why(account, identities)}

      <label>اربطه بهوية
        <select id="ident">
          <option value="">بلا هوية</option>
          ${identities.map((i) =>
            `<option value="${esc(i.id)}"${i.id === account.identity_id ? ' selected' : ''}>${esc(i.name)} — ${esc(i.email)}</option>`
          ).join('')}
        </select>
      </label>

      <div class="row gap">
        <button class="btn ghost grow" data-act="skip">تخطَّ</button>
        <button class="btn primary grow" data-act="save">احفظ وأكّد</button>
      </div>
      <a class="btn small ghost wide" href="#/account/${esc(account.id)}">فتح التعديل الكامل</a>
    </div>`;
}

function list(title, note, rows, name, identities) {
  if (!rows.length) return '';
  return `
    <details class="card closed-list">
      <summary><b>${esc(title)}</b> — ${rows.length}</summary>
      <p class="tiny muted">${esc(note)}</p>
      ${rows.slice(0, 50).map((a) => `
        <a class="row-card" href="#/account/${esc(a.id)}">
          <div class="grow">
            <div class="title">${esc(name(a))}</div>
            <div class="sub mono" dir="ltr">${esc(label(a))}</div>
            ${deviates(a, identities) ? `<div class="sub warn-text">${esc(deviationNote(a, identities))}</div>` : ''}
          </div>
          <span class="chev">‹</span>
        </a>`).join('')}
      ${rows.length > 50 ? `<p class="tiny muted center">و${rows.length - 50} غيرها</p>` : ''}
    </details>`;
}

function deviationNote(account, identities) {
  const ident = identityById(identities, account.identity_id);
  return ident ? `قاعدة ${ident.name} تقول ${ident.email}` : '';
}

function why(account, identities) {
  const bits = [];
  if (account.confidence === 'imported') bits.push('مستورد وما راجعته');
  if (!account.identity_id) bits.push('بلا هوية');
  if (deviates(account, identities)) bits.push(deviationNote(account, identities));
  return bits.length ? `<p class="tiny warn-text">${esc(bits.join(' — '))}</p>` : '';
}
