// ---------------------------------------------------------------------------
//  اختبارات المنطق الخالص
//  تشتغل بـ node بلا متصفح وبلا شبكة:  node tools/test.mjs
//  أهم اختبار فيها هو الأخير: أن كلمة المرور لا تنجو من الاستيراد بأي شكل.
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, rootDomain, labelFromDomain, rank } from '../app/js/search.js';
import { parseCsv, extractEntries, planImport } from '../app/js/import-csv.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    console.log('  ✗ ' + name);
    // نطبع الرسالة كاملة: تفاصيل الفشل هي المطلوبة، لا سطرها الأول
    for (const line of err.message.split('\n')) {
      if (line.trim()) console.log('      ' + line.trim());
    }
  }
}

function group(title) {
  console.log('\n' + title);
}

// ---------------------------------------------------------------------------
group('تطبيع النص');

test('يوحّد الألف بأشكالها', () => {
  assert.equal(normalize('أحمد'), normalize('احمد'));
  assert.equal(normalize('إيميل'), normalize('ايميل'));
  assert.equal(normalize('آدم'), normalize('ادم'));
});

test('يوحّد التاء المربوطة والألف المقصورة', () => {
  assert.equal(normalize('شركة'), normalize('شركه'));
  assert.equal(normalize('مصطفى'), normalize('مصطفي'));
});

test('يحذف التشكيل والتطويل', () => {
  assert.equal(normalize('مُحَمَّد'), normalize('محمد'));
  assert.equal(normalize('نـــون'), normalize('نون'));
});

test('يحوّل الأرقام العربية إلى غربية', () => {
  assert.equal(normalize('حساب ٢٠٢٤'), 'حساب 2024');
});

test('يصغّر اللاتيني ويوحّد الفواصل', () => {
  assert.equal(normalize('Noon.COM'), 'noon com');
});

// ---------------------------------------------------------------------------
group('جذر النطاق');

test('يجرّد البادئات الضجيجية', () => {
  assert.equal(rootDomain('https://www.noon.com/saudi-ar/'), 'noon.com');
  assert.equal(rootDomain('https://login.microsoftonline.com/x'), 'microsoftonline.com');
  assert.equal(rootDomain('accounts.google.com'), 'google.com');
});

test('يحترم اللواحق المركّبة', () => {
  assert.equal(rootDomain('https://www.amazon.com.sa/gp/cart'), 'amazon.com.sa');
  assert.equal(rootDomain('shop.bbc.co.uk'), 'bbc.co.uk');
});

test('نطاقان لنفس المتجر يعطيان جذرين مختلفين بحق', () => {
  // amazon.sa و amazon.com خدمتان بنطاقين — الدمج بينهما قرارك لا قرار الأداة
  assert.notEqual(rootDomain('amazon.sa'), rootDomain('amazon.com'));
});

test('الاسم المقروء يُشتق من الجذر', () => {
  assert.equal(labelFromDomain('https://www.noon.com/x'), 'Noon');
});

test('ما فيه نقطة يعني ما فيه نطاق', () => {
  // بدون هذا الشرط يحوّل مُحلّل الروابط كلمة عربية إلى اسم مضيف مرمَّز
  // فتُحفظ كنطاق وهمي في المرادفات
  assert.equal(rootDomain('إنستقرام'), '');
  assert.equal(rootDomain('نتفلكس'), '');
  assert.equal(rootDomain('MyBank'), '');
  assert.equal(rootDomain('localhost'), '');
  assert.equal(rootDomain(''), '');
});

test('الرابط بمساره يعطي الجذر وحده لا الرابط كاملاً', () => {
  assert.equal(rootDomain('https://www.aliexpress.com/item/123'), 'aliexpress.com');
  assert.equal(rootDomain('https://x.com/home?a=1#b'), 'x.com');
});

// ---------------------------------------------------------------------------
group('ترتيب البحث');

