/* Family EA — phone app. Plain JavaScript, no build step. */
(function () {
  'use strict';

  var CFG = window.FEA_CONFIG || {};
  var PEOPLE = CFG.PEOPLE || { ayo: 'Ayo', itunu: 'Itunu' };
  var VERSION = '1.2.0';
  var PENDING_MS = 5000;

  /* ───────── helpers ───────── */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  // A tiny store the alert worker can read too (it can't see localStorage).
  var IDB = {
    open: function () { return new Promise(function (res, rej) { try { var r = indexedDB.open('fea', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; } catch (e) { rej(e); } }); },
    set: function (k, v) { return IDB.open().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }); }).catch(function () {}); }
  };
  function b64ToBytes(b) { var s = atob(String(b).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(b).length + 3) % 4)); var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function isIOS() { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function d(iso) { var t = Date.parse(iso); return isNaN(t) ? null : new Date(t); }
  function hhmm(iso) { var x = d(iso); return x ? pad(x.getHours()) + ':' + pad(x.getMinutes()) : ''; }
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function dayStart(x) { var y = new Date(x); y.setHours(0, 0, 0, 0); return y; }
  function dayLabel(iso) { var x = d(iso); return x ? DOW[x.getDay()] + ' ' + x.getDate() + ' ' + MON[x.getMonth()] : ''; }
  function relWhen(iso) {
    var x = d(iso); if (!x) return '';
    var diff = Math.round((dayStart(new Date()) - dayStart(x)) / 86400000);
    if (diff === 0) return hhmm(iso);
    if (diff === 1) return 'Yest.';
    if (diff < 7 && diff > 0) return DOW[x.getDay()];
    return x.getDate() + ' ' + MON[x.getMonth()];
  }
  // When the EA picks up app requests (its scheduled runs). Shown as "around 1pm".
  function nextRun() {
    var runs = CFG.EA_RUNS || [['08:47', '9am'], ['12:47', '1pm'], ['17:47', '6pm']];
    var n = new Date(), mins = n.getHours() * 60 + n.getMinutes();
    for (var k = 0; k < runs.length; k++) {
      var hm = runs[k][0].split(':');
      if (+hm[0] * 60 + +hm[1] > mins) return runs[k][1];
    }
    return 'tomorrow ' + runs[0][1];
  }
  // "its 1pm run" today, or "tomorrow’s 9am run" after the last run.
  function runWhen() { var r = nextRun(); return /^tomorrow /.test(r) ? 'tomorrow\u2019s ' + r.slice(9) + ' run' : 'its ' + r + ' run'; }
  // Reminder presets: one tap, no typing. [key, label, Date]
  function whenOptions() {
    var n = new Date(), out = [];
    function at(days, h) { var x = new Date(n); x.setDate(x.getDate() + days); x.setHours(h, 0, 0, 0); return x; }
    out.push(['1h', 'In 1 hour', new Date(n.getTime() + 3600000)]);
    if (n.getHours() < 18) out.push(['eve', 'This evening', at(0, 19)]);
    out.push(['tom', 'Tomorrow morning', at(1, 8)]);
    var dow = n.getDay(), toSat = (6 - dow + 7) % 7;
    if (toSat === 0 && n.getHours() >= 9) toSat = 7;
    out.push(['sat', 'Saturday', at(toSat, 10)]);
    out.push(['mon', 'Monday', at((8 - dow) % 7 || 7, 8)]);
    return out;
  }
  function whenLabel(iso) {
    var x = d(iso); if (!x) return '';
    var diff = Math.round((dayStart(x) - dayStart(new Date())) / 86400000);
    var day = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : diff > 1 && diff < 7 ? DOW[x.getDay()] : x.getDate() + ' ' + MON[x.getMonth()];
    return day + ' ' + hhmm(iso);
  }
  function localInputValue(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()); }
  function endOfToday() { var e = new Date(); e.setHours(23, 59, 59, 0); return e; }
  function greeting() { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }
  function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }

  /* ───────── icons (inline, stroke) ───────── */
  function svg(p, s) { return '<svg aria-hidden="true" width="' + (s || 24) + '" height="' + (s || 24) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
  var I = {
    today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    houses: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/>',
    plan: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    intel: '<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    send: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    lists: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    snooze: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3L2 6M19 3l3 3"/>',
    clip: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    drop: '<path d="M12 3c3.5 4.3 6 7.6 6 10.6A6 6 0 0 1 6 13.6C6 10.6 8.5 7.3 12 3z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
    shuffle: '<path d="M4 7h3c5 0 5 10 10 10h3"/><path d="M4 17h3c2 0 3-1.5 4-3.5M13 9.5C14 8 15 7 17 7h3"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>',
    minus: '<path d="M5 12h14"/>'
  };

  /* ───────── state ───────── */
  var S = {
    mode: 'loading', demo: false, key: LS.get('fea.key', null), person: null, name: '',
    data: { items: [], history: [], queue: [], messages: [], runs: {}, lastSync: '', notes: [], groceries: [], snoozes: [], doneToday: 0, alerts: {} },
    tab: LS.get('fea.tab', 'today'), who: 'all', houseFilter: 'new', openScore: {}, seg: 'mine',
    month: 'all', mod: 'all', hq: '', histOpen: null, draft: '', files: [], ref: null, reading: 0,
    sheet: null, sheetItem: null, sheetFresh: false, unlinkAsk: false,
    jotText: '', jotWhen: '', pickTime: '', listSeg: 'groceries', gText: '', showSnoozed: false, lastDone: 0,
    gHistory: LS.get('fea.gHistory', []),
    prefs: Object.assign({ theme: 'auto', size: 'm', font: 'cambria', hc: false, rm: false, waterGoal: 8, game: '', quotes: true }, LS.get('fea.prefs', {})),
    pending: {}, syncing: false, offline: false, linkError: '', installHidden: LS.get('fea.installHidden', false),
    chatSeen: LS.get('fea.chatSeen', ''), firstPaint: true,
    instant: LS.get('fea.instant', []), reports: {}, water: LS.get('fea.water', {}), challenge: null,
    quoteIdx: Math.floor(Math.random() * 1000), pushOn: false
  };
  var TABS = [['today', 'Today'], ['lists', 'Lists'], ['houses', 'Houses'], ['plan', 'Plan'], ['intel', 'Intel'], ['history', 'History']];
  var AISLE_ORDER = ['Fruit & veg', 'Bakery', 'Meat & fish', 'Dairy & eggs', 'Cupboard', 'Frozen', 'Drinks', 'Household', 'Toiletries', 'Other'];
  var AISLES = [
    ['Fruit & veg', /\b(apple|banana|orange|lemon|lime|grape|berr|melon|mango|pear|plantain|tomato|potato|onion|garlic|ginger|pepper|chilli|carrot|lettuce|salad|spinach|cabbage|kale|broccoli|cucumber|mushroom|avocado|yam|okra|herb|coriander|parsley|veg|fruit)/],
    ['Meat & fish', /\b(chicken|beef|lamb|pork|mince|turkey|sausage|bacon|ham|goat|fish|salmon|tuna|cod|prawn|shrimp|mackerel|meat)/],
    ['Dairy & eggs', /\b(milk|cheese|butter|yog|cream|egg|custard)/],
    ['Bakery', /\b(bread|loaf|roll|bagel|wrap|pitta|croissant|bun|cake|muffin)/],
    ['Cupboard', /\b(rice|pasta|spaghetti|noodle|flour|sugar|salt|oil|vinegar|beans|lentil|tin|can|sauce|stock|cube|cereal|oats|tea|coffee|honey|jam|spice|seasoning|crisps|biscuit|chocolate|snack|nuts|garri|semolina)/],
    ['Frozen', /\b(frozen|ice cream|peas|chips)/],
    ['Drinks', /\b(water|juice|squash|cola|coke|lemonade|wine|beer|drink)/],
    ['Household', /\b(toilet|kitchen roll|tissue|bin bag|foil|cling|wash|detergent|softener|bleach|cleaner|sponge|dishwasher|battery|bulb)/],
    ['Toiletries', /\b(shampoo|conditioner|soap|shower|toothpaste|toothbrush|deodorant|razor|lotion|pads|tampon|nappies)/]
  ];
  function aisleFor(name) { var n = String(name || '').toLowerCase(); for (var i = 0; i < AISLES.length; i++) if (AISLES[i][1].test(n)) return AISLES[i][0]; return 'Other'; }
  var AREAS = { houses: 'Houses', plan: 'Plan', intel: 'Intel', migration: 'Migration', commands: 'Requests' };

  function canSee(o) { return o === S.person || o === 'both' || o === 'either'; }
  function owner(o) {
    var initials = Object.keys(PEOPLE).map(function (k) { return PEOPLE[k].charAt(0); });
    if (o === S.person) return { label: S.name, short: S.name.charAt(0), cls: 'own-' + o };
    if (o === 'either') return { label: 'Either of you', short: initials.join('/'), cls: 'own-either' };
    return { label: 'Both of you', short: initials.join('+'), cls: 'own-both' };
  }
  function ochip(o) { var w = owner(o); return '<span class="ochip ' + w.cls + '">' + esc(w.label) + '</span>'; }
  function items(mod) { return S.data.items.filter(function (i) { return canSee(i.for) && (!mod || i.module === mod); }); }
  function okWho(o) { return canSee(o) && (S.who === 'all' || S.who === o); }

  /* ───────── API ───────── */
  var api = {
    load: function () {
      if (S.demo) return window.FEA_DEMO.bootstrap();
      return fetch(CFG.API_URL + '?action=bootstrap&key=' + encodeURIComponent(S.key), { cache: 'no-store', redirect: 'follow' }).then(function (r) { return r.json(); });
    },
    report: function (id) {
      if (S.demo) return window.FEA_DEMO.report(id);
      return fetch(CFG.API_URL + '?action=report&key=' + encodeURIComponent(S.key) + '&id=' + encodeURIComponent(id), { cache: 'no-store', redirect: 'follow' }).then(function (r) { return r.json(); });
    },
    post: function (body) {
      if (S.demo) return window.FEA_DEMO.post(body);
      return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ key: S.key }, body)), redirect: 'follow' }).then(function (r) { return r.json(); });
    }
  };

  function accept(res) {
    S.data = {
      items: (res.items || []).filter(function (i) { return canSee(i.for); }).map(function (i) { i.data = i.data || {}; return i; }),
      history: (res.history || []).filter(function (h) { return canSee(h.for); }),
      queue: res.queue || [], messages: res.messages || [], runs: res.runs || {}, lastSync: res.lastSync || res.serverTime || '',
      notes: res.notes || [], groceries: res.groceries || [], snoozes: res.snoozes || [],
      doneToday: res.doneToday || 0, alerts: res.alerts || { topic: '', morning: true, evening: true }
    };
    (S.localNotes || []).forEach(function (n) { if (!S.data.notes.some(function (x) { return x.id === n.id; })) S.data.notes.push(n); });
    (S.localGroceries || []).forEach(function (g) { if (!S.data.groceries.some(function (x) { return x.id === g.id || (x.name.toLowerCase() === g.name.toLowerCase() && !x.ticked); })) S.data.groceries.push(g); });
    // keep optimistic chat messages that the server hasn't echoed yet
    (S.localMsgs || []).forEach(function (m) { if (!S.data.messages.some(function (x) { return x.id === m.id; })) S.data.messages.push(m); });
  }

  function load(opts) {
    opts = opts || {};
    if (S.syncing) return Promise.resolve();
    S.syncing = true; paintSync();
    return api.load().then(function (res) {
      if (!res || !res.ok) {
        if (res && res.error === 'bad_key') { unlink('That key isn’t recognised. Check it and try again.'); return; }
        throw new Error((res && res.error) || 'load_failed');
      }
      S.person = res.person; S.name = res.name || PEOPLE[res.person] || 'You';
      accept(res);
      if (!S.demo) { LS.set('fea.cache', { res: res, at: new Date().toISOString() }); IDB.set('cfg', { key: S.key, api: CFG.API_URL, person: res.person }); }
      S.offline = false;
      var wasLink = S.mode !== 'app';
      S.mode = 'app';
      render(wasLink || opts.animate);
    }).catch(function () {
      var c = !S.demo && LS.get('fea.cache', null);
      if (c && c.res) {
        S.person = c.res.person; S.name = c.res.name; accept(c.res); S.offline = true; S.mode = 'app';
        render(S.firstPaint);
      } else if (S.mode !== 'app') {
        S.mode = 'link'; S.linkError = 'Couldn’t reach your EA. Check your connection and try again.'; render(true);
      } else { S.offline = true; toast('No connection. Showing your saved copy.'); }
    }).then(function () { S.syncing = false; paintSync(); S.firstPaint = false; });
  }

  /* ───────── actions with an undo window ───────── */
  function queueAction(item, action, label) {
    if (S.pending[item.id]) return;
    var p = { action: action, label: label, start: Date.now() };
    p.timer = setTimeout(function () { commit(item.id); }, PENDING_MS);
    S.pending[item.id] = p;
    toast(label + ' · sending in 5 s', { undo: item.id, ms: PENDING_MS });
    render();
  }
  function cancelAction(id) {
    var p = S.pending[id]; if (!p) return;
    clearTimeout(p.timer); delete S.pending[id];
    toast('Cancelled. Nothing was sent.');
    render();
  }
  function commit(id) {
    var p = S.pending[id]; if (!p) return Promise.resolve();
    clearTimeout(p.timer); delete S.pending[id];
    var item = S.data.items.filter(function (i) { return i.id === id; })[0];
    if (item) { item.status = 'queued'; if (item.module === 'houses') item.data.decision = p.action; if (p.action.indexOf('option:') === 0) item.data.choice = p.action.slice(7); }
    S.data.queue.push({ id: 'tmp-' + id, itemId: id, text: p.label, ts: new Date().toISOString() });
    render();
    return api.post({ type: 'action', itemId: id, action: p.action, label: p.label }).then(function (res) {
      if (!res || !res.ok) throw new Error(res && res.error);
      S.data.queue.forEach(function (q) { if (q.id === 'tmp-' + id) q.id = res.id; });
      toast('Sent to your EA · acts around ' + nextRun());
    }).catch(function () {
      if (item) { item.status = 'open'; if (item.data) { delete item.data.decision; delete item.data.choice; } }
      S.data.queue = S.data.queue.filter(function (q) { return q.id !== 'tmp-' + id; });
      toast('Couldn’t send. Check your connection and try again.');
    }).then(function () { render(); });
  }
  function flushPending() {
    Object.keys(S.pending).forEach(function (id) {
      var p = S.pending[id]; clearTimeout(p.timer); delete S.pending[id];
      if (S.demo || !navigator.sendBeacon) return;
      try { navigator.sendBeacon(CFG.API_URL, new Blob([JSON.stringify({ key: S.key, type: 'action', itemId: id, action: p.action, label: p.label })], { type: 'text/plain' })); } catch (e) {}
    });
  }
  function toggleRead(item) {
    var to = item.status === 'read' ? 'unread' : 'read';
    item.status = to === 'read' ? 'read' : 'open';
    render();
    api.post({ type: 'action', itemId: item.id, action: to }).catch(function () { item.status = to === 'read' ? 'open' : 'read'; toast('Couldn’t save that. Try again.'); render(); });
  }
  /* ───────── files: photos and documents ───────── */
  var MAX_FILES = 5, MAX_FILE = 10 * 1024 * 1024, MAX_TOTAL = 15 * 1024 * 1024;
  var OK_TYPES = /^(image\/(jpeg|png|gif|webp|heic|heif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/;
  var EXT_TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', csv: 'text/csv', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic' };
  function sizeLabel(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function totalBytes() { return S.files.reduce(function (t, f) { return t + f.size; }, 0); }

  // Big photos are shrunk on the phone first (max 2000 px), so they upload quickly.
  function shrinkImage(file) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || file.size < 1200000 || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(function (b) { res(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.85); });
    }).catch(function () { return file; });
  }
  function toBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function addFiles(list) {
    var arr = Array.prototype.slice.call(list || []);
    if (!arr.length) return;
    if (S.files.length + arr.length > MAX_FILES) { toast('Up to ' + MAX_FILES + ' files at a time.'); arr = arr.slice(0, MAX_FILES - S.files.length); }
    S.reading += arr.length; render();
    arr.reduce(function (chain, raw) {
      return chain.then(function () {
        var type = raw.type || EXT_TYPES[(raw.name.split('.').pop() || '').toLowerCase()] || '';
        if (!OK_TYPES.test(type)) { toast('\u201c' + raw.name + '\u201d isn\u2019t a photo or document I can send.'); return; }
        return shrinkImage(raw).then(function (f) {
          if (f.size > MAX_FILE) { toast('\u201c' + raw.name + '\u201d is over 10 MB.'); return; }
          if (totalBytes() + f.size > MAX_TOTAL) { toast('That\u2019s over 15 MB in one go. Send the rest next.'); return; }
          return toBase64(f).then(function (b64) {
            S.files.push({ id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6), name: f.name || raw.name, mime: f.type || type, size: f.size, data: b64,
              preview: /^image\/(jpeg|png|gif|webp)$/.test(f.type || type) ? URL.createObjectURL(f) : '' });
          });
        });
      }).catch(function () { toast('Couldn\u2019t read \u201c' + raw.name + '\u201d.'); }).then(function () { S.reading--; render(); });
    }, Promise.resolve());
  }
  function openPicker() { var fi = document.getElementById('file-input'); if (fi) fi.click(); }
  function fileChip(f, removable) {
    var img = /^image\//.test(f.mime);
    var thumb = f.preview ? '<img src="' + esc(f.preview) + '" alt="" class="fthumb">' : '<span class="ficon">' + svg(img ? I.clip : I.doc, 18) + '</span>';
    var url = safeUrl(f.url);
    var label = '<span class="fname">' + esc(f.name) + '</span><span class="fsize">' + esc(sizeLabel(f.size || 0)) + '</span>';
    if (removable) return '<span class="file">' + thumb + '<span class="fcol">' + label + '</span><button type="button" class="fx" data-act="rmfile" data-id="' + esc(f.id) + '" aria-label="Remove ' + esc(f.name) + '">' + svg(I.x, 16) + '</button></span>';
    return url ? '<a class="file" href="' + esc(url) + '" target="_blank" rel="noopener">' + thumb + '<span class="fcol">' + label + '</span>' + svg(I.ext, 14) + '</a>'
      : '<span class="file">' + thumb + '<span class="fcol">' + label + '</span></span>';
  }

  function sendChat() {
    var text = (S.draft || '').trim();
    var files = S.files.slice();
    if (S.reading) { toast('Still preparing your files\u2026'); return; }
    if (!text && !files.length) return;
    var route = files.length || S.ref ? 'action' : classify(text);
    var gm = route === 'action' && text.match(/^(?:please\s+)?add\s+(.+?)\s+to\s+(?:the\s+|our\s+|my\s+)?(?:shopping|grocery|groceries)(?:\s+list)?\.?$/i);
    if (gm) {
      var gl = gm[1].split(/\s*(?:,|\band\b)\s*/).filter(Boolean);
      S.draft = '';
      S.instant.push({ id: 'q' + Date.now(), ts: new Date().toISOString(), from: 'me', text: text, instant: true },
        { id: 'a' + Date.now(), ts: new Date(Date.now() + 1).toISOString(), from: 'instant', text: 'Added to the shared shopping list: ' + gl.join(', ') + '.' });
      saveInstant();
      gl.forEach(function (g) { addGrocery(g); });
      render(); return;
    }
    if (route === 'other' && builtIn(text) && answerInstantly(text)) { S.draft = ''; render(); return; }
    if (route === 'jot') {
      S.draft = '';
      S.jotText = text.replace(/^remind me\s*(to\s+|about\s+)?/i, '').replace(/^./, function (c) { return c.toUpperCase(); });
      S.pickTime = ''; S.jotWhen = new Date().getHours() < 18 ? 'eve' : 'tom';
      render(); openSheet('jot');
      toast('Pick a time and save. Your phone reminds you, no EA run needed.', { ms: 5000 });
      return;
    }
    if ((route === 'lookup' || route === 'question') && answerInstantly(text)) { S.draft = ''; render(); return; }
    var unanswered = route === 'question' || route === 'lookup';
    var tmp = { id: 'local-' + Date.now(), ts: new Date().toISOString(), from: 'me', text: text || ('Sent ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '.'), status: 'sending',
      files: files.map(function (f) { return { name: f.name, mime: f.mime, size: f.size, preview: f.preview }; }) };
    S.localMsgs = (S.localMsgs || []).concat([tmp]);
    S.data.messages.push(tmp);
    var ref = S.ref;
    S.draft = ''; S.files = []; S.ref = null;
    render();
    api.post({ type: 'message', text: text, ref: ref || '', files: files.map(function (f) { return { name: f.name, mime: f.mime, data: f.data }; }) }).then(function (res) {
      if (!res || !res.ok) throw new Error(res && res.error);
      tmp.status = 'sent'; tmp.id = res.id;
      (res.files || []).forEach(function (sf, k) { if (tmp.files[k]) tmp.files[k].url = sf.url; });
      S.localMsgs = S.localMsgs.filter(function (m) { return m !== tmp; });
      if (files.length) setTimeout(load, 300); // pull the new History entry
      if (unanswered) {
        S.instant.push({ id: 'n' + Date.now(), ts: new Date(Date.now() + 1).toISOString(), from: 'instant', text: 'I couldn\u2019t find that in your last 6 months of history, so I\u2019ve passed it to your EA. It\u2019ll answer at ' + runWhen() + '.' });
        saveInstant();
      } else toast((files.length ? 'Sent with ' + files.length + ' file' + (files.length === 1 ? '' : 's') : 'Sent') + ' \u00b7 your EA does this at ' + runWhen());
    }).catch(function (e) {
      tmp.status = 'failed'; tmp.retryFiles = files; tmp.retryRef = ref;
      var why = { file_type: 'That file type can\u2019t be sent.', file_too_big: 'Files are too big. Try fewer at once.', too_many_files: 'Up to 5 files at a time.' }[e && e.message];
      toast(why || 'Couldn\u2019t send. Check your connection and try again.');
    }).then(function () { render(); });
  }

  /* ───────── jots, snoozes and groceries (instant, no EA wait) ───────── */
  function copyText(t, ok) {
    if (navigator.clipboard && t) navigator.clipboard.writeText(t).then(function () { toast(ok); }, function () { toast(t, { ms: 8000 }); });
    else toast(t || 'Nothing to copy.', { ms: 8000 });
  }
  function saveJot() {
    var text = ((document.getElementById('jot-text') || {}).value || S.jotText || '').trim();
    if (!text) { toast('Type or say what you need to remember.'); return; }
    var at = chosenWhen();
    if (S.jotWhen === 'pick' && !at) { toast('Pick a date and time first.'); return; }
    var tmp = { id: 'local-n' + Date.now(), text: text, created: new Date().toISOString(), remindAt: at, status: 'open' };
    S.localNotes = (S.localNotes || []).concat([tmp]);
    S.data.notes.push(tmp); S.jotText = '';
    closeSheet(); render();
    toast(at ? 'Saved. I\u2019ll remind you ' + whenLabel(at) + '.' : 'Saved to My list.');
    api.post({ type: 'note', op: 'add', text: text, remindAt: at }).then(function (r) {
      if (!r || !r.ok) throw new Error();
      tmp.id = r.id; S.localNotes = S.localNotes.filter(function (n) { return n !== tmp; });
    }).catch(function () {
      S.data.notes = S.data.notes.filter(function (n) { return n !== tmp; }); S.localNotes = (S.localNotes || []).filter(function (n) { return n !== tmp; });
      S.jotText = text; toast('Couldn\u2019t save. Your note is kept, try again.'); render();
    });
  }
  function noteOp(id, op) {
    var n = S.data.notes.filter(function (x) { return x.id === id; })[0]; if (!n) return;
    var before = JSON.stringify(n);
    if (op === 'done') { n.status = 'done'; n.doneAt = new Date().toISOString(); S.data.doneToday = (S.data.doneToday || 0) + 1; toast('Nice one. Done.'); }
    if (op === 'undo') { n.status = 'open'; S.data.doneToday = Math.max(0, (S.data.doneToday || 0) - 1); }
    if (op === 'delete') S.data.notes = S.data.notes.filter(function (x) { return x !== n; });
    render();
    api.post({ type: 'note', op: op, id: id }).then(function (r) { if (!r || !r.ok) throw new Error(); }).catch(function () {
      Object.assign(n, JSON.parse(before)); if (op === 'delete') S.data.notes.push(n); toast('Couldn\u2019t save that. Try again.'); render();
    });
  }
  function doSnooze() {
    var it = S.sheetItem, at = chosenWhen();
    if (!it || !at) { toast('Pick when to be reminded.'); return; }
    closeSheet();
    if (it.kind === 'note') {
      var n = S.data.notes.filter(function (x) { return x.id === it.id; })[0];
      if (n) n.remindAt = at;
      api.post({ type: 'note', op: 'snooze', id: it.id, remindAt: at }).catch(function () { toast('Couldn\u2019t save that. Try again.'); });
    } else {
      S.data.snoozes = (S.data.snoozes || []).filter(function (z) { return z.itemId !== it.id; }).concat([{ itemId: it.id, until: at }]);
      api.post({ type: 'snooze', itemId: it.id, until: at }).then(function (r) { if (!r || !r.ok) throw new Error(); }).catch(function () {
        S.data.snoozes = S.data.snoozes.filter(function (z) { return z.itemId !== it.id; }); toast('Couldn\u2019t snooze. Try again.'); render();
      });
    }
    toast('Out of sight until ' + whenLabel(at) + '. I\u2019ll remind you.');
    render();
  }
  function unsnooze(id) {
    S.data.snoozes = (S.data.snoozes || []).filter(function (z) { return z.itemId !== id; });
    render();
    api.post({ type: 'snooze', op: 'clear', itemId: id }).catch(function () {});
  }
  function addGrocery(raw) {
    var t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    var m = t.match(/^(\d+(?:\.\d+)?\s*(?:x|kg|g|l|ml|pack|packs|bags?|tins?)?)\s+(.+)$/i) || t.match(/^(.+?)\s+[x\u00d7](\d+)$/i);
    var name = t, qty = '';
    if (m && /^\d/.test(m[1])) { qty = m[1].replace(/\s*x$/i, ''); name = m[2]; } else if (m) { name = m[1]; qty = m[2]; }
    name = name.charAt(0).toUpperCase() + name.slice(1);
    var dup = S.data.groceries.filter(function (g) { return !g.ticked && g.name.toLowerCase() === name.toLowerCase(); })[0];
    if (dup) { if (qty) dup.qty = qty; toast(name + ' is already on the list.'); }
    else {
      var tmp = { id: 'local-g' + Date.now(), name: name, qty: qty, aisle: aisleFor(name), addedBy: S.person, created: new Date().toISOString(), ticked: false };
      S.data.groceries.push(tmp); S.localGroceries = (S.localGroceries || []).concat([tmp]);
      api.post({ type: 'grocery', op: 'add', name: name, qty: qty }).then(function (r) {
        if (!r || !r.ok) throw new Error(); tmp.id = r.id; S.localGroceries = S.localGroceries.filter(function (g) { return g !== tmp; });
      }).catch(function () { S.data.groceries = S.data.groceries.filter(function (g) { return g !== tmp; }); S.localGroceries = (S.localGroceries || []).filter(function (g) { return g !== tmp; }); toast('Couldn\u2019t add ' + name + '. Try again.'); render(); });
    }
    S.gHistory = [name].concat((S.gHistory || []).filter(function (n) { return n.toLowerCase() !== name.toLowerCase(); })).slice(0, 20);
    LS.set('fea.gHistory', S.gHistory);
    S.gText = '';
    render();
    var gi = document.getElementById('g-input'); if (gi) gi.focus({ preventScroll: true });
  }
  function groceryOp(id, op) {
    var snapshot = JSON.stringify(S.data.groceries);
    if (op === 'clear') S.data.groceries = S.data.groceries.filter(function (g) { return !g.ticked; });
    else {
      var g = S.data.groceries.filter(function (x) { return x.id === id; })[0]; if (!g) return;
      if (op === 'tick') { g.ticked = true; g.tickedBy = S.person; S.data.doneToday = (S.data.doneToday || 0) + 1; }
      if (op === 'untick') { g.ticked = false; g.tickedBy = ''; S.data.doneToday = Math.max(0, (S.data.doneToday || 0) - 1); }
      if (op === 'remove') S.data.groceries = S.data.groceries.filter(function (x) { return x !== g; });
    }
    render();
    if (String(id || '').indexOf('local-') === 0) return; // not saved yet; the add will carry it
    api.post({ type: 'grocery', op: op, id: id }).then(function (r) { if (!r || !r.ok) throw new Error(); }).catch(function () {
      S.data.groceries = JSON.parse(snapshot); toast('Couldn\u2019t update the list. Try again.'); render();
    });
  }

  /* ───────── derived data ───────── */
  function houseState(i) {
    if (S.pending[i.id]) return 'pending';
    if (i.status === 'open') return 'new';
    return i.status; // queued | done | read
  }
  function houseDecision(i) { return (S.pending[i.id] && S.pending[i.id].action) || (i.data && i.data.decision) || ''; }

  function needs() {
    var out = [];
    var newHouses = items('houses').filter(function (i) { return houseState(i) === 'new' && !isSnoozed(i.id); });
    if (newHouses.length) out.push({ owner: 'both', rank: 2, title: newHouses.length + ' new house match' + (newHouses.length === 1 ? '' : 'es'), sub: 'Approve, skip or never', go: 'houses' });
    items('plan').filter(function (i) { return i.status === 'open' && !S.pending[i.id] && !isSnoozed(i.id); }).forEach(function (i) {
      var clash = i.data.kind === 'clash';
      out.push({ id: i.id, owner: i.for, rank: clash ? 0 : 1, due: i.due, title: (clash ? 'Clash: ' : '') + i.title, sub: dayLabel(i.due) + (clash ? ' · pick one' : i.summary ? ' · ' + i.summary : ''), go: 'plan' });
    });
    S.data.items.filter(function (i) { return canSee(i.for) && (i.module === 'intel' || i.module === 'migration') && i.status === 'open' && i.data.rag === 'act' && !isSnoozed(i.id); }).forEach(function (i) {
      out.push({ id: i.id, owner: i.for, rank: i.module === 'migration' ? 1 : 3, title: i.title, sub: i.data.why || i.summary || '', go: i.module === 'migration' ? 'intel:mig' : 'intel:mine' });
    });
    var unread = S.data.messages.filter(function (m) { return m.from === 'ea' && m.ts > (S.chatSeen || ''); });
    if (unread.length) out.push({ owner: S.person, rank: 0, title: 'New reply from your EA', sub: unread[unread.length - 1].text.slice(0, 70), go: 'ask' });
    return out.sort(function (a, b) { return a.rank - b.rank || String(a.due || '').localeCompare(String(b.due || '')); });
  }

  function isSnoozed(id) { var now = Date.now(); return (S.data.snoozes || []).some(function (z) { return z.itemId === id && Date.parse(z.until) > now; }); }
  function snoozeOf(id) { return (S.data.snoozes || []).filter(function (z) { return z.itemId === id && Date.parse(z.until) > Date.now(); })[0]; }
  function openNotes() {
    return (S.data.notes || []).filter(function (n) { return n.status === 'open'; }).sort(function (a, b) {
      if (!a.remindAt) return 1; if (!b.remindAt) return -1; return a.remindAt < b.remindAt ? -1 : 1;
    });
  }
  function dueNotes() { var e = endOfToday().getTime(); return openNotes().filter(function (n) { return n.remindAt && Date.parse(n.remindAt) <= e; }); }

  function planGroups() {
    var today = dayStart(new Date());
    var dow = (today.getDay() + 6) % 7; // Monday = 0
    var endThis = new Date(today.getTime() + (7 - dow) * 86400000);
    var endNext = new Date(endThis.getTime() + 7 * 86400000);
    var endAfter = new Date(endNext.getTime() + 7 * 86400000);
    var groups = [['Overdue', []], ['This week', []], ['Next week', []], ['Week after', []], ['Later', []]];
    items('plan').filter(function (i) { return okWho(i.for); }).sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); }).forEach(function (i) {
      var t = d(i.due);
      var g = !t ? 4 : t < today ? 0 : t < endThis ? 1 : t < endNext ? 2 : t < endAfter ? 3 : 4;
      groups[g][1].push(i);
    });
    return groups.filter(function (g) { return g[1].length; });
  }

  function last6Months() {
    var out = [], x = new Date(); x.setDate(1);
    for (var k = 0; k < 6; k++) {
      out.push({ key: x.getFullYear() + '-' + pad(x.getMonth() + 1), short: MON[x.getMonth()], long: MONTH[x.getMonth()] + ' ' + x.getFullYear() });
      x.setMonth(x.getMonth() - 1);
    }
    return out;
  }
  function monthKey(iso) { var x = d(iso); return x ? x.getFullYear() + '-' + pad(x.getMonth() + 1) : ''; }

  /* ───────── preferences ───────── */
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyPrefs() {
    var p = S.prefs;
    var dark = p.theme === 'dark' || (p.theme === 'auto' && mql && mql.matches);
    var cls = [dark ? 'dark' : 'light', 's-' + p.size, 'f-' + p.font];
    if (p.hc) cls.push('hc');
    if (p.rm) cls.push('rm');
    document.documentElement.className = cls.join(' ');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1C1612' : '#FBF5EC');
    LS.set('fea.prefs', p);
  }
  if (mql && mql.addEventListener) mql.addEventListener('change', function () { if (S.prefs.theme === 'auto') applyPrefs(); });

  /* ───────── views ───────── */
  function header() {
    var titles = { today: greeting() + ', ' + S.name, lists: 'Lists', houses: 'House search', plan: 'Plan ahead', intel: 'Intel & migration', history: 'History', ask: 'Ask your EA' };
    var me = owner(S.person);
    return '<header class="top"><div class="top-row"><div style="min-width:0">' +
      '<div class="eyebrow"><span class="leaf">' + svg(I.leaf, 14) + '</span>Family EA · ' + esc(dayLabel(new Date().toISOString())) + '</div>' +
      '<h1>' + esc(titles[S.tab] || '') + '</h1></div>' +
      '<div class="hbtns"><button class="hbtn" data-act="tab" data-v="ask" aria-label="Ask your EA"' + (S.tab === 'ask' ? ' aria-current="page"' : '') + '>' + svg(I.chat, 22) + (unreadCount() ? '<span class="hdot" aria-label="New reply"></span>' : '') + '</button>' +
      '<button class="avatar ' + me.cls + '" data-act="settings" aria-label="Your settings and accessibility">' + esc(me.short) + '<span class="cog">' + svg(I.cog, 12) + '</span></button></div></div>' +
      '<div class="sync" id="sync">' + syncInner() + '</div></header>';
  }
  function unreadCount() { return S.data.messages.filter(function (m) { return m.from === 'ea' && m.ts > (S.chatSeen || ''); }).length; }
  function syncInner() {
    var dotCls = S.offline ? 'off' : S.syncing ? 'busy' : '';
    var text = S.offline ? 'Offline · saved copy' : S.syncing ? 'Checking for updates…' : 'Updated ' + (hhmm(S.data.lastSync) || 'just now') + ' · EA next run around ' + nextRun();
    return '<span class="dot ' + dotCls + '"></span><span>' + esc(text) + '</span>' + (S.demo ? '<span class="pill">Demo</span>' : '') + '<button class="link" data-act="refresh">Refresh</button>';
  }
  function paintSync() { var el = document.getElementById('sync'); if (el) el.innerHTML = syncInner(); }

  function nav() {
    var newHouses = items('houses').filter(function (i) { return houseState(i) === 'new'; }).length;
    var clashes = items('plan').filter(function (i) { return i.status === 'open' && i.data.kind === 'clash' && !S.pending[i.id]; }).length;
    return '<nav class="tabs" aria-label="Sections">' + TABS.map(function (t) {
      var badge = t[0] === 'houses' ? newHouses : t[0] === 'plan' ? clashes : 0;
      return '<button data-act="tab" data-v="' + t[0] + '"' + (S.tab === t[0] ? ' aria-current="page"' : '') + '>' + svg(I[t[0]]) + '<span>' + t[1] + '</span>' +
        (badge ? '<span class="badge" aria-label="' + badge + ' new">' + badge + '</span>' : '') + '</button>';
    }).join('') + '</nav>';
  }

  function stag(html, i) {
    var v = '--i:' + Math.min(i, 10) + ';';
    var m = html.match(/^<\w+[^>]*?\sstyle="/);
    return m ? html.replace(m[0], m[0] + v) : html.replace(/^<(\w+)/, '<$1 style="' + v + '"');
  }

  function today() {
    var all = needs();
    var tiles = [S.person, 'both', 'either'].map(function (o) {
      var w = owner(o), n = all.filter(function (x) { return x.owner === o; }).length;
      var sub = o === S.person ? 'Just for you' : o === 'both' ? 'Needs you together' : 'Whoever’s free';
      return '<button class="tile ' + w.cls + '" data-act="who" data-v="' + o + '" aria-pressed="' + (S.who === o) + '"><span class="n">' + n + '</span><span class="l">' + esc(w.label) + '</span><span class="s">' + sub + '</span></button>';
    }).join('');
    var list = all.filter(function (x) { return okWho(x.owner); });
    var html = [];
    if (!S.demo && !isStandalone() && !S.installHidden) {
      html.push('<section class="card pad stack" aria-label="Install"><div class="row-between"><b>Add to your Home Screen</b><button class="textbtn" data-act="hideinstall">Hide</button></div>' +
        '<div class="note">In Safari, tap Share, then “Add to Home Screen”. Open it from there and paste your key once more.</div>' +
        '<button class="btn small olive" data-act="copykey">Copy my key</button></section>');
    }
    var qc = quoteCard(); if (qc) html.push(qc);
    // "Your 3 for today": the short answer to "what now?"
    var top = dueNotes().map(function (n) { return { note: n }; }).concat(all.map(function (x) { return { need: x }; })).slice(0, 3);
    var shownNeeds = top.filter(function (t) { return t.need; }).map(function (t) { return t.need; });
    var doneN = S.data.doneToday || 0;
    var bump = doneN > S.lastDone && S.lastDone > 0; S.lastDone = doneN;
    html.push('<section class="top3" aria-label="Your 3 for today"><div class="row-between"><h2 class="h2" style="color:var(--olive)">Your 3 for today</h2>' +
      '<span class="donechip' + (bump ? ' bump' : '') + '" aria-live="polite">' + svg(I.check, 14) + 'Done today · ' + doneN + '</span></div>' +
      (top.length ? '<ol class="three">' + top.map(function (t, k) {
        if (t.note) {
          var n = t.note, over = Date.parse(n.remindAt) < Date.now();
          return '<li><button class="gcheck" data-act="notedone" data-id="' + esc(n.id) + '" aria-label="Done: ' + esc(n.text) + '"><span class="box"></span></button>' +
            '<span class="col"><span class="t">' + esc(n.text) + '</span><span class="s' + (over ? ' late' : '') + '">' + svg(I.bell, 12) + ' ' + (over ? 'Was due ' : '') + esc(whenLabel(n.remindAt)) + '</span></span>' +
            '<button class="btn small" data-act="snoozenote" data-id="' + esc(n.id) + '">Later</button></li>';
        }
        var x = t.need;
        return '<li><span class="num" aria-hidden="true">' + (k + 1) + '</span><button class="col linkcol" data-act="go" data-v="' + x.go + '"><span class="t">' + esc(x.title) + '</span><span class="s">' + esc(x.sub) + '</span></button>' +
          (x.id ? '<button class="btn small" data-act="snoozeitem" data-id="' + esc(x.id) + '">Later</button>' : '<span class="chev">' + svg(I.chev, 18) + '</span>') + '</li>';
      }).join('') + '</ol>' : '<div class="allclear" style="background:transparent;padding:4px 0">' + svg(I.check, 20) + 'Nothing urgent. Got a thought? Tap + to jot it down.</div>') + '</section>');
    html.push(waterCard());
    var rest = S.who === 'all' ? list.filter(function (x) { return shownNeeds.indexOf(x) < 0; }) : list;
    html.push('<section class="tiles" aria-label="Who needs to act">' + tiles + '</section>');
    list = rest;
    html.push('<section class="stack"><div class="row-between"><h2 class="h2">' + (S.who === 'all' ? 'Everything else' : esc(owner(S.who).label)) + ' · ' + list.length + '</h2>' +
      (S.who !== 'all' ? '<button class="textbtn" data-act="who" data-v="all">Show all</button>' : '') + '</div>' +
      (list.length ? '<div class="list">' + list.map(function (n) {
        var w = owner(n.owner);
        return '<button class="rowbtn" data-act="go" data-v="' + n.go + '"><span class="obadge ' + w.cls + '" aria-hidden="true">' + esc(w.short) + '</span>' +
          '<span class="col"><span class="t">' + esc(n.title) + '</span><span class="s">' + esc(n.sub) + '</span><span>' + ochip(n.owner) + '</span></span><span class="chev">' + svg(I.chev, 18) + '</span></button>';
      }).join('') + '</div>' : '<div class="allclear">' + svg(I.check, 20) + 'All clear. Nothing else needs you here.</div>') + '</section>');

    var q = S.data.queue.concat(Object.keys(S.pending).map(function (id) { return { text: S.pending[id].label + ' (sending)' }; }));
    if (q.length) {
      html.push('<section class="stack"><h2 class="h2">Waiting for your EA · ' + q.length + '</h2><div class="list">' + q.map(function (x) {
        return '<div class="qrow"><span class="d"></span><span>' + esc(x.text) + '</span><span class="w">around ' + nextRun() + '</span></div>';
      }).join('') + '</div></section>');
    }
    var snoozedItems = S.data.items.filter(function (i) { return canSee(i.for) && isSnoozed(i.id); });
    if (snoozedItems.length) {
      html.push('<section class="stack"><button class="row-between textbtn" style="color:var(--ink);width:100%;min-height:44px" data-act="togglesnoozed" aria-expanded="' + S.showSnoozed + '"><span class="h2">' + svg(I.snooze, 14) + ' Snoozed · ' + snoozedItems.length + '</span><span style="color:var(--accentInk)">' + (S.showSnoozed ? 'Hide' : 'Show') + '</span></button>' +
        (S.showSnoozed ? '<div class="list">' + snoozedItems.map(function (i) {
          return '<div class="qrow"><span class="col" style="display:flex;flex-direction:column;flex:1;min-width:0"><b>' + esc(i.title) + '</b><span class="note" style="font-size:.75rem">Back ' + esc(whenLabel(snoozeOf(i.id).until)) + '</span></span><button class="btn small" data-act="unsnooze" data-id="' + esc(i.id) + '">Bring back</button></div>';
        }).join('') + '</div>' : '') + '</section>');
    }
    var recent = S.data.history.slice(0, 4);
    html.push('<section class="stack"><div class="row-between"><h2 class="h2">Latest from your EA</h2><button class="textbtn" data-act="tab" data-v="history">Full history</button></div>' +
      (recent.length ? '<div class="list">' + recent.map(function (h) {
        return '<button class="feed" data-act="report" data-id="' + esc(h.id) + '"><span class="when">' + esc(relWhen(h.date)) + '</span><span class="col" style="display:flex;flex-direction:column;gap:2px"><b style="font-size:.875rem">' + esc(h.title) + '</b><span class="note" style="font-size:.8125rem">' + esc(h.outcome) + '</span></span></button>';
      }).join('') + '</div>' : '<div class="empty">Your EA’s updates will appear here after its next run.</div>') + '</section>');
    return html;
  }

  function scoreRing(score) {
    var c = 2 * Math.PI * 29, off = c * (1 - Math.max(0, Math.min(100, +score || 0)) / 100);
    return '<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="var(--line)" stroke-width="3"/><circle class="ring" cx="32" cy="32" r="29" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 32 32)"/></svg>';
  }

  function houses() {
    var all = items('houses');
    var buckets = {
      new: all.filter(function (i) { var s = houseState(i); return s === 'new' || s === 'pending'; }),
      short: all.filter(function (i) { var s = houseState(i); return s !== 'new' && s !== 'pending' && houseDecision(i) === 'approve'; }),
      gone: all.filter(function (i) { var s = houseState(i); return s !== 'new' && s !== 'pending' && (houseDecision(i) === 'skip' || houseDecision(i) === 'never'); })
    };
    var html = ['<div class="chips wrap" role="group" aria-label="Show">' + [['new', 'New'], ['short', 'Shortlist'], ['gone', 'Discarded']].map(function (f) {
      return '<button class="fchip" data-act="hfilter" data-v="' + f[0] + '" aria-pressed="' + (S.houseFilter === f[0]) + '">' + f[1] + ' · ' + buckets[f[0]].length + '</button>';
    }).join('') + '</div>'];
    var list = buckets[S.houseFilter] || [];
    if (!list.length) html.push('<div class="empty">' + (S.houseFilter === 'new' ? 'No new matches right now. The next search runs on a weekday at 12:30 and 16:00.' : 'Nothing here yet.') + '</div>');
    list.forEach(function (i) {
      var x = i.data || {}, st = houseState(i), dec = houseDecision(i), open = !!S.openScore[i.id];
      var rows = (x.rows || []).map(function (r) {
        var pct = r[2] ? Math.round(r[1] / r[2] * 100) : 0;
        return '<div><div class="row-between" style="font-size:.8125rem"><span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '/' + esc(r[2]) + '</b></div><div class="bar"><i data-w="' + pct + '" style="width:' + (open ? pct : 0) + '%"></i></div></div>';
      }).join('');
      var listing = safeUrl(x.listingUrl), map = safeUrl(x.mapUrl);
      var status = '';
      if (st === 'pending') {
        var p = S.pending[i.id], el = Date.now() - p.start;
        status = '<div class="status pending">' + esc(p.label) + ' in a moment<button class="btn small" data-act="undo" data-id="' + esc(i.id) + '">Undo</button></div><div class="countdown"><i style="animation-duration:' + PENDING_MS + 'ms;animation-delay:-' + el + 'ms"></i></div>';
      } else if (st === 'queued') {
        status = '<div class="status queued">' + svg(I.check, 18) + 'Sent. Your EA acts around ' + nextRun() + '.</div>';
      } else if (st === 'done') {
        status = '<div class="status ' + (dec === 'never' ? 'never' : 'done') + '">' + svg(I.check, 18) + esc(i.outcome || 'Done by your EA') + '</div>';
      }
      html.push('<article class="card house">' +
        '<div style="display:flex;gap:12px;align-items:flex-start"><div class="grow"><div class="price">' + esc(x.price || '') + '</div><div style="font-weight:700">' + esc(i.title) + '</div><div class="note" style="font-size:.8125rem">' + esc(x.listed || dayLabel(i.created)) + '</div></div>' +
        '<div class="score" aria-label="Score ' + esc(x.score) + ' out of 100">' + scoreRing(x.score) + '<b>' + esc(x.score || '–') + '</b><span>/100</span></div></div>' +
        '<div class="tags">' + ochip(i.for) + (x.chips || []).map(function (c) { return '<span class="soft">' + esc(c) + '</span>'; }).join('') + '</div>' +
        (x.why || x.lifestyle ? '<div class="why"><span class="h2" style="font-size:.75rem">Why this one</span><span>' + esc(x.why || '') + '</span>' + (x.lifestyle ? '<span class="note" style="font-size:.8125rem">' + esc(x.lifestyle) + '</span>' : '') + '</div>' : '') +
        (rows ? '<button class="row-between textbtn" style="color:var(--ink);min-height:44px;width:100%" data-act="score" data-id="' + esc(i.id) + '" aria-expanded="' + open + '"><span>Score breakdown</span><span style="color:var(--accentInk)">' + (open ? 'Hide' : 'Show') + '</span></button>' +
          '<div class="bars' + (open ? ' open' : '') + '" id="bars-' + esc(i.id) + '"><div>' + rows + '</div></div>' : '') +
        ((listing || map) ? '<div class="btns">' + (listing ? '<a class="btn" href="' + esc(listing) + '" target="_blank" rel="noopener">View listing ' + svg(I.ext, 14) + '</a>' : '') + (map ? '<a class="btn" href="' + esc(map) + '" target="_blank" rel="noopener">Commute map ' + svg(I.ext, 14) + '</a>' : '') + '</div>' : '') +
        attachBtn(i) +
        (st === 'new' ? '<div class="btns"><button class="btn big primary x2" data-act="house" data-id="' + esc(i.id) + '" data-v="approve">Approve</button><button class="btn big" data-act="house" data-id="' + esc(i.id) + '" data-v="skip">Skip</button><button class="btn big warn" data-act="house" data-id="' + esc(i.id) + '" data-v="never">Never</button></div>' : status) +
        '</article>');
    });
    return html;
  }

  function plan() {
    var html = [whoChips(), '<div class="note">The next three weeks, from your calendars and inbox.</div>'];
    var groups = planGroups();
    if (!groups.length) html.push('<div class="empty">Nothing coming up for this filter.</div>');
    groups.forEach(function (g) {
      html.push('<section class="stack"><h2 class="h2">' + g[0] + '</h2>' + g[1].map(function (i) {
        var x = i.data || {}, kind = x.kind || 'event', t = d(i.due), clash = kind === 'clash' && i.status === 'open';
        var pending = S.pending[i.id];
        var body = '';
        if (pending) {
          body = '<div class="status pending">' + esc(pending.label) + ' in a moment<button class="btn small" data-act="undo" data-id="' + esc(i.id) + '">Undo</button></div>';
        } else if (i.status === 'open') {
          if (kind === 'clash') {
            body = (x.options || []).map(function (o, k) {
              return '<button class="btn ' + (k === 0 ? 'primary' : '') + '" style="justify-content:flex-start;text-align:left" data-act="planact" data-id="' + esc(i.id) + '" data-v="option:' + esc(o.id) + '" data-label="' + esc(o.label) + '">' + esc(o.label) + '</button>';
            }).join('');
          } else {
            var acts = kind === 'deadline' ? [['add_calendar', 'Add to calendar'], ['remind', 'Remind me']] : [['add_calendar', 'Add to calendar']];
            body = '<div class="btns" style="justify-content:flex-start">' + acts.map(function (a) { return '<button class="btn small" style="flex:0 0 auto" data-act="planact" data-id="' + esc(i.id) + '" data-v="' + a[0] + '" data-label="' + esc(a[1] + ': ' + i.title) + '">' + a[1] + '</button>'; }).join('') + '</div>';
          }
        } else if (i.status === 'queued') {
          body = '<div class="status queued">' + svg(I.check, 18) + 'Sent. Your EA acts around ' + nextRun() + '.</div>';
        } else if (i.status === 'done') {
          body = '<div class="status done">' + svg(I.check, 18) + esc(i.outcome || 'Done') + '</div>';
        }
        return '<article class="card plan' + (clash ? ' clash' : '') + '"><div class="date"><small>' + (t ? DOW[t.getDay()] : '–') + '</small><b>' + (t ? t.getDate() : '') + '</b></div>' +
          '<div class="grow"><div class="tags"><span class="tag t-' + esc(kind) + '">' + (kind === 'clash' ? 'Clash' : kind === 'deadline' ? 'Deadline' : 'Event') + '</span>' + ochip(i.for) + '</div>' +
          '<b>' + esc(i.title) + '</b><div class="note" style="font-size:.8125rem">' + esc((t && (i.summary || '').indexOf(hhmm(i.due)) < 0 ? hhmm(i.due) + (i.summary ? ' · ' : '') : '') + (i.summary || '')) + '</div>' + body + attachBtn(i) + '</div></article>';
      }).join('') + '</section>');
    });
    return html;
  }

  function intel() {
    var mod = S.seg === 'mig' ? 'migration' : 'intel';
    var list = items(mod).sort(function (a, b) { return a.status === 'read' ? 1 : b.status === 'read' ? -1 : String(b.created).localeCompare(String(a.created)); });
    var html = ['<div class="seg" role="tablist" aria-label="Brief">' + [['mine', 'Yours'], ['mig', 'Migration']].map(function (s) {
      return '<button role="tab" aria-selected="' + (S.seg === s[0]) + '" data-act="seg" data-v="' + s[0] + '">' + s[1] + '</button>';
    }).join('') + '</div>',
    '<div class="note">' + (mod === 'migration' ? 'Sensitive. Shown only in the app, never in phone alerts.' : 'Your briefs, plus anything shared. Itunu’s stay private to her.') + '</div>'];
    if (!list.length) html.push('<div class="empty">Nothing new. Briefs arrive Mon and Thu at 09:00.</div>');
    list.forEach(function (i) {
      var x = i.data || {}, rag = x.rag || 'note', read = i.status === 'read', url = safeUrl(x.url);
      html.push('<article class="card pad stack" style="gap:8px;opacity:' + (read ? .62 : 1) + ';transition:opacity .3s">' +
        '<div class="tags"><span class="tag t-' + esc(rag) + '">' + (rag === 'act' ? 'Check' : rag === 'ok' ? 'All clear' : 'FYI') + '</span>' + ochip(i.for) + '<span class="note" style="font-size:.75rem">' + esc(x.source || dayLabel(i.created)) + '</span></div>' +
        '<b style="font-size:1rem;line-height:1.3">' + esc(i.title) + '</b>' + (i.summary ? '<div style="font-size:.875rem">' + esc(i.summary) + '</div>' : '') +
        (x.why ? '<div class="note" style="font-size:.8125rem"><b style="color:var(--ink)">Why it matters:</b> ' + esc(x.why) + '</div>' : '') +
        '<div class="btns" style="margin-top:4px">' + (url ? '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">Source ' + svg(I.ext, 14) + '</a>' : '') +
        '<button class="btn" data-act="askabout" data-v="' + esc('Tell me more about: ' + i.title) + '">Ask EA</button>' +
        '<button class="btn" style="flex:0 0 48px;padding:0" data-act="' + (i.status === 'open' ? 'snoozeitem' : 'attachfor') + '" data-id="' + esc(i.id) + '" aria-label="' + (i.status === 'open' ? 'Remind me later about ' : 'Add a file about ') + esc(i.title) + '">' + svg(i.status === 'open' ? I.snooze : I.clip, 18) + '</button>' +
        '<button class="btn good" data-act="read" data-id="' + esc(i.id) + '" aria-pressed="' + read + '">' + (read ? svg(I.check, 16) + 'Read' : 'Mark read') + '</button></div></article>');
    });
    return html;
  }

  function attachBtn(i) {
    var z = snoozeOf(i.id);
    return '<div class="cardtools"><button class="textbtn addfile" data-act="attachfor" data-id="' + esc(i.id) + '">' + svg(I.clip, 16) + 'Add a file</button>' +
      (z ? '<button class="textbtn addfile" data-act="unsnooze" data-id="' + esc(i.id) + '">' + svg(I.snooze, 16) + 'Snoozed to ' + esc(whenLabel(z.until)) + ' · undo</button>'
        : (i.status === 'open' ? '<button class="textbtn addfile" data-act="snoozeitem" data-id="' + esc(i.id) + '">' + svg(I.snooze, 16) + 'Remind me later</button>' : '')) + '</div>';
  }

  /* ───────── Lists: shared groceries + my jots ───────── */
  function lists() {
    var g = S.data.groceries || [], notes = S.data.notes || [];
    var toBuy = g.filter(function (x) { return !x.ticked; }), basket = g.filter(function (x) { return x.ticked; });
    var other = Object.keys(PEOPLE).filter(function (k) { return k !== S.person; }).map(function (k) { return PEOPLE[k]; })[0] || 'the family';
    var html = ['<div class="seg" role="tablist" aria-label="Lists">' + [['groceries', 'Groceries · ' + toBuy.length], ['mine', 'My list · ' + openNotes().length]].map(function (x) {
      return '<button role="tab" aria-selected="' + (S.listSeg === x[0]) + '" data-act="listseg" data-v="' + x[0] + '">' + esc(x[1]) + '</button>';
    }).join('') + '</div>'];
    if (S.listSeg === 'groceries') {
      html.push('<form class="addrow" id="g-form" autocomplete="off"><label class="sr" for="g-input">Add to the shopping list</label>' +
        '<input id="g-input" enterkeyhint="done" placeholder="Add an item, e.g. 2 milk" value="' + esc(S.gText) + '">' +
        '<button class="send" type="submit" aria-label="Add to list">' + svg(I.plus, 22) + '</button></form>');
      html.push('<div class="note" style="display:flex;align-items:center;gap:6px">' + ochip('both') + ' Shared with ' + esc(other) + ' · updates live</div>');
      var again = (S.gHistory || []).filter(function (n) { return !toBuy.some(function (x) { return x.name.toLowerCase() === n.toLowerCase(); }); }).slice(0, 8);
      if (again.length) html.push('<div class="stack" style="gap:6px"><span class="h2" style="font-size:.75rem">Add again</span><div class="chips">' + again.map(function (n) {
        return '<button class="fchip" data-act="gagain" data-v="' + esc(n) + '">+ ' + esc(n) + '</button>';
      }).join('') + '</div></div>');
      if (!toBuy.length && !basket.length) html.push('<div class="empty">The list is empty. Add the first thing you\u2019re running low on.</div>');
      AISLE_ORDER.forEach(function (a) {
        var rows = toBuy.filter(function (x) { return (x.aisle || aisleFor(x.name)) === a; });
        if (!rows.length) return;
        html.push('<section class="stack" style="gap:8px"><h2 class="h2">' + esc(a) + ' · ' + rows.length + '</h2><div class="list">' + rows.map(groceryRow).join('') + '</div></section>');
      });
      if (basket.length) html.push('<section class="stack" style="gap:8px"><div class="row-between"><h2 class="h2">In the basket · ' + basket.length + '</h2><button class="textbtn" data-act="gclear">Clear basket</button></div><div class="list basket">' + basket.map(groceryRow).join('') + '</div></section>');
    } else {
      var open = openNotes(), done = notes.filter(function (n) { return n.status === 'done'; });
      html.push('<button class="btn big olive" data-act="jot">' + svg(I.plus, 20) + 'Jot something down</button>');
      html.push('<div class="note">Only you see this list. Anything with a time gets a phone alert.</div>');
      if (!open.length) html.push('<div class="empty">Nothing jotted. When a thought pops up, tap + and get it out of your head.</div>');
      else html.push('<div class="list">' + open.map(noteRow).join('') + '</div>');
      if (done.length) html.push('<section class="stack" style="gap:8px"><h2 class="h2">Done recently · ' + done.length + '</h2><div class="list basket">' + done.map(noteRow).join('') + '</div></section>');
    }
    return html;
  }
  function groceryRow(x) {
    var by = x.addedBy === 'ea' ? 'EA' : (PEOPLE[x.addedBy] || '?').charAt(0);
    return '<div class="grow-row' + (x.ticked ? ' ticked' : '') + '"><button class="gcheck" data-act="' + (x.ticked ? 'guntick' : 'gtick') + '" data-id="' + esc(x.id) + '" aria-pressed="' + !!x.ticked + '" aria-label="' + (x.ticked ? 'Put back: ' : 'Got it: ') + esc(x.name) + '"><span class="box">' + (x.ticked ? svg(I.check, 16) : '') + '</span></button>' +
      '<span class="gname">' + esc(x.name) + (x.qty ? ' <span class="gqty">\u00d7' + esc(x.qty) + '</span>' : '') + '</span>' +
      '<span class="gby" title="Added by ' + esc(by) + '">' + esc(by) + '</span>' +
      (x.ticked ? '' : '<button class="fx" data-act="gremove" data-id="' + esc(x.id) + '" aria-label="Remove ' + esc(x.name) + '">' + svg(I.x, 16) + '</button>') + '</div>';
  }
  function noteRow(n) {
    var done = n.status === 'done', over = !done && n.remindAt && Date.parse(n.remindAt) < Date.now();
    return '<div class="grow-row' + (done ? ' ticked' : '') + '"><button class="gcheck" data-act="' + (done ? 'noteundo' : 'notedone') + '" data-id="' + esc(n.id) + '" aria-pressed="' + done + '" aria-label="' + (done ? 'Not done: ' : 'Done: ') + esc(n.text) + '"><span class="box">' + (done ? svg(I.check, 16) : '') + '</span></button>' +
      '<span class="col" style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0"><span class="gname">' + esc(n.text) + '</span>' +
      (n.remindAt && !done ? '<span class="s' + (over ? ' late' : '') + '" style="font-size:.75rem">' + svg(I.bell, 12) + ' ' + (over ? 'Was due ' : '') + esc(whenLabel(n.remindAt)) + '</span>' : (done ? '' : '<span class="s" style="font-size:.75rem;color:var(--muted)">No reminder</span>')) + '</span>' +
      (done ? '<button class="fx" data-act="notedelete" data-id="' + esc(n.id) + '" aria-label="Delete ' + esc(n.text) + '">' + svg(I.x, 16) + '</button>' : '<button class="btn small" data-act="snoozenote" data-id="' + esc(n.id) + '">Later</button>') + '</div>';
  }

  function whenPicker(withNone) {
    var opts = whenOptions().map(function (o) { return [o[0], o[1], whenLabel(o[2].toISOString())]; });
    if (withNone) opts.push(['none', 'No reminder', '']);
    opts.push(['pick', 'Pick a time', '']);
    return '<div class="whens" role="radiogroup" aria-label="Remind me">' + opts.map(function (o) {
      return '<button class="opt when" role="radio" aria-checked="' + (S.jotWhen === o[0]) + '" data-act="when" data-v="' + o[0] + '"><b>' + esc(o[1]) + '</b>' + (o[2] ? '<span>' + esc(o[2]) + '</span>' : '') + '</button>';
    }).join('') + '</div>' +
      (S.jotWhen === 'pick' ? '<label class="field"><span class="h2" style="font-size:.75rem">Date and time</span><input id="pick-time" type="datetime-local" value="' + esc(S.pickTime || localInputValue(new Date(Date.now() + 3600000))) + '"></label>' : '');
  }
  function chosenWhen() {
    if (S.jotWhen === 'none' || !S.jotWhen) return '';
    if (S.jotWhen === 'pick') { var v = (document.getElementById('pick-time') || {}).value || S.pickTime; var t = v ? new Date(v) : null; return t && !isNaN(t) ? t.toISOString() : ''; }
    var o = whenOptions().filter(function (x) { return x[0] === S.jotWhen; })[0];
    return o ? o[2].toISOString() : '';
  }
  function sheetWrap(label, inner) {
    var fresh = S.sheetFresh ? '' : ' style="animation:none"';
    return '<div class="scrim"' + fresh + '><button class="close-area" data-act="closesheet" aria-label="Close"></button><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(label) + '"' + fresh + '><div class="grab" aria-hidden="true"></div>' + inner + '</div></div>';
  }
  function jotSheet() {
    return sheetWrap('Jot it down', '<div class="row-between"><h2 style="margin:0;font-size:1.3rem">Jot it down</h2><button class="textbtn" data-act="closesheet">Cancel</button></div>' +
      '<label class="sr" for="jot-text">What do you need to remember?</label><textarea id="jot-text" rows="3" maxlength="500" placeholder="What\u2019s on your mind? e.g. Renew the car insurance">' + esc(S.jotText) + '</textarea>' +
      '<div class="note" style="font-size:.8125rem;margin-top:-8px">Tip: tap the microphone on your keyboard to say it instead.</div>' +
      '<div class="stack" style="gap:8px"><span class="h2" style="font-size:.75rem">Remind me</span>' + whenPicker(true) + '</div>' +
      '<div class="btns"><button class="btn" data-act="jotgrocery">' + svg(I.lists, 18) + 'It\u2019s shopping</button><button class="btn big primary x2" data-act="savejot">Save</button></div>');
  }
  function snoozeSheet() {
    var it = S.sheetItem || {};
    var title = it.kind === 'note' ? ((S.data.notes || []).filter(function (n) { return n.id === it.id; })[0] || {}).text : (findItem(it.id) || {}).title;
    return sheetWrap('Remind me later', '<div class="row-between"><h2 style="margin:0;font-size:1.3rem">Remind me later</h2><button class="textbtn" data-act="closesheet">Cancel</button></div>' +
      '<div class="why"><b>' + esc(title || '') + '</b><span class="note" style="font-size:.8125rem">It leaves your list for now and comes back with a phone alert.</span></div>' +
      whenPicker(false) + (S.jotWhen === 'pick' ? '<button class="btn big primary" data-act="dosnooze">Set reminder</button>' : ''));
  }

  function whoChips() {
    return '<div class="chips" role="group" aria-label="Show items for">' + [['all', 'All'], [S.person, S.name], ['both', 'Both'], ['either', 'Either']].map(function (w) {
      var cls = w[0] === 'all' ? '' : ' own ' + owner(w[0]).cls;
      return '<button class="fchip' + cls + '" data-act="who" data-v="' + w[0] + '" aria-pressed="' + (S.who === w[0]) + '">' + esc(w[1]) + '</button>';
    }).join('') + '</div>';
  }

  function historyView() {
    return ['<div class="search"><label class="sr" for="hist-q">Search history</label><input id="hist-q" type="search" autocomplete="off" placeholder="Search 6 months of history…" value="' + esc(S.hq) + '">' + svg(I.search, 20) + '</div>',
      '<div id="hist-results" class="stack" style="gap:16px">' + historyResults() + '</div>'];
  }
  function historyResults() {
    var months = last6Months();
    var keys = months.map(function (m) { return m.key; });
    var q = S.hq.trim().toLowerCase();
    var base = S.data.history.filter(function (h) {
      return keys.indexOf(monthKey(h.date)) > -1 && okWho(h.for) && (S.mod === 'all' || h.module === S.mod) &&
        (!q || (h.title + ' ' + h.outcome + ' ' + (h.detail || '')).toLowerCase().indexOf(q) > -1);
    });
    var shown = base.filter(function (h) { return S.month === 'all' || monthKey(h.date) === S.month; });
    var html = '<div class="stack" style="gap:6px"><span class="h2" style="font-size:.75rem">Month</span><div class="chips" role="group" aria-label="Month">' +
      [{ key: 'all', short: 'All', long: 'Last 6 months' }].concat(months).map(function (m) {
        var n = m.key === 'all' ? base.length : base.filter(function (h) { return monthKey(h.date) === m.key; }).length;
        return '<button class="mchip" data-act="month" data-v="' + m.key + '" aria-pressed="' + (S.month === m.key) + '"><b>' + m.short + '</b><span>' + n + '</span></button>';
      }).join('') + '</div></div>';
    html += '<div class="stack" style="gap:6px"><span class="h2" style="font-size:.75rem">Area</span><div class="chips" role="group" aria-label="Area">' +
      [['all', 'All areas']].concat(Object.keys(AREAS).map(function (k) { return [k, AREAS[k]]; })).map(function (a) {
        return '<button class="fchip" data-act="mod" data-v="' + a[0] + '" aria-pressed="' + (S.mod === a[0]) + '">' + a[1] + '</button>';
      }).join('') + '</div></div>';
    html += whoChips();
    var label = S.month === 'all' ? 'Last 6 months' : (months.filter(function (m) { return m.key === S.month; })[0] || {}).long;
    html += '<div class="summary" aria-live="polite">' + shown.length + ' item' + (shown.length === 1 ? '' : 's') + ' · ' + esc(label) + (S.who !== 'all' ? ' · ' + esc(owner(S.who).label) : '') + '</div>';
    if (!shown.length) return html + '<div class="empty">No history matches these filters.</div>';
    months.forEach(function (m) {
      var g = shown.filter(function (h) { return monthKey(h.date) === m.key; });
      if (!g.length) return;
      html += '<section class="stack" style="gap:8px"><h2 class="h2">' + m.long + ' · ' + g.length + '</h2><div class="list">' + g.map(function (h) {
        var w = owner(h.for), x = d(h.date);
        return '<button class="hrow" data-act="report" data-id="' + esc(h.id) + '"><span class="obadge sm ' + w.cls + '" aria-hidden="true">' + esc(w.short) + '</span>' +
          '<span class="col"><span class="row-between" style="align-items:baseline"><span class="t">' + esc(h.title) + '</span><span class="dt">' + (x ? x.getDate() + ' ' + MON[x.getMonth()] : '') + '</span></span>' +
          '<span class="o">' + esc(h.outcome) + '</span><span class="tags" style="margin-top:2px"><span class="tag t-mod">' + esc(AREAS[h.module] || 'Other') + '</span>' + ochip(h.for) + '</span></span><span class="chev">' + svg(I.chev, 18) + '</span></button>';
      }).join('') + '</div></section>';
    });
    return html;
  }

  function ask() {
    var msgs = S.data.messages.map(function (m) { return m; }).concat(S.instant || []).sort(function (a, b) { return String(a.ts).localeCompare(String(b.ts)); });
    var eaMsgs = S.data.messages.slice().sort(function (a, b) { return String(a.ts).localeCompare(String(b.ts)); });
    var lastEa = eaMsgs[eaMsgs.length - 1];
    var waiting = lastEa && lastEa.from === 'me' && lastEa.status !== 'failed' && lastEa.status !== 'answered';
    var html = ['<div class="bubbles">' + (msgs.length ? '' : '<div class="empty">Questions about your history, lists and what needs you are answered straight away. Jobs for your EA — apply, reply, book, anything timed — go to its next run: 9am, 1pm or 6pm.</div>') + msgs.map(function (m) {
      var att = (m.files || []).length ? '<div class="files">' + m.files.map(function (f) { return fileChip(f, false); }).join('') + '</div>' : '';
      var res = (m.results || []).length ? '<div class="results">' + m.results.map(function (h) {
        var x = d(h.date);
        return '<button class="rcard" data-act="report" data-id="' + esc(h.id) + '"><span class="col"><span class="t">' + esc(h.title) + '</span><span class="s">' + esc((AREAS[h.module] || 'Update') + ' · ' + (x ? DOW[x.getDay()] + ' ' + x.getDate() + ' ' + MON[x.getMonth()] : '') + (h.outcome ? ' · ' + h.outcome : '')) + '</span></span><span class="chev">' + svg(I.chev, 16) + '</span></button>';
      }).join('') + '</div>' : '';
      if (m.from === 'instant') return '<div class="bub ea instant"><div class="b">' + esc(m.text) + '</div>' + res + '<span class="m">' + svg(I.spark, 12) + ' Instant answer · ' + esc(relWhen(m.ts)) + '</span></div>';
      var me = m.from !== 'ea';
      var meta = me ? (m.instant ? 'Answered instantly' : m.status === 'sending' ? 'Sending…' : m.status === 'failed' ? 'Not sent' : m.status === 'answered' ? 'Done by your EA' : 'For your EA \u00b7 ' + runWhen().replace(/^its /, '')) : ('From your EA' + (runLabel(m.ts) ? '’s ' + runLabel(m.ts) : ''));
      return '<div class="bub ' + (me ? 'me' : 'ea') + '">' + att + '<div class="b">' + esc(m.text) + '</div><span class="m">' + esc(meta) + ' · ' + esc(relWhen(m.ts)) +
        (m.status === 'failed' ? ' <button class="textbtn" data-act="retry" data-id="' + esc(m.id) + '">Try again</button>' : '') + '</span></div>';
    }).join('') + (waiting ? '<div class="runnote">' + svg(I.snooze, 14) + ' Your EA picks up jobs at ' + runWhen() + '. Questions get an instant answer.</div>' : '') + '</div>',
    '<div class="chips wrap" aria-label="Suggestions">' + ['What needs me today?', 'What needs both of us?', 'Summarise this week', 'Latest intel', 'Shopping list'].map(function (t) {
      return '<button class="fchip" data-act="suggest" data-v="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('') + '</div>'];
    return html;
  }

  function composer() {
    var refItem = S.ref && findItem(S.ref);
    var tray = (S.files.length || S.reading || refItem) ? '<div class="tray">' +
      (refItem ? '<div class="refline">About: <b>' + esc(refItem.title) + '</b><button type="button" class="textbtn" data-act="clearref">Remove</button></div>' : '') +
      (S.files.length || S.reading ? '<div class="files">' + S.files.map(function (f) { return fileChip(f, true); }).join('') + (S.reading ? '<span class="file reading"><span class="ficon">' + svg(I.clip, 18) + '</span><span class="fcol"><span class="fname">Preparing\u2026</span></span></span>' : '') + '</div>' : '') + '</div>' : '';
    return '<form class="composer" id="chat-form" autocomplete="off">' + tray + '<div class="crow">' +
      '<input type="file" id="file-input" class="sr" multiple accept="image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.pptx,.txt,.csv" tabindex="-1" aria-hidden="true">' +
      '<button type="button" class="attach" data-act="attach" aria-label="Add a photo or document">' + svg(I.clip, 22) + '</button>' +
      '<label class="sr" for="chat-input">Message your EA</label>' +
      '<input id="chat-input" enterkeyhint="send" placeholder="Message your EA\u2026" value="' + esc(S.draft) + '">' +
      '<button class="send" type="submit" aria-label="Send">' + svg(I.send, 20) + '</button></div></form>';
  }

  function settingsSheet() {
    var p = S.prefs, me = owner(S.person);
    function opts(key, list) {
      return '<div class="opts" role="radiogroup">' + list.map(function (o) {
        return '<button class="opt" role="radio" aria-checked="' + (p[key] === o[0]) + '" data-act="pref" data-k="' + key + '" data-v="' + o[0] + '"' + (o[2] ? ' style="' + o[2] + '"' : '') + '>' + o[1] + '</button>';
      }).join('') + '</div>';
    }
    function sw(key, label, sub) {
      return '<button class="switch" role="switch" aria-checked="' + !!p[key] + '" data-act="toggle" data-k="' + key + '"><span style="flex:1;display:flex;flex-direction:column;gap:2px"><b style="font-size:.9375rem">' + label + '</b><span class="note" style="font-size:.8125rem">' + sub + '</span></span><span class="track" aria-hidden="true"><i></i></span></button>';
    }
    return '<div class="scrim" ' + (S.sheetFresh ? '' : 'style="animation:none"') + '><button class="close-area" data-act="closesettings" aria-label="Close settings"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="You and accessibility" ' + (S.sheetFresh ? '' : 'style="animation:none"') + '><div class="grab" aria-hidden="true"></div>' +
      '<div class="row-between"><h2 style="margin:0;font-size:1.3rem">You &amp; accessibility</h2><button class="btn small primary" data-act="closesettings">Done</button></div>' +
      '<div class="me-card"><span class="obadge ' + me.cls + '" style="border:2px solid var(--o-fg)">' + esc(me.short) + '</span><span style="display:flex;flex-direction:column;gap:2px"><b>Signed in as ' + esc(S.name) + '</b><span style="font-size:.8125rem;font-weight:600">You see your own items and shared ones. Nobody else’s.</span></span></div>' +
      '<div class="stack" style="gap:8px"><span class="h2" style="font-size:.75rem">Light or dark</span>' + opts('theme', [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Match phone']]) + '</div>' +
      '<div class="stack" style="gap:8px"><span class="h2" style="font-size:.75rem">Text size</span>' + opts('size', [['m', 'Aa', 'font-size:.95rem'], ['l', 'Aa', 'font-size:1.2rem'], ['xl', 'Aa', 'font-size:1.45rem']]) + '</div>' +
      '<div class="stack" style="gap:8px"><span class="h2" style="font-size:.75rem">Font</span>' + opts('font', [['cambria', 'Cambria', "font-family:'Cambria Math',Cambria,'Iowan Old Style',Georgia,serif"], ['sans', 'Rounded', "font-family:Nunito,system-ui,sans-serif"], ['easy', 'Easy-read', "font-family:'Atkinson Hyperlegible',Verdana,sans-serif"]]) + '</div>' +
      '<div class="list">' + sw('hc', 'High contrast', 'Darker text and stronger edges') + sw('rm', 'Reduce motion', 'No slide or fade effects') + '</div>' +
      wellnessSection() +
      alertsSection() +
      '<div class="stack" style="gap:8px">' + (S.demo ? '<button class="btn" data-act="exitdemo">Leave the demo</button>' :
        (S.unlinkAsk ? '<div class="note">Unlink this phone? You’ll need your key to link it again.</div><div class="btns"><button class="btn" data-act="unlinkno">Keep linked</button><button class="btn warn" data-act="unlinkyes">Unlink</button></div>'
          : '<button class="btn" data-act="copykey">Copy my key</button><button class="btn" data-act="unlinkask">Unlink this phone</button>')) +
      '<div class="note center" style="font-size:.75rem">Settings are saved on this phone only · v' + VERSION + '</div></div></div></div>';
  }

  function wellnessSection() {
    var p = S.prefs, g = p.game || ((CFG.GAMES || {})[S.person]) || 'puzzle';
    function o(key, cur, list) { return '<div class="opts" role="radiogroup">' + list.map(function (x) { return '<button class="opt" role="radio" aria-checked="' + (String(cur) === String(x[0])) + '" data-act="pref" data-k="' + key + '" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>'; }
    return '<div class="stack" style="gap:8px"><span class="h2" style="font-size:.75rem">Wellness</span>' +
      '<span class="note" style="font-size:.8125rem">Daily water goal</span>' + o('waterGoal', p.waterGoal, [['6', '6 glasses'], ['8', '8 glasses'], ['10', '10 glasses']]) +
      '<span class="note" style="font-size:.8125rem">Each glass unlocks</span>' + o('game', g, [['puzzle', 'Brain puzzle'], ['french', 'French'], ['off', 'Nothing']]) +
      '<div class="list"><button class="switch" role="switch" aria-checked="' + !!p.quotes + '" data-act="toggle" data-k="quotes"><span style="flex:1;display:flex;flex-direction:column;gap:2px"><b style="font-size:.9375rem">Quote or verse on Today</b><span class="note" style="font-size:.8125rem">A new one each time you open the app</span></span><span class="track" aria-hidden="true"><i></i></span></button></div></div>';
  }

  function alertsSection() {
    var a = S.data.alerts || {};
    function asw(key, label, sub) {
      return '<button class="switch" role="switch" aria-checked="' + (a[key] !== false) + '" data-act="aprefs" data-k="' + key + '"><span style="flex:1;display:flex;flex-direction:column;gap:2px"><b style="font-size:.9375rem">' + label + '</b><span class="note" style="font-size:.8125rem">' + sub + '</span></span><span class="track" aria-hidden="true"><i></i></span></button>';
    }
    var state;
    if (S.demo) state = '<div class="note">Alerts are switched off in the demo.</div>';
    else if (!pushSupported()) state = isIOS() && !isStandalone()
      ? '<div class="note">Open Family EA from its <b>Home Screen icon</b>, then come back here to turn alerts on. iPhones only allow alerts from Home Screen apps.</div>'
      : '<div class="note">This browser can\u2019t show Family EA alerts. On iPhone, use the Home Screen app.</div>';
    else if (S.pushOn) state = '<div class="pushon">' + svg(I.check, 16) + ' Alerts are on for this ' + (isIOS() ? 'phone' : 'device') + '.</div>' +
      '<div class="btns"><button class="btn" data-act="testalert">Send a test alert</button><button class="btn" data-act="pushoff">Turn off here</button></div>';
    else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') state = '<div class="note">Notifications are blocked for Family EA. On iPhone: Settings \u203a Notifications \u203a Family EA \u203a Allow Notifications. Then try again.</div><button class="btn" data-act="pushon">Try again</button>';
    else state = '<button class="btn big primary" data-act="pushon">' + svg(I.bell, 18) + 'Turn on alerts on this ' + (isIOS() ? 'phone' : 'device') + '</button><div class="note" style="font-size:.8125rem">Your phone will ask to allow notifications. Tap Allow.</div>';
    return '<div class="stack" style="gap:8px"><span class="h2" style="font-size:.75rem">Phone alerts</span>' +
      '<div class="card pad stack" style="box-shadow:none;gap:10px"><b>' + svg(I.bell, 16) + ' Reminders from Family EA</b>' +
      '<span class="note" style="font-size:.8125rem">Alerts come from the Family EA app itself and show the task, so you know what to do. Tap one to open the app.' + (a.devices ? ' On for ' + a.devices + ' device' + (a.devices === 1 ? '' : 's') + '.' : '') + '</span>' +
      state + '</div>' +
      '<div class="stack" style="gap:6px"><span class="h2" style="font-size:.75rem">Daily</span><div class="list">' + asw('morning', 'Morning plan, 8am', 'Your 3 things for today, plus a quote or verse') + asw('evening', 'Evening check, 8pm', 'What\u2019s on tomorrow, and anything to jot down') + '</div></div>' +
      '<div class="stack" style="gap:6px"><span class="h2" style="font-size:.75rem">Gentle nudges \u00b7 only when useful, at most 3 a day</span><div class="list">' +
      asw('water', 'Water check, 3pm', 'Only if you\u2019re behind on glasses') + asw('open5', 'Still open, 5pm', 'Only if something due today is left') +
      asw('week', 'Week ahead, Sunday 6pm', 'What\u2019s coming up in the next 7 days') + asw('reply', 'When your EA replies', 'So you don\u2019t have to keep checking') + '</div></div>' +
      '<div class="stack" style="gap:6px"><span class="h2" style="font-size:.75rem">Quiet hours</span><div class="opts" role="radiogroup">' + [['22-7', '10pm\u20137am'], ['21-8', '9pm\u20138am'], ['off', 'Off']].map(function (q) {
        return '<button class="opt" role="radio" aria-checked="' + ((a.quiet || '22-7') === q[0]) + '" data-act="aquiet" data-v="' + q[0] + '">' + q[1] + '</button>'; }).join('') + '</div>' +
      '<span class="note" style="font-size:.8125rem">Nothing buzzes in quiet hours. Reminders you set wait until they end.</span>' +
      (a.paused ? '<button class="btn" data-act="apause" data-v="0">' + svg(I.bell, 16) + 'Nudges paused today \u00b7 Resume</button>' : '<button class="btn" data-act="apause" data-v="1">' + svg(I.snooze, 16) + 'Pause nudges for today</button>') +
      '<span class="note" style="font-size:.75rem">Pausing keeps your own reminders. Everything else is quiet until tomorrow.</span></div></div>';
  }
  function checkPush() {
    if (S.demo || !pushSupported()) return Promise.resolve();
    return navigator.serviceWorker.getRegistration().then(function (r) { return r ? r.pushManager.getSubscription() : null; })
      .then(function (sub) { var on = !!sub && Notification.permission === 'granted'; if (on !== S.pushOn) { S.pushOn = on; if (S.sheet === 'settings') renderOverlay(); } }).catch(function () {});
  }
  function enablePush() {
    var vapid = (S.data.alerts || {}).vapid;
    if (!vapid) { toast('Alerts aren\u2019t ready yet. Pull to refresh and try again.'); return; }
    var perm = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    Promise.resolve(perm).then(function (p) {
      if (p !== 'granted') { toast('Notifications weren\u2019t allowed. You can change this in your phone\u2019s Settings.', { ms: 6000 }); renderOverlay(); return; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (old) { return old || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapid) }); });
      }).then(function (sub) {
        return IDB.set('seen', new Date().toISOString()).then(function () { return IDB.set('cfg', { key: S.key, api: CFG.API_URL, person: S.person }); })
          .then(function () { return api.post({ type: 'pushsub', op: 'add', sub: sub.toJSON() }); });
      }).then(function (r) {
        if (!r || !r.ok) throw new Error(r && r.error);
        S.pushOn = true; S.data.alerts.devices = r.devices; renderOverlay();
        toast('Alerts are on. Send yourself a test.');
      });
    }).catch(function () { toast('Couldn\u2019t turn alerts on. Check your connection and try again.'); });
  }
  function disablePush() {
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return;
      var j = sub.toJSON();
      return sub.unsubscribe().then(function () { return api.post({ type: 'pushsub', op: 'remove', sub: j }); });
    }).then(function () { S.pushOn = false; renderOverlay(); toast('Alerts are off on this device.'); }, function () { toast('Couldn\u2019t turn alerts off. Try again.'); });
  }

  function linkScreen() {
    var hasApi = !!CFG.API_URL;
    var keyFromHash = (location.hash.match(/key=([A-Za-z0-9]+)/) || [])[1] || '';
    return '<div class="welcome enter">' +
      '<img class="logo" src="icons/icon-192.png" alt="" style="--i:0">' +
      '<div style="--i:1"><h1>Family EA</h1><p class="note" style="font-size:1rem;margin:6px 0 0">Your family assistant, in your pocket.</p></div>' +
      '<section class="card pad stack" style="--i:2"><b>Link this phone</b>' +
      (hasApi ? '<ol class="steps"><li>Ask Ayo for your private key (it’s made once, in the back end).</li><li>Paste it below.</li></ol>' +
        '<div class="field"><label for="key-input" class="h2" style="font-size:.75rem">Your private key</label><input id="key-input" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(keyFromHash) + '" placeholder="Paste your key"></div>' +
        (S.linkError ? '<div class="err" role="alert">' + esc(S.linkError) + '</div>' : '') +
        '<button class="btn big primary" data-act="link">Link this phone</button>'
        : '<div class="note">The back end isn’t connected yet. Follow step 3 in SETUP.md, then reload.</div>') +
      '</section>' +
      '<button class="btn big olive" style="--i:3" data-act="demo">Try the demo first</button>' +
      '<p class="note center" style="--i:4;font-size:.8125rem">Private by design: each person sees only their own items and shared ones.</p></div>';
  }

  function skeleton() {
    return '<header class="top"><div class="skel" style="height:18px;width:40%"></div><div class="skel" style="height:30px;width:70%"></div></header><main>' +
      '<div class="tiles"><div class="skel" style="height:96px"></div><div class="skel" style="height:96px"></div><div class="skel" style="height:96px"></div></div>' +
      '<div class="skel" style="height:220px"></div><div class="skel" style="height:160px"></div></main>';
  }

  /* ───────── instant answers (no waiting for a run) ───────── */
  var MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  function monthIndex(m) { return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(String(m).slice(0, 3).toLowerCase()); }
  var MOD_WORDS = {
    intel: /\b(intel|brief|briefing|briefs|regulat\w*|fca|aml|fatf|sanctions?|crypto|compliance|fincrime)\b/i,
    migration: /\b(migration|visa|immigration|ilr|settlement|home office|express entry|sponsor\w*)\b/i,
    houses: /\b(house|houses|home|homes|property|properties|rent|rental|viewing|viewings|flat|tracker|letting)\b/i,
    plan: /\b(plan|plans|calendar|event|events|clash|clashes|deadline|deadlines|appointment|appointments)\b/i,
    commands: /\b(request|requests|command|commands)\b/i
  };
  var STOP = ('the a an and or of to in on at for from with about what whats which when where who why how did does do is are was were has have had any anything ' +
    'me my our us we you your it its this that these those there their them they can could would should please tell show give find get pull open bring look up ' +
    'last this next week month today yesterday report email item thing things one some all more summary summarise summarize said say sent send').split(' ');
  function parseQuery(text) {
    var t = String(text || '').toLowerCase(), now = new Date(), range = null, label = '', m;
    function dayRange(y, mo, dd) { var a = new Date(y, mo, dd); var b = new Date(y, mo, dd, 23, 59, 59); return { from: a.getTime(), to: b.getTime(), day: true }; }
    function fixYear(mo, dd) { var y = now.getFullYear(); if (new Date(y, mo, dd) > now) y--; return y; }
    if ((m = t.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?' + MONTH_RE + '\\b')))) { var mo = monthIndex(m[2]), dd = +m[1]; range = dayRange(fixYear(mo, dd), mo, dd); }
    else if ((m = t.match(new RegExp('\\b' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b')))) { var mo2 = monthIndex(m[1]), d2 = +m[2]; range = dayRange(fixYear(mo2, d2), mo2, d2); }
    else if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) { var y3 = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : fixYear(+m[2] - 1, +m[1]); range = dayRange(y3, +m[2] - 1, +m[1]); }
    else if (/\btoday\b/.test(t)) range = dayRange(now.getFullYear(), now.getMonth(), now.getDate());
    else if (/\byesterday\b/.test(t)) { var yd = new Date(now.getTime() - 86400000); range = dayRange(yd.getFullYear(), yd.getMonth(), yd.getDate()); }
    else if (/\bthis week\b/.test(t)) { var ws = dayStart(now); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7)); range = { from: ws.getTime(), to: now.getTime() }; label = 'this week'; }
    else if (/\blast week\b/.test(t)) { var lw = dayStart(now); lw.setDate(lw.getDate() - ((lw.getDay() + 6) % 7) - 7); range = { from: lw.getTime(), to: lw.getTime() + 7 * 86400000 - 1 }; label = 'last week'; }
    else if (/\blast month\b/.test(t)) { var lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); range = { from: lm.getTime(), to: new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1 }; label = 'last month'; }
    else if (/\bthis month\b/.test(t)) { range = { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: now.getTime() }; label = 'this month'; }
    else if ((m = t.match(new RegExp('\\b(?:in|during|from)\\s+' + MONTH_RE + '\\b')))) { var mi = monthIndex(m[1]), yy = now.getFullYear(); if (mi > now.getMonth()) yy--; range = { from: new Date(yy, mi, 1).getTime(), to: new Date(yy, mi + 1, 1).getTime() - 1 }; label = 'in ' + MONTH[mi]; }
    if (range && range.day) label = dayLabel(new Date(range.from).toISOString());
    var mod = null;
    Object.keys(MOD_WORDS).forEach(function (k) { if (!mod && MOD_WORDS[k].test(t)) mod = k; });
    var words = t.replace(new RegExp(MONTH_RE, 'g'), ' ').replace(/[^a-z0-9À-ſ]+/g, ' ').split(' ').filter(function (w) {
      return w.length >= 3 && STOP.indexOf(w) < 0 && !/^\d+(st|nd|rd|th)?$/.test(w) && !Object.keys(MOD_WORDS).some(function (k) { return MOD_WORDS[k].test(w); });
    });
    return { range: range, label: label, mod: mod, words: words };
  }
  function searchHistory(pq, widen) {
    var hist = S.data.history.filter(function (h) { return canSee(h.for); });
    var r = pq.range, pad = widen ? 3 * 86400000 : 0;
    return hist.map(function (h) {
      var t = Date.parse(h.date) || 0, score = 0;
      if (r) { if (t < r.from - pad || t > r.to + pad) return null; score += 5; }
      if (pq.mod) { if (h.module !== pq.mod) return null; score += 3; }
      var title = String(h.title).toLowerCase(), rest = (String(h.outcome) + ' ' + String(h.detail || '')).toLowerCase();
      pq.words.forEach(function (w) { if (title.indexOf(w) > -1) score += 2; else if (rest.indexOf(w) > -1) score += 1; });
      if (!r && !pq.mod && score === 0) return null;
      return { h: h, score: score, t: t };
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score || b.t - a.t; }).slice(0, 5).map(function (x) { return x.h; });
  }
  function classify(text) {
    var t = String(text || '').trim().toLowerCase(), pq = parseQuery(t);
    var lookupish = !!(pq.range || pq.mod);
    if (/^remind me\b/.test(t)) return 'jot';
    if (/^(find|show|pull up|get|open|bring up|look up|look for|search|tell me about|give me|what about|any news on|latest|last|recent|newest)\b/.test(t) && lookupish) return 'lookup';
    if (/^(please\s+)?(can you\s+|could you\s+|will you\s+)?(apply|submit|reply|respond|email|send|book|schedule|add|put|cancel|move|reschedule|approve|skip|never|contact|call|ring|draft|write|update|change|delete|pay|order|buy|chase|follow up|set up|arrange|research|find|look into|check|compare|organi[sz]e|sort|prepare|make|create|renew|sign)\b/.test(t)) return 'action';
    if (/^(what|when|which|where|who|why|how|did|do|does|is|are|was|were|has|have|had|any|anything|summar|recap|list|show|tell|give)\b/.test(t) || /\?\s*$/.test(t)) return 'question';
    if (lookupish && t.split(/\s+/).length <= 8) return 'lookup';
    return 'other';
  }
  function needsLine(x) { return x.title + (x.sub ? ' — ' + x.sub : ''); }
  function builtIn(t) {
    t = t.toLowerCase();
    var all = needs();
    if (/needs? (both|the two) of us|for both of us|needs us both/.test(t)) {
      var b = all.filter(function (x) { return x.owner === 'both'; });
      return { text: b.length ? 'These need you both:\n' + b.map(function (x, i) { return (i + 1) + '. ' + needsLine(x); }).join('\n') : 'Nothing needs you both right now.' };
    }
    if (/what needs me|needs my attention|on my plate|what (do|should) i (do|focus)|my (3|three) for today|to ?do today/.test(t)) {
      var mine = dueNotes().map(function (n) { return n.text + ' (reminder)'; }).concat(all.map(needsLine));
      return { text: mine.length ? 'Here’s what needs you:\n' + mine.slice(0, 8).map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') + (mine.length > 8 ? '\n…and ' + (mine.length - 8) + ' more on Today.' : '') : 'Nothing needs you right now. Enjoy the breather.' };
    }
    if (/grocer|shopping( list)?|what do we need to buy/.test(t)) {
      var g = S.data.groceries.filter(function (x) { return !x.ticked; });
      return { text: g.length ? 'On the shopping list (' + g.length + '):\n' + g.map(function (x) { return '• ' + x.name + (x.qty ? ' × ' + x.qty : ''); }).join('\n') : 'The shopping list is empty.' };
    }
    if (/\b(my )?(jots|notes|reminders)\b/.test(t) && !/^remind me/.test(t)) {
      var n = openNotes();
      return { text: n.length ? 'Your jots (' + n.length + '):\n' + n.map(function (x) { return '• ' + x.text + (x.remindAt ? ' — ' + whenLabel(x.remindAt) : ''); }).join('\n') : 'You have no open jots.' };
    }
    if (/summar|recap|what happened|catch me up/.test(t)) {
      var pq = parseQuery(t); if (!pq.range) pq = parseQuery('this week');
      var full = S.data.history.filter(function (h) { var x = Date.parse(h.date) || 0; return canSee(h.for) && x >= pq.range.from && x <= pq.range.to && (!pq.mod || h.module === pq.mod); });
      if (!full.length) return { text: 'Nothing from your EA ' + (pq.label || 'in that time') + ' yet.' };
      var by = {};
      full.forEach(function (h) { (by[h.module] = by[h.module] || []).push(h); });
      return { text: 'Here’s ' + (pq.label || 'that period') + ' (' + full.length + ' update' + (full.length === 1 ? '' : 's') + '):\n' + Object.keys(by).map(function (k) { return (AREAS[k] || 'Other') + ': ' + by[k].length; }).join(' · '), results: full.slice(0, 5) };
    }
    return null;
  }
  function saveInstant() { S.instant = S.instant.slice(-80); LS.set('fea.instant', S.instant); }
  function answerInstantly(text) {
    var now = new Date().toISOString();
    var mine = { id: 'q' + Date.now(), ts: now, from: 'me', text: text, instant: true };
    var built = builtIn(text);
    var reply;
    if (built) reply = { text: built.text, results: (built.results || []).map(slimHist) };
    else {
      var pq = parseQuery(text), res = searchHistory(pq), near = false;
      if (!res.length && pq.range) { res = searchHistory(pq, true); near = res.length > 0; }
      if (res.length) {
        var what = pq.mod ? (AREAS[pq.mod] || 'Updates') : 'Updates';
        reply = { text: (near ? 'Nothing on ' + pq.label + ' exactly. The closest ' + what.toLowerCase() + ':' : (pq.label ? what + ' from ' + pq.label + ':' : pq.mod ? 'Latest ' + what.toLowerCase() + ':' : 'Here’s what I found in your history:')) + '\nTap one to see the full breakdown.', results: res.map(slimHist) };
      }
    }
    if (!reply) return false;
    S.instant.push(mine, { id: 'a' + Date.now(), ts: new Date(Date.now() + 1).toISOString(), from: 'instant', text: reply.text, results: reply.results || [] });
    saveInstant();
    return true;
  }
  function slimHist(h) { return { id: h.id, title: h.title, date: h.date, outcome: h.outcome, module: h.module, for: h.for }; }
  // Which scheduled run an EA reply came from, e.g. "1pm run".
  function runLabel(ts) {
    var x = d(ts); if (!x) return '';
    var runs = CFG.EA_RUNS || [['08:47', '9am'], ['12:47', '1pm'], ['17:47', '6pm']], mins = x.getHours() * 60 + x.getMinutes(), best = '';
    runs.forEach(function (r) { var hm = r[0].split(':'), st = +hm[0] * 60 + +hm[1]; if (mins >= st && mins - st < 180) best = r[1] + ' run'; });
    return best;
  }

  /* ───────── report breakdown (tap a History item) ───────── */
  function openReport(id) {
    S.sheet = 'report'; S.sheetItem = { id: id }; S.sheetFresh = true; renderOverlay();
    if (S.reports[id] && S.reports[id].ok) return;
    S.reports[id] = { loading: true };
    api.report(id).then(function (r) { S.reports[id] = r && r.ok ? r : { error: (r && r.error) || 'failed' }; }, function () { S.reports[id] = { error: 'offline' }; })
      .then(function () { if (S.sheet === 'report' && S.sheetItem && S.sheetItem.id === id) renderOverlay(); });
  }
  function reportBlocks(blocks) {
    var out = '', inList = false;
    (blocks || []).forEach(function (b) {
      var links = (b.links || []).map(function (l) { var u = safeUrl(l.url); return u ? '<a class="rlink" href="' + esc(u) + '" target="_blank" rel="noopener">' + svg(I.ext, 14) + esc(String(l.text || 'Open link').slice(0, 60)) + '</a>' : ''; }).join('');
      if (b.t === 'li') { if (!inList) { out += '<ul class="rlist">'; inList = true; } out += '<li>' + esc(b.text) + links + '</li>'; return; }
      if (inList) { out += '</ul>'; inList = false; }
      out += b.t === 'h' ? '<h3 class="rh">' + esc(b.text) + '</h3>' + links : '<p class="rp">' + esc(b.text) + (links ? '<span class="rlinks">' + links + '</span>' : '') + '</p>';
    });
    if (inList) out += '</ul>';
    return out;
  }
  function reportSheet() {
    var id = (S.sheetItem || {}).id, h = S.data.history.filter(function (x) { return x.id === id; })[0] || {};
    var r = S.reports[id] || { loading: true }, x = d(r.date || h.date), base = r.ok ? r : h;
    var glance = uniqLines([base.outcome, base.summary, base.detail]);
    var head = '<div class="row-between"><span class="tags"><span class="tag t-mod">' + esc(AREAS[base.module] || 'Other') + '</span>' + (base.for ? ochip(base.for) : '') + '</span><button class="textbtn" data-act="closesheet">Close</button></div>' +
      '<div class="stack" style="gap:4px"><h2 style="margin:0;font-size:1.3rem;line-height:1.25">' + esc(base.title || 'Report') + '</h2><span class="note" style="font-size:.8125rem">' + (x ? esc(DOW[x.getDay()] + ' ' + x.getDate() + ' ' + MONTH[x.getMonth()] + ' ' + x.getFullYear() + ' · ' + hhmm(x.toISOString())) : '') + (r.subject && r.subject !== base.title ? ' · ' + esc(r.subject) : '') + '</span></div>';
    var body = '<section class="card pad stack rglance"><span class="h2" style="font-size:.75rem;color:var(--olive)">At a glance</span>' +
      (glance.length ? glance.map(function (g) { return '<p class="rp">' + esc(g) + '</p>'; }).join('') : '<p class="note">No summary was saved for this one.</p>') +
      (r.why ? '<div class="why"><b>Why this matters to you</b><span>' + esc(r.why) + '</span></div>' : '') +
      (r.due ? '<p class="note" style="font-size:.8125rem">' + svg(I.plan, 14) + ' Due ' + esc(whenLabel(r.due)) + '</p>' : '') +
      (r.source ? '<p class="note" style="font-size:.8125rem">Source: ' + esc(r.source) + '</p>' : '') +
      (safeUrl(r.url) ? '<a class="btn small" href="' + esc(safeUrl(r.url)) + '" target="_blank" rel="noopener">' + svg(I.ext, 16) + 'Open the source</a>' : '') + '</section>';
    if (r.loading) body += '<section class="stack" aria-label="Loading the full report"><div class="skel" style="height:16px;width:60%"></div><div class="skel" style="height:14px"></div><div class="skel" style="height:14px;width:85%"></div><div class="skel" style="height:14px;width:70%"></div></section>';
    else if (r.error) body += '<div class="note">' + (r.error === 'offline' ? 'You’re offline, so only the summary is shown.' : 'The full email isn’t available for this one, so only the summary is shown.') + '</div>';
    else {
      if ((r.blocks || []).length) body += '<section class="stack rfull"><span class="h2" style="font-size:.75rem">The full report</span>' + reportBlocks(r.blocks) + '</section>';
      if (r.hidden) body += '<div class="note" style="font-size:.8125rem">Parts of this email meant for someone else are left out.</div>';
      if ((r.related || []).length) body += '<section class="stack" style="gap:8px"><span class="h2" style="font-size:.75rem">Also in this email</span><div class="list">' + r.related.map(function (o) {
        return '<button class="rowbtn" data-act="report" data-id="' + esc(o.id) + '"><span class="col"><span class="t">' + esc(o.title) + '</span><span class="s">' + esc(o.summary || '') + '</span></span><span class="chev">' + svg(I.chev, 18) + '</span></button>';
      }).join('') + '</div></section>';
    }
    var askText = 'About “' + (base.title || '') + '” (' + (x ? x.getDate() + ' ' + MON[x.getMonth()] : '') + '): ';
    body += '<div class="btns"><button class="btn" data-act="askabout" data-v="' + esc(askText) + '">' + svg(I.chat, 18) + 'Ask EA about this</button>' + (findItem(id) ? '<button class="btn primary" data-act="openitem" data-id="' + esc(id) + '">Go to it</button>' : '') + '</div>';
    return sheetWrap('Report', head + body);
  }
  function uniqLines(list) { var seen = {}; return list.map(function (x) { return String(x || '').trim(); }).filter(function (x) { var k = x.toLowerCase(); if (!x || seen[k]) return false; seen[k] = 1; return true; }); }

  /* ───────── quotes, water and mini challenges ───────── */
  var QUOTES = window.FEA_QUOTES || [];
  function quoteCard() {
    if (!S.prefs.quotes || !QUOTES.length) return '';
    var q = QUOTES[S.quoteIdx % QUOTES.length];
    return '<section class="card pad quote" aria-label="Thought for today"><div class="row-between"><span class="h2" style="font-size:.7rem;color:var(--olive)">' + svg(I.leaf, 13) + ' ' + esc(q.k || 'Thought') + '</span>' +
      '<button class="textbtn" data-act="newquote" aria-label="Show another quote">' + svg(I.shuffle, 16) + '</button></div>' +
      '<blockquote><p>“' + esc(q.t) + '”</p><footer>' + esc(q.a) + '</footer></blockquote></section>';
  }
  function todayKey() { var n = new Date(); return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); }
  function waterGoal() { return +S.prefs.waterGoal || 8; }
  function glasses(k) { return +(S.water[k || todayKey()] || 0); }
  function waterStreak() {
    var goal = waterGoal(), n = 0, x = new Date();
    if (glasses() < goal) x.setDate(x.getDate() - 1); // today still counts if not finished yet
    for (var i = 0; i < 400; i++) {
      var k = x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
      if (+(S.water[k] || 0) >= goal) { n++; x.setDate(x.getDate() - 1); } else break;
    }
    return n;
  }
  function gameKind() { var g = S.prefs.game || ((CFG.GAMES || {})[S.person]) || 'puzzle'; return g; }
  function gameState(kind) { return LS.get('fea.game.' + kind, { level: 1, run: 0, played: 0, correct: 0, best: 1 }); }
  function waterCard() {
    var goal = waterGoal(), have = glasses(), streak = waterStreak(), kind = gameKind();
    var drops = ''; for (var i = 0; i < goal; i++) drops += '<span class="drop' + (i < have ? ' full' : '') + '" aria-hidden="true">' + svg(I.drop, 18) + '</span>';
    var gs = kind !== 'off' && window.FEA_GAMES ? gameState(kind) : null;
    return '<section class="card pad stack water" aria-label="Water today"><div class="row-between"><b>' + svg(I.drop, 16) + ' Water</b><span class="note" style="font-size:.8125rem">' + (streak ? streak + '-day streak' : 'Start a streak today') + '</span></div>' +
      '<div class="drops" role="img" aria-label="' + have + ' of ' + goal + ' glasses">' + drops + '</div>' +
      '<div class="wrow"><button class="btn small olive" data-act="waterplus">' + svg(I.plus, 16) + 'Add a glass</button>' +
      '<button class="btn small" data-act="waterminus" aria-label="Take one glass off"' + (have ? '' : ' disabled') + '>' + svg(I.minus, 16) + '</button>' +
      '<span class="wcount"><b>' + have + '</b> of ' + goal + ' glasses' + (have >= goal ? ' \u00b7 goal met' : '') + '</span></div>' +
      (gs ? '<div class="note" style="font-size:.8125rem">Each glass unlocks a quick ' + (kind === 'french' ? 'French challenge' : 'brain puzzle') + ' · level ' + gs.level + '</div>' : '') + '</section>';
  }
  var waterTimer;
  function syncWater() {
    if (S.demo) return;
    clearTimeout(waterTimer);
    waterTimer = setTimeout(function () { api.post({ type: 'prefs', waterLog: { day: todayKey(), n: glasses(), goal: waterGoal(), game: gameKind() } }).catch(function () {}); }, 1500);
  }
  function addGlass() {
    var k = todayKey(), goal = waterGoal();
    S.water[k] = glasses() + 1;
    var keep = {}; Object.keys(S.water).sort().slice(-400).forEach(function (x) { keep[x] = S.water[x]; }); S.water = keep;
    LS.set('fea.water', S.water); syncWater();
    if (S.water[k] === goal) toast('Water goal met. Well done!');
    var kind = gameKind();
    if (kind !== 'off' && window.FEA_GAMES) startChallenge(kind); else render();
  }
  function startChallenge(kind) {
    var gs = gameState(kind);
    S.challenge = { c: window.FEA_GAMES.make(kind, gs.level), picked: null };
    S.sheet = 'challenge'; S.sheetItem = null; S.sheetFresh = true;
    render(); renderOverlay();
  }
  function answerChallenge(choice) {
    var ch = S.challenge; if (!ch || ch.picked !== null) return;
    ch.picked = choice;
    var right = choice === ch.c.a, kind = ch.c.kind;
    var before = gameState(kind), after = window.FEA_GAMES.next(before, kind, right);
    LS.set('fea.game.' + kind, after);
    ch.levelUp = after.level > before.level; ch.levelDown = after.level < before.level; ch.right = right;
    renderOverlay();
  }
  function challengeSheet() {
    var ch = S.challenge; if (!ch) return '';
    var c = ch.c, kind = c.kind, gs = gameState(kind), have = glasses();
    var opts = '<div class="copts">' + c.o.map(function (o) {
      var cls = ch.picked === null ? '' : o === c.a ? ' right' : o === ch.picked ? ' wrong' : ' dim';
      return '<button class="copt' + cls + '" data-act="canswer" data-v="' + esc(o) + '"' + (ch.picked !== null ? ' aria-disabled="true"' : '') + '>' + esc(o) + '</button>';
    }).join('') + '</div>';
    var fb = ch.picked === null ? '' : '<div class="cfb ' + (ch.right ? 'ok' : 'no') + '" role="status"><b>' + (ch.right ? 'Correct!' : 'Not quite.') + '</b> ' + esc(c.why) +
      (ch.levelUp ? '<br><b>Level up: now level ' + gs.level + '.</b>' : ch.levelDown ? '<br>Back to level ' + gs.level + ' for a moment.' : '') + '</div>';
    return sheetWrap('Mini challenge', '<div class="row-between"><span class="h2" style="font-size:.75rem;color:var(--olive)">' + svg(I.drop, 14) + ' Glass ' + have + ' of ' + waterGoal() + ' · ' + esc(window.FEA_GAMES.kinds[kind]) + ' · level ' + c.level + '</span><button class="textbtn" data-act="closesheet">' + (ch.picked === null ? 'Skip' : 'Close') + '</button></div>' +
      '<h2 class="cq">' + esc(c.q) + '</h2>' + opts + fb +
      (ch.picked !== null ? '<div class="btns"><button class="btn" data-act="cmore">One more</button><button class="btn primary" data-act="closesheet">Done</button></div><div class="note center" style="font-size:.75rem">' + gs.correct + ' right out of ' + gs.played + ' so far · best level ' + gs.best + '</div>' : ''));
  }

  /* ───────── render ───────── */
  var root, view, overlay, toastEl, toastTimer;
  var scrollMemo = {};

  function render(animate) {
    if (!view) return;
    if (S.mode === 'loading') { view.innerHTML = skeleton(); return; }
    if (S.mode === 'link') { view.innerHTML = linkScreen(); overlay.innerHTML = ''; return; }
    var main = document.getElementById('main');
    var prevTab = view.getAttribute('data-tab');
    if (main && prevTab) scrollMemo[prevTab] = main.scrollTop;
    var active = document.activeElement && document.activeElement.id;
    var selStart = active && document.activeElement.selectionStart;

    var parts = { today: today, lists: lists, houses: houses, plan: plan, intel: intel, history: historyView, ask: ask }[S.tab]();
    var changed = prevTab !== S.tab;
    var anim = animate || changed;
    view.setAttribute('data-tab', S.tab);
    view.innerHTML = header() +
      '<main id="main" class="' + (S.tab === 'ask' ? 'ask ' + (S.files.length || S.reading || S.ref ? 'tall ' : '') : '') + (anim ? 'enter' : '') + '">' + parts.map(function (h, i) { return anim ? stag(h, i) : h; }).join('') + '</main>' +
      (S.tab === 'ask' ? composer() : '<button class="fab" data-act="jot" aria-label="Jot it down">' + svg(I.plus, 24) + '<span>Jot it down</span></button>') + nav();

    main = document.getElementById('main');
    var fab = view.querySelector('.fab'), lastTop = 0;
    if (fab) main.addEventListener('scroll', function () {
      var t = main.scrollTop;
      if (t > lastTop + 6 && t > 80) fab.classList.add('mini');
      else if (t < lastTop - 6 || t < 40) fab.classList.remove('mini');
      lastTop = t;
    }, { passive: true });
    if (S.tab === 'ask') main.scrollTop = main.scrollHeight;
    else main.scrollTop = changed ? 0 : (scrollMemo[S.tab] || 0);
    if (active) {
      var el = document.getElementById(active);
      if (el && el.focus) { el.focus({ preventScroll: true }); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch (e) {} }
    }
    // animate score bars that are open
    requestAnimationFrame(function () {
      document.querySelectorAll('.bars.open .bar i').forEach(function (b) { b.style.width = b.getAttribute('data-w') + '%'; });
    });
    if (!S.sheet) overlay.innerHTML = '';
  }
  function renderOverlay() {
    if (S.mode !== 'app' || !S.sheet) { overlay.innerHTML = ''; return; }
    var focusId = document.activeElement && overlay.contains(document.activeElement) ? document.activeElement.id : '';
    overlay.innerHTML = S.sheet === 'settings' ? settingsSheet() : S.sheet === 'jot' ? jotSheet() : S.sheet === 'report' ? reportSheet() : S.sheet === 'challenge' ? challengeSheet() : snoozeSheet();
    S.sheetFresh = false;
    if (focusId && document.getElementById(focusId)) document.getElementById(focusId).focus({ preventScroll: true });
  }
  function openSheet(name, item) { S.sheet = name; S.sheetItem = item || null; S.sheetFresh = true; S.unlinkAsk = false; renderOverlay(); }
  function closeSheet() { S.sheet = null; S.sheetItem = null; renderOverlay(); }

  function toast(text, opts) {
    opts = opts || {};
    clearTimeout(toastTimer);
    toastEl.innerHTML = '<span>' + esc(text) + '</span>' + (opts.undo ? '<button class="btn small" data-act="undo" data-id="' + esc(opts.undo) + '">Undo</button>' : '');
    toastEl.classList.add('show');
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, opts.ms || 3200);
  }

  /* ───────── events ───────── */
  function findItem(id) { return S.data.items.filter(function (i) { return i.id === id; })[0]; }
  function setTab(t) { S.tab = t; LS.set('fea.tab', t); if (t === 'ask') { S.chatSeen = new Date().toISOString(); LS.set('fea.chatSeen', S.chatSeen); } render(); }

  function onClick(e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act'), v = el.getAttribute('data-v'), id = el.getAttribute('data-id');
    var item;
    switch (act) {
      case 'tab': setTab(v); break;
      case 'go':
        if (v.indexOf('intel:') === 0) { S.seg = v.slice(6); setTab('intel'); }
        else { if (v === 'houses') S.houseFilter = 'new'; setTab(v); }
        break;
      case 'who': S.who = S.who === v && v !== 'all' ? 'all' : v; if (S.tab === 'history') updateHistory(); else render(); break;
      case 'hfilter': S.houseFilter = v; render(); break;
      case 'score':
        S.openScore[id] = !S.openScore[id];
        var bars = document.getElementById('bars-' + id);
        if (bars) {
          bars.classList.toggle('open', S.openScore[id]); el.setAttribute('aria-expanded', S.openScore[id]);
          el.lastChild.textContent = S.openScore[id] ? 'Hide' : 'Show';
          bars.querySelectorAll('.bar i').forEach(function (b) { b.style.width = S.openScore[id] ? b.getAttribute('data-w') + '%' : '0'; });
        }
        break;
      case 'house':
        item = findItem(id); if (!item) break;
        var place = (item.title.split(',')[1] || item.title).trim().split(' ')[0];
        queueAction(item, v, { approve: 'Approve', skip: 'Skip', never: 'Never' }[v] + ' ' + place + ' house');
        break;
      case 'planact': item = findItem(id); if (item) queueAction(item, v, el.getAttribute('data-label') || v); break;
      case 'undo': cancelAction(id); toastEl.classList.remove('show'); break;
      case 'read': item = findItem(id); if (item) toggleRead(item); break;
      case 'askabout': if (S.sheet) closeSheet(); S.draft = v; setTab('ask'); setTimeout(function () { var c = document.getElementById('chat-input'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }, 60); break;
      case 'suggest': S.draft = v; render(); var ci = document.getElementById('chat-input'); if (ci) ci.focus(); break;
      case 'retry':
        var m = S.data.messages.filter(function (x) { return x.id === id; })[0];
        if (m) {
          S.data.messages = S.data.messages.filter(function (x) { return x !== m; }); S.localMsgs = (S.localMsgs || []).filter(function (x) { return x !== m; });
          S.draft = /^Sent \d+ files?\.$/.test(m.text) && m.retryFiles ? '' : m.text; S.files = m.retryFiles || []; S.ref = m.retryRef || null; sendChat();
        }
        break;
      case 'seg': S.seg = v; render(); break;
      case 'attach': openPicker(); break;
      case 'attachfor':
        item = findItem(id);
        S.ref = id;
        if (item && !S.draft) S.draft = 'About \u201c' + item.title + '\u201d: ';
        setTab('ask');
        openPicker(); // same tap, so iOS allows the picker to open
        break;
      case 'clearref': S.ref = null; render(); break;
      case 'rmfile':
        S.files = S.files.filter(function (f) { if (f.id === id && f.preview) URL.revokeObjectURL(f.preview); return f.id !== id; });
        render(); break;
      case 'month': S.month = v; updateHistory(); break;
      case 'mod': S.mod = v; updateHistory(); break;
      case 'hopen':
        S.histOpen = S.histOpen === id ? null : id;
        var det = el.nextElementSibling;
        document.querySelectorAll('.hdetail.open').forEach(function (x) { if (x !== det) { x.classList.remove('open'); x.previousElementSibling.setAttribute('aria-expanded', 'false'); } });
        if (det) { det.classList.toggle('open', S.histOpen === id); el.setAttribute('aria-expanded', S.histOpen === id); }
        break;
      case 'histjump': case 'report': openReport(id); break;
      case 'openitem':
        item = findItem(id); closeSheet();
        if (item) { if (item.module === 'intel' || item.module === 'migration') { S.seg = item.module === 'migration' ? 'migration' : 'mine'; setTab('intel'); } else setTab({ houses: 'houses', plan: 'plan' }[item.module] || 'today'); }
        break;
      case 'newquote': S.quoteIdx = (S.quoteIdx + 1 + Math.floor(Math.random() * Math.max(1, QUOTES.length - 1))) % Math.max(1, QUOTES.length); render(); break;
      case 'waterplus': addGlass(); break;
      case 'waterminus': if (glasses() > 0) { S.water[todayKey()] = glasses() - 1; LS.set('fea.water', S.water); syncWater(); render(); } break;
      case 'canswer': answerChallenge(v); break;
      case 'cmore': startChallenge(S.challenge ? S.challenge.c.kind : gameKind()); break;
      case 'settings': checkPush(); openSheet('settings'); var first = overlay.querySelector('.sheet button'); if (first) first.focus({ preventScroll: true }); break;
      case 'closesettings': case 'closesheet': closeSheet(); break;
      case 'jot':
        S.jotText = ''; S.pickTime = ''; S.jotWhen = new Date().getHours() < 18 ? 'eve' : 'tom';
        openSheet('jot');
        var jt = document.getElementById('jot-text'); if (jt) jt.focus();
        break;
      case 'when': S.jotWhen = v; if (S.sheet === 'snooze' && v !== 'pick') { doSnooze(); break; } renderOverlay(); break;
      case 'savejot': saveJot(); break;
      case 'jotgrocery': var jtxt = (document.getElementById('jot-text') || {}).value || ''; if (jtxt.trim()) { closeSheet(); addGrocery(jtxt); S.listSeg = 'groceries'; setTab('lists'); } else toast('Type what you need first.'); break;
      case 'snoozeitem': S.jotWhen = ''; openSheet('snooze', { kind: 'item', id: id }); break;
      case 'snoozenote': S.jotWhen = ''; openSheet('snooze', { kind: 'note', id: id }); break;
      case 'dosnooze': doSnooze(); break;
      case 'unsnooze': unsnooze(id); break;
      case 'togglesnoozed': S.showSnoozed = !S.showSnoozed; render(); break;
      case 'notedone': noteOp(id, 'done'); break;
      case 'noteundo': noteOp(id, 'undo'); break;
      case 'notedelete': noteOp(id, 'delete'); break;
      case 'listseg': S.listSeg = v; render(); break;
      case 'gtick': groceryOp(id, 'tick'); break;
      case 'guntick': groceryOp(id, 'untick'); break;
      case 'gremove': groceryOp(id, 'remove'); break;
      case 'gclear': groceryOp(null, 'clear'); break;
      case 'gagain': addGrocery(v); break;
      case 'pushon': enablePush(); break;
      case 'pushoff': disablePush(); break;
      case 'copytopic': copyText(S.data.alerts.topic, 'Channel copied. Paste it in the ntfy app.'); break;
      case 'testalert':
        api.post({ type: 'testalert' }).then(function (r) { toast(r && r.ok ? 'Test sent. It should pop up in a few seconds.' : 'Couldn\u2019t send. Turn alerts off and on again here.'); }, function () { toast('Couldn\u2019t send. Check your connection.'); });
        break;
      case 'aquiet': S.data.alerts.quiet = v; renderOverlay(); api.post({ type: 'prefs', quiet: v }).catch(function () { toast('Couldn\u2019t save that. Try again.'); }); break;
      case 'apause': S.data.alerts.paused = v === '1'; renderOverlay(); api.post({ type: 'prefs', pause: v === '1' }).then(function () { toast(v === '1' ? 'Nudges paused for today. Your own reminders still come.' : 'Nudges back on.'); }, function () { toast('Couldn\u2019t save that. Try again.'); }); break;
      case 'aprefs':
        var ak = el.getAttribute('data-k'); S.data.alerts[ak] = S.data.alerts[ak] === false; renderOverlay();
        var pb = { type: 'prefs' }; pb[ak] = S.data.alerts[ak]; api.post(pb).catch(function () { toast('Couldn\u2019t save that. Try again.'); });
        break;
      case 'pref': S.prefs[el.getAttribute('data-k')] = v; applyPrefs(); render(); renderOverlay(); if (/^(waterGoal|game)$/.test(el.getAttribute('data-k')) && glasses() + Object.keys(S.water).length) syncWater(); break;
      case 'toggle': var k = el.getAttribute('data-k'); S.prefs[k] = !S.prefs[k]; applyPrefs(); render(); renderOverlay(); break;
      case 'refresh': load(); break;
      case 'hideinstall': S.installHidden = true; LS.set('fea.installHidden', true); render(); break;
      case 'copykey':
        if (navigator.clipboard && S.key) navigator.clipboard.writeText(S.key).then(function () { toast('Key copied. Paste it in the Home Screen app.'); }, function () { toast('Couldn’t copy. Your key: ' + S.key, { ms: 8000 }); });
        else toast(S.key ? 'Your key: ' + S.key : 'No key on this phone.', { ms: 8000 });
        break;
      case 'unlinkask': S.unlinkAsk = true; renderOverlay(); break;
      case 'unlinkno': S.unlinkAsk = false; renderOverlay(); break;
      case 'unlinkyes': unlink(''); break;
      case 'exitdemo': S.demo = false; S.sheet = null; S.mode = S.key ? 'loading' : 'link'; render(); if (S.key) load({ animate: true }); break;
      case 'demo': S.demo = true; S.mode = 'loading'; render(); load({ animate: true }); break;
      case 'link': linkPhone(); break;
    }
  }

  function updateHistory() {
    var r = document.getElementById('hist-results');
    if (r) r.innerHTML = historyResults(); else render();
  }

  function linkPhone() {
    var input = document.getElementById('key-input');
    var key = (input && input.value || '').trim().replace(/\s+/g, '');
    if (key.length < 20) { S.linkError = 'That key looks too short. Paste the whole thing.'; render(); return; }
    S.key = key; S.linkError = ''; LS.set('fea.key', key);
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    S.mode = 'loading'; render(); load({ animate: true });
  }

  function unlink(msg) {
    flushPending();
    LS.del('fea.key'); LS.del('fea.cache'); LS.del('fea.instant'); S.instant = []; S.reports = {};
    IDB.set('cfg', null);
    if (pushSupported() && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function (r) { return r && r.pushManager.getSubscription(); }).then(function (sub) { if (sub) sub.unsubscribe(); }).catch(function () {});
    S.key = null; S.sheet = null; S.mode = 'link'; S.linkError = msg || '';
    S.data = { items: [], history: [], queue: [], messages: [], runs: {}, lastSync: '', notes: [], groceries: [], snoozes: [], doneToday: 0, alerts: {} };
    render(true);
  }

  var histTimer;
  function onInput(e) {
    if (e.target.id === 'chat-input') S.draft = e.target.value;
    if (e.target.id === 'jot-text') S.jotText = e.target.value;
    if (e.target.id === 'g-input') S.gText = e.target.value;
    if (e.target.id === 'pick-time') S.pickTime = e.target.value;
    if (e.target.id === 'hist-q') { S.hq = e.target.value; clearTimeout(histTimer); histTimer = setTimeout(updateHistory, 160); }
    if (e.target.id === 'key-input' && S.linkError) { S.linkError = ''; }
  }
  function onSubmit(e) {
    if (e.target.id === 'chat-form') { e.preventDefault(); S.draft = document.getElementById('chat-input').value; sendChat(); }
    if (e.target.id === 'g-form') { e.preventDefault(); var gi = document.getElementById('g-input'); addGrocery(gi.value); }
  }
  function onKey(e) {
    if (e.key === 'Enter' && e.target.id === 'key-input') { e.preventDefault(); linkPhone(); }
    if (e.key === 'Escape' && S.sheet) closeSheet();
  }

  /* ───────── start ───────── */
  function start() {
    root = document.getElementById('app');
    root.innerHTML = '<div id="view" style="display:contents"></div><div id="overlay"></div><div id="toast" class="toast" role="status" aria-live="polite"></div>';
    view = document.getElementById('view'); overlay = document.getElementById('overlay'); toastEl = document.getElementById('toast');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('change', function (e) { if (e.target.id === 'file-input') { addFiles(e.target.files); e.target.value = ''; } });
    // drag and drop on a computer
    root.addEventListener('dragover', function (e) { if (S.mode === 'app') e.preventDefault(); });
    root.addEventListener('drop', function (e) { if (S.mode === 'app' && e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); if (S.tab !== 'ask') setTab('ask'); addFiles(e.dataTransfer.files); } });
    root.addEventListener('keydown', onKey);
    applyPrefs();

    var params = new URLSearchParams(location.search);
    if (params.get('demo') === '1' || /demo/.test(location.hash)) S.demo = true;
    var hashKey = (location.hash.match(/key=([A-Za-z0-9]+)/) || [])[1];
    if (hashKey && !S.key) { S.key = hashKey; LS.set('fea.key', hashKey); }

    if (S.demo || (S.key && CFG.API_URL)) { S.mode = 'loading'; render(); load({ animate: true }).then(checkPush); }
    else { S.mode = 'link'; render(true); }

    if (window.FEA_DEMO) window.FEA_DEMO.onChange(function () { if (S.demo) load(); });
    setInterval(function () { if (S.mode === 'app' && document.visibilityState === 'visible' && !Object.keys(S.pending).length) { paintSync(); load(); } }, 60000);
    // the shared grocery list refreshes every 15 s while it's on screen
    setInterval(function () { if (S.mode === 'app' && S.tab === 'lists' && S.listSeg === 'groceries' && !S.sheet && document.visibilityState === 'visible') load(); }, 15000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushPending(); // iOS often skips pagehide for home-screen apps
      else if (S.mode === 'app') load();
    });
    window.addEventListener('pagehide', flushPending);
    window.addEventListener('online', function () { if (S.mode === 'app') load(); });

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  window.FEA_APP = { state: S, version: VERSION }; // handy for checks
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
