/* =====================================================================
   📴 المحاضرات والمجالس — بلا إنترنت
   ---------------------------------------------------------------------
   تطبيق ويب يُثبَّت على الجوال والكمبيوتر. البيانات تأتي من «نظام المحاضرات
   والمجالس» (Google Apps Script) بكلمة مرورك، وتُحفظ على هذا الجهاز فقط
   (IndexedDB)، ويحميها رمز PIN. ما تُدخله بلا إنترنت يُحفظ في «الطابور»
   ويُرفع للبرنامج حين يعود الاتصال.
   ===================================================================== */
(function () {
  'use strict';
  const APP_VER = '1.5';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const AR_DIG = (s) => String(s || '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 1776);
  // تطبيع البحث: بلا تشكيل ولا تطويل، والهمزات والتاء والياء موحّدة (مثل البرنامج)
  const nz = (s) => AR_DIG(s).toLowerCase().replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىی]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/[کگ]/g, 'ك').replace(/چ/g, 'ج')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const words = (q) => nz(q).split(' ').filter(Boolean);
  const hasAll = (bag, ws) => ws.every((w) => bag.indexOf(w) >= 0 || bag.indexOf(w.replace(/^ال/, '')) >= 0);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const WD = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const fmtAt = (t) => { if (!t) return '—'; const d = new Date(t); return isoOf(d).replace(/-/g, '/') + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const ago = (t) => { if (!t) return 'لم تتم بعد'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'الآن' : m < 60 ? 'قبل ' + m + ' د' : m < 1440 ? 'قبل ' + Math.round(m / 60) + ' س' : 'قبل ' + Math.round(m / 1440) + ' يوم'; };

  // ---------------- 💾 التخزين (IndexedDB) ----------------
  let DB = null;
  const dbOpen = () => new Promise((res, rej) => {
    const r = indexedDB.open('majalis-offline', 1);
    r.onupgradeneeded = () => { const d = r.result; ['kv', 'txt', 'ops'].forEach((n) => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); }); };
    r.onsuccess = () => { DB = r.result; res(DB); };
    r.onerror = () => rej(r.error);
  });
  const tx = (store, mode, fn) => new Promise((res, rej) => { const t = DB.transaction(store, mode), s = t.objectStore(store); let out; const r = fn(s); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  const kvGet = (k) => tx('kv', 'readonly', (s) => s.get(k));
  const kvSet = (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k));
  const opsAll = () => new Promise((res, rej) => { const out = []; const t = DB.transaction('ops', 'readonly'); const c = t.objectStore('ops').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { out.push(x.value); x.continue(); } }; t.oncomplete = () => res(out.sort((a, b) => a.at - b.at)); t.onerror = () => rej(t.error); });
  const opPut = (o) => tx('ops', 'readwrite', (s) => s.put(o, o.id));
  const opDel = (id) => tx('ops', 'readwrite', (s) => s.delete(id));
  const txtPutMany = (rows) => tx('txt', 'readwrite', (s) => { rows.forEach((r) => s.put({ id: r[0], part: r[1], text: r[2], mod: r[3], src: r[4] }, r[0] + '|' + r[1])); });
  const txtKeys = () => tx('txt', 'readonly', (s) => s.getAllKeys());
  const txtDel = (keys) => tx('txt', 'readwrite', (s) => { keys.forEach((k) => s.delete(k)); });
  const txtOf = (id) => new Promise((res, rej) => { const out = []; const t = DB.transaction('txt', 'readonly'); const c = t.objectStore('txt').openCursor(IDBKeyRange.bound(id + '|', id + '|￿')); c.onsuccess = () => { const x = c.result; if (x) { out.push(x.value); x.continue(); } }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); });
  const txtEach = (fn) => new Promise((res, rej) => { const t = DB.transaction('txt', 'readonly'); const c = t.objectStore('txt').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { if (fn(x.value) !== false) x.continue(); } }; t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
  const txtCount = () => tx('txt', 'readonly', (s) => s.count());

  // ---------------- 🌐 الاتصال بالبرنامج ----------------
  let CFG = {};   // exec, tok, user, dev, devName, pin, lastSync, txtSince, txtFull
  const api = async (body, timeoutMs) => {
    if (!CFG.exec) throw new Error('لا رابط للبرنامج');
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeoutMs || 300000);
    try {
      let r;
      try { r = await fetch(CFG.exec, { method: 'POST', body: JSON.stringify(Object.assign({ tok: CFG.tok || '', dev: CFG.dev, devName: CFG.devName }, body)), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', signal: ctl.signal }); }
      catch (eF) { if (eF.name === 'AbortError') throw eF; if (!online()) throw new Error('📴 لا إنترنت الآن.'); const e2 = new Error('FETCH'); e2.fetch = true; throw e2; }
      const t = await r.text();
      let j; try { j = JSON.parse(t); } catch (e) { throw new Error(/<html/i.test(t) ? 'البرنامج أعاد صفحة بدل البيانات — تأكد أن «رابط البرنامج» هو رابط النشر (exec) وأن النشر لـ«أي شخص».' : 'رد غير مفهوم من البرنامج.'); }
      if (j && j.revoked) {   // ⛔ أُوقف هذا الجهاز من البرنامج
        if (j.wipe) { try { sessionStorage.setItem('offRevoked', '1'); } catch (e) {} await wipe(); throw new Error('wiped'); }
        CFG.tok = ''; await kvSet('cfg', CFG); setTimeout(() => setupScreen(j.error || 'أُوقف هذا الجهاز من البرنامج.'), 0);
      }
      if (j && j.auth) { const e = new Error(j.error || 'انتهت الجلسة'); e.auth = true; throw e; }
      return j;
    } finally { clearTimeout(tm); }
  };
  const online = () => navigator.onLine !== false;

  // ---------------- 📦 البيانات في الذاكرة ----------------
  let SNAP = null, LEC = [], MAJ = [], OPS = [], EXTRAS = [], HIJ = null;
  const MAJ_KEYS = () => ['iso', 'time', 'husseiniya', 'owner', 'lecture', 'status', 'notes', 'mtype', 'family', 'deceased', 'ophone', 'famnote'].concat(EXTRAS.map((e) => e.key));
  // بصمة مجلس (نفسها في البرنامج Off_majHash_) — لكشف تعديله من مكان آخر
  const majHash = (m) => { const s = MAJ_KEYS().map((k) => String(m[k] == null ? '' : m[k]).replace(/\s+/g, ' ').trim()).join('¦'); let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return String(h); };
  const isPriv = (m) => !!(m && (m.mtype || m.family || m.deceased));
  const famNames = (v) => String(v || '').split(/\s*[،,\n]\s*/).map((x) => x.trim()).filter(Boolean);
  const famNorm = (s) => nz(s).replace(/^(عائله|عايله|اسره|بيت|ال)\s+/, '').replace(/^ال(?=..)/, '');
  const privTitle = (m) => { const p = []; if (m.mtype) p.push(m.mtype); const f = famNames(m.family); if (f.length) p.push((f.length > 1 ? f.slice(0, -1).join('، ') + ' و' + f[f.length - 1] : f[0]) + (m.famnote ? ' (' + m.famnote + ')' : '')); if (m.deceased) p.push('عن روح ' + m.deceased); return p.join(' — ') + (m.night ? ' (' + m.night + ')' : ''); };
  const majItems = (m) => { const out = []; String(m.lecture || '').split('\n').map((x) => x.trim()).filter(Boolean).forEach((t) => out.push({ k: 'lecture', icon: '📚', label: 'المحاضرة', t })); EXTRAS.forEach((e) => String(m[e.key] || '').split('\n').map((x) => x.trim()).filter(Boolean).forEach((t) => out.push({ k: e.key, icon: e.icon, label: e.label, t }))); return out; };
  const hijriOf = (iso) => { const h = HIJ && HIJ.days && HIJ.days[iso]; if (h) return h[0] + ' ' + ((HIJ.months || [])[h[1] - 1] || h[1]) + ' ' + h[2]; try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseIso(iso)); } catch (e) { return ''; } };
  const dayCell = (iso) => { const d = parseIso(iso); return d ? WD[d.getDay()] + ' ' + iso.replace(/-/g, '/') : iso; };
  const fileIdOf = (url) => { const m = /\/d\/([\w-]{20,})|[?&]id=([\w-]{20,})/.exec(url || ''); return m ? (m[1] || m[2]) : ''; };

  function buildData() {
    const P = (SNAP && SNAP.parts) || {};
    EXTRAS = SNAP && SNAP.extras || [];
    HIJ = P.hij && !P.hij.error ? P.hij : null;
    LEC = [];
    if (P.lec && P.lec.rows) {
      const c = P.lec.cols, g = (r, k) => (r[c[k] - 1] || '').toString();
      P.lec.rows.forEach((r, i) => {
        const title = g(r, 'title') || g(r, 'orig'); if (!title) return;
        LEC.push({ row: i + 2, title, orig: g(r, 'orig'), lecturer: g(r, 'lecturer'), link: g(r, 'link'), folder: g(r, 'folder'), tags: g(r, 'tags').split(/\s*[،,]\s*/).filter(Boolean), notes: g(r, 'notes'), file: g(r, 'file'), fileId: fileIdOf(g(r, 'file')), xf: g(r, 'xf'), rate: g(r, 'rate'), poet: g(r, 'poet'), poems: g(r, 'poems'), dates: g(r, 'dates') });
      });
    }
    MAJ = Array.isArray(P.maj) ? P.maj.map((m) => Object.assign({}, m)) : [];
    // ما في الطابور يظهر كأنه حُفظ (حتى يُرفع)
    OPS.forEach((o) => {
      if (o.st === 'done') return;
      if (o.fn === 'Maj_saveBatch') {
        const c = o.args[0] || {}; (o.args[1] || []).forEach((it, k) => {
          const m = Object.assign({ id: 'tmp-' + o.id + '-' + k, area: '', pnotes: {} }, c, { iso: it.iso, time: it.time, night: it.night || c.night || '' });
          if (it.blank) { m.lecture = ''; EXTRAS.forEach((e) => { m[e.key] = ''; }); }
          m._pend = o.id; MAJ.push(m);
        });
      } else if (o.fn === 'Maj_saveMajlis') { const r = o.args[0]; const i = MAJ.findIndex((m) => m.id === String(r.id)); if (i >= 0) { MAJ[i] = Object.assign({}, MAJ[i], r, { _pend: o.id }); } }
      else if (o.fn === 'Maj_setStatus') { const m = MAJ.find((x) => x.id === String(o.args[0])); if (m) { m.status = o.args[1]; m._pend = o.id; } }
      else if (o.lec) { const l = LEC.find((x) => x.title === o.lec.title) || LEC.find((x) => x.row === o.lec.row); if (l) { if (o.lec.rating != null) l.rate = o.lec.rating; if (o.lec.notes != null) l.notes = o.lec.notes; l._pend = o.id; } }
    });
    MAJ.sort((a, b) => (a.iso + a.time).localeCompare(b.iso + b.time));
    // 📇 الدليل: ما في الطابور من تعديلات يظهر فوراً
    HUSL = (Array.isArray(P.hus) ? P.hus : []).map((h) => Object.assign({}, h));
    OPS.forEach((o) => { if (o.fn !== 'Hus_save' || o.st === 'done') return; const r = o.args[0] || {}, h = HUSL.find((x) => x.name === r.name); if (!h) return;
      Object.assign(h, { owner: r.owner, time: r.time, notes: r.notes, address: r.address, addressText: r.address || h.addressText, mapRaw: r.map, _pend: o.id });
      if (r.phone != null) { const ph = String(r.phone).split(/[\n،,;\/]+/).map((x) => x.trim()).filter(Boolean); h.phones = ph.map((x) => ({ phone: x, wa: '' })); h.phone = ph[0] || ''; } });
    // ✔️ «تمّ» في الأعمال: ما في الطابور يغلب ما في اللقطة
    DONE = {}; OPS.forEach((o) => { if (o.fn === 'Daily_done' && o.st !== 'done') DONE[o.args[0] + '|' + o.args[1]] = !!o.args[2]; });
    remindPlan();
  }
  let DONE = {}, HUSL = [];
  // بصمة مكان في الدليل (نفسها في البرنامج Off_husHash_)
  const husHash = (h) => { const t = ['owner', 'time', 'notes', 'address', 'mapRaw'].map((k) => String(h[k] == null ? '' : h[k]).replace(/\s+/g, ' ').trim()).join('¦'); let x = 0; for (let i = 0; i < t.length; i++) x = ((x << 5) - x + t.charCodeAt(i)) | 0; return String(x); };
  const isDone = (iso, x) => { const k = iso + '|' + x.check; return k in DONE ? DONE[k] : !!x.done; };
  // كل قراءات فقرة: من سجل المجالس (المحاضرة وكل خانة)
  const readsOf = (title) => { const k = nz(title); return MAJ.filter((m) => m.status !== 'ملغى' && majItems(m).some((x) => nz(x.t) === k)); };

  // ---------------- 🔄 المزامنة ----------------
  let SYNC = { busy: false, msg: '', pct: 0, err: '' };
  const syncUi = () => { const c = $('#syncChip'); if (c) c.innerHTML = chipHtml(); const b = $('#syncBox'); if (b) b.innerHTML = syncBoxHtml(); };
  const chipHtml = () => { const n = OPS.filter((o) => o.st !== 'done').length; return (SYNC.busy ? '⏳ ' + esc(SYNC.msg || 'مزامنة') : online() ? '🟢 ' + esc(ago(CFG.lastSync)) : '📴 بلا إنترنت') + (n ? ' <span class="badge">' + n + '</span>' : ''); };
  const syncBoxHtml = () => SYNC.busy ? '<div class="sm">' + esc(SYNC.msg) + '</div><div class="bar"><i style="width:' + SYNC.pct + '%"></i></div>' : (SYNC.err ? '<div class="alert e">' + esc(SYNC.err) + '</div>' : '');

  async function pushOps() {
    const pend = OPS.filter((o) => o.st === 'pending' || o.st === 'error');
    if (!pend.length) return 0;
    SYNC.msg = 'رفع ' + pend.length + ' إدخال…'; syncUi();
    const r = await api({ api: 'push', ops: pend.map((o) => ({ id: o.id, fn: o.fn, args: o.args, guard: o.guard, lec: o.lec, label: o.label })) });
    if (!r.ok) throw new Error(r.error || 'تعذّر الرفع');
    let n = 0;
    for (const o of pend) {
      const x = r.res[o.id]; if (!x) continue;
      if (x.ok) { await opDel(o.id); n++; continue; }
      o.st = x.conflict ? 'conflict' : x.ask ? 'ask' : 'error'; o.err = x.error || (x.res && x.res.error) || ''; o.res = x.res || null; o.now = x.now || null; o.nowHus = x.nowHus || null; o.gone = !!x.gone;
      await opPut(o);
    }
    OPS = await opsAll();
    return n;
  }
  async function sync(opts) {
    opts = opts || {};
    if (SYNC.busy) return;
    if (!online()) { SYNC.err = '📴 لا إنترنت الآن — ستتم المزامنة حين يعود.'; syncUi(); return; }
    SYNC = { busy: true, msg: 'اتصال…', pct: 3, err: '' }; syncUi();
    try {
      const pushed = await pushOps();
      SYNC.msg = 'تنزيل البيانات…'; SYNC.pct = 15; syncUi();
      const s = await api({ api: 'snap' });
      if (!s.ok) throw new Error(s.error || 'تعذّر التنزيل');
      SNAP = s; await kvSet('snap', s);
      CFG.user = s.user; buildData();
      // 📄 النصوص: أول مرة كلها، ثم المتغيّر فقط
      if (!opts.noText && (s.parts.txt && s.parts.txt.rows)) {
        const since = CFG.txtFull ? (CFG.txtSince || 0) : 0, t0 = Date.now() - 60000;
        let cur = 0, done = false, got = 0, total = 0, first = true;
        while (!done) {
          const r = await api({ api: 'texts', since, cur, n: 150 });
          if (!r.ok) throw new Error(r.error || 'تعذّر تنزيل النصوص');
          if (first && r.keys) { const live = new Set(r.keys); const have = await txtKeys(); const gone = have.filter((k) => !live.has(k)); if (gone.length) await txtDel(gone); first = false; }
          total = r.total || 0; if (r.rows.length) await txtPutMany(r.rows); got += r.rows.length; cur = r.cur; done = r.done || !r.rows.length;
          SYNC.msg = 'النصوص ' + got + ' / ' + total; SYNC.pct = 20 + Math.round(75 * got / Math.max(total, 1)); syncUi();
        }
        CFG.txtSince = t0; CFG.txtFull = true;
      }
      CFG.lastSync = Date.now(); await kvSet('cfg', CFG);
      SYNC = { busy: false, msg: '', pct: 100, err: '' };
      toast('✅ تمت المزامنة' + (pushed ? ' — رُفع ' + pushed + ' إدخال' : ''));
    } catch (e) {
      SYNC = { busy: false, msg: '', pct: 0, err: (e.auth ? '🔐 ' : '⚠️ ') + (e.name === 'AbortError' ? 'انتهت المهلة — أعد المحاولة.' : e.fetch ? 'البرنامج لم يردّ (Failed to fetch). جرّب الرابط من «⚙️ الإعدادات»، أو تأكد أن النشر لـ«أي شخص» وأن الكود محدَّث.' : (e.message || e)) };
      if (e.auth) { CFG.tok = ''; await kvSet('cfg', CFG); }
    }
    syncUi(); render();
  }

  // ---------------- 🔐 PIN ----------------
  const sha = async (s) => { if (crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); } let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return 'x' + h; };
  let UNLOCKED = false, lastActive = Date.now();
  function pinScreen(mode, done) {   // mode: set | confirm | enter
    let v = '', first = '';
    const draw = () => {
      $('#app').innerHTML = '<div class="wrap" style="max-width:420px;text-align:center;padding-top:40px">' +
        '<img src="icon-192.png" width="72" height="72" alt="" style="border-radius:18px"><h2 style="margin:10px 0 0">' + (mode === 'enter' ? 'أدخل رمز PIN' : first ? 'أعد إدخال الرمز للتأكيد' : 'اختر رمز PIN (4 أرقام)') + '</h2>' +
        '<div class="mut sm">' + (mode === 'enter' ? 'المحاضرات والمجالس — بلا إنترنت' : 'يُطلب كل مرة تفتح التطبيق') + '</div>' +
        '<div class="pin">' + [0, 1, 2, 3].map((i) => '<span class="' + (i < v.length ? 'f' : '') + '"></span>').join('') + '</div><div id="pinErr" class="alert e hidden"></div>' +
        '<div class="keys">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : '<button type="button" data-k="' + k + '">' + k + '</button>').join('') + '</div>' +
        (mode === 'enter' ? '<div style="margin-top:18px"><a href="#" id="pinForgot" class="sm">نسيت الرمز؟</a></div>' : '') + '</div>';
    };
    const press = async (k) => {
      if (k === '⌫') v = v.slice(0, -1); else if (v.length < 4) v += k;
      draw();
      if (v.length < 4) return;
      if (mode === 'enter') {
        if (await sha('pin:' + v) === CFG.pin) { UNLOCKED = true; lastActive = Date.now(); done(); }
        else { v = ''; draw(); const e = $('#pinErr'); e.textContent = 'رمز خاطئ'; e.classList.remove('hidden'); }
      } else if (!first) { first = v; v = ''; draw(); }
      else if (first === v) { CFG.pin = await sha('pin:' + v); await kvSet('cfg', CFG); UNLOCKED = true; done(); }
      else { first = ''; v = ''; draw(); const e = $('#pinErr'); e.textContent = 'الرمزان مختلفان — أعد من البداية'; e.classList.remove('hidden'); }
    };
    draw();
    $('#app').onclick = (e) => {
      const b = e.target.closest('[data-k]'); if (b) press(b.getAttribute('data-k'));
      if (e.target.id === 'pinForgot') { e.preventDefault(); if (confirm('بدون الرمز يجب مسح بيانات التطبيق من هذا الجهاز والدخول من جديد (يحتاج إنترنت). ما في الطابور ولم يُرفع سيُفقد. أمسح؟')) wipe(); }
    };
    window.onkeydown = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); };
  }
  async function wipe() { UNLOCKED = false; await new Promise((r) => { const d0 = DB; DB = null; if (d0) d0.close(); const q = indexedDB.deleteDatabase('majalis-offline'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); location.reload(); }

  // ---------------- 🧭 الإعداد الأول ----------------
  // «Failed to fetch»: Google ردّ بصفحة (دخول/خطأ) بدل البيانات
  const fetchHelp = () => { const t = (CFG.exec || '').replace(/\?.*$/, '') + '?api=ping';
    return '<b>البرنامج لم يردّ على التطبيق.</b> افتح هذا الرابط في نفس المتصفح لتعرف السبب: <a href="' + esc(t) + '" target="_blank" dir="ltr" style="word-break:break-all">' + esc(t) + '</a>' +
      '<ul style="margin:6px 0 0;padding-inline-start:18px"><li>صفحة دخول Google أو «ليس لديك إذن» ← النشر ليس لـ«أي شخص»: Apps Script ← نشر ← إدارة عمليات النشر ← ✏️ ← «مَن لديه إذن الوصول: <b>أي شخص</b>» ← نشر.</li>' +
      '<li>صفحة البرنامج نفسه، أو «Script function not found» ← الكود لم يُحدَّث بعد: حدّثه بملف zip الأخير.</li>' +
      '<li>سطر يبدأ بـ {"ok":true ← الرابط سليم؛ أعد المحاولة هنا.</li></ul>'; };
  function setupScreen(err, html) {
    window.onkeydown = null; $('#app').onclick = null;
    $('#app').innerHTML = '<div class="top"><h1>📴 المحاضرات والمجالس — بلا إنترنت</h1></div><div class="wrap" style="max-width:560px">' +
      '<div class="card"><div class="b">١) رابط برنامجك</div><div class="mut sm">من البرنامج: «النسخ الاحتياطي والنظام» ← «📴 التطبيق بلا إنترنت» ← «📋 انسخ رابط برنامجك»، والصقه هنا.</div>' +
      '<input class="in" id="sExec" dir="ltr" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(CFG.exec || '') + '">' +
      '<label class="lbl">اسم هذا الجهاز (يظهر لك في البرنامج)</label><input class="in" id="sDev" value="' + esc(CFG.devName || defaultDevName()) + '"></div>' +
      '<div class="card"><div class="b">٢) الدخول</div><div class="mut sm">بنفس اسمك وكلمة مرورك في البرنامج (فارغ = المدير).</div>' +
      '<label class="lbl">الاسم</label><input class="in" id="sName" autocomplete="username"><label class="lbl">كلمة المرور</label><input class="in" id="sPw" type="password" autocomplete="current-password"></div>' +
      (err ? '<div class="alert e">' + (html ? err : esc(err)) + '</div>' : '') +
      '<button class="btn" id="sGo" style="width:100%">اتصل وابدأ</button><div style="margin-top:10px"><a href="#" id="sImp" class="sm">📥 أو استورد نسخة من جهاز آخر (تعمل بلا إنترنت)</a></div><div class="mut xs" style="margin-top:10px">بياناتك لا تمرّ بأي خادم آخر: تُنزَّل من برنامجك مباشرة وتُحفظ على هذا الجهاز فقط.</div></div>';
    $('#sImp').onclick = (e) => { e.preventDefault(); devImportPick(); };
    $('#sGo').onclick = async () => {
      const b = $('#sGo'); b.disabled = true; b.textContent = '⏳ اتصال…';
      try {
        let ex = $('#sExec').value.trim(); if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(ex) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(ex)) throw new Error('الرابط يجب أن يبدأ بـ https://script.google.com/macros/s/… وينتهي بـ /exec');
        ex = ex.replace(/\/dev(\?.*)?$/, '/exec');
        CFG.exec = ex; CFG.devName = $('#sDev').value.trim() || defaultDevName(); CFG.dev = CFG.dev || uid();
        if (!online()) throw new Error('يحتاج الإعداد الأول إنترنت.');
        const p = await api({ api: 'ping' }, 30000); if (!p.ok) throw new Error(p.error || 'البرنامج لم يردّ');
        const l = await api({ api: 'login', name: $('#sName').value.trim(), pw: $('#sPw').value }, 60000);
        if (!l.ok) throw new Error(l.error || 'تعذّر الدخول');
        CFG.tok = l.tok; CFG.user = l.user; await kvSet('cfg', CFG);
        if (!CFG.pin) pinScreen('set', () => { boot(true); }); else boot(true);
      } catch (e) { setupScreen(e.fetch ? fetchHelp() : (e.message || String(e)), !!e.fetch); }
    };
  }
  const defaultDevName = () => /Android/i.test(navigator.userAgent) ? 'جوال أندرويد' : /iPhone|iPad/i.test(navigator.userAgent) ? 'آيفون' : /Windows/i.test(navigator.userAgent) ? 'كمبيوتر ويندوز' : 'جهاز';

  // ---------------- 🖥️ الواجهة ----------------
  let VIEW = 'home', SUB = {}, TOASTT = null;
  const TABS = [['home', '🏠', 'الرئيسية'], ['search', '🔎', 'بحث'], ['maj', '📅', 'المجالس'], ['lec', '📚', 'الفقرات'], ['more', '☰', 'المزيد']];
  function toast(t) { let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.style.cssText = 'position:fixed;bottom:80px;inset-inline:16px;z-index:60;background:#222;color:#fff;border-radius:12px;padding:10px 14px;text-align:center;font-size:14px;opacity:.95'; document.body.appendChild(el); } el.textContent = t; el.style.display = 'block'; clearTimeout(TOASTT); TOASTT = setTimeout(() => { el.style.display = 'none'; }, 2800); }
  function shell(title, inner) {
    return '<div class="top"><h1>' + title + '</h1><button class="chip" id="syncChip" title="مزامنة">' + chipHtml() + '</button></div>' +
      '<div class="wrap"><div id="syncBox">' + syncBoxHtml() + '</div>' + inner + '</div>' +
      '<nav class="nav">' + TABS.map((t) => '<button data-tab="' + t[0] + '" class="' + (VIEW === t[0] || (t[0] === 'more' && ['fam', 'hus', 'daily', 'occ', 'queue', 'set', 'rep'].includes(VIEW)) ? 'on' : '') + '"><span class="i">' + t[1] + '</span>' + t[2] + '</button>').join('') + '</nav>';
  }
  function render() {
    if (!UNLOCKED) return;
    const f = VIEWS[VIEW] || VIEWS.home;
    const [title, inner] = f();
    const y = window.scrollY;
    $('#app').innerHTML = shell(title, inner);
    if (SUB.keepY) window.scrollTo(0, y);
    (AFTER[VIEW] || (() => {}))();
  }
  const go = (v, sub) => { VIEW = v; SUB = sub || {}; window.scrollTo(0, 0); render(); };

  // ---------- صفحات ----------
  const majRow = (m) => '<div class="item" data-maj="' + esc(m.id) + '"><div class="row"><span class="b" dir="ltr">' + esc(m.time || '—') + '</span><span class="grow">' +
    (isPriv(m) ? '<span class="ptag">🕯️ ' + esc(privTitle(m)) + '</span><br>' : '') + '<span class="t' + (m.status === 'ملغى' ? ' mut" style="text-decoration:line-through' : '') + '">' + esc(m.husseiniya) + '</span>' +
    (m._pend ? ' <span class="badge" title="بانتظار الرفع">⏳</span>' : '') + (m.status === 'تمّ' ? ' <span class="tag">✔️ تمّ</span>' : m.status === 'ملغى' ? ' <span class="tag">🚫 ملغى</span>' : '') +
    '<div class="mut sm">' + esc(dayCell(m.iso)) + ' · ' + esc(hijriOf(m.iso)) + '</div>' +
    (majItems(m).length ? '<div class="sm">' + majItems(m).map((x) => esc(x.icon + ' ' + x.t)).join(' · ') + '</div>' : '') + '</span></div></div>';
  const lecRow = (l, extra) => '<div class="item" data-lec="' + l.row + '"><div class="t">' + esc(l.title) + (l._pend ? ' <span class="badge">⏳</span>' : '') + '</div><div class="mut sm">📁 ' + esc(l.folder) + (l.rate ? ' · ⭐ ' + esc(l.rate) : '') + (l.tags.length ? ' · ' + l.tags.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') : '') + '</div>' + (extra || '') + '</div>';

  const VIEWS = {
    home() {
      const today = isoOf(new Date()), tm = isoOf(new Date(Date.now() + 864e5));
      const up = MAJ.filter((m) => m.iso >= today && m.status !== 'ملغى').slice(0, 8);
      const P = (SNAP && SNAP.parts) || {}, d0 = (P.daily || [])[0];
      const n = OPS.filter((o) => o.st !== 'done').length, bad = OPS.filter((o) => o.st === 'conflict' || o.st === 'ask' || o.st === 'error').length;
      let h = '';
      if (bad) h += '<div class="alert w">⚠️ ' + bad + ' إدخال يحتاج قرارك قبل الرفع — <a href="#" data-go="queue">افتحها</a></div>';
      else if (n) h += '<div class="alert i">⏳ ' + n + ' إدخال بانتظار الرفع — <a href="#" data-go="queue">اعرضها</a></div>';
      if (!SNAP) h += '<div class="alert w">لم تتم أول مزامنة بعد. اضغط «🔄 زامن الآن» وأنت على الإنترنت (يفضّل Wi-Fi: النصوص كثيرة).</div>';
      h += '<div class="card"><div class="row"><span class="grow b">📅 مجالسي القادمة</span><button class="btn s" data-new="pub">➕ مجلس</button><button class="btn s o" data-new="priv">🕯️ خاص</button></div>' +
        (up.length ? up.map((m) => (m.iso === today ? '' : '') + majRow(m)).join('') : '<div class="mut sm">لا مجالس قادمة.</div>') + '</div>';
      if (d0) h += '<div class="card"><div class="b">🕌 اليوم: ' + esc(d0.weekday + ' ' + d0.hijri) + '</div>' + dailyHtml(d0, true) + '<a href="#" data-go="daily" class="sm">كل الأعمال والأيام القادمة ←</a></div>';
      h += '<div class="card sm"><div class="row"><span class="grow">🔄 آخر مزامنة: <b>' + esc(fmtAt(CFG.lastSync)) + '</b> (' + esc(ago(CFG.lastSync)) + ')</span><button class="btn s" data-sync="1">🔄 زامن الآن</button></div></div>';
      return ['🏠 المحاضرات والمجالس', h];
    },
    search() {
      const q = SUB.q || '';
      let h = '<div class="card"><input class="in" id="q" type="search" placeholder="🔎 فقرة، وسم، ملاحظة، حسينية، عائلة، مرحوم، هاتف…" value="' + esc(q) + '" autofocus>' +
        '<div class="row sm" style="margin-top:6px"><label><input type="checkbox" id="qTxt"' + (SUB.txt ? ' checked' : '') + '> 📄 وفي نصوص الملفات</label></div></div><div id="qOut"></div>';
      return ['🔎 بحث', h];
    },
    maj() {
      const mode = SUB.mode || 'up', today = isoOf(new Date());
      let h = '<div class="seg">' + [['up', '⏭ القادمة'], ['past', '⏮ الماضية'], ['cal', '📅 التقويم'], ['priv', '🕯️ الخاصة'], ['fam', '👪 العوائل']].map((x) => '<button data-mmode="' + x[0] + '" class="' + (mode === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>';
      h += '<div class="row" style="margin-bottom:8px"><input class="in grow" id="mq" type="search" placeholder="🔎 الحسينية/المسجد، المسؤول أو هاتفه، العائلة، المرحوم…" value="' + esc(SUB.q || '') + '" style="flex:1"><button class="btn" data-new="' + (mode === 'priv' ? 'priv' : 'pub') + '">➕</button></div>';
      if (mode === 'fam') return ['📅 المجالس', h + famListHtml()];
      if (mode === 'cal') return ['📅 المجالس', h + calHtml()];
      let L = MAJ.filter((m) => mode === 'past' ? m.iso < today : mode === 'priv' ? isPriv(m) : m.iso >= today);
      if (mode === 'past') L = L.slice().reverse();
      L = majFilter(L, SUB.q);
      h += '<div class="card" id="mlist">' + (L.length ? L.slice(0, 300).map(majRow).join('') + (L.length > 300 ? '<div class="mut sm">… و' + (L.length - 300) + ' أخرى — ضيّق البحث</div>' : '') : '<div class="mut">لا نتائج.</div>') + '</div>';
      return ['📅 المجالس', h];
    },
    lec() {
      const P = (SNAP && SNAP.parts) || {}, folders = Array.from(new Set(LEC.map((l) => l.folder).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
      let h = '<div class="card"><input class="in" id="lq" type="search" placeholder="🔎 العنوان، الوسم، الملاحظة، المصدر…" value="' + esc(SUB.q || '') + '">' +
        '<div class="row" style="margin-top:6px"><select class="in" id="lf" style="flex:1"><option value="">📁 كل المجلدات</option>' + folders.map((f) => '<option' + (SUB.f === f ? ' selected' : '') + '>' + esc(f) + '</option>').join('') + '</select>' +
        '<select class="in" id="lr" style="width:auto"><option value="">⭐ الكل</option>' + ['مميز', 'وسط', 'عادي'].map((r) => '<option' + (SUB.r === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></div>' +
        '<label class="sm"><input type="checkbox" id="ln"' + (SUB.n ? ' checked' : '') + '> 📝 أظهر الملاحظات</label></div><div class="card" id="llist"></div>';
      return ['📚 الفقرات (' + LEC.length + ')', h];
    },
    more() {
      const n = OPS.filter((o) => o.st !== 'done').length;
      const it = (v, i, t, d) => '<div class="item" data-go="' + v + '"><div class="t">' + i + ' ' + t + '</div><div class="mut sm">' + d + '</div></div>';
      return ['☰ المزيد', '<div class="card">' + it('fam', '👪', 'العوائل', 'ماذا قرأت لكل عائلة') + it('hus', '📇', 'دليل الحسينيات والمساجد', 'الأماكن وأصحابها وهواتفهم') + it('rep', '📊', 'التقارير', 'حسينية، شهر، الفقرات الأكثر قراءة') + it('daily', '🕌', 'الأعمال', 'أعمال اليوم والليلة، ✔️ تمّ، ورسالتها') + it('occ', '📆', 'المناسبات', 'مناسبات كل شهر بالهجري والميلادي') +
        it('queue', '⏳', 'بانتظار الرفع' + (n ? ' (' + n + ')' : ''), 'ما أدخلته بلا إنترنت') + it('set', '⚙️', 'الإعدادات', 'المزامنة، الرمز، الجهاز') + '</div>'];
    },
    rep() {
      const mode = SUB.mode || 'hus';
      let h = '<div class="seg">' + [['hus', '🕌 حسينية'], ['mon', '📅 الشهر'], ['lec', '📚 الفقرات']].map((x) => '<button data-rmode="' + x[0] + '" class="' + (mode === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>';
      if (mode === 'hus') {
        const names = Array.from(new Set(MAJ.map((m) => m.husseiniya).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar'));
        h += '<div class="card"><select class="in" id="rh"><option value="">— اختر الحسينية / المكان —</option>' + names.map((n) => '<option' + (SUB.h === n ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select></div>';
        h += SUB.h ? husRepHtml(SUB.h) : '<div class="card mut sm">اختر مكاناً لترى: كم قرأت فيه، وماذا قرأت ومتى، والقادم.</div>';
      } else if (mode === 'mon') h += monRepHtml();
      else h += lecRepHtml();
      return ['📊 التقارير', h];
    },
    fam() { return ['👪 العوائل', '<div class="row" style="margin-bottom:8px"><input class="in" id="fq" type="search" placeholder="🔎 العائلة، ملاحظتها، المرحوم، المسؤول أو هاتفه…" value="' + esc(SUB.q || '') + '"></div>' + famListHtml()]; },
    hus() {
      const L = HUSL.filter((x) => !x.error);
      const types = Array.from(new Set(L.map((x) => x.type || 'حسينية')));
      return ['📇 الدليل (' + L.length + ')', '<div class="card"><input class="in" id="hq" type="search" placeholder="🔎 الاسم، المنطقة، المسؤول، الهاتف…" value="' + esc(SUB.q || '') + '"><div class="seg" style="margin:6px 0 0">' + ['', ...types].map((t) => '<button data-htype="' + esc(t) + '" class="' + ((SUB.t || '') === t ? 'on' : '') + '">' + esc(t || 'الكل') + '</button>').join('') + '</div></div><div class="card" id="hlist"></div>'];
    },
    daily() {
      const D = ((SNAP && SNAP.parts && SNAP.parts.daily) || []), i = SUB.i || 0, d = D[i];
      let h = '<div class="seg">' + D.map((x, k) => '<button data-dday="' + k + '" class="' + (k === i ? 'on' : '') + '">' + esc(k === 0 ? 'اليوم' : k === 1 ? 'غداً' : x.weekday) + ' ' + esc(String(x.hday || '')) + '</button>').join('') + '</div>';
      const night = SUB.n && d && d.night;
      if (d) h += '<div class="seg"><button data-dper="d" class="' + (night ? '' : 'on') + '">☀️ النهار</button>' + (d.night ? '<button data-dper="n" class="' + (night ? 'on' : '') + '">🌙 ' + esc(d.night.title || 'الليلة') + '</button>' : '') + '</div>';
      h += d ? '<div class="card"><div class="row"><span class="grow b">' + esc(night ? d.night.title : d.weekday + ' ' + d.hijri + ' — ' + d.gregText) + '</span><button class="btn s" data-dmsg="' + i + '|' + (night ? 'n' : 'd') + '">📤 الرسالة</button></div>' + dailyHtml(night ? Object.assign({ iso: d.night.iso }, d.night) : d, false) + '</div>' : '<div class="card mut">لا أعمال محفوظة — زامن وأنت على الإنترنت.</div>';
      return ['🕌 الأعمال', h];
    },
    occ() {
      const O = ((SNAP && SNAP.parts && SNAP.parts.occ) || []), i = SUB.i == null ? 1 : SUB.i, o = O[i];
      let h = '<div class="row" style="margin-bottom:8px"><button class="btn s o" data-occ="' + (i - 1) + '"' + (i <= 0 ? ' disabled' : '') + '>→ السابق</button><span class="grow b" style="text-align:center">' + esc(o ? o.name : '') + '<div class="mut xs">' + esc(o ? o.other : '') + '</div></span><button class="btn s o" data-occ="' + (i + 1) + '"' + (i >= O.length - 1 ? ' disabled' : '') + '>التالي ←</button></div>';
      h += '<div class="card">' + (o && o.items && o.items.length ? o.items.map((x) => '<div class="item"><div class="t">' + esc(x.title || x.bare || '') + '</div><div class="mut sm">' + esc([x.hText || x.hijri || '', x.gText || x.greg || '', x.type || ''].filter(Boolean).join(' · ')) + '</div></div>').join('') : '<div class="mut">لا مناسبات مسجّلة لهذا الشهر.</div>') + '</div>';
      return ['📆 المناسبات', h];
    },
    queue() {
      const L = OPS.filter((o) => o.st !== 'done');
      let h = L.length ? '' : '<div class="card mut">لا شيء بانتظار الرفع ✅</div>';
      L.forEach((o) => {
        const st = { pending: '⏳ بانتظار الإنترنت', error: '⚠️ لم يُرفع', conflict: '⚖️ تعارض', ask: '❓ يحتاج قرارك' }[o.st] || o.st;
        h += '<div class="card"><div class="row"><span class="grow t">' + esc(o.label || o.fn) + '</span><span class="tag">' + st + '</span></div><div class="mut xs">' + esc(fmtAt(o.at)) + '</div>' + (o.desc ? '<div class="sm">' + esc(o.desc) + '</div>' : '') + (o.err ? '<div class="alert e">' + esc(o.err) + '</div>' : '');
        if (o.st === 'conflict' && o.nowHus) h += '<div class="alert w">في البرنامج الآن: 👤 ' + esc(o.nowHus.owner || '—') + ' · ⏰ ' + esc(o.nowHus.time || '—') + (o.nowHus.address ? ' · 📍 ' + esc(o.nowHus.address) : '') + (o.nowHus.notes ? '<br>📝 ' + esc(o.nowHus.notes) : '') + '</div><div class="row"><button class="btn s" data-qforce="' + o.id + '">طبّق تعديلي رغم ذلك</button><button class="btn s o" data-qdel="' + o.id + '">اترك تعديلي (احذفه)</button></div>';
        else if (o.st === 'conflict' && o.now) h += '<div class="alert w">في البرنامج الآن: ' + esc(o.now.husseiniya + ' · ' + o.now.iso + ' ' + o.now.time + ' · ' + o.now.status) + (majItems(o.now).length ? '<br>' + majItems(o.now).map((x) => esc(x.icon + ' ' + x.t)).join(' · ') : '') + '</div><div class="row"><button class="btn s" data-qforce="' + o.id + '">طبّق تعديلي رغم ذلك</button><button class="btn s o" data-qdel="' + o.id + '">اترك تعديلي (احذفه)</button></div>';
        else if (o.st === 'ask' && o.res && o.res.needConfirm === 'newHusseiniya') h += '<div class="alert w">«' + esc(o.res.name) + '» ليس في دليل الحسينيات والمساجد.</div><div class="row"><select class="in" id="pt-' + o.id + '" style="width:auto">' + ['حسينية', 'مسجد', 'ديوانية', 'صالة', 'منزل'].map((t) => '<option>' + t + '</option>').join('') + '</select><button class="btn s" data-qplace="' + o.id + '">أضفه للدليل</button><button class="btn s o" data-qfree="' + o.id + '">نص حر</button></div>';
        else if (o.st === 'ask' && o.res && o.res.needConfirm === 'newLecture') h += '<div class="alert w">الفقرة «' + esc(o.res.name || '') + '» ليست في الأرشيف.</div><div class="row"><button class="btn s" data-qaddlec="' + o.id + '">أضفها للأرشيف</button><button class="btn s o" data-qkeepfree="' + o.id + '">احفظها نصاً حراً</button></div>';
        else if (o.st === 'ask' && o.res && o.res.needDup) h += '<div class="alert w">🔁 مسجّل من قبل في «' + esc(o.res.husseiniya || '') + '» في نفس اليوم: ' + esc((o.res.dups || []).map((d) => d.iso + ' ' + (d.withTime || '') + (d.lecture ? ' — ' + d.lecture : '')).join('، ')) + '</div><div class="row"><button class="btn s" data-qdup="' + o.id + '">احفظه مجلساً إضافياً</button></div>';
        else if (o.st === 'ask' && o.res && o.res.conflicts) h += '<div class="alert w">⚠️ يتعارض في الوقت مع: ' + esc((o.res.conflicts || []).map((c) => (c.withHus || '') + ' ' + (c.withTime || '') + ' (' + (c.iso || '') + ')').join('، ')) + '</div><div class="row"><button class="btn s" data-qforce2="' + o.id + '">احفظ رغم التعارض</button></div>';
        h += '<div class="row" style="margin-top:6px">' + (o.st !== 'pending' ? '<button class="btn s o" data-qretry="' + o.id + '">🔁 أعد المحاولة</button>' : '') + '<button class="btn s o" style="color:var(--bad);border-color:var(--bad)" data-qdel="' + o.id + '">🗑️ احذفه</button></div></div>';
      });
      return ['⏳ بانتظار الرفع', h];
    },
    set() {
      const P = (SNAP && SNAP.parts) || {};
      let h = '<div class="card"><div class="kv"><span class="k">المستخدم</span><span>' + esc((CFG.user && CFG.user.name) || '—') + '</span><span class="k">الجهاز</span><span>' + esc(CFG.devName || '') + '</span><span class="k">آخر مزامنة</span><span>' + esc(fmtAt(CFG.lastSync)) + '</span>' +
        '<span class="k">الفقرات</span><span>' + LEC.length + '</span><span class="k">المجالس</span><span>' + MAJ.length + '</span><span class="k">النصوص</span><span id="txtN">…</span><span class="k">الإصدار</span><span>' + APP_VER + '</span></div>' +
        '<div class="row" style="margin-top:10px"><button class="btn" data-sync="1">🔄 زامن الآن</button><button class="btn o" data-sync="full">📄 أعد تنزيل النصوص كلها</button></div></div>' +
        '<div class="card"><div class="b">🔔 تذكير بالمجالس</div><label class="row sm" style="margin-top:6px"><input type="checkbox" id="remOn"' + (CFG.rem && CFG.rem.on ? ' checked' : '') + '> ذكّرني قبل كل مجلس بـ <select class="in" id="remMin" style="width:auto">' + [15, 30, 60, 90, 120, 180].map((n) => '<option value="' + n + '"' + (((CFG.rem && CFG.rem.min) || 60) === n ? ' selected' : '') + '>' + (n < 60 ? n + ' دقيقة' : n === 60 ? 'ساعة' : n === 120 ? 'ساعتين' : (n / 60) + ' ساعات') + '</option>').join('') + '</select></label>' +
          '<label class="row sm" style="margin-top:6px">🌙 ملخص مجالس الغد كل مساء الساعة <select class="in" id="remEve" style="width:auto"><option value="">— لا —</option>' + ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00'].map((x) => '<option' + ((CFG.rem && CFG.rem.eve) === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
          '<div class="mut xs" style="margin-top:4px">' + remindNote() + '</div><div class="row" style="margin-top:6px"><button class="btn s o" id="remTest">🔔 جرّب إشعاراً الآن</button></div></div>' +
        '<div class="card"><div class="row"><button class="btn o" id="setPin">🔐 غيّر رمز PIN</button><button class="btn o" id="setLogin">👤 دخول من جديد</button><button class="btn o" id="setLock">🔒 اقفل الآن</button></div></div>' +
        '<div class="card"><div class="b">رابط البرنامج</div><div class="xs mut" dir="ltr" style="word-break:break-all">' + esc(CFG.exec) + '</div><button class="btn s o" id="setExec" style="margin-top:6px">✏️ غيّره</button></div>' +
        '<div class="card"><div class="b">🛡️ نسخة من بيانات هذا الجهاز</div><div class="mut xs">ملف واحد فيه المجالس والفقرات والنصوص وما لم يُرفع — احفظه في الجوال أو الكمبيوتر، ويُستورد على أي جهاز ولو بلا إنترنت.</div><div class="row" style="margin-top:6px"><button class="btn s" id="bkOut">⬇️ نزّل النسخة</button><button class="btn s o" id="bkIn">📥 استورد نسخة</button></div><div id="bkRes" class="sm" style="margin-top:4px"></div></div>' +
        '<div class="card"><button class="btn bad" id="setWipe">🗑️ امسح بيانات التطبيق من هذا الجهاز</button><div class="mut xs" style="margin-top:6px">لا يمس برنامجك. ما لم يُرفع من الطابور يُفقد.</div></div>';
      return ['⚙️ الإعدادات', h];
    },
  };
  // ---------- أجزاء مشتركة ----------
  function dailyHtml(d, short) {
    let h = '';
    const mn = [d.moonTop, d.moonNote].find((x) => typeof x === 'string' && x.trim()); if (mn) h += '<div class="alert i">' + esc(mn) + '</div>';
    (d.occasions || []).forEach((o) => { h += '<div class="alert w">📆 ' + esc(o.title || o.text || o) + '</div>'; });
    (d.groups || []).forEach((g) => {
      const its = (g.items || []).filter((x) => !short || x.home || x.inMsg);
      if (!its.length) return;
      h += '<div class="b sm" style="margin-top:8px">' + esc(g.title) + '</div>' + its.slice(0, short ? 6 : 999).map((x) => { const dn = x.check && isDone(d.iso, x);
        return '<div class="item act' + (dn ? ' done' : '') + '" style="cursor:default"><div class="row" style="flex-wrap:nowrap;align-items:flex-start">' + (x.check ? '<button class="btn s ' + (dn ? '' : 'o') + '" data-adone="' + esc(d.iso + '|' + x.check) + '" title="' + (dn ? 'أنجزته — اضغط للإلغاء' : 'علّمه: تمّ') + '" style="flex:none;padding:2px 8px">' + (dn ? '✔️ تمّ' : '✔️') + '</button>' : '') + '<div class="grow"><div class="at">' + esc(x.text || x.title) + '</div>' + (!short && x.notes ? '<div class="mut xs">' + esc(x.notes) + '</div>' : '') + (x.moonWarn ? '<div class="alert w">' + esc(x.moonWarn) + '</div>' : '') + '</div></div></div>'; }).join('');
    });
    return h || '<div class="mut sm">لا أعمال.</div>';
  }
  function majFilter(L, q) {
    const ws = words(q || ''), qd = AR_DIG(q || '').replace(/\D/g, '');
    if (!ws.length) return L;
    return L.filter((m) => (qd.length >= 4 && String(m.ophone || '').replace(/\D/g, '').indexOf(qd) >= 0) || hasAll(nz([m.husseiniya, m.area, m.owner, m.lecture, m.notes, m.family, m.famnote, m.deceased, m.mtype, m.ophone, m.iso, majItems(m).map((x) => x.t).join(' ')].join(' ')), ws));
  }
  function famData() {
    const by = {}, today = isoOf(new Date());
    MAJ.forEach((m) => famNames(m.family).forEach((nm) => {
      const k = famNorm(nm); if (!k) return;
      const f = by[k] = by[k] || { name: nm, k, list: [], deceased: [], owner: '', ophone: '', note: '' };
      f.list.push(m); if (m.deceased && !f.deceased.includes(m.deceased)) f.deceased.push(m.deceased);
      if (m.owner) f.owner = m.owner; if (m.ophone) f.ophone = m.ophone; if (m.famnote) f.note = m.famnote;
    }));
    return Object.values(by).map((f) => { const act = f.list.filter((m) => m.status !== 'ملغى'); f.n = act.length; f.last = act.filter((m) => m.iso <= today).map((m) => m.iso).sort().pop() || ''; return f; }).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  }
  function famListHtml() {
    const ws = words(SUB.q || ''), qd = AR_DIG(SUB.q || '').replace(/\D/g, '');
    const L = famData().filter((f) => !ws.length || (qd.length >= 4 && String(f.ophone).replace(/\D/g, '').includes(qd)) || hasAll(nz([f.name, f.note, f.deceased.join(' '), f.owner, f.ophone].join(' ')), ws));
    return '<div class="card">' + (L.length ? L.map((f) => '<div class="item" data-fam="' + esc(f.name) + '"><div class="t">👪 ' + esc(f.name) + (f.note ? ' <span class="mut">(' + esc(f.note) + ')</span>' : '') + ' <span class="tag">' + f.n + '</span></div><div class="mut sm">' + esc([f.deceased.length ? 'عن روح ' + f.deceased.join('، ') : '', f.last ? 'آخر مجلس ' + f.last.replace(/-/g, '/') : '', f.owner ? '👤 ' + f.owner : '', f.ophone].filter(Boolean).join(' · ')) + '</div></div>').join('') : '<div class="mut">لا عوائل' + (ws.length ? ' بهذا البحث' : ' بعد') + '.</div>') + '</div>';
  }
  function calHtml() {
    const base = SUB.ym ? parseIso(SUB.ym + '-01') : new Date(), y = base.getFullYear(), mo = base.getMonth(), first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate(), today = isoOf(new Date());
    const by = {}; MAJ.forEach((m) => { if (m.status !== 'ملغى') (by[m.iso] = by[m.iso] || []).push(m); });
    const ym = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
    let h = '<div class="row" style="margin-bottom:6px"><button class="btn s o" data-cal="' + ym(new Date(y, mo - 1, 1)) + '">→</button><span class="grow b" style="text-align:center">' + new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(first) + '<div class="mut xs">' + esc(hijriOf(isoOf(first)) + ' – ' + hijriOf(isoOf(new Date(y, mo, days)))) + '</div></span><button class="btn s o" data-cal="' + ym(new Date(y, mo + 1, 1)) + '">←</button></div>';
    h += '<div class="cal">' + ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map((w) => '<div class="h">' + w + '</div>').join('');
    for (let i = 0; i < first.getDay(); i++) h += '<div class="x"></div>';
    for (let d = 1; d <= days; d++) {
      const iso = y + '-' + pad(mo + 1) + '-' + pad(d), L = by[iso] || [], hh = HIJ && HIJ.days && HIJ.days[iso];
      h += '<div data-cday="' + iso + '" class="' + (iso === today ? 'today' : '') + '"><b>' + d + '</b> <span class="mut">' + (hh ? hh[0] : '') + '</span>' + L.slice(0, 3).map((m) => '<span class="dot' + (isPriv(m) ? ' p' : '') + '"></span>').join('') + '</div>';
    }
    h += '</div>';
    const sel = SUB.day; if (sel) h += '<div class="card" style="margin-top:8px"><div class="b">' + esc(dayCell(sel) + ' · ' + hijriOf(sel)) + '</div>' + ((by[sel] || []).map(majRow).join('') || '<div class="mut sm">لا مجالس.</div>') + '<button class="btn s" data-new="pub" data-iso="' + sel + '" style="margin-top:6px">➕ مجلس في هذا اليوم</button></div>';
    return h;
  }
  // ---------- بعد الرسم ----------
  const AFTER = {
    search() {
      const run = async () => {
        const q = $('#q').value; SUB.q = q; SUB.txt = $('#qTxt').checked; const ws = words(q), out = $('#qOut');
        if (!ws.length) { out.innerHTML = ''; return; }
        const L = LEC.filter((l) => hasAll(nz([l.title, l.orig, l.folder, l.tags.join(' '), l.notes, l.lecturer, l.poet, l.poems].join(' ')), ws)).slice(0, 60);
        const M = majFilter(MAJ, q).slice(-40).reverse();
        const H = HUSL.filter((x) => hasAll(nz([x.name, x.area, x.owner, x.phone, (x.more || []).map((c) => c.name + ' ' + (c.phone || '')).join(' ')].join(' ')), ws)).slice(0, 20);
        let h = '';
        if (L.length) h += '<div class="card"><div class="b">📚 الفقرات (' + L.length + ')</div>' + L.map((l) => lecRow(l)).join('') + '</div>';
        if (M.length) h += '<div class="card"><div class="b">📅 المجالس (' + M.length + ')</div>' + M.map(majRow).join('') + '</div>';
        if (H.length) h += '<div class="card"><div class="b">📇 الدليل (' + H.length + ')</div>' + H.map(husRow).join('') + '</div>';
        if (SUB.txt) h += '<div class="card" id="qTxtOut"><div class="b">📄 في نصوص الملفات</div><div class="mut sm">⏳ يبحث…</div></div>';
        out.innerHTML = h || '<div class="card mut">لا نتائج.</div>';
        if (SUB.txt) searchTexts(ws, $('#qTxtOut'));
      };
      let tm; $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(run, 250); }; $('#qTxt').onchange = run; if (SUB.q) run();
    },
    maj() { const i = $('#mq'); let tm; i.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { SUB.q = i.value; SUB.keepY = false; const v = i.value; render(); const j = $('#mq'); j.focus(); j.setSelectionRange(v.length, v.length); }, 300); }; },
    fam() { const i = $('#fq'); let tm; i.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { SUB.q = i.value; const v = i.value; render(); const j = $('#fq'); j.focus(); j.setSelectionRange(v.length, v.length); }, 300); }; },
    lec() {
      const draw = () => {
        SUB.q = $('#lq').value; SUB.f = $('#lf').value; SUB.r = $('#lr').value; SUB.n = $('#ln').checked;
        const ws = words(SUB.q), L = LEC.filter((l) => (!SUB.f || l.folder === SUB.f) && (!SUB.r || l.rate === SUB.r) && (!ws.length || hasAll(nz([l.title, l.orig, l.tags.join(' '), l.notes, l.lecturer, l.poet].join(' ')), ws)));
        $('#llist').innerHTML = L.length ? L.slice(0, 400).map((l) => lecRow(l, SUB.n && l.notes ? '<div class="sm" style="white-space:pre-line;border-inline-start:3px solid var(--line);padding-inline-start:6px;margin-top:3px">📝 ' + esc(l.notes) + '</div>' : '')).join('') + (L.length > 400 ? '<div class="mut sm">… و' + (L.length - 400) + ' أخرى</div>' : '') : '<div class="mut">لا نتائج.</div>';
      };
      let tm; $('#lq').oninput = () => { clearTimeout(tm); tm = setTimeout(draw, 250); }; $('#lf').onchange = draw; $('#lr').onchange = draw; $('#ln').onchange = draw; draw();
    },
    hus() {
      const draw = () => { SUB.q = $('#hq').value; const ws = words(SUB.q), qd = AR_DIG(SUB.q).replace(/\D/g, ''); const L = HUSL.filter((x) => (!SUB.t || (x.type || 'حسينية') === SUB.t) && (!ws.length || (qd.length >= 4 && JSON.stringify(x.phones || []).replace(/\D/g, '').includes(qd)) || hasAll(nz([x.name, x.area, x.owner, x.notes, (x.more || []).map((c) => c.name).join(' ')].join(' ')), ws))); $('#hlist').innerHTML = L.map(husRow).join('') || '<div class="mut">لا نتائج.</div>'; };
      let tm; $('#hq').oninput = () => { clearTimeout(tm); tm = setTimeout(draw, 250); }; draw();
    },
    set() { txtCount().then((n) => { const e = $('#txtN'); if (e) e.textContent = n + ' جزء'; }); const mn = $('#remMin'); if (mn) mn.onchange = async () => { CFG.rem = Object.assign({}, CFG.rem, { min: +mn.value }); await kvSet('cfg', CFG); remindPlan(); toast('✓ حُفظ'); };
      const ev = $('#remEve'); if (ev) ev.onchange = async () => { if (ev.value && 'Notification' in window && Notification.permission !== 'granted') { const p1 = await Notification.requestPermission(); if (p1 !== 'granted') { toast('⚠️ لم تُسمح الإشعارات'); ev.value = ''; return; } } CFG.rem = Object.assign({ min: 60 }, CFG.rem, { eve: ev.value }); await kvSet('cfg', CFG); await remindPlan(); if (ev.value) { try { const reg = await navigator.serviceWorker.ready; if (reg.periodicSync) await reg.periodicSync.register('remind', { minInterval: 15 * 60000 }); } catch (e) {} } toast(ev.value ? '🌙 ملخص الغد الساعة ' + ev.value : '✓ أُلغي ملخص الغد'); }; },
    rep() { const hs0 = $('#rh'); if (hs0) hs0.onchange = () => { SUB.h = hs0.value; render(); }; const i = $('#rq'); if (!i) return; let tm; i.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { SUB.q = i.value; const v1 = i.value; render(); const j = $('#rq'); if (j) { j.focus(); j.setSelectionRange(v1.length, v1.length); } }, 350); }; const hs = $('#rh'); if (hs) hs.onchange = () => { SUB.h = hs.value; render(); }; },
  };
  function husRow(x) {
    const mine = MAJ.filter((m) => m.husseiniya === x.name && m.status !== 'ملغى'), last = mine.filter((m) => m.iso <= isoOf(new Date())).pop();
    const ph = (x.phones && x.phones.length ? x.phones : x.phone ? [{ phone: x.phone, wa: x.wa }] : []);
    return '<div class="item" data-husr="' + esc(x.name) + '"><div class="t">' + (x.type && x.type !== 'حسينية' ? '<span class="tag">' + esc(x.type) + '</span> ' : '') + esc(x.name) + '</div><div class="sm">' + (x.owner ? '👤 ' + esc(x.owner) + ' ' : '') + ph.map((p) => '<a href="tel:' + esc(p.phone) + '" dir="ltr">📞 ' + esc(p.phone) + '</a>' + (p.wa ? ' <a href="https://wa.me/' + esc(p.wa) + '" target="_blank">💬</a>' : '')).join(' · ') + '</div>' +
      (x.addressText ? '<div class="mut xs">📍 ' + esc(x.addressText) + '</div>' : '') + (x.weekdaysText || x.hdaysText ? '<div class="mut xs">📆 ' + esc([x.weekdaysText, x.hdaysText, x.time].filter(Boolean).join(' · ')) + '</div>' : '') + '<div class="mut xs">قراءاتي: ' + mine.length + (last ? ' · آخرها ' + esc(last.iso.replace(/-/g, '/')) : '') + '</div></div>';
  }
  async function searchTexts(ws, box) {
    const byFile = {}; LEC.forEach((l) => { if (l.fileId) byFile[l.fileId] = l; });
    const hits = []; let n = 0;
    await txtEach((r) => {
      n++; const lines = String(r.text || '').split('\n');
      for (let i = 0; i < lines.length; i++) { const b = nz(lines[i]); if (b && hasAll(b, ws)) { hits.push({ r, i, line: lines[i] }); if (hits.length >= 200) return false; } }
    });
    if (!box.isConnected) return;
    const g = {}; hits.forEach((x) => { (g[x.r.id] = g[x.r.id] || []).push(x); });
    const ids = Object.keys(g);
    box.innerHTML = '<div class="b">📄 في نصوص الملفات (' + ids.length + ' ملف)</div>' + (n ? '' : '<div class="alert w">لا نصوص على الجهاز بعد — زامن وأنت على الإنترنت.</div>') +
      (ids.map((id) => { const l = byFile[id]; return '<div class="item"' + (l ? ' data-lec="' + l.row + '"' : '') + '><div class="t">' + esc(l ? l.title : '(ملف أرشيف) ' + id.slice(0, 8)) + '</div>' + g[id].slice(0, 3).map((x) => '<div class="sm"><span class="mut">' + (x.i + 1) + ':</span> ' + hlWords(x.line, ws) + '</div>').join('') + '</div>'; }).join('') || (n ? '<div class="mut sm">لا نتائج.</div>' : ''));
  }
  const HLC = { 'ا': '[اأإآٱ]', 'ه': '[هة]', 'ي': '[يىئی]', 'و': '[وؤ]', 'ك': '[كک]', 'ج': '[جچ]' };
  function hlWords(s, ws) { let t = esc(s); ws.forEach((w) => { if (w.length < 2) return; try { t = t.replace(new RegExp('(' + w.split('').map((c) => (HLC[c] || c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) + '[\\u064B-\\u065F\\u0640]*').join('') + ')', 'g'), '<span class="hl">$1</span>'); } catch (e) {} }); return t; }

  // ---------------- 📊 التقارير (من بيانات الجهاز) ----------------
  let REP_TXT = '';
  const copyText = (t) => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('📋 نُسخ'), () => prompt('انسخ:', t));
  const stIcon = (s) => s === 'تمّ' ? '✔️' : s === 'ملغى' ? '🚫' : '⏳';
  function husRepData(name) {
    const today = isoOf(new Date()), L = MAJ.filter((m) => m.husseiniya === name), act = L.filter((m) => m.status !== 'ملغى');
    const done = act.filter((m) => m.iso <= today), up = act.filter((m) => m.iso > today), T = {};
    done.forEach((m) => majItems(m).forEach((x) => { const k = nz(x.t); (T[k] = T[k] || { t: x.t, icon: x.icon, w: [] }).w.push(m.iso); }));
    return { L, act, done, up, cancel: L.length - act.length, titles: Object.values(T).sort((a, b) => b.w.length - a.w.length || a.t.localeCompare(b.t, 'ar')) };
  }
  function husRepHtml(name) {
    const D = husRepData(name), H = HUSL.find((x) => x.name === name);
    REP_TXT = ['📊 ' + name, 'المجالس: ' + D.act.length + ' (قُرئ ' + D.done.length + '، قادم ' + D.up.length + (D.cancel ? '، ملغى ' + D.cancel : '') + ')', D.done.length ? 'أول مجلس: ' + D.done[0].iso.replace(/-/g, '/') + ' · آخر مجلس: ' + D.done[D.done.length - 1].iso.replace(/-/g, '/') : '', '',
      '📚 ما قرأته فيه:', ...D.titles.map((t) => '• ' + t.icon + ' ' + t.t + ' — ' + t.w.map((x) => x.replace(/-/g, '/')).join('، ')), '', D.up.length ? '⏭ القادم:' : '', ...D.up.map((m) => '• ' + dayCell(m.iso) + ' ' + (m.time || '') + (majItems(m).length ? ' — ' + majItems(m).map((x) => x.t).join('، ') : ''))].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
    return '<div class="card"><div class="row"><span class="grow t">' + esc(name) + '</span><button class="btn s" data-rcopy="1">📋 انسخ</button><button class="btn s o" data-rinv="' + esc(name) + '">📨 رسالة الاتفاق</button>' + (H ? '<button class="btn s o" data-hused="' + esc(name) + '">✏️ عدّل بياناته</button>' : '') + '</div>' + (H && H._pend ? '<div class="alert i">⏳ تعديلك على بياناته بانتظار الرفع</div>' : '') + (H && H.owner ? '<div class="mut sm">👤 ' + esc(H.owner) + (H.phone ? ' · <a href="tel:' + esc(H.phone) + '" dir="ltr">' + esc(H.phone) + '</a>' : '') + '</div>' : '') +
      '<div class="kv" style="margin-top:6px"><span class="k">المجالس</span><span><b>' + D.act.length + '</b> (✔️ ' + D.done.length + ' · ⏭ ' + D.up.length + (D.cancel ? ' · 🚫 ' + D.cancel : '') + ')</span>' + (D.done.length ? '<span class="k">أول/آخر</span><span>' + esc(D.done[0].iso.replace(/-/g, '/') + ' ← ' + D.done[D.done.length - 1].iso.replace(/-/g, '/')) + '</span>' : '') + '<span class="k">فقرات مختلفة</span><span>' + D.titles.length + '</span></div></div>' +
      (D.up.length ? '<div class="card"><div class="b">⏭ القادم (' + D.up.length + ')</div>' + D.up.map(majRow).join('') + '</div>' : '') +
      '<div class="card"><div class="b">📚 ما قرأته فيه (' + D.titles.length + ')</div>' + (D.titles.map((t) => { const l = LEC.find((y) => nz(y.title) === nz(t.t)); return '<div class="item"' + (l ? ' data-lec="' + l.row + '"' : '') + '>' + esc(t.icon + ' ' + t.t) + (t.w.length > 1 ? ' <span class="tag">' + t.w.length + '×</span>' : '') + '<div class="mut xs">' + esc(t.w.map((x) => x.replace(/-/g, '/')).join(' · ')) + '</div></div>'; }).join('') || '<div class="mut sm">لا قراءات بعد.</div>') + '</div>' +
      '<div class="card"><div class="b">🗂️ كل مجالسه (' + D.L.length + ')</div>' + D.L.slice().reverse().slice(0, 200).map(majRow).join('') + '</div>';
  }
  function openHusRep(name) { const el = sheet('📊 ' + esc(name), husRepHtml(name)); el.addEventListener('click', (e) => { const mj = e.target.closest('[data-maj]'); if (mj) openMaj(mj.getAttribute('data-maj')); const lc = e.target.closest('[data-lec]'); if (lc) openLec(lc.getAttribute('data-lec')); if (e.target.closest('[data-rcopy]')) copyText(REP_TXT); const iv = e.target.closest('[data-rinv]'); if (iv) openInv(iv.getAttribute('data-rinv')); const he = e.target.closest('[data-hused]'); if (he) husForm(he.getAttribute('data-hused')); }); }
  // 📇 تعديل مكان في الدليل (المسؤول، الهواتف، الوقت، العنوان، الموقع، الملاحظات) — يُرفع كالمجالس
  function husForm(name) {
    const H = HUSL.find((x) => x.name === name); if (!H) return;
    const tm = /^(\d{1,2}):(\d{2})/.exec(H.time || '') || [], th = tm[1] ? pad(+tm[1]) : '', tmi = tm[2] || '';
    const el = sheet('✏️ ' + esc(name), '<div class="card"><label class="lbl">صاحب الحسينية / المسؤول</label><input class="in" id="hOw" value="' + esc(H.owner || '') + '">' +
      '<label class="lbl">الهواتف (افصل بينها بالفاصلة «،»)</label><input class="in" id="hPh" dir="ltr" type="tel" value="' + esc((H.phones || []).map((p1) => p1.phone).join('، ') || H.phone || '') + '">' +
      '<label class="lbl">الوقت المعتاد</label><div class="row" style="gap:4px;flex-wrap:nowrap" dir="ltr"><select class="in" id="hTH" style="width:auto"><option value="">--</option>' + Array.from({ length: 24 }, (_, i) => pad(i)).map((x) => '<option' + (x === th ? ' selected' : '') + '>' + x + '</option>').join('') + '</select><b>:</b><select class="in" id="hTM" style="width:auto">' + Array.from(new Set(['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].concat(tmi ? [tmi] : []))).sort().map((x) => '<option' + (x === (tmi || '00') ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<label class="lbl">العنوان</label><textarea class="in" id="hAd" style="min-height:60px">' + esc(H.address || '') + '</textarea>' +
      '<label class="lbl">رابط الموقع (خرائط جوجل) أو الإحداثيات</label><input class="in" id="hMp" dir="ltr" value="' + esc(H.mapRaw || '') + '">' +
      '<label class="lbl">ملاحظات</label><textarea class="in" id="hNt" style="min-height:60px">' + esc(H.notes || '') + '</textarea></div>' +
      '<button class="btn" id="hSave" style="width:100%">💾 احفظ' + (online() ? '' : ' (يُرفع حين يعود الإنترنت)') + '</button>');
    $('#hSave', el).onclick = async () => {
      const g = (id) => ($(id, el).value || '').trim();
      const rec = { name: H.name, weekdays: H.weekdays || [], hdays: H.hdaysText || '', time: g('#hTH') ? g('#hTH') + ':' + g('#hTM') : '', owner: g('#hOw'), phone: g('#hPh'), notes: g('#hNt'), rules: H.rulesText || '', address: g('#hAd'), map: g('#hMp'), more: H.more || [], type: H.type || 'حسينية' };
      const base = ((SNAP && SNAP.parts && SNAP.parts.hus) || []).find((x) => x.name === H.name) || H;
      await queue({ fn: 'Hus_save', args: [rec], guard: { hus: H.name, h: husHash(base) }, label: '📇 تعديل الدليل: ' + H.name, desc: [rec.owner && '👤 ' + rec.owner, rec.phone && '📞 ' + rec.phone, rec.time && '⏰ ' + rec.time].filter(Boolean).join(' · ') });
      history.back(); setTimeout(() => { $$('.sheet').forEach((x) => x._close()); openHusRep(H.name); }, 120);
    };
  }
  // 📅 الشهر: ميلادي أو هجري (بتقويم البرنامج)، والسابق/التالي
  function monRepHtml() {
    const cal = SUB.cal || 'h', off = SUB.mon || 0, now = new Date();
    let from, to, title;
    if (cal === 'g') { const a = new Date(now.getFullYear(), now.getMonth() + off, 1), b = new Date(a.getFullYear(), a.getMonth() + 1, 0); from = isoOf(a); to = isoOf(b); title = new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(a); }
    else {
      const H = (HIJ && HIJ.days) || {}, t0 = H[isoOf(now)]; if (!t0) return '<div class="card mut">التقويم الهجري غير محفوظ — زامن أولاً.</div>';
      let mo = t0[1] + off, yr = t0[2]; while (mo < 1) { mo += 12; yr--; } while (mo > 12) { mo -= 12; yr++; }
      const ds = Object.keys(H).filter((k) => H[k][1] === mo && H[k][2] === yr).sort(); if (!ds.length) return '<div class="card mut">هذا الشهر خارج التقويم المحفوظ.</div>';
      from = ds[0]; to = ds[ds.length - 1]; title = ((HIJ.months || [])[mo - 1] || mo) + ' ' + yr + 'هـ';
    }
    const L = MAJ.filter((m) => m.iso >= from && m.iso <= to), act = L.filter((m) => m.status !== 'ملغى'), byH = {}, T = {};
    act.forEach((m) => { byH[m.husseiniya] = (byH[m.husseiniya] || 0) + 1; majItems(m).forEach((x) => { const k = nz(x.t); (T[k] = T[k] || { t: x.t, icon: x.icon, n: 0 }).n++; }); });
    const hs = Object.keys(byH).sort((a, b) => byH[b] - byH[a]), ts = Object.values(T).sort((a, b) => b.n - a.n), cnt = (s) => L.filter((m) => m.status === s).length;
    REP_TXT = ['📅 ' + title + ' (' + from.replace(/-/g, '/') + ' – ' + to.replace(/-/g, '/') + ')', 'المجالس: ' + act.length + ' — ✔️ تمّ ' + cnt('تمّ') + ' · ⏳ مجدول ' + cnt('مجدول') + (cnt('ملغى') ? ' · 🚫 ملغى ' + cnt('ملغى') : '') + ' · 🕯️ خاصة ' + act.filter(isPriv).length, '', '🕌 حسب المكان:', ...hs.map((x) => '• ' + x + ': ' + byH[x]), '', '📚 الفقرات:', ...ts.map((x) => '• ' + x.icon + ' ' + x.t + (x.n > 1 ? ' (' + x.n + ')' : ''))].join('\n');
    return '<div class="card"><div class="row"><button class="btn s o" data-rmon="' + (off - 1) + '">→</button><span class="grow b" style="text-align:center">' + esc(title) + '<div class="mut xs">' + esc('من ' + from.replace(/-/g, '/') + ' إلى ' + to.replace(/-/g, '/')) + '</div></span><button class="btn s o" data-rmon="' + (off + 1) + '">←</button></div>' +
      '<div class="seg" style="margin:8px 0 0"><button data-rcal="h" class="' + (cal === 'h' ? 'on' : '') + '">هجري</button><button data-rcal="g" class="' + (cal === 'g' ? 'on' : '') + '">ميلادي</button><button data-rcopy="1">📋 انسخ</button></div></div>' +
      '<div class="card"><div class="kv"><span class="k">المجالس</span><span><b>' + act.length + '</b></span><span class="k">✔️ تمّ</span><span>' + cnt('تمّ') + '</span><span class="k">⏳ مجدول</span><span>' + cnt('مجدول') + '</span><span class="k">🚫 ملغى</span><span>' + cnt('ملغى') + '</span><span class="k">🕯️ خاصة</span><span>' + act.filter(isPriv).length + '</span><span class="k">أماكن</span><span>' + hs.length + '</span></div></div>' +
      '<div class="card"><div class="b">🕌 حسب المكان</div>' + (hs.map((x) => '<div class="item row" data-husr="' + esc(x) + '"><span class="grow">' + esc(x) + '</span><span class="tag">' + byH[x] + '</span></div>').join('') || '<div class="mut sm">لا مجالس.</div>') + '</div>' +
      '<div class="card"><div class="b">📚 الفقرات (' + ts.length + ')</div>' + ts.map((x) => '<div class="sm">' + esc(x.icon + ' ' + x.t) + (x.n > 1 ? ' <span class="tag">' + x.n + '×</span>' : '') + '</div>').join('') + '</div>' +
      '<div class="card"><div class="b">🗂️ المجالس</div>' + L.map(majRow).join('') + '</div>';
  }
  // 📚 الأكثر قراءة، وما لم يُقرأ (حسب المجلد)
  function lecRepHtml() {
    const C = {}; MAJ.forEach((m) => { if (m.status === 'ملغى') return; majItems(m).forEach((x) => { const k = nz(x.t); C[k] = C[k] || { n: 0, last: '' }; C[k].n++; if (m.iso > C[k].last && m.iso <= isoOf(new Date())) C[k].last = m.iso; }); });
    const ws = words(SUB.q || ''), F = Array.from(new Set(LEC.map((l) => l.folder).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
    const L = LEC.filter((l) => (!SUB.f || l.folder === SUB.f) && (!ws.length || hasAll(nz([l.title, l.tags.join(' '), l.folder].join(' ')), ws))).map((l) => Object.assign({ c: C[nz(l.title)] || { n: 0, last: '' } }, { l }));
    const top = L.filter((x) => x.c.n).sort((a, b) => b.c.n - a.c.n).slice(0, 40), never = L.filter((x) => !x.c.n);
    REP_TXT = ['📚 الأكثر قراءة' + (SUB.f ? ' — ' + SUB.f : ''), ...top.map((x) => '• ' + x.l.title + ' — ' + x.c.n + ' مرة' + (x.c.last ? ' (آخرها ' + x.c.last.replace(/-/g, '/') + ')' : '')), '', '🆕 لم تُقرأ بعد: ' + never.length].join('\n');
    return '<div class="card"><input class="in" id="rq" type="search" placeholder="🔎 العنوان، الوسم، المجلد…" value="' + esc(SUB.q || '') + '"><div class="row" style="margin-top:6px"><select class="in" id="rf" style="flex:1" onchange="__offApp.go(\'rep\', { mode: \'lec\', f: this.value, q: document.getElementById(\'rq\').value })"><option value="">📁 كل المجلدات</option>' + F.map((f) => '<option' + (SUB.f === f ? ' selected' : '') + '>' + esc(f) + '</option>').join('') + '</select><button class="btn s" data-rcopy="1">📋 انسخ</button></div></div>' +
      '<div class="card"><div class="b">🔝 الأكثر قراءة</div>' + (top.map((x) => '<div class="item row" data-lec="' + x.l.row + '"><span class="grow">' + esc(x.l.title) + '<div class="mut xs">📁 ' + esc(x.l.folder) + (x.c.last ? ' · آخرها ' + esc(x.c.last.replace(/-/g, '/')) : '') + '</div></span><span class="tag">' + x.c.n + '×</span></div>').join('') || '<div class="mut sm">لا شيء.</div>') + '</div>' +
      '<div class="card"><details><summary class="b">🆕 لم تُقرأ بعد (' + never.length + ')</summary>' + never.slice(0, 300).map((x) => '<div class="item" data-lec="' + x.l.row + '">' + esc(x.l.title) + '<div class="mut xs">📁 ' + esc(x.l.folder) + '</div></div>').join('') + '</details></div>';
  }
  // 📨 رسالة الاتفاق: حيّة من البرنامج إن وُجد إنترنت، وإلا من آخر مزامنة
  function openInv(hus) {
    const S = ((SNAP && SNAP.parts && SNAP.parts.inv) || {})[hus] || null, B = (SNAP && SNAP.parts && SNAP.parts.boot) || {}, rc = (S && S.recipient) || ((B.hints || {})[hus] || {}).owner || '';
    const pend = OPS.some((o) => o.st !== 'done' && ((o.args && o.args[0] && o.args[0].husseiniya === hus) || (o.fn === 'Maj_setStatus' && MAJ.some((m) => m.id === String(o.args[0]) && m.husseiniya === hus))));
    const el = sheet('📨 ' + esc(hus), '<div class="card"><label class="lbl">إلى (المسؤول)</label><div class="row" style="flex-wrap:nowrap"><input class="in" id="ivR" style="flex:1" value="' + esc(rc) + '"><button class="btn s o" id="ivGo" style="flex:none">🔄 أنشئها</button></div><div id="ivInfo" class="mut xs" style="margin-top:4px"></div>' + (pend ? '<div class="alert w">⏳ عندك تعديلات لهذا المكان لم تُرفع — الرسالة لا تشملها حتى تُرفع.</div>' : '') +
      '<textarea class="in" id="ivT" style="min-height:280px;margin-top:6px"></textarea><div class="row" style="margin-top:6px"><button class="btn" id="ivCp">📋 انسخ</button><select class="in hidden" id="ivWho" style="width:auto"></select><button class="btn o" id="ivWa">💬 واتساب</button>' + (navigator.share ? '<button class="btn o" id="ivSh">↗ مشاركة</button>' : '') + '</div></div>');
    let contacts = (S && S.contacts) || [];
    const fill = (text, cs, info) => { $('#ivT', el).value = text || ''; contacts = cs || []; const w = $('#ivWho', el); w.innerHTML = contacts.map((c) => '<option value="' + esc(c.wa) + '">' + esc(c.name || c.phone) + '</option>').join(''); w.classList.toggle('hidden', contacts.length < 2); $('#ivInfo', el).textContent = info || ''; };
    const live = async () => {
      if (!online()) { fill(S ? S.text : '', S ? S.contacts : [], S ? '📴 من آخر مزامنة (' + fmtAt(CFG.lastSync) + ')' : '📴 لا رسالة محفوظة لهذا المكان (لا مواعيد قادمة وقت المزامنة).'); return; }
      $('#ivInfo', el).textContent = '⏳ يُنشئها البرنامج…';
      try { const r = await api({ api: 'inv', p: { husseiniya: hus, recipient: $('#ivR', el).value.trim(), fromIso: isoOf(new Date()), model: '1' } }, 60000);
        if (!r.ok) { fill(S ? S.text : '', S ? S.contacts : [], '⚠️ ' + (r.error || 'تعذّر')); return; }
        fill(r.text, (r.contacts || []).filter((c) => c.wa), '✅ من البرنامج الآن · ' + (r.count || 0) + ' موعد');
      } catch (e) { fill(S ? S.text : '', S ? S.contacts : [], '⚠️ تعذّر الاتصال — من آخر مزامنة'); }
    };
    live();
    $('#ivGo', el).onclick = live;
    $('#ivCp', el).onclick = () => copyText($('#ivT', el).value);
    $('#ivWa', el).onclick = () => { const to = contacts.length > 1 ? $('#ivWho', el).value : (contacts[0] || {}).wa || ''; window.open('https://wa.me/' + String(to).replace(/\D/g, '') + '?text=' + encodeURIComponent($('#ivT', el).value), '_blank'); };
    const sh = $('#ivSh', el); if (sh) sh.onclick = () => navigator.share({ text: $('#ivT', el).value }).catch(() => {});
  }
  // 📤 نص للنسخ والإرسال (رسالة الأعمال)
  function openText(title, text, note) {
    const el = sheet(esc(title), '<div class="card">' + (note ? '<div class="mut xs">' + esc(note) + '</div>' : '') + '<textarea class="in" id="txT" style="min-height:340px;margin-top:6px">' + esc(text || '') + '</textarea><div class="row" style="margin-top:6px"><button class="btn" id="txCp">📋 انسخ</button><button class="btn o" id="txWa">💬 واتساب</button>' + (navigator.share ? '<button class="btn o" id="txSh">↗ مشاركة</button>' : '') + '</div></div>');
    if (!text) $('#txT', el).value = 'لا رسالة محفوظة — زامن وأنت على الإنترنت.';
    $('#txCp', el).onclick = () => copyText($('#txT', el).value);
    $('#txWa', el).onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent($('#txT', el).value), '_blank');
    const sh = $('#txSh', el); if (sh) sh.onclick = () => navigator.share({ text: $('#txT', el).value }).catch(() => {});
  }
  // ✔️ عمل بمفتاحه في يوم/ليلة (من اللقطة)
  function dayActs(iso, check) {
    for (const d of ((SNAP && SNAP.parts && SNAP.parts.daily) || [])) for (const D of [d, d.night ? Object.assign({ iso: d.night.iso }, d.night) : null]) { if (!D || D.iso !== iso) continue; for (const g of D.groups || []) for (const x of g.items || []) if (x.check === check) return x; }
    return null;
  }

  // ---------------- 🛡️ نسخة من بيانات الجهاز (تصدير/استيراد) ----------------
  async function devExport() {
    const box = $('#bkRes'); if (box) box.textContent = '⏳ تجهيز…';
    const txt = []; await txtEach((r) => { txt.push([r.id, r.part, r.text, r.mod, r.src]); });
    const data = { app: 'majalis-offline', v: 1, at: Date.now(), cfg: { exec: CFG.exec, devName: CFG.devName, user: CFG.user, lastSync: CFG.lastSync, rem: CFG.rem }, snap: SNAP, ops: OPS, txt };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), name = 'نسخة-المحاضرات-والمجالس-' + isoOf(new Date()) + '.json';
    let shared = false;
    try { const f = new File([blob], name, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [f] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: name }); shared = true; } } catch (e) {}
    if (!shared) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
    if (box) box.textContent = '✅ ' + name + ' (' + (blob.size / 1048576).toFixed(1) + ' MB) — احفظه خارج الجوال أيضاً.';
  }
  function devImportPick() {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
    i.onchange = async () => { const f = i.files && i.files[0]; if (!f) return; try { await devImport(JSON.parse(await f.text())); } catch (e) { alert('ملف غير صالح: ' + (e.message || e)); } };
    i.click();
  }
  async function devImport(d) {
    if (!d || d.app !== 'majalis-offline' || !d.snap) throw new Error('ليس نسخة من هذا التطبيق');
    if (!confirm('استيراد نسخة ' + fmtAt(d.at) + ' (' + ((d.snap.parts && d.snap.parts.maj) || []).length + ' مجلس، ' + (d.txt || []).length + ' جزء نص)؟\nتحلّ محل بيانات هذا الجهاز' + (OPS.length ? '، وما في الطابور هنا يُدمج معها.' : '.'))) return;
    await kvSet('snap', d.snap);
    await tx('txt', 'readwrite', (st) => st.clear()); for (let k = 0; k < (d.txt || []).length; k += 500) await txtPutMany(d.txt.slice(k, k + 500));
    for (const o of d.ops || []) await opPut(o);
    CFG.exec = CFG.exec || d.cfg.exec; CFG.devName = CFG.devName || d.cfg.devName; CFG.user = CFG.user || d.cfg.user; CFG.rem = CFG.rem || d.cfg.rem; CFG.lastSync = d.cfg.lastSync || d.at; CFG.txtFull = false; CFG.dev = CFG.dev || uid();
    if (CFG.tok == null) CFG.tok = '';   // يعمل للعرض بلا دخول؛ والمزامنة تطلب الدخول حين يتوفر الإنترنت
    await kvSet('cfg', CFG); OPS = await opsAll();
    if (!CFG.pin) pinScreen('set', () => boot(false)); else boot(false);
  }

  // ---------------- 🔔 التذكير بالمجالس ----------------
  // الخطة تُحفظ في الجهاز (remind)، والتطبيق المفتوح يفحصها كل 30 ثانية، وعامل الخدمة يفحصها عند «المزامنة الدورية» (أندرويد بعد التثبيت)
  const remindNote = () => !('Notification' in window) ? '⚠️ هذا المتصفح لا يدعم الإشعارات.' : Notification.permission === 'denied' ? '⚠️ الإشعارات ممنوعة لهذا التطبيق من إعدادات المتصفح/الجوال — اسمح بها ثم فعّل التذكير.' :
    'يعمل والتطبيق مفتوح أو في الخلفية. وعلى الأندرويد بعد تثبيته يفحص أيضاً وهو مغلق كل فترة (يحددها الجوال) — فقد يتأخر قليلاً.';
  async function remindPlan() {
    if (!DB) return;
    const R0 = CFG.rem || {}, min = R0.min || 60, list = [];
    const now = Date.now();
    if (R0.on) MAJ.forEach((m) => {
      if (m.status === 'ملغى' || !m.time) return; const d = parseIso(m.iso), t = /^(\d{1,2}):(\d{2})/.exec(m.time); if (!d || !t) return;
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +t[1], +t[2]).getTime(); if (at < now - 3600000 || at > now + 3 * 864e5) return;
      list.push({ id: m.id + '@' + m.iso + m.time + '@' + min, when: at - min * 60000, at, title: (isPriv(m) ? '🕯️ ' : '🕌 ') + m.husseiniya + ' — ' + m.time, body: [isPriv(m) ? privTitle(m) : '', majItems(m).map((x) => x.icon + ' ' + x.t).join(' · '), m.owner ? '👤 ' + m.owner : ''].filter(Boolean).join('\n') || 'مجلس بعد ' + (min < 60 ? min + ' دقيقة' : (min / 60) + ' ساعة') });
    });
    // 🌙 ملخص الغد: مرة كل مساء بمجالس الغد، وتنبيه على ما ليس فيه فقرة
    if (R0.eve) for (let k = 0; k < 2; k++) {
      const d0 = new Date(), day = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k), tmr = isoOf(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)), [eh, em] = R0.eve.split(':').map(Number);
      const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em).getTime(), L = MAJ.filter((m) => m.iso === tmr && m.status !== 'ملغى').sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      if (!L.length || when < now - 4 * 3600000) continue;
      const empty = L.filter((m) => !majItems(m).length).length;
      list.push({ id: 'eve@' + tmr + '@' + R0.eve + '@' + L.length, when, at: when + 3 * 3600000, title: '🌙 غداً ' + dayCell(tmr).split(' ')[0] + ': ' + (L.length === 1 ? 'مجلس واحد' : L.length === 2 ? 'مجلسان' : L.length + ' مجالس') + (empty ? ' — ⚠️ ' + empty + ' بلا فقرة' : ''),
        body: L.map((m) => (m.time || '—') + ' ' + m.husseiniya + ' — ' + (majItems(m).map((x) => x.t).join('، ') || '⚠️ بلا فقرة')).join('\n') });
    }
    try { await kvSet('remind', { on: !!(R0.on || R0.eve), list }); } catch (e) {}
  }
  async function remindTick() {
    if (!DB || !(CFG.rem && (CFG.rem.on || CFG.rem.eve)) || !('Notification' in window) || Notification.permission !== 'granted') return;
    const P = await kvGet('remind') || { list: [] }, seen = await kvGet('notified') || {}, now = Date.now();
    for (const x of P.list || []) { if (seen[x.id] || now < x.when || now > x.at + 1800000) continue; seen[x.id] = now; await notify(x.title, x.body, x.id); }
    Object.keys(seen).forEach((k) => { if (now - seen[k] > 7 * 864e5) delete seen[k]; }); await kvSet('notified', seen);
  }
  async function notify(title, body, tag) {
    try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) return reg.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar' }); } catch (e) {}
    try { new Notification(title, { body, tag, icon: 'icon-192.png', dir: 'rtl' }); } catch (e) {}
  }
  async function remindSet(on) {
    if (on && 'Notification' in window && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { toast('⚠️ لم تُسمح الإشعارات'); on = false; } }
    CFG.rem = Object.assign({ min: 60 }, CFG.rem, { on: !!on, min: +(($('#remMin') || {}).value || (CFG.rem && CFG.rem.min) || 60) }); await kvSet('cfg', CFG); await remindPlan();
    if (on) { try { const reg = await navigator.serviceWorker.ready; if (reg.periodicSync) await reg.periodicSync.register('remind', { minInterval: 15 * 60000 }); } catch (e) {} toast('🔔 التذكير مفعّل'); } else toast('🔕 التذكير متوقف');
    render();
  }
  async function remindTest() {
    if ('Notification' in window && Notification.permission !== 'granted') await Notification.requestPermission();
    if (!('Notification' in window) || Notification.permission !== 'granted') return toast('⚠️ الإشعارات غير مسموحة');
    const up = MAJ.find((m) => m.iso >= isoOf(new Date()) && m.status !== 'ملغى');
    notify('🔔 تجربة التذكير', up ? 'أقرب مجلس: ' + up.husseiniya + ' — ' + dayCell(up.iso) + ' ' + (up.time || '') : 'لا مجالس قادمة', 'test');
  }
  setInterval(() => { if (UNLOCKED) remindTick().catch(() => {}); }, 30000);

  // ---------------- 📄 صفحات التفاصيل (فوق الواجهة) ----------------
  function sheet(title, inner, onBack) {
    const el = document.createElement('div'); el.className = 'sheet';
    el.innerHTML = '<div class="top"><button class="chip" data-close="1">→ رجوع</button><h1>' + title + '</h1></div><div class="wrap">' + inner + '</div>';
    document.body.appendChild(el); history.pushState({ sheet: 1 }, '');
    el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) history.back(); });
    el._close = () => { el.remove(); if (onBack) onBack(); };
    return el;
  }
  window.addEventListener('popstate', () => { const s = $$('.sheet').pop(); if (s) s._close(); });
  async function openLec(row) {
    const l = LEC.find((x) => x.row === +row); if (!l) return;
    const R = readsOf(l.title);
    const el = sheet('📚 ' + esc(l.title),
      '<div class="card"><div class="t" style="font-size:17px">' + esc(l.title) + '</div>' + (l.orig && l.orig !== l.title ? '<div class="mut sm">الأصلي: ' + esc(l.orig) + '</div>' : '') +
      '<div class="kv" style="margin-top:6px"><span class="k">المجلد</span><span>' + esc(l.folder) + '</span>' + (l.lecturer ? '<span class="k">المصدر</span><span>' + esc(l.lecturer) + '</span>' : '') + (l.poet ? '<span class="k">الشاعر</span><span>' + esc(l.poet) + '</span>' : '') + (l.tags.length ? '<span class="k">الوسوم</span><span>' + l.tags.map((t) => '<span class="tag">' + esc(t) + '</span>').join('') + '</span>' : '') + '</div>' +
      '<div class="row" style="margin-top:8px"><span class="sm mut">⭐ التقييم:</span>' + ['مميز', 'وسط', 'عادي'].map((r) => '<button class="btn s ' + (l.rate === r ? '' : 'o') + '" data-rate="' + r + '">' + r + '</button>').join('') + '</div>' +
      (l.file ? '<div style="margin-top:6px"><a href="' + esc(l.file) + '" target="_blank" class="sm">📄 افتح الملف في Drive (يحتاج إنترنت)</a></div>' : '') + '</div>' +
      '<div class="card"><div class="row"><span class="grow b">📝 الملاحظات</span><button class="btn s o" id="noteEd">✏️ عدّل</button></div><div id="noteBox" class="sm" style="white-space:pre-line">' + (esc(l.notes) || '<span class="mut">لا ملاحظات.</span>') + '</div></div>' +
      '<div class="card"><div class="b">📖 قُرئت ' + R.length + ' مرة</div>' + (R.length ? R.slice().reverse().map((m) => '<div class="sm">• ' + esc(dayCell(m.iso)) + ' — ' + esc(m.husseiniya) + (isPriv(m) ? ' <span class="ptag">🕯️ ' + esc(privTitle(m)) + '</span>' : '') + '</div>').join('') : '') + (l.dates ? '<details class="sm" style="margin-top:4px"><summary class="mut">سجل القراءات في الكشف</summary><div style="white-space:pre-line">' + esc(l.dates) + '</div></details>' : '') + '</div>' +
      '<div class="card"><div class="b">📄 النص</div><div id="txtBox" class="mut sm">⏳ …</div></div>');
    el.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-rate]');
      if (r) { await queue({ lec: { row: l.row, title: l.title, rating: r.getAttribute('data-rate') }, label: '⭐ تقييم «' + l.title + '»: ' + r.getAttribute('data-rate') }); $$('[data-rate]', el).forEach((b) => b.classList.toggle('o', b !== r)); return; }
      if (e.target.id === 'noteEd') { const box = $('#noteBox', el); box.innerHTML = '<textarea class="in" id="noteIn">' + esc(l.notes) + '</textarea><button class="btn s" id="noteSave" style="margin-top:6px">💾 احفظ</button>'; return; }
      if (e.target.id === 'noteSave') { const v = $('#noteIn', el).value; await queue({ lec: { row: l.row, title: l.title, notes: v }, label: '📝 ملاحظات «' + l.title + '»' }); $('#noteBox', el).textContent = v; }
    });
    const tb = $('#txtBox', el);
    if (!l.fileId) { tb.textContent = 'لا ملف مرتبط بهذه الفقرة.'; return; }
    const parts = (await txtOf(l.fileId)).sort((a, b) => String(a.part).localeCompare(String(b.part), 'en', { numeric: true }));
    if (!parts.length) { tb.innerHTML = 'النص غير محفوظ على الجهاز بعد (يُنزَّل مع المزامنة إن كان مفهرساً في البرنامج).'; return; }
    tb.className = 'txt'; tb.innerHTML = parts.map((p) => esc(p.text)).join('\n');
    const hint = document.createElement('div'); hint.className = 'mut xs'; hint.textContent = 'النص من «فهرس المتن» (بلا تشكيل). للنسخة الأصلية افتح الملف.'; tb.parentNode.insertBefore(hint, tb);
  }
  function openMaj(id) {
    const m = MAJ.find((x) => x.id === String(id)); if (!m) return;
    const its = majItems(m);
    const el = sheet((isPriv(m) ? '🕯️ ' : '🕌 ') + esc(m.husseiniya),
      '<div class="card">' + (isPriv(m) ? '<div class="ptag" style="margin-bottom:6px">🕯️ ' + esc(privTitle(m)) + '</div>' : '') + '<div class="t">' + esc(m.husseiniya) + '</div><div class="mut sm">' + esc(dayCell(m.iso) + ' · ' + hijriOf(m.iso) + ' · ' + (m.time || '')) + '</div>' +
      '<div class="kv" style="margin-top:6px">' + (m.owner ? '<span class="k">المسؤول</span><span>' + esc(m.owner) + '</span>' : '') + (m.ophone ? '<span class="k">هاتفه</span><span><a href="tel:' + esc(m.ophone) + '" dir="ltr">' + esc(m.ophone) + '</a></span>' : '') + '<span class="k">الحالة</span><span>' + esc(m.status) + '</span>' + (m.notes ? '<span class="k">ملاحظات</span><span>' + esc(m.notes) + '</span>' : '') + '</div>' +
      (m._pend ? '<div class="alert i">⏳ فيه تعديل بانتظار الرفع</div>' : '') + '</div>' +
      '<div class="card"><div class="b">الفقرات</div>' + (its.length ? its.map((x) => { const l = LEC.find((y) => nz(y.title) === nz(x.t)); return '<div class="item"' + (l ? ' data-lec="' + l.row + '"' : '') + '>' + esc(x.icon + ' ' + x.label + ': ') + '<b>' + esc(x.t) + '</b></div>'; }).join('') + Object.keys(m.pnotes || {}).filter((k) => m.pnotes[k]).map((k) => '<div class="sm mut">📝 ' + esc((k === 'lecture' ? 'المحاضرة' : ((EXTRAS.find((e) => e.key === k) || {}).label || k)) + ': ' + m.pnotes[k]) + '</div>').join('') : '<div class="mut sm">لا فقرات بعد.</div>') + '</div>' +
      '<div class="row"><button class="btn" data-medit="' + esc(m.id) + '">✏️ عدّل</button><button class="btn o" data-minv="1">📨 رسالة الاتفاق</button><button class="btn o" data-mhus="1">📊 تقرير المكان</button>' + (m.status !== 'تمّ' ? '<button class="btn o" data-mst="تمّ">✔️ تمّ</button>' : '') + (m.status !== 'ملغى' ? '<button class="btn o" data-mst="ملغى">🚫 ألغِ</button>' : '<button class="btn o" data-mst="مجدول">↩️ أعده مجدولاً</button>') + '</div>');
    el.addEventListener('click', async (e) => {
      const s = e.target.closest('[data-mst]'); if (s) {
        if (String(m.id).startsWith('tmp-')) { toast('انتظر رفع المجلس الجديد أولاً، ثم غيّر حالته.'); return; }
        const st = s.getAttribute('data-mst'), why = st === 'ملغى' ? (prompt('سبب الإلغاء (اختياري):') || '') : '';
        await queue({ fn: 'Maj_setStatus', args: [m.id, st, why], guard: { maj: m.id, h: majHash(m) }, label: (st === 'تمّ' ? '✔️ تمّ: ' : st === 'ملغى' ? '🚫 إلغاء: ' : '↩️ ') + m.husseiniya + ' ' + m.iso });
        history.back(); return;
      }
      const ed = e.target.closest('[data-medit]'); if (ed) { history.back(); setTimeout(() => majForm(m), 50); }
      const lc = e.target.closest('[data-lec]'); if (lc) openLec(lc.getAttribute('data-lec'));
      if (e.target.closest('[data-minv]')) openInv(m.husseiniya);
      if (e.target.closest('[data-mhus]')) openHusRep(m.husseiniya);
    });
  }
  function openFam(name) {
    const f = famData().find((x) => x.name === name); if (!f) return;
    const T = {}; f.list.filter((m) => m.status !== 'ملغى').forEach((m) => majItems(m).forEach((x) => { const k = nz(x.t); (T[k] = T[k] || { t: x.t, icon: x.icon, w: [] }).w.push(m); }));
    const titles = Object.values(T).sort((a, b) => b.w.length - a.w.length);
    const text = () => ['👪 عائلة ' + f.name + (f.note ? ' (' + f.note + ')' : '') + (f.deceased.length ? ' — عن روح ' + f.deceased.join('، ') : ''), '', '📚 الفقرات التي قرأتها لهم:', ...titles.map((t) => '• ' + t.icon + ' ' + t.t + ' — ' + t.w.map((m) => m.iso.replace(/-/g, '/') + ' (' + m.husseiniya + ')').join('، ')), '', '🕯️ مجالسهم:', ...f.list.slice().reverse().map((m) => '• ' + m.iso.replace(/-/g, '/') + ' ' + (m.time || '') + ' — ' + (m.mtype || '') + (m.night ? ' (' + m.night + ')' : '') + (m.deceased ? ' عن روح ' + m.deceased : '') + ' — ' + m.husseiniya + (m.status === 'ملغى' ? ' (ملغى)' : ''))].join('\n');
    const el = sheet('👪 ' + esc(f.name),
      '<div class="card"><div class="t">' + esc(f.name) + (f.note ? ' <span class="mut">(' + esc(f.note) + ')</span>' : '') + '</div><div class="mut sm">' + esc([f.deceased.length ? 'عن روح ' + f.deceased.join('، ') : '', f.owner ? '👤 ' + f.owner : '', f.ophone].filter(Boolean).join(' · ')) + '</div><div class="row" style="margin-top:6px"><button class="btn s" data-famnew="1">➕ مجلس لهم</button><button class="btn s o" data-famcp="1">📋 انسخ</button></div></div>' +
      '<div class="card"><div class="b">📚 الفقرات التي قرأتها لهم (' + titles.length + ')</div>' + titles.map((t) => '<div class="item">' + esc(t.icon + ' ' + t.t) + '<div class="mut xs">' + t.w.map((m) => esc(m.iso.replace(/-/g, '/') + ' · ' + m.husseiniya)).join(' | ') + '</div></div>').join('') + '</div>' +
      '<div class="card"><div class="b">🕯️ مجالسهم (' + f.list.length + ')</div>' + f.list.slice().reverse().map(majRow).join('') + '</div>');
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-famcp]')) { const t = text(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('📋 نُسخ'), () => prompt('انسخ:', t)); }
      if (e.target.closest('[data-famnew]')) { history.back(); setTimeout(() => majForm(null, { priv: true, family: f.name, owner: f.owner, ophone: f.ophone, famnote: f.note }), 50); }
      const mj = e.target.closest('[data-maj]'); if (mj) openMaj(mj.getAttribute('data-maj'));
    });
  }

  // ---------------- ✍️ نموذج المجلس (جديد/تعديل) — يُحفظ في الطابور ----------------
  function majForm(m, pre) {
    pre = pre || {}; const edit = !!m, priv = edit ? isPriv(m) : !!pre.priv, B = (SNAP && SNAP.parts && SNAP.parts.boot) || {};
    const v = (k) => esc(edit ? (m[k] || '') : (pre[k] || ''));
    const dl = (id, arr) => '<datalist id="' + id + '">' + (arr || []).map((x) => '<option value="' + esc(x) + '"></option>').join('') + '</datalist>';
    // قائمة كل خانة من فقرات نوعها فقط (كما في البرنامج)، وإلا كل الفقرات
    const LS = (SNAP && SNAP.parts && SNAP.parts.lists) || {}, lecTitles = LS.lectures || LEC.map((l) => l.title), exOf = (k) => { const x = (LS.extras || []).find((y) => y.key === k); return x ? x.lectures : LEC.map((l) => l.title); };
    // ⏰ الوقت بنظام 24 ساعة (ساعة + دقيقة)، لا يتبع إعداد الجهاز
    const tv = String(edit ? m.time || '' : '').split(':'), th = tv[0] || '', tmn = tv[1] || '';
    const timeHtml = '<div class="row" style="gap:4px;flex-wrap:nowrap" dir="ltr"><select class="in" id="fTH" style="width:auto"><option value="">--</option>' + Array.from({ length: 24 }, (_, i) => pad(i)).map((h) => '<option' + (h === th ? ' selected' : '') + '>' + h + '</option>').join('') + '</select><b>:</b><select class="in" id="fTM" style="width:auto">' + Array.from(new Set(['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].concat(tmn ? [tmn] : []))).sort().map((x) => '<option' + (x === (tmn || '00') ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></div>';
    const field = (lbl, inner) => '<label class="lbl">' + lbl + '</label>' + inner;
    // ✍️ كل خانة: أكثر من فقرة (سطر لكل فقرة) + 📝 ملاحظة عليها (كما في البرنامج)
    const PN = (edit && m.pnotes) || {};
    const fxRow = (k, list, val) => '<div class="row fxr" style="flex-wrap:nowrap;margin-bottom:4px"><input class="in" style="flex:1" data-fi="' + k + '" list="' + list + '" value="' + esc(val) + '"><button type="button" class="btn s o" data-fxdel="1" title="احذف هذا السطر" style="flex:none">✕</button></div>';
    const itemsField = (k, lbl, list) => { const vals = edit ? String(m[k] || '').split('\n').map((x) => x.trim()).filter(Boolean) : []; if (!vals.length) vals.push('');
      return '<div class="fx" data-fk="' + k + '" data-fl="' + list + '"><label class="lbl">' + lbl + '</label>' + vals.map((v1) => fxRow(k, list, v1)).join('') +
        '<div class="row" style="gap:6px"><button type="button" class="btn s o" data-fxadd="' + k + '">➕ فقرة أخرى</button><button type="button" class="btn s o" data-fxnote="' + k + '">📝 ملاحظة' + (PN[k] ? ' ✓' : '') + '</button></div>' +
        '<input class="in' + (PN[k] ? '' : ' hidden') + '" data-fn="' + k + '" placeholder="📝 مثل: قرأت النصف الأول فقط" value="' + esc(PN[k] || '') + '" style="margin-top:4px"></div>'; };
    const el = sheet(edit ? '✏️ تعديل مجلس' : (priv ? '🕯️ مجلس خاص جديد' : '🕌 مجلس جديد'),
      '<div class="card">' +
      (priv ? field('نوع المجلس', '<input class="in" id="fType" list="dlT" value="' + v('mtype') + '">' + dl('dlT', B.privTypes)) +
        field('العائلة (عائلتان أو أكثر: افصل بالفاصلة «،»)', '<input class="in" id="fFam" list="dlF" value="' + v('family') + '">' + dl('dlF', Object.keys(B.famHints || {}))) +
        field('ملاحظة عن العائلة', '<input class="in" id="fFamNote" value="' + v('famnote') + '">') + field('عن روح', '<input class="in" id="fDec" value="' + v('deceased') + '">') : '') +
      field(priv ? 'المكان (من الدليل أو اكتبه)' : 'الحسينية', '<input class="in" id="fHus" list="dlH" value="' + v('husseiniya') + '">' + dl('dlH', B.husseiniyas)) +
      field(priv ? 'المسؤول من العائلة' : 'صاحب المجلس / المسؤول', '<input class="in" id="fOwner" list="dlO" value="' + v('owner') + '">' + dl('dlO', B.owners)) +
      (priv ? field('هاتفه', '<input class="in" id="fPhone" type="tel" dir="ltr" value="' + v('ophone') + '">') : '') +
      '<div class="row"><div class="grow">' + field('التاريخ', '<input class="in" id="fDate" type="date" value="' + esc(edit ? m.iso : (pre.iso || isoOf(new Date()))) + '"><div class="mut xs" id="fDateH"></div>') + '</div><div class="grow">' + field('الوقت', timeHtml) + '</div>' +
      (priv && !edit ? '<div style="width:90px">' + field('الليالي', '<input class="in" id="fNights" type="number" min="1" max="10" value="1">') + '</div>' : '') + '</div>' +
      field('الحالة', '<select class="in" id="fSt">' + (B.statuses || ['مجدول', 'تمّ', 'ملغى']).map((s) => '<option' + ((edit ? m.status : 'مجدول') === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>') +
      '</div><div class="card"><div class="b">الفقرات' + (priv && !edit ? ' <span class="mut xs">(لليلة الأولى فقط إن كانت عدة ليالٍ)</span>' : '') + '</div>' + dl('dlL', lecTitles) + EXTRAS.map((e) => dl('dlX-' + e.key, exOf(e.key))).join('') +
      itemsField('lecture', '📚 المحاضرة', 'dlL') + EXTRAS.map((e) => itemsField(e.key, esc(e.icon + ' ' + e.label), 'dlX-' + e.key)).join('') +
      '<div id="fWarn"></div>' + field('ملاحظات', '<textarea class="in" id="fNotes">' + v('notes') + '</textarea>') + '</div>' +
      '<button class="btn" id="fSave" style="width:100%">💾 احفظ' + (online() ? '' : ' (يُرفع حين يعود الإنترنت)') + '</button>');
    // ⚠️ هل قرأت هذه الفقرة لهذه العائلة / في هذا المكان؟ (من بيانات الجهاز)
    const warn = () => {
      const fam = priv ? famNames($('#fFam', el).value).map(famNorm) : [], place = nz($('#fHus', el).value);
      const ts = $$('[data-fi]', el).map((i) => i.value.trim()).filter(Boolean);
      $('#fWarn', el).innerHTML = ts.map((t) => {
        const R = readsOf(t).filter((x) => !m || x.id !== m.id), F = fam.length ? R.filter((x) => famNames(x.family).some((n) => fam.includes(famNorm(n)))) : [], P = R.filter((x) => !F.includes(x) && nz(x.husseiniya) === place);
        return (F.length ? '<div class="alert e">🔴 «' + esc(t) + '» قرأتها لهذه العائلة: ' + F.slice(-3).map((x) => esc(x.iso.replace(/-/g, '/') + ' — ' + x.husseiniya + (x.deceased ? ' (عن روح ' + x.deceased + ')' : ''))).join(' | ') + '</div>' : '') +
          (P.length ? '<div class="alert w">🟡 «' + esc(t) + '» قُرئت في هذا المكان: ' + P.slice(-3).map((x) => esc(x.iso.replace(/-/g, '/'))).join(' | ') + '</div>' : '');
      }).join('');
    };
    el.addEventListener('input', (e) => { if (e.target.matches('[data-fi],#fFam,#fHus')) warn(); });
    el.addEventListener('click', (e) => {
      const ad = e.target.closest('[data-fxadd]'); if (ad) { const box = ad.closest('.fx'); const r1 = document.createElement('div'); r1.innerHTML = fxRow(box.getAttribute('data-fk'), box.getAttribute('data-fl'), ''); const nr = r1.firstChild; box.insertBefore(nr, ad.parentNode); nr.querySelector('input').focus(); return; }
      const dx = e.target.closest('[data-fxdel]'); if (dx) { const box = dx.closest('.fx'), rows = $$('.fxr', box); if (rows.length > 1) dx.parentNode.remove(); else rows[0].querySelector('input').value = ''; warn(); return; }
      const nt = e.target.closest('[data-fxnote]'); if (nt) { const i1 = $('[data-fn="' + nt.getAttribute('data-fxnote') + '"]', el); i1.classList.toggle('hidden'); if (!i1.classList.contains('hidden')) i1.focus(); }
    });
    // 🕌 اختيار الحسينية من الدليل يملأ مسؤولها ووقتها (للمجلس العام)
    el.addEventListener('change', (e) => { if (e.target.id !== 'fHus' || priv) return; const H = HUSL.find((x) => x.name === e.target.value.trim()); if (!H) return; const o = $('#fOwner', el); if (H.owner && (!o.value || o.dataset.auto)) { o.value = H.owner; o.dataset.auto = '1'; } const t = /^(\d{1,2}):(\d{2})/.exec(H.time || ''); if (t && !$('#fTH', el).value) { $('#fTH', el).value = pad(+t[1]); const mm = $('#fTM', el); if (![...mm.options].some((op) => op.value === t[2])) mm.add(new Option(t[2])); mm.value = t[2]; } });
    el.addEventListener('input', (e) => { if (e.target.id === 'fOwner') delete e.target.dataset.auto; });
    const dH = () => { const v = $('#fDate', el).value; $('#fDateH', el).textContent = v ? dayCell(v) + ' · ' + hijriOf(v) : ''; }; $('#fDate', el).addEventListener('input', dH); $('#fDate', el).addEventListener('change', dH); dH();
    el.addEventListener('change', (e) => { if (e.target.id === 'fFam' && priv) { const h = (B.famHints || {})[famNames(e.target.value)[0]]; if (h) { if (!$('#fOwner', el).value && h.owner) $('#fOwner', el).value = h.owner; if (!$('#fPhone', el).value && h.ophone) $('#fPhone', el).value = h.ophone; if (!$('#fFamNote', el).value && h.famnote) $('#fFamNote', el).value = h.famnote; if (!$('#fHus', el).value && h.place) $('#fHus', el).value = h.place; } } });
    warn();
    $('#fSave', el).onclick = async () => {
      const g = (id) => { const x = $(id, el); return x ? x.value.trim() : ''; };
      const rec = { husseiniya: g('#fHus'), owner: g('#fOwner'), status: g('#fSt'), notes: g('#fNotes'), pnotes: {} };
      ['lecture'].concat(EXTRAS.map((e) => e.key)).forEach((k) => {
        rec[k] = $$('[data-fi="' + k + '"]', el).map((i) => i.value.trim()).filter(Boolean).filter((v1, j, a) => a.indexOf(v1) === j).join('\n');
        const n1 = ($('[data-fn="' + k + '"]', el) || {}).value; if (n1 && n1.trim() && rec[k]) rec.pnotes[k] = n1.trim();
      });
      if (priv) { Object.assign(rec, { mtype: g('#fType'), family: famNames(g('#fFam')).join('، '), famnote: g('#fFamNote'), deceased: g('#fDec'), ophone: g('#fPhone') }); if (!rec.family) return toast('🕯️ اكتب اسم العائلة'); if (!rec.mtype) return toast('🕯️ اختر نوع المجلس'); }
      if (!rec.husseiniya) return toast('اكتب المكان');
      const iso = g('#fDate'), time = g('#fTH') ? g('#fTH') + ':' + g('#fTM') : '';
      if (!iso) return toast('اختر التاريخ');
      const opts = { conflicts: 'ask' };
      if (edit) {
        if (String(m.id).startsWith('tmp-')) return toast('انتظر رفع هذا المجلس أولاً، ثم عدّله.');
        Object.assign(rec, { id: m.id, iso, time });
        await queue({ fn: 'Maj_saveMajlis', args: [rec, { keepTime: !time }], guard: { maj: m.id, h: majHash(m) }, label: '✏️ تعديل مجلس: ' + rec.husseiniya + ' ' + iso, desc: majItems(rec).map((x) => x.icon + ' ' + x.t).join(' · ') });
      } else {
        const n = priv ? Math.max(1, Math.min(10, +g('#fNights') || 1)) : 1, d0 = parseIso(iso), items = [];
        for (let k = 0; k < n; k++) items.push({ iso: isoOf(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k)), time, night: n > 1 ? 'الليلة ' + (k + 1) + ' من ' + n : '', blank: k > 0 });
        await queue({ fn: 'Maj_saveBatch', args: [rec, items, opts], label: (priv ? '🕯️ ' : '🕌 ') + 'مجلس جديد: ' + rec.husseiniya + ' ' + iso + (n > 1 ? ' (' + n + ' ليالٍ)' : ''), desc: (priv ? privTitle(rec) + ' · ' : '') + majItems(rec).map((x) => x.icon + ' ' + x.t).join(' · ') });
      }
      history.back();
    };
  }
  // يضع العملية في الطابور، ويطبّقها على البيانات المحلية، ويرفعها فوراً إن وُجد إنترنت
  async function queue(o) {
    o.id = o.id || uid(); o.at = Date.now(); o.st = 'pending';
    await opPut(o); OPS = await opsAll(); buildData(); render();
    if (!o.quiet) toast(online() ? '⏳ يُرفع الآن…' : '💾 حُفظ على الجهاز — يُرفع حين يعود الإنترنت');
    if (online()) { try { SYNC.busy = true; syncUi(); await pushOps(); } catch (e) { SYNC.err = '⚠️ ' + (e.message || e); } SYNC.busy = false; buildData(); render(); syncUi(); const bad = OPS.find((x) => x.id === o.id && x.st !== 'pending'); if (bad) toast('⚠️ يحتاج قرارك — افتح «بانتظار الرفع»'); else if (!OPS.find((x) => x.id === o.id) && !o.quiet) toast('✅ رُفع للبرنامج'); }
  }

  // ---------------- 🖱️ النقرات ----------------
  document.addEventListener('click', async (e) => {
    if (!UNLOCKED) return;
    const t = e.target;
    const tab = t.closest('[data-tab]'); if (tab) { go(tab.getAttribute('data-tab')); return; }
    const g = t.closest('[data-go]'); if (g) { e.preventDefault(); go(g.getAttribute('data-go')); return; }
    if (t.closest('#syncChip')) { sync(); return; }
    const sy = t.closest('[data-sync]'); if (sy) { if (sy.getAttribute('data-sync') === 'full') { CFG.txtFull = false; } sync(); return; }
    if (t.closest('.sheet')) return;   // داخل صفحة تفاصيل: تُعالج هناك
    const mm = t.closest('[data-mmode]'); if (mm) { go('maj', { mode: mm.getAttribute('data-mmode') }); return; }
    const cal = t.closest('[data-cal]'); if (cal) { go('maj', { mode: 'cal', ym: cal.getAttribute('data-cal') }); return; }
    const cd = t.closest('[data-cday]'); if (cd) { SUB.day = cd.getAttribute('data-cday'); SUB.keepY = true; render(); return; }
    const nw = t.closest('[data-new]'); if (nw) { majForm(null, { priv: nw.getAttribute('data-new') === 'priv', iso: nw.getAttribute('data-iso') || '' }); return; }
    const mj = t.closest('[data-maj]'); if (mj) { openMaj(mj.getAttribute('data-maj')); return; }
    const lc = t.closest('[data-lec]'); if (lc) { openLec(lc.getAttribute('data-lec')); return; }
    const fm = t.closest('[data-fam]'); if (fm) { openFam(fm.getAttribute('data-fam')); return; }
    const ht = t.closest('[data-htype]'); if (ht) { SUB.t = ht.getAttribute('data-htype'); render(); return; }
    const dd = t.closest('[data-dday]'); if (dd) { SUB.i = +dd.getAttribute('data-dday'); render(); return; }
    const oc = t.closest('[data-occ]'); if (oc && !oc.disabled) { SUB.i = +oc.getAttribute('data-occ'); render(); return; }
    const dp = t.closest('[data-dper]'); if (dp) { SUB.n = dp.getAttribute('data-dper') === 'n'; SUB.keepY = true; render(); return; }
    const dm = t.closest('[data-dmsg]'); if (dm) { const [i1, per] = dm.getAttribute('data-dmsg').split('|'), d1 = ((SNAP && SNAP.parts && SNAP.parts.daily) || [])[+i1]; if (d1) openText(per === 'n' ? '🌙 رسالة ' + (d1.night && d1.night.title || 'الليلة') : '📤 رسالة أعمال ' + d1.weekday + ' ' + d1.hijri, per === 'n' ? d1.msgN : d1.msg, 'نص الرسالة من آخر مزامنة (' + fmtAt(CFG.lastSync) + ').'); return; }
    const ad = t.closest('[data-adone]'); if (ad) { const [iso, ...ck] = ad.getAttribute('data-adone').split('|'), check = ck.join('|'), d1 = dayActs(iso, check); const on = !(d1 && isDone(iso, d1));
      const old = OPS.find((o) => o.fn === 'Daily_done' && o.args[0] === iso && o.args[1] === check && o.st === 'pending'); if (old) await opDel(old.id);
      await queue({ fn: 'Daily_done', args: [iso, check, on], label: (on ? '✔️ تمّ: ' : '↩️ لم يتمّ: ') + ((d1 && (d1.title || d1.category)) || 'عمل') + ' — ' + iso, quiet: true }); return; }
    const ri = t.closest('[data-rinv]'); if (ri) { openInv(ri.getAttribute('data-rinv')); return; }
    const hed = t.closest('[data-hused]'); if (hed) { husForm(hed.getAttribute('data-hused')); return; }
    const hr = t.closest('[data-husr]'); if (hr) { openHusRep(hr.getAttribute('data-husr')); return; }
    const rm = t.closest('[data-rmode]'); if (rm) { go('rep', { mode: rm.getAttribute('data-rmode') }); return; }
    const rmo = t.closest('[data-rmon]'); if (rmo) { SUB.mon = +rmo.getAttribute('data-rmon'); SUB.keepY = true; render(); return; }
    const rcal = t.closest('[data-rcal]'); if (rcal) { SUB.cal = rcal.getAttribute('data-rcal'); SUB.mon = 0; render(); return; }
    const rcp = t.closest('[data-rcopy]'); if (rcp) { copyText(REP_TXT); return; }
    if (t.id === 'remTest') { remindTest(); return; }
    // الطابور
    const qid = (a) => { const b = t.closest('[' + a + ']'); return b ? b.getAttribute(a) : null; };
    const fix = async (id, f) => { const o = OPS.find((x) => x.id === id); if (!o) return; f(o); o.st = 'pending'; o.err = ''; await opPut(o); OPS = await opsAll(); buildData(); render(); if (online()) sync({ noText: true }); };
    let id;
    if ((id = qid('data-qdel'))) { if (confirm('حذف هذا الإدخال من الطابور؟ (لن يُرفع)')) { await opDel(id); OPS = await opsAll(); buildData(); render(); } return; }
    if ((id = qid('data-qretry'))) return fix(id, () => {});
    if ((id = qid('data-qforce'))) return fix(id, (o) => { delete o.guard; });
    if ((id = qid('data-qforce2'))) return fix(id, (o) => { o.args[2] = Object.assign({}, o.args[2] || {}, { conflicts: 'force' }); if (o.fn === 'Maj_saveMajlis') o.args[1] = Object.assign({}, o.args[1] || {}, { force: true }); });
    if ((id = qid('data-qplace'))) { const ty = ($('#pt-' + id) || {}).value || 'حسينية'; return fix(id, (o) => { const i = o.fn === 'Maj_saveBatch' ? 2 : 1; o.args[i] = Object.assign({}, o.args[i] || {}, { addHusseiniya: true, placeType: ty }); }); }
    if ((id = qid('data-qfree'))) return fix(id, (o) => { const i = o.fn === 'Maj_saveBatch' ? 2 : 1; o.args[i] = Object.assign({}, o.args[i] || {}, { freePlace: true }); });
    const optFix = (id, add) => fix(id, (o) => { const i = o.fn === 'Maj_saveBatch' ? 2 : 1; o.args[i] = Object.assign({}, o.args[i] || {}, add); });
    if ((id = qid('data-qaddlec'))) return optFix(id, { addLecture: true });
    if ((id = qid('data-qkeepfree'))) return optFix(id, { keepFree: true });
    if ((id = qid('data-qdup'))) return optFix(id, { allowDup: true });
    // الإعدادات
    if (t.id === 'setPin') { pinScreen('set', () => { render(); }); return; }
    if (t.id === 'setLogin') { CFG.tok = ''; await kvSet('cfg', CFG); setupScreen(); return; }
    if (t.id === 'setLock') { UNLOCKED = false; lockNow(); return; }
    if (t.id === 'setExec') { setupScreen(); return; }
    if (t.id === 'remOn') { await remindSet(t.checked); return; }
    if (t.id === 'bkOut') { devExport(); return; }
    if (t.id === 'bkIn') { devImportPick(); return; }
    if (t.id === 'setWipe') { if (confirm('مسح كل بيانات التطبيق من هذا الجهاز؟')) wipe(); return; }
  });
  function lockNow() { pinScreen('enter', () => { window.onkeydown = null; $('#app').onclick = null; render(); }); }
  // يُقفل بعد 5 دقائق في الخلفية
  document.addEventListener('visibilitychange', () => { if (document.hidden) lastActive = Date.now(); else if (UNLOCKED && CFG.pin && Date.now() - lastActive > 5 * 60000) { UNLOCKED = false; lockNow(); } else if (UNLOCKED && online() && Date.now() - (CFG.lastSync || 0) > 6 * 3600000) sync(); });
  window.addEventListener('online', () => { syncUi(); if (UNLOCKED && OPS.some((o) => o.st === 'pending')) sync({ noText: true }); });
  window.addEventListener('offline', syncUi);

  // ---------------- 🚀 البدء ----------------
  async function boot(fresh) {
    window.onkeydown = null; $('#app').onclick = null;
    SNAP = await kvGet('snap') || null; OPS = await opsAll(); buildData();
    UNLOCKED = true; render();
    if (online() && (fresh || !CFG.lastSync || Date.now() - CFG.lastSync > 6 * 3600000)) sync();
  }
  (async function start() {
    try { await dbOpen(); } catch (e) { $('#app').innerHTML = '<div class="wrap"><div class="alert e">هذا المتصفح لا يسمح بالتخزين (وضع التصفح الخفي؟). افتح التطبيق في Chrome العادي.</div></div>'; return; }
    CFG = await kvGet('cfg') || {}; CFG.dev = CFG.dev || uid();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});   // لا يمسحه المتصفح عند امتلاء المساحة
    let rvk = ''; try { rvk = sessionStorage.getItem('offRevoked'); sessionStorage.removeItem('offRevoked'); } catch (e) {}
    if (rvk) { setupScreen('⛔ أُوقف هذا الجهاز من البرنامج، ومُسحت بيانات التطبيق منه. إن كان جهازك فادخل من جديد بكلمة المرور.'); return; }
    if (!CFG.exec || !CFG.tok && CFG.tok !== '' || CFG.tok == null) { setupScreen(); return; }
    if (!CFG.pin) { pinScreen('set', () => boot(true)); return; }
    pinScreen('enter', () => boot(false));
  })();
  window.__offApp = { get CFG() { return CFG; }, get MAJ() { return MAJ; }, get LEC() { return LEC; }, get OPS() { return OPS; }, sync, go };
})();