const items = [
  {
    service: { id: '1', name: 'نون', last_opened_at: null },
    aliases: [{ alias: 'noon.com', kind: 'domain' }],
    accounts: [{ email: 'shop@example.com', username: null, note: null }],
  },
  {
    service: { id: '2', name: 'Netflix', last_opened_at: null },
    aliases: [{ alias: 'netflix.com', kind: 'domain' }, { alias: 'نتفلكس', kind: 'name' }],
    accounts: [{ email: 'me@example.com', username: null, note: null }],
  },
];

test('يلقى الخدمة بالعربي وبالإنجليزي معاً', () => {
  assert.equal(rank('نون', items)[0].service.id, '1');
  assert.equal(rank('noon', items)[0].service.id, '1');
  assert.equal(rank('نتفلكس', items)[0].service.id, '2');
  assert.equal(rank('netflix', items)[0].service.id, '2');
});

test('يلقاها بالنطاق كاملاً', () => {
  assert.equal(rank('noon.com', items)[0].service.id, '1');
});

test('يلقاها بالإيميل نفسه', () => {
  assert.equal(rank('shop@example.com', items)[0].service.id, '1');
});

test('بلا بحث يرجّع كل شيء', () => {
  assert.equal(rank('', items).length, 2);
});

test('ما يخترع نتائج', () => {
  assert.equal(rank('zzzqqq', items).length, 0);
});

// ---------------------------------------------------------------------------
group('تحليل CSV');

test('يحترم الفواصل داخل علامات الاقتباس', () => {
  const rows = parseCsv('a,b\n"one, two",three');
  assert.deepEqual(rows[1], ['one, two', 'three']);
});

test('يحترم الأسطر داخل الحقل', () => {
  const rows = parseCsv('a,b\n"line1\nline2",x');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'line1\nline2');
});

test('يحترم علامة الاقتباس المضاعفة', () => {
  const rows = parseCsv('a\n"say ""hi"""');
  assert.equal(rows[1][0], 'say "hi"');
});

// ---------------------------------------------------------------------------
group('الاستيراد — العقد الأمني');

const CHROME_CSV = [
  'name,url,username,password,note',
  'noon,https://www.noon.com/,shop@example.com,SuperSecret123!,',
  'noon,https://noon.com/uae-ar/,shop@example.com,SuperSecret123!,',
  'netflix,https://www.netflix.com/login,me@example.com,"pa,ss word",خطة العائلة',
  'x,https://x.com/,handle_only,Hunter2,',
  ',,orphan@example.com,Secret9,سطر بلا موقع ولا اسم',
  ',,,,',
].join('\n');

const SECRETS = ['SuperSecret123!', 'pa,ss word', 'Hunter2', 'Secret9'];

test('يقرأ السجلات ويتخطى ما لا ينفع', () => {
  const { entries, skipped, hadPasswords } = extractEntries(CHROME_CSV);
  // أربعة صالحة، وسطر بلا موقع ولا اسم يُعدّ متخطّى، والسطر الفاضي تماماً
  // يسقط عند التحليل قبل أن يُحسب أصلاً
  assert.equal(entries.length, 4, 'عدد السجلات الصالحة');
  assert.equal(skipped, 1, 'عدد المتخطّى');
  assert.equal(hadPasswords, true);
});

test('لا أثر لأي كلمة مرور في المخرجات', () => {
  const { entries } = extractEntries(CHROME_CSV);
  const dump = JSON.stringify(entries);
  for (const secret of SECRETS) {
    assert.ok(!dump.includes(secret), 'تسربت كلمة المرور: ' + secret);
  }
});

test('لا أثر لأي كلمة مرور في خطة الاستيراد كاملة', () => {
  const { entries } = extractEntries(CHROME_CSV);
  const plan = planImport(entries, []);
  const dump = JSON.stringify(plan);
  for (const secret of SECRETS) {
    assert.ok(!dump.includes(secret), 'تسربت كلمة المرور: ' + secret);
  }
});

test('يدمج نطاقي نفس الخدمة في سجل واحد', () => {
  const { entries } = extractEntries(CHROME_CSV);
  const plan = planImport(entries, []);
  const noon = plan.newServices.filter((s) => s.group.domain === 'noon.com');
  assert.equal(noon.length, 1, 'المفروض خدمة واحدة لنون لا اثنتان');
  assert.equal(noon[0].accounts.length, 1, 'نفس الإيميل ما يتكرر');
});

