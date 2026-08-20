// ---------------------------------------------------------------------------
//  الدخول والقفل الرقمي
//  لا يوجد إنشاء حساب ولا استرجاع بالإيميل — عمداً. التطبيق الذي يذكّرك
//  بإيميلاتك لا يصح أن يكون مقفلاً خلف إيميل قد تنساه.
// ---------------------------------------------------------------------------
import * as api from '../api.js';
import { $, esc, toast } from '../ui.js';
import { markUnlocked, render } from '../app.js';

export async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('daftar:' + pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function show(root, { mode }) {
  return mode === 'lock' ? showLock(root) : showSignIn(root);
}

function showSignIn(root) {
  root.innerHTML = `
    <div class="gate">
      <div class="brand">
        <div class="brand-mark">د</div>
        <h1>دفتر الهويات</h1>
        <p class="muted">أي إيميل استعملت، وأين، ولماذا</p>
      </div>
      <form id="f" class="card stack" autocomplete="on">
        <label>الإيميل
          <input name="email" type="email" required autocomplete="username" dir="ltr">
        </label>
        <label>كلمة المرور
          <input name="password" type="password" required autocomplete="current-password" dir="ltr">
        </label>
        <p class="error" id="err" hidden></p>
        <button class="btn primary big" type="submit">دخول</button>
      </form>
      <p class="muted tiny center">
        الحساب يُنشأ مرة واحدة من لوحة تحكم Supabase، ولا يوجد تسجيل عام
      </p>
    </div>`;

  $('#f', root).onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const err = $('#err', root);
    btn.disabled = true;
    btn.textContent = 'جارٍ الدخول…';
    err.hidden = true;
    try {
      const data = new FormData(e.target);
      await api.signIn(data.get('email').trim(), data.get('password'));
      markUnlocked();
      location.hash = '#/';
      await render();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'دخول';
    }
  };
}

function showLock(root) {
  root.innerHTML = `
    <div class="gate">
      <div class="brand">
        <div class="brand-mark">د</div>
        <h1>مقفل</h1>
        <p class="muted">اكتب الرمز لفتح الدفتر</p>
      </div>
      <form id="f" class="card stack">
        <input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*"
               maxlength="8" required autocomplete="off" class="pin" dir="ltr" autofocus>
        <p class="error" id="err" hidden></p>
        <button class="btn primary big" type="submit">فتح</button>
        <button class="btn ghost" type="button" id="out">خروج من الحساب</button>
      </form>
    </div>`;

  $('#pin', root).focus();

  $('#f', root).onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#err', root);
    const entered = await hashPin($('#pin', root).value);
    if (entered === localStorage.getItem('daftar.pin')) {
      markUnlocked();
      await render();
    } else {
      err.textContent = 'الرمز غير صحيح';
      err.hidden = false;
      $('#pin', root).value = '';
      $('#pin', root).focus();
    }
  };

  $('#out', root).onclick = () => {
    api.clearSession();
    localStorage.removeItem('daftar.pin');
    toast('خرجت من الحساب');
    render();
  };
}
