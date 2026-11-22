// عامل الخدمة: يحفظ ملفات التطبيق نفسه (لا البيانات) ليفتح بلا إنترنت.
// البيانات في IndexedDB، وتأتي من برنامجك مباشرة — لا تمرّ من هنا ولا تُحفظ في هذا الكاش.
const VER = 'majalis-offline-v3';
const SHELL = ['./', './index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;   // طلبات البرنامج (Google) تمر كما هي
  // الشبكة أولاً (لتصل تحديثات التطبيق)، والكاش إن لم يوجد نت
  e.respondWith(fetch(e.request).then((r) => {
    if (r && r.ok) { const cp = r.clone(); caches.open(VER).then((c) => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