test('يفرّق الإيميل عن اسم المستخدم', () => {
  const { entries } = extractEntries(CHROME_CSV);
  const plan = planImport(entries, []);
  const x = plan.newServices.find((s) => s.group.domain === 'x.com');
  assert.equal(x.accounts[0].email, null);
  assert.equal(x.accounts[0].username, 'handle_only');
});

test('كل مستورد يُحفظ غير مؤكّد وبلا هوية', () => {
  const { entries } = extractEntries(CHROME_CSV);
  const plan = planImport(entries, []);
  for (const rec of plan.newServices) {
    for (const a of rec.accounts) {
      assert.equal(a.confidence, 'imported');
      assert.equal(a.source, 'imported');
      assert.equal(a.identity_id, null);
    }
  }
});

test('يشتغل مع صيغة سفاري ذات الأعمدة المختلفة', () => {
  const safari = ['Title,URL,Username,Password,Notes',
                  'Noon,https://noon.com,me@example.com,TopSecret,ملاحظة'].join('\n');
  const { entries, hadPasswords } = extractEntries(safari);
  assert.equal(hadPasswords, true);
  assert.equal(entries[0].username, 'me@example.com');
  assert.ok(!JSON.stringify(entries).includes('TopSecret'));
});

test('يشتغل مع ملف بلا عمود كلمة مرور أصلاً', () => {
  const plain = 'name,url,username\nNoon,https://noon.com,me@example.com';
  const { entries, hadPasswords } = extractEntries(plain);
  assert.equal(hadPasswords, false);
  assert.equal(entries.length, 1);
});

test('يدمج مع خدمة قائمة بدل ما ينشئ مكرراً', () => {
  const existing = [{
    service: { id: 'S1', name: 'نون' },
    aliases: [{ alias: 'noon.com', kind: 'domain' }],
    accounts: [{ email: 'shop@example.com' }],
  }];
  const { entries } = extractEntries(CHROME_CSV);
  const plan = planImport(entries, existing);
  assert.equal(plan.mergedServices.length, 1);
  assert.equal(plan.mergedServices[0].existing.service.id, 'S1');
});

// ---------------------------------------------------------------------------
//  فحص ثابت للوحدات
//  الشاشات ما تنفتح في node لأنها تحتاج متصفحاً، فنفحص روابطها من النص نفسه.
//  يمسك خللين قاتلين لا يمسكهما فحص الصياغة: اسم مستعمل بلا استيراد، واستيراد
//  اسم غير مُصدَّر أصلاً. الاثنان لا يظهران إلا وقت التشغيل على شاشة معيّنة.
// ---------------------------------------------------------------------------
group('ربط الوحدات');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.js') ? [full] : [];
  });
}

const files = walk(join(ROOT, 'app', 'js'));
const modules = new Map();

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const exports = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    exports.add(m[1]);
  }
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) exports.add(name);
    }
  }

  const imports = new Map();   // اسم محلي -> مسار الوحدة
  const namespaces = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const part of m[1].split(',')) {
      const [orig, local] = part.trim().split(/\s+as\s+/).map((s) => s.trim());
      if (orig) imports.set(local || orig, { spec: m[2], orig });
    }
  }
  for (const m of src.matchAll(/import\s*\*\s*as\s+([\w$]+)\s*from\s*['"]([^'"]+)['"]/g)) {
    namespaces.add(m[1]);
  }

  modules.set(file, { src, exports, imports, namespaces });
}

const resolveSpec = (from, spec) => resolve(dirname(from), spec);

