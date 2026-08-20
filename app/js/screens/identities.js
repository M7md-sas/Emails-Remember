// ---------------------------------------------------------------------------
//  الهويات
//  القاعدة تُكتب هنا مرة واحدة: إيميل وسبب. وكل حساب مربوط بها يرث السبب
//  فلا تعيد كتابته مئات المرات.
// ---------------------------------------------------------------------------
import * as store from '../store.js';
import { loadAll, STARTER_IDENTITIES } from '../data.js';
import { syncSoon } from '../sync.js';
import { $, esc, back, toast, confirmDialog, countAccounts } from '../ui.js';
import { render } from '../app.js';

const PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#be185d', '#4b5563'];

export async function show(root) {
  const { identities, accounts } = await loadAll();
  const used = new Map();
  for (const a of accounts) used.set(a.identity_id, (used.get(a.identity_id) || 0) + 1);

  root.innerHTML = `
    <div class="topbar">
      <button class="icon" data-act="back">›</button>
      <h1 class="grow">الهويات</h1>
      <button class="icon" data-act="add">+</button>
    </div>

    ${identities.length ? '' : starter()}

    <div class="stack pad">
      ${identities.map((i) => card(i, used.get(i.id) || 0)).join('')}
    </div>`;

  root.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === 'back') return back();
    if (act === 'add') return openEditor(root, null, identities);
    if (act === 'edit') return openEditor(root, identities.find((i) => i.id === btn.dataset.id), identities);

    if (act === 'seed') {
      const rows = STARTER_IDENTITIES.map((s, n) => ({
        id: store.newId(),
        name: s.name,
        email: '',
        color: s.color,
        why: s.why,
        is_default: n === 0,
        sort_order: n,
        created_at: new Date().toISOString(),
        deleted_at: null,
      }));
      await store.saveMany('identities', rows);
      toast('أضفت أربع هويات — عبّي إيميل كل واحدة');
      return render();
    }

    if (act === 'default') {
      for (const i of identities) {
        if (i.is_default !== (i.id === btn.dataset.id)) {
          await store.save('identities', { ...i, is_default: i.id === btn.dataset.id });
        }
      }
      syncSoon();
      return render();
    }

    if (act === 'del') {
      const ident = identities.find((i) => i.id === btn.dataset.id);
      const count = used.get(ident.id) || 0;
      const yes = await confirmDialog({
        title: 'حذف هوية ' + ident.name + '؟',
        body: count
          ? `مربوط فيها ${count} حساباً. الحسابات ما تنحذف، بس تصير بلا هوية.`
          : 'ما فيه حساب مربوط فيها.',
        confirmLabel: 'احذف',
        danger: true,
      });
      if (!yes) return;
      await store.remove('identities', ident.id);
      syncSoon();
      toast('انحذفت');
      return render();
    }
  };
}

function card(ident, count) {
  const missing = !ident.email
    ? `<p class="tiny warn-text">ناقصها إيميل — ما تقدر تُستعمل في النصيحة قبل ما تعبّيه</p>`
    : '';
  return `
    <div class="card ident" style="--c:${esc(ident.color)}">
      <div class="row">
        <span class="dot big-dot" style="background:${esc(ident.color)}"></span>
        <div class="grow">
          <div class="title">${esc(ident.name)}${ident.is_default ? ' <span class="tag ok">الافتراضية</span>' : ''}</div>
          <div class="sub mono" dir="ltr">${esc(ident.email || '—')}</div>
        </div>
        <span class="tag soft">${esc(countAccounts(count))}</span>
      </div>
      ${ident.why ? `<p class="note">${esc(ident.why)}</p>` : ''}
      ${missing}
      <div class="row gap end">
        ${ident.is_default ? '' : `<button class="btn small ghost" data-act="default" data-id="${esc(ident.id)}">اجعلها الافتراضية</button>`}
        <button class="btn small ghost" data-act="edit" data-id="${esc(ident.id)}">تعديل</button>
        <button class="btn small ghost danger" data-act="del" data-id="${esc(ident.id)}">حذف</button>
      </div>
    </div>`;
}

function starter() {
  return `
    <div class="empty">
      <h2>ما عرّفت هوياتك بعد</h2>
      <p class="muted">
        الهوية إيميل واحد وسبب واحد يُكتب مرة. بعدها كل موقع تربطه بهوية،
        والسبب يجيك جاهزاً بلا إعادة كتابة.
      </p>
      <button class="btn primary big" data-act="seed">ابدأ بأربع هويات مقترحة</button>
      <button class="btn ghost" data-act="add">أو أضف واحدة من عندك</button>
    </div>`;
}

function openEditor(root, ident, all) {
  const isNew = !ident;
  const cur = ident || {
    name: '', email: '', why: '',
    color: PALETTE[all.length % PALETTE.length],
    is_default: !all.length,
    sort_order: all.length,
  };

  const host = $('#modal');
  host.innerHTML = `
    <form class="sheet stack" id="ef">
      <h2>${isNew ? 'هوية جديدة' : 'تعديل الهوية'}</h2>
      <label>الاسم
        <input name="name" required value="${esc(cur.name)}" placeholder="شخصي، عمل، تسوق…">
      </label>
      <label>الإيميل
        <input name="email" type="email" dir="ltr" value="${esc(cur.email)}" placeholder="name@example.com">
      </label>
      <label>متى تستعمل هذه الهوية
        <textarea name="why" rows="3" placeholder="اكتب براحتك — هذا السبب يورَّث على كل حساب تربطه بها">${esc(cur.why)}</textarea>
      </label>
      <label>اللون
        <div class="palette">
          ${PALETTE.map((c) =>
            `<label class="swatch" style="background:${c}">
               <input type="radio" name="color" value="${c}"${c === cur.color ? ' checked' : ''}>
             </label>`).join('')}
        </div>
      </label>
      <div class="row gap">
        <button class="btn ghost" type="button" data-x="no">إلغاء</button>
        <button class="btn primary" type="submit">حفظ</button>
      </div>
    </form>`;
  host.classList.add('open');

  const close = () => { host.classList.remove('open'); host.innerHTML = ''; };
  host.onclick = (e) => {
    if (e.target === host || e.target.closest('[data-x="no"]')) close();
  };

  $('#ef', host).onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    await store.save('identities', {
      ...cur,
      id: ident ? ident.id : store.newId(),
      created_at: cur.created_at || new Date().toISOString(),
      deleted_at: null,
      name: d.get('name').trim(),
      email: d.get('email').trim(),
      why: d.get('why').trim() || null,
      color: d.get('color'),
    });
    syncSoon();
    close();
    toast('اتحفظت');
    render();
  };
}
