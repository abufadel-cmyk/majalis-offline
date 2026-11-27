// عامل الخدمة: يحفظ ملفات التطبيق نفسه (لا البيانات) ليفتح بلا إنترنت.
// البيانات في IndexedDB، وتأتي من برنامجك مباشرة — لا تمرّ من هنا ولا تُحفظ في هذا الكاش.
const VER = 'majalis-offline-v10';
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

// 🔔 التذكير بالمجالس وهو مغلق: «المزامنة الدورية» (أندرويد بعد التثبيت) تفحص الخطة المحفوظة في الجهاز
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('majalis-offline', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onupgradeneeded = () => { const d = r.result; ['kv', 'txt', 'ops'].forEach((n) => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); }; });
const kv = (db, k, v) => new Promise((res, rej) => { const t = db.transaction('kv', v === undefined ? 'readonly' : 'readwrite'), s = t.objectStore('kv'), q = v === undefined ? s.get(k) : s.put(v, k); let out; q.onsuccess = () => { out = q.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); });
async function remindCheck() {
  const db = await idb(), P = await kv(db, 'remind'), seen = (await kv(db, 'notified')) || {}, now = Date.now();
  if (!P || !P.on) return;
  for (const x of P.list || []) { if (seen[x.id] || now < x.when || now > x.at + 1800000) continue; seen[x.id] = now; await self.registration.showNotification(x.title, { body: x.body, tag: x.id, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar' }); }
  await kv(db, 'notified', seen);
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'remind') e.waitUntil(remindCheck().catch(() => {})); });
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => { for (const c of cs) { if ('focus' in c) return c.focus(); } return self.clients.openWindow('./'); }));
});
