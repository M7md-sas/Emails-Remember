// ---------------------------------------------------------------------------
//  إعدادات الاتصال
//  المفتاح هنا هو المفتاح العام المصمَّم للنشر، ووجوده في مستودع عام مقصود
//  وآمن. حمايتك تأتي من عزل الصفوف ومن كلمة مرورك، لا من إخفاء هذا المفتاح.
//  ممنوع منعاً باتاً وضع مفتاح الخدمة service_role في هذا الملف أو غيره.
// ---------------------------------------------------------------------------
export const SUPABASE_URL = 'https://iwviaczzxgpgwnwaziqu.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Bzv5mXuTF66nTElsOe3x-A_WRuEf__v';

// اسم قاعدة البيانات المحلية داخل المتصفح
export const LOCAL_DB = 'daftar-hawiyat';
export const LOCAL_DB_VERSION = 1;

// الجداول بالترتيب الذي يحترم الارتباطات: الأصول قبل ما يعتمد عليها
export const TABLES = ['identities', 'services', 'service_aliases', 'accounts'];

// يذكّرك بالتصدير إذا مرّ هذا العدد من الأيام بلا نسخة احتياطية
export const BACKUP_REMINDER_DAYS = 30;
