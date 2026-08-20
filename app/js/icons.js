// ---------------------------------------------------------------------------
//  الأيقونات
//  رسوم متجهية بسماكة خط واحدة، لا رموز نصية ولا إيموجي — الرمز النصي يختلف
//  شكله بين الأجهزة ولا يقبل التلوين، والإيموجي يكسر الاتساق تماماً.
//  المصدر: مجموعة Lucide بترخيص ISC، مرسومة يدوياً هنا لتبقى بلا مكتبة.
// ---------------------------------------------------------------------------

const PATHS = {
  search:   '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  // يشير لليمين لأن الواجهة من اليمين لليسار، فالرجوع يمين لا يسار
  back:     '<path d="m9 6 6 6-6 6"/>',
  chevron:  '<path d="m15 6-6 6 6 6"/>',
  caret:    '<path d="m6 9 6 6 6-6"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  copy:     '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check:    '<path d="m5 13 4 4L19 7"/>',
  wand:     '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>',
  user:     '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  layers:   '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 14 9 5 9-5"/>',
  download: '<path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M4 21h16"/>',
  upload:   '<path d="M12 17V5"/><path d="m7 10 5-5 5 5"/><path d="M4 21h16"/>',
  lock:     '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  refresh:  '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  trash:    '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  inbox:    '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/>',
  chart:    '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sparkle:  '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3 9 9M15 15l2.7 2.7M17.7 6.3 15 9M9 15l-2.7 2.7"/>',
  alert:    '<path d="M12 9v4M12 17h.01"/><path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/>',
  key:      '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8-8"/><path d="m17 5 2 2"/><path d="m14.5 7.5 2 2"/>',
  logout:   '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 12h11"/><path d="m13 8-4 4 4 4"/>',
};

/**
 * يرجّع أيقونة جاهزة للحقن. `size` تأخذ 's' للحجم الصغير.
 * كلها مخفية عن قارئ الشاشة لأن كل زر عندنا يحمل نصاً أو عنواناً وصفياً.
 */
export function icon(name, size = '') {
  const d = PATHS[name];
  if (!d) return '';
  return `<svg class="i${size === 's' ? '-s' : ''}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}
