# ---------------------------------------------------------------------------
#  خادم التطوير المحلي
#
#  خادم بايثون العادي يترك المتصفح يخزّن الملفات بحدسه الخاص، فتعدّل ملفاً
#  وتحدّث الصفحة ولا يتغيّر شيء — وتقضي وقتك تطارد خللاً غير موجود.
#  هذا يمنع التخزين نهائياً، فما تشوف إلا آخر نسخة على القرص.
#
#  للتشغيل:  python tools/serve.py
# ---------------------------------------------------------------------------
import functools
import http.server
import os
import sys

# مسار المشروع عربي، وطرفية ويندوز الافتراضية لا تعرف حروفه فتنهار عند أول
# طباعة. نثبّت الترميز هنا بدل أن نتجنّب الطباعة.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='replace')

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.webmanifest': 'application/manifest+json',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # نكتم سجل الطلبات العادية ونُبقي الأخطاء وحدها
        status = args[1] if len(args) > 1 else ''
        if not str(status).startswith('2'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    # خادم متعدد الخيوط: المتصفح يطلب عشرين وحدة دفعة واحدة، والخادم
    # الأحادي يختنق تحتها ويعلّق الصفحة بلا رسالة خطأ.
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(('', PORT), handler) as httpd:
        print(f'http://localhost:{PORT}  ->  {os.path.normpath(ROOT)}')
        print('التخزين المؤقت معطّل — كل تحديث يجيب آخر نسخة')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nتوقف')
