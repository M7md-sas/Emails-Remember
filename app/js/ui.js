// ---------------------------------------------------------------------------
//  أدوات الواجهة المشتركة
// ---------------------------------------------------------------------------

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** كل نص يمر من هنا قبل الحقن — بيانات المستخدم لا تُثق بها ولو كانت له. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

export function back() {
  if (history.length > 1) history.back();
  else go('#/');
}

let toastTimer = null;

export function toast(message, kind = 'info') {
  const box = $('#toast');
  box.textContent = message;
  box.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (box.className = 'toast'), 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // بعض المتصفحات ترفض الحافظة بلا تفاعل مباشر — نرجع لطريقة قديمة تعمل
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(d);
}

export function relativeDays(iso) {
  if (!iso) return 'ما تأكّد بعد';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days < 30) return `قبل ${days} يوماً`;
  if (days < 365) return `قبل ${Math.floor(days / 30)} شهراً`;
  return `قبل ${Math.floor(days / 365)} سنة`;
}

/** نافذة تأكيد تُرجع وعداً — تُستعمل قبل كل حذف. */
export function confirmDialog({ title, body = '', confirmLabel = 'تأكيد', danger = false }) {
  return new Promise((resolve) => {
    const host = $('#modal');
    host.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true">
        <h2>${esc(title)}</h2>
        ${body ? `<p class="muted">${esc(body)}</p>` : ''}
        <div class="row gap">
          <button class="btn ghost" data-x="no">إلغاء</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    host.classList.add('open');

    const close = (answer) => {
      host.classList.remove('open');
      host.innerHTML = '';
      resolve(answer);
    };
    host.onclick = (e) => {
      if (e.target === host) return close(false);
      const x = e.target.closest('[data-x]');
      if (x) close(x.dataset.x === 'yes');
    };
  });
}

/** يبني قائمة خيارات — نستعملها لطريقة الدخول والحالة والهوية. */
export function options(map, selected) {
  return Object.entries(map)
    .map(([v, label]) =>
      `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(label)}</option>`)
    .join('');
}

/**
 * تصريف عربي صحيح للعدد: مفرد ومثنى وجمع قلة وجمع كثرة.
 * الصيغ بالترتيب: [مفرد, مثنى, جمع قلة, تمييز مفرد منصوب]
 * مثال: countIn(2, ['حساب واحد', 'حسابان', 'حسابات', 'حساباً'])
 */
export function countIn(n, [one, two, few, many]) {
  if (n === 0) return 'بلا ' + few;
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

export const countAccounts = (n) =>
  countIn(n, ['حساب واحد', 'حسابان', 'حسابات', 'حساباً']);

export const countRemaining = (n) =>
  countIn(n, ['واحد باقٍ', 'اثنان باقيان', 'باقية', 'باقياً']);

export function initials(name) {
  const clean = (name || '').trim();
  return clean ? clean.slice(0, 2) : '؟';
}
