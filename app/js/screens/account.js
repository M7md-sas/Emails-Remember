// ---------------------------------------------------------------------------
//  إضافة حساب وتعديله
// ---------------------------------------------------------------------------
import { loadAll, saveAccount, removeAccount, identityById,
         LOGIN_METHODS, STATUSES } from '../data.js';
import { syncSoon } from '../sync.js';
import { $, esc, go, back, toast, options, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';

export async function show(root, { id, service: serviceParam }) {
  const { identities, items, accounts } = await loadAll();
  const isNew = !id || id === 'new';
  const account = isNew ? null : accounts.find((a) => a.id === id);
  if (!isNew && !account) return go('#/');

  const serviceId = isNew ? serviceParam : account.service_id;
  const item = items.find((i) => i.service.id === serviceId);
  if (!item) return go('#/');

  const cur = account || {
    service_id: serviceId,
    identity_id: (identities.find((i) => i.is_default) || identities[0] || {}).id || '',
    email: '',
    username: '',
    login_method: 'email',
    status: 'active',
    note: '',
    source: 'manual',
    confidence: 'confirmed',
  };

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back" aria-label="رجوع">${icon('back')}</button>
      <h1 class="grow">${isNew ? 'حساب جديد' : 'تعديل الحساب'}</h1>
    </div>
    <p class="pad muted">في <b>${esc(item.service.name)}</b></p>

    <form id="f" class="pad stack">
      <label>طريقة الدخول
        <select name="login_method">${options(LOGIN_METHODS, cur.login_method)}</select>
      </label>

      <label>الإيميل
        <input name="email" type="email" dir="ltr" value="${esc(cur.email)}"
               placeholder="الإيميل المربوط بالحساب">
      </label>

      <label>الهوية
        <select name="identity_id">
          <option value="">بلا هوية</option>
          ${identities.map((i) =>
            `<option value="${esc(i.id)}"${i.id === cur.identity_id ? ' selected' : ''}>${esc(i.name)} — ${esc(i.email)}</option>`
          ).join('')}
        </select>
      </label>
      <p class="tiny muted" id="hint"></p>

      <label>اسم المستخدم إن كان مختلفاً
        <input name="username" dir="ltr" value="${esc(cur.username)}" placeholder="اختياري">
      </label>

      <label>حالة الحساب
        <select name="status">${options(STATUSES, cur.status)}</select>
      </label>

      <label>ملاحظة
        <textarea name="note" rows="3" placeholder="ليش اخترت هذا الإيميل هنا بالذات؟">${esc(cur.note)}</textarea>
      </label>

      <button class="btn primary big" type="submit">حفظ</button>
      ${isNew ? '' : `<button class="btn ghost danger" type="button" data-act="del">حذف الحساب</button>`}
    </form>`;

  const form = $('#f', root);
  const hint = $('#hint', root);

  // يملأ الإيميل من الهوية إذا كان فاضياً، وينبّه إذا خالفها
  const syncHint = () => {
    const ident = identityById(identities, form.identity_id.value);
    if (!ident) { hint.textContent = ''; return; }
    if (!form.email.value.trim()) form.email.value = ident.email;
    hint.textContent = form.email.value.trim() &&
      form.email.value.trim().toLowerCase() !== ident.email.toLowerCase()
      ? `ينبّهك: هذا يخالف قاعدة "${ident.name}" وإيميلها ${ident.email} — مقبول، بس مقصود؟`
      : '';
  };

  form.identity_id.onchange = syncHint;
  form.email.oninput = syncHint;
  syncHint();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    if (!d.get('email').trim() && !d.get('username').trim() && d.get('login_method') === 'email') {
      return toast('اكتب الإيميل أو اسم المستخدم', 'warn');
    }
    await saveAccount({
      ...cur,
      id: account ? account.id : undefined,
      identity_id: d.get('identity_id') || null,
      email: d.get('email'),
      username: d.get('username'),
      login_method: d.get('login_method'),
      status: d.get('status'),
      note: d.get('note'),
      // أي لمسة يدوية منك ترفعه إلى مؤكّد — هذا هو معنى التأكيد أصلاً
      confidence: 'confirmed',
      confirmed_at: new Date().toISOString(),
    });
    syncSoon();
    toast('اتحفظ');
    go('#/s/' + serviceId);
  };

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'back') return back();
    if (btn.dataset.act === 'del') {
      const yes = await confirmDialog({
        title: 'حذف هذا الحساب؟',
        body: 'راح ينحذف من كل أجهزتك.',
        confirmLabel: 'احذف',
        danger: true,
      });
      if (!yes) return;
      await removeAccount(account.id);
      syncSoon();
      toast('انحذف');
      go('#/s/' + serviceId);
    }
  };
}