test('كل اسم مستورد موجود فعلاً في وحدته', () => {
  const problems = [];
  for (const [file, mod] of modules) {
    for (const [local, { spec, orig }] of mod.imports) {
      if (!spec.startsWith('.')) continue;
      const target = modules.get(resolveSpec(file, spec));
      if (!target) {
        problems.push(`${relative(ROOT, file)} يستورد من وحدة غير موجودة: ${spec}`);
        continue;
      }
      if (!target.exports.has(orig)) {
        problems.push(`${relative(ROOT, file)} يستورد ${orig} وهو غير مُصدَّر من ${spec}`);
      }
    }
  }
  assert.equal(problems.length, 0, '\n  ' + problems.join('\n  '));
});

test('كل اسم مُصدَّر مستعمل في ملف مستورَد فيه', () => {
  // نجمع كل ما تصدّره وحداتنا، ثم نتأكد أن أي ملف يستدعيه استورده
  const allExports = new Set();
  for (const mod of modules.values()) for (const e of mod.exports) allExports.add(e);

  const problems = [];
  for (const [file, mod] of modules) {
    const stripped = mod.src
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?$/gm, '');

    for (const m of stripped.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = m[1];
      if (!allExports.has(name)) continue;
      if (mod.imports.has(name)) continue;
      if (mod.exports.has(name)) continue;                 // معرّف هنا
      if (new RegExp(`(?:function|const|let|class)\\s+${name}\\b`).test(stripped)) continue;
      problems.push(`${relative(ROOT, file)} يستعمل ${name} بلا استيراد`);
    }
  }
  assert.equal(problems.length, 0, '\n  ' + [...new Set(problems)].join('\n  '));
});

test('ملفات العامل الخدمي كلها موجودة', () => {
  const sw = readFileSync(join(ROOT, 'app', 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/'\.\/((?:js|css|icons)\/[^']+)'/g)].map((m) => m[1]);
  assert.ok(listed.length > 10, 'قائمة المخزون تبدو ناقصة');
  const missing = listed.filter((rel) => {
    try { statSync(join(ROOT, 'app', rel)); return false; } catch { return true; }
  });
  assert.deepEqual(missing, [], 'ملفات مذكورة في sw.js وغير موجودة');
});

test('كل وحدة في مجلد js مذكورة في مخزون العامل الخدمي', () => {
  const sw = readFileSync(join(ROOT, 'app', 'sw.js'), 'utf8');
  const missing = files
    .map((f) => relative(join(ROOT, 'app'), f).replace(/\\/g, '/'))
    .filter((rel) => !sw.includes(`'./${rel}'`));
  assert.deepEqual(missing, [], 'وحدات لن تُخزَّن فلن تعمل بدون نت');
});

test('مسار الحفظ كله لا يلمس كلمة مرور', () => {
  // العهد المقصود ضيّق ودقيق: كلمة مرورك للتطبيق نفسه مشروعة في مسار الدخول
  // وحده. أما كل ما يكتب في التخزين أو يرفع للخادم أو يبني نسخة احتياطية،
  // فلا يجوز أن يظهر فيه ذكر لكلمة مرور إطلاقاً.
  const AUTH_PATH = ['api.js', 'screens/login.js'];
  const READS_COLUMN = ['import-csv.js'];   // يتعرّف على العمود ليمحوه

  const offenders = [];
  for (const [file, mod] of modules) {
    const rel = relative(join(ROOT, 'app', 'js'), file).replace(/\\/g, '/');
    if (AUTH_PATH.includes(rel) || READS_COLUMN.includes(rel)) continue;
    if (/\bpassw(or)?d\b/i.test(mod.src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], 'ذُكرت كلمة مرور في مسار الحفظ');
});

test('جداول المزامنة ما فيها عمود كلمة مرور في المخطط', () => {
  const sql = readFileSync(join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const cols = [...sql.matchAll(/^\s{2}([a-z_]+)\s+(?:uuid|text|boolean|integer|bigint|timestamptz)/gm)]
    .map((m) => m[1]);
  assert.ok(cols.length > 20, 'ما قدرت أقرأ الأعمدة من المخطط');
  assert.deepEqual(cols.filter((c) => /pass|secret|token|pin/i.test(c)), []);
});

// ---------------------------------------------------------------------------
console.log(`\nنجح ${passed} — فشل ${failed}\n`);
process.exit(failed ? 1 : 0);
