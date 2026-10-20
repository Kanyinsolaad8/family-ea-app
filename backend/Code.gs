/**
 * Family EA App — back end (Google Apps Script, free).
 *
 * What it does
 *  - Reads Family EA emails in the shared Gmail and turns them into app data
 *    (a Google Sheet called "Family EA App Data").
 *  - Serves each person ONLY their own items plus shared ones (both / either).
 *    Privacy is enforced here, not in the phone.
 *  - Turns taps and chat messages in the app into emails the command
 *    processor already reads, so the scheduled tasks stay the brain.
 *
 * Install steps are in docs/SETUP.md. Runs as adhome854@gmail.com.
 */

var CFG = {
  SHEET_NAME: 'Family EA App Data',
  APP_URL: 'https://kanyinsolaad8.github.io/family-ea-app/', // tapping a phone alert opens this
  PEOPLE: { ayo: 'Ayo', itunu: 'Itunu' },
  OWNERS: ['ayo', 'itunu', 'both', 'either'],
  HISTORY_DAYS: 190,          // a little over 6 months
  OPEN_DAYS: 45,              // open items older than this drop off Today
  BACKFILL_THREADS: 400,
  INGEST_QUERY: 'subject:("family ea" OR "property alert" OR "property match" OR "house search" OR "migration" OR "morning intel" OR "morning brief" OR "intel" OR "action scout" OR "plan ahead" OR "weekly digest" OR "commitments")',
  BLOCK_START: 'FAMILYEA-DATA-START',
  BLOCK_END: 'FAMILYEA-DATA-END',
  APP_MARK: '[sent from Family EA app]',
  UPLOAD_FOLDER: 'Family EA App Uploads',
  MAX_FILES: 5,
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  MAX_TOTAL_BYTES: 15 * 1024 * 1024,
  // First match wins (lower-case subject keywords).
  MODULE_KEYWORDS: [
    ['property', 'houses'], ['house search', 'houses'], ['rental', 'houses'],
    ['migration', 'migration'], ['visa', 'migration'],
    ['intel', 'intel'], ['morning brief', 'intel'],
    ['action scout', 'plan'], ['plan ahead', 'plan'], ['commitments', 'plan'], ['clash', 'plan'],
    ['app chat', 'chat'], ['app request', 'commands'],
    ['family ea', 'commands']
  ],
  MODULE_LABELS: { houses: 'House search', plan: 'Plan ahead', intel: 'Professional intel', migration: 'Migration', commands: 'Requests', chat: 'Chat' },
  ACTIONS: {
    houses: { approve: 'APPROVE', skip: 'SKIP', never: 'NEVER' },
    plan: { add_calendar: 'ADD TO CALENDAR', remind: 'REMIND ME', done: 'MARK DONE' },
    intel: { read: null, unread: null },
    migration: { read: null, unread: null }
  }
};

var TABLES = {
  Items: ['id', 'person', 'module', 'status', 'title', 'summary', 'detail', 'created', 'updated', 'due', 'outcome', 'data', 'source'],
  Actions: ['id', 'ts', 'person', 'itemId', 'action', 'label', 'payload', 'status', 'doneAt'],
  Messages: ['id', 'ts', 'person', 'from', 'text', 'status', 'ref', 'files'],
  Notes: ['id', 'person', 'text', 'created', 'remindAt', 'status', 'sentAt', 'doneAt', 'level', 'headsAt'],
  Gratitude: ['id', 'person', 'day', 'text', 'shared', 'created'],
  Groceries: ['id', 'name', 'qty', 'aisle', 'addedBy', 'created', 'ticked', 'tickedBy', 'tickedAt', 'removed'],
  Snoozes: ['id', 'person', 'itemId', 'until', 'sentAt'],
  Pushes: ['id', 'person', 'endpoint', 'p256dh', 'auth', 'status', 'created', 'lastOk'],
  Alerts: ['id', 'person', 'ts', 'title', 'body'],
  Seen: ['msgId', 'ts'],
  Meta: ['key', 'value'],
  Log: ['ts', 'level', 'text']
};

/* ───────────────────────── Web endpoints ───────────────────────── */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return json_({ ok: true, app: 'family-ea', time: new Date().toISOString() });
    if (p.action === 'file' || p.action === 'files') {
      if (!isTaskKey_(p.key)) return json_({ ok: false, error: 'bad_key' });
      return json_(p.action === 'files' ? listFiles_() : readFile_(p.name));
    }
    var person = personForKey_(p.key);
    if (!person) return json_({ ok: false, error: 'bad_key' });
    if (p.action === 'report') return json_(handleReport_(person, String(p.id || '')));
    if (p.action === 'alerts') return json_(alertsFor_(person, String(p.since || '')));
    return json_(buildBootstrap_(person, new Date()));
  } catch (err) {
    log_('error', 'doGet: ' + err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  if (body.type === 'file') {
    if (!isTaskKey_(body.key)) return json_({ ok: false, error: 'bad_key' });
    var flock = LockService.getScriptLock();
    try { flock.waitLock(20000); return json_(writeFile_(body.name, body.content, body.mode)); }
    catch (err) { log_('error', 'file write: ' + err); return json_({ ok: false, error: 'server_error' }); }
    finally { try { flock.releaseLock(); } catch (x) {} }
  }
  var person = personForKey_(body.key);
  if (!person) return json_({ ok: false, error: 'bad_key' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (body.type === 'action') return json_(handleAction_(person, body, new Date()));
    if (body.type === 'message') return json_(handleMessage_(person, body, new Date()));
    if (body.type === 'note') return json_(handleNote_(person, body, new Date()));
    if (body.type === 'gratitude') return json_(handleGratitude_(person, body, new Date()));
    if (body.type === 'grocery') return json_(handleGrocery_(person, body, new Date()));
    if (body.type === 'snooze') return json_(handleSnooze_(person, body, new Date()));
    if (body.type === 'prefs') return json_(handlePrefs_(person, body));
    if (body.type === 'pushsub') return json_(handlePushSub_(person, body));
    if (body.type === 'testalert') { var sentN = push_(person, 'Family EA', 'Test alert: phone alerts are working.'); return json_({ ok: !!sentN, devices: devicesFor_(person) }); }
    return json_({ ok: false, error: 'unknown_type' });
  } catch (err) {
    log_('error', 'doPost: ' + err);
    return json_({ ok: false, error: 'server_error' });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── Family EA files in Google Drive (for the scheduled tasks) ───────────────────────── */
/* The scheduled tasks run in the cloud, so they keep their rules and logs here instead of on the Mac.
   They use a separate task key; it can read and write these files only, never anyone's app data. */

var FILES_FOLDER = 'Family EA Files';

/** Run once: creates the task key and prints it to the log. */
function setupTaskKey() {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('TASK_KEY');
  if (!k) { k = 'task_' + (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40); props.setProperty('TASK_KEY', k); }
  filesFolder_();
  Logger.log('Task key: ' + k);
  return k;
}

function isTaskKey_(key) {
  var k = PropertiesService.getScriptProperties().getProperty('TASK_KEY');
  return !!k && typeof key === 'string' && key === k;
}

function filesFolder_() {
  var it = DriveApp.getFoldersByName(FILES_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FILES_FOLDER);
}

function safeFileName_(name) {
  name = String(name || '').trim();
  return /^[A-Za-z0-9][A-Za-z0-9 _.()-]{0,99}$/.test(name) && name.indexOf('..') < 0 ? name : '';
}

function findFile_(name) {
  var it = filesFolder_().getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

function readFile_(name) {
  var n = safeFileName_(name);
  if (!n) return { ok: false, error: 'bad_name' };
  var f = findFile_(n);
  if (!f) return { ok: false, error: 'not_found', name: n };
  return { ok: true, name: n, content: f.getBlob().getDataAsString('UTF-8'), updated: f.getLastUpdated().toISOString() };
}

function listFiles_() {
  var out = [], it = filesFolder_().getFiles();
  while (it.hasNext()) { var f = it.next(); out.push({ name: f.getName(), size: f.getSize(), updated: f.getLastUpdated().toISOString() }); }
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return { ok: true, files: out };
}

/** mode: 'replace' (default) or 'append' (adds the text on a new line at the end). */
function writeFile_(name, content, mode) {
  var n = safeFileName_(name);
  if (!n) return { ok: false, error: 'bad_name' };
  content = String(content == null ? '' : content);
  if (content.length > 2000000) return { ok: false, error: 'too_big' };
  var f = findFile_(n);
  if (mode === 'append' && f) {
    var old = f.getBlob().getDataAsString('UTF-8');
    content = old + (old && !/\n$/.test(old) ? '\n' : '') + content;
  }
  if (f) {
    // keep a dated backup copy before every replace, so nothing is ever lost
    if (mode !== 'append') backupFile_(f);
    f.setContent(content);
  } else {
    f = filesFolder_().createFile(n, content, n.slice(-3) === '.md' ? 'text/markdown' : 'text/plain');
  }
  return { ok: true, name: n, size: content.length };
}

function backupFile_(f) {
  try {
    var it = filesFolder_().getFoldersByName('Backups');
    var b = it.hasNext() ? it.next() : filesFolder_().createFolder('Backups');
    var stamp = Utilities.formatDate(new Date(), 'Europe/London', 'yyyy-MM-dd');
    var name = stamp + ' ' + f.getName();
    if (!b.getFilesByName(name).hasNext()) f.makeCopy(name, b); // one backup per file per day
  } catch (e) { log_('warn', 'backup failed: ' + e); }
}

/* ───────────────────────── People and keys ───────────────────────── */

/** Run once from the editor: creates the data sheet, the 10-minute sync and Ayo's key. */
function setup() {
  ss_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'ingest' || h === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('ingest').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  var existing = keysFor_('ayo');
  if (!existing.length) addPerson('ayo');
  else log_('info', 'Ayo already has a key. Run showKeys() to see it.');
  Logger.log('Setup done. Next: Deploy > New deployment > Web app. Then run backfill() once.');
}

/** Creates a private key for a person ('ayo' or 'itunu'). Run addItunu() later. */
function addPerson(person) {
  if (!CFG.PEOPLE[person]) throw new Error('Unknown person: ' + person);
  var key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
  var props = PropertiesService.getScriptProperties();
  props.setProperty('KEY_' + key, person);
  if (!props.getProperty('NTFY_TOPIC_' + person)) props.setProperty('NTFY_TOPIC_' + person, 'fea-' + person + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20));
  Logger.log(CFG.PEOPLE[person] + "'s private key: " + key + '  (keep it secret; paste it into the app once)');
  return key;
}
function addItunu() { return addPerson('itunu'); }

/** Lists keys per person (for when someone gets a new phone). */
function showKeys() {
  var props = PropertiesService.getScriptProperties().getProperties();
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('KEY_') === 0) Logger.log(CFG.PEOPLE[props[k]] + ': ' + k.slice(4));
  });
}

/** Stops a lost phone: revokeKey('the-key'). */
function revokeKey(key) {
  PropertiesService.getScriptProperties().deleteProperty('KEY_' + key);
  Logger.log('Key removed.');
}

function personForKey_(key) {
  if (!key || typeof key !== 'string' || key.length < 20 || key.length > 80) return null;
  var person = PropertiesService.getScriptProperties().getProperty('KEY_' + key);
  return CFG.PEOPLE[person] ? person : null;
}

function keysFor_(person) {
  var props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props).filter(function (k) { return k.indexOf('KEY_') === 0 && props[k] === person; });
}

/* ───────────────────────── Privacy rule ───────────────────────── */

/** The one rule: you see your own items and shared ones. Never the other person's. */
function canSee_(viewer, owner) {
  return owner === viewer || owner === 'both' || owner === 'either';
}

/** Returns a valid owner or null. Unknown values are rejected, never widened to 'both'. */
function normOwner_(v) {
  v = String(v || '').toLowerCase().trim();
  return CFG.OWNERS.indexOf(v) > -1 ? v : null;
}

/** For emails without a data block: a name in the subject decides; otherwise null. */
function ownerFromText_(s) {
  s = String(s || '').toLowerCase();
  var a = /\bayo\b/.test(s), i = /\bitunu\b/.test(s);
  return a && !i ? 'ayo' : i && !a ? 'itunu' : null;
}

function has_(obj, k) { return Object.prototype.hasOwnProperty.call(obj, k); }

/* ───────────────────────── Read model for the app ───────────────────────── */

function buildBootstrap_(person, now) {
  var items = rows_('Items');
  var actions = rows_('Actions');
  var messages = rows_('Messages');
  var meta = metaMap_();
  var dayMs = 86400000;
  var openCut = now.getTime() - CFG.OPEN_DAYS * dayMs;
  var histCut = now.getTime() - CFG.HISTORY_DAYS * dayMs;

  var visible = items.filter(function (r) { return canSee_(person, r.person); });

  var live = visible.filter(function (r) {
    var t = Date.parse(r.created) || 0;
    if (r.status === 'done') return (Date.parse(r.updated) || t) >= now.getTime() - 14 * dayMs; // recently finished stays visible
    if (r.status !== 'open' && r.status !== 'queued' && r.status !== 'read') return false;
    if (r.module === 'plan' && r.due) return (Date.parse(r.due) || 0) >= now.getTime() - 2 * dayMs;
    return t >= openCut;
  }).map(function (r) { return publicItem_(r, person); });

  var history = visible.filter(function (r) {
    return (Date.parse(r.created) || 0) >= histCut;
  }).map(function (r) {
    return {
      id: r.id, date: r.created, module: r.module, for: r.person, title: r.title,
      outcome: r.outcome || r.summary || '', detail: r.detail || r.summary || '', status: r.status
    };
  }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });

  var queue = actions.filter(function (a) { return a.person === person && a.status === 'queued'; })
    .map(function (a) { return { id: a.id, ts: a.ts, itemId: a.itemId, text: a.label }; });

  var msgs = messages.filter(function (m) { return m.person === person; })
    .sort(function (a, b) { return a.ts < b.ts ? -1 : 1; })
    .slice(-80)
    .map(function (m) {
      var files = [];
      try { files = m.files ? JSON.parse(m.files) : []; } catch (e) { files = []; }
      return { id: m.id, ts: m.ts, from: m.from === 'ea' ? 'ea' : 'me', text: m.text, status: m.status,
        files: files.map(function (f) { return { name: f.name, mime: f.mime, size: f.size, url: f.url }; }) };
    });

  var runs = {};
  Object.keys(meta).forEach(function (k) { if (k.indexOf('lastRun_') === 0) runs[k.slice(8)] = meta[k]; });

  return {
    ok: true,
    person: person,
    name: CFG.PEOPLE[person],
    serverTime: now.toISOString(),
    lastSync: meta.lastIngest || '',
    runs: runs,
    items: live,
    history: history,
    queue: queue,
    messages: msgs,
    notes: rows_('Notes').filter(function (n) {
      return n.person === person && (n.status === 'open' || (n.status === 'done' && (Date.parse(n.doneAt) || 0) > now.getTime() - 3 * dayMs));
    }).map(function (n) { return { id: n.id, text: n.text, created: n.created, remindAt: n.remindAt, status: n.status, doneAt: n.doneAt, level: n.level || 'normal' }; }),
    gratitude: rows_('Gratitude').filter(function (g) { return g.person === person || (g.shared === '1' && (Date.parse(g.created) || 0) > now.getTime() - 60 * dayMs); })
      .slice(-150).map(function (g) { return { id: g.id, day: g.day, text: g.text, shared: g.shared === '1', from: g.person === person ? '' : g.person, created: g.created }; }),
    groceries: rows_('Groceries').filter(function (g) {
      return !g.removed && (!g.ticked || (Date.parse(g.tickedAt) || 0) > now.getTime() - 2 * dayMs);
    }).map(function (g) { return { id: g.id, name: g.name, qty: g.qty, aisle: g.aisle, addedBy: g.addedBy, created: g.created, ticked: !!g.ticked, tickedBy: g.tickedBy }; }),
    snoozes: rows_('Snoozes').filter(function (z) { return z.person === person && z.until && Date.parse(z.until) > now.getTime(); })
      .map(function (z) { return { itemId: z.itemId, until: z.until }; }),
    doneToday: doneToday_(person, now),
    alerts: {
      topic: PropertiesService.getScriptProperties().getProperty('NTFY_TOPIC_' + person) || '',
      vapid: vapid_().pub,
      devices: devicesFor_(person),
      morning: alertOn_(meta, person, 'morning'), evening: alertOn_(meta, person, 'evening'),
      water: alertOn_(meta, person, 'water'), open5: alertOn_(meta, person, 'open5'), week: alertOn_(meta, person, 'week'), reply: alertOn_(meta, person, 'reply'),
      quiet: quietOf_(meta, person), paused: paused_(meta, person, londonDay_(now))
    }
  };
}

function publicItem_(r, person) {
  var data = {};
  try { data = r.data ? JSON.parse(r.data) : {}; } catch (e) { data = {}; }
  var readBy = data.readBy || [];
  delete data.readBy;
  var status = r.status === 'open' && readBy.indexOf(person) > -1 ? 'read' : r.status;
  return {
    id: r.id, module: r.module, for: r.person, status: status, title: r.title,
    summary: r.summary, detail: r.detail, created: r.created, due: r.due, outcome: r.outcome, data: data
  };
}

/* ───────────────────────── Report breakdown (tap a History item) ───────────────────────── */

/**
 * The full story behind one History item, for the person asking only.
 * Uses the item's own fields, the other items from the same email that this person may see,
 * and a readable copy of the email itself with any section for the other person removed.
 */
function handleReport_(person, id) {
  var r = rows_('Items').filter(function (x) { return x.id === id; })[0];
  if (!r || !canSee_(person, r.person)) return { ok: false, error: 'not_found' };
  var cache = CacheService.getScriptCache(), ck = 'rep2_' + person + '_' + hashId_(id + '|' + r.updated);
  var hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  var data = {};
  try { data = r.data ? JSON.parse(r.data) : {}; } catch (e) { data = {}; }
  var out = {
    ok: true, id: r.id, title: r.title, date: r.created, module: r.module, for: r.person, status: r.status,
    summary: r.summary || '', detail: r.detail || '', outcome: r.outcome || '', due: r.due || '',
    why: String(data.why || ''), source: String(data.source || ''), rag: String(data.rag || ''),
    url: /^https?:\/\//i.test(String(data.url || data.listingUrl || '')) ? String(data.url || data.listingUrl) : '',
    related: [], subject: '', blocks: [], hidden: 0
  };
  if (r.source) {
    out.related = rows_('Items').filter(function (x) { return x.source === r.source && x.id !== r.id && canSee_(person, x.person); })
      .slice(0, 12).map(function (x) { return { id: x.id, title: x.title, summary: x.summary || x.outcome || '', for: x.person }; });
    try {
      var m = GmailApp.getMessageById(r.source);
      if (m) {
        out.subject = cleanSubject_(m.getSubject());
        var f = privacyFilter_(htmlToBlocks_(m.getBody() || ''), person);
        out.blocks = f.blocks; out.hidden = f.hidden;
      }
    } catch (e) { log_('warn', 'report email: ' + e); }
  }
  try { cache.put(ck, JSON.stringify(out), 21600); } catch (e) {} // too big for the cache is fine
  return out;
}

/** Email HTML → simple readable blocks: {t:'h'|'p'|'li', text, links:[{url,text}]} */
function htmlToBlocks_(html) {
  var s = String(html || '');
  var A = CFG.BLOCK_START, B = CFG.BLOCK_END;
  s = s.replace(new RegExp('<!--\\s*' + A + '[\\s\\S]*?' + B + '\\s*-->', 'g'), '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, '');
  var links = [];
  s = s.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, function (_, url, txt) {
    var t = decodeEntities_(stripTags_(txt)).replace(/\s+/g, ' ').trim();
    url = decodeEntities_(url).trim();
    if (!/^https?:\/\//i.test(url)) return t;
    links.push({ url: url, text: t || url });
    return ' \u0001' + (links.length - 1) + '\u0002 ';
  });
  s = s.replace(/<h[1-4]\b[^>]*>/gi, '\n\u0003').replace(/<\/h[1-4]>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n\u0004').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|ul|ol|table|section|blockquote)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities_(s).replace(/&(rsquo|lsquo);/g, '\u2019').replace(/&(rdquo|ldquo);/g, '\u201d')
    .replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013').replace(/&middot;/g, '\u00b7').replace(/&pound;/g, '\u00a3')
    .replace(/&hellip;/g, '\u2026').replace(/&bull;/g, '\u2022').replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); });
  var out = [], total = 0, prev = '';
  s.split('\n').forEach(function (raw) {
    if (out.length >= 220 || total > 16000) return;
    var line = raw.replace(/[ \t\u00a0]+/g, ' ').trim();
    var t = 'p';
    if (line.charAt(0) === '\u0003') { t = 'h'; line = line.slice(1).trim(); }
    if (line.charAt(0) === '\u0004') { t = 'li'; line = line.slice(1).trim(); }
    var ls = [];
    line = line.replace(/\u0001(\d+)\u0002/g, function (_, k) { var l = links[+k]; if (l) ls.push(l); return l ? l.text : ''; }).replace(/\s+/g, ' ').trim();
    if (!line || line === prev || /^[\s\u00b7|\u2022\-–—]+$/.test(line)) return;
    prev = line;
    var b = { t: t, text: line.slice(0, 1200) };
    if (ls.length) b.links = ls.slice(0, 4);
    out.push(b); total += line.length;
  });
  return out;
}

/** Who a section header is for: 'ayo' / 'itunu' / 'both', or '' if the line isn't a header. */
function sectionOwner_(text) {
  var s = String(text || '').trim();
  if (s.length > 90) return '';
  var hasI = s.indexOf('\u2696') > -1, hasA = s.indexOf('\uD83D\uDEE1') > -1;
  if (hasI && hasA) return 'both';
  var names = Object.keys(CFG.PEOPLE);
  for (var k = 0; k < names.length; k++) {
    var nm = CFG.PEOPLE[names[k]];
    var re = new RegExp('^(?:[^A-Za-z0-9]{0,4})(?:for\\s+)?' + nm + '\\b(?:\\s*[\\u00b7:\\-–—]\\s*\\d+\\s+items?)?\\s*[:\\-–—]?\\s*$', 'i');
    if (re.test(s) || new RegExp('\\b' + nm + '\\s*\\u00b7\\s*\\d+\\s+items?\\b', 'i').test(s)) return names[k];
  }
  if (hasI && s.length < 60 && /itunu/i.test(s)) return 'itunu';
  if (hasA && s.length < 60 && /ayo/i.test(s)) return 'ayo';
  if (/^(?:[^A-Za-z0-9]{0,4})(?:for\s+)?(both of you|both|shared|for you both)\b[\s:\-–—·\d a-z]*$/i.test(s) && s.length < 40) return 'both';
  return '';
}

/** Drops any section of the email that belongs to the other person. */
function privacyFilter_(blocks, person) {
  var current = 'both', kept = [], hidden = 0;
  blocks.forEach(function (b) {
    var o = sectionOwner_(b.text);
    if (o) current = o;
    if (canSee_(person, current)) kept.push(b); else hidden++;
  });
  return { blocks: kept, hidden: hidden };
}

/* ───────────────────────── Writes from the app ───────────────────────── */

function handleAction_(person, body, now) {
  var itemId = String(body.itemId || '');
  var action = String(body.action || '');
  var item = rows_('Items').filter(function (r) { return r.id === itemId; })[0];
  if (!item || !canSee_(person, item.person)) return { ok: false, error: 'not_found' };

  var allowed = has_(CFG.ACTIONS, item.module) ? CFG.ACTIONS[item.module] : {};
  var data = {};
  try { data = item.data ? JSON.parse(item.data) : {}; } catch (e) {}
  var command = allowed[action];

  // Clash and choice options come from the item itself.
  if (action.indexOf('option:') === 0) {
    var optId = action.slice(7);
    var opt = (data.options || []).filter(function (o) { return o.id === optId; })[0];
    if (!opt) return { ok: false, error: 'bad_action' };
    command = 'CHOOSE: ' + opt.label;
  } else if (!has_(allowed, action)) {
    return { ok: false, error: 'bad_action' };
  }

  // Reading a brief is private bookkeeping, kept per person: no email needed.
  if (action === 'read' || action === 'unread') {
    var readBy = (data.readBy || []).filter(function (p) { return p !== person; });
    if (action === 'read') readBy.push(person);
    data.readBy = readBy;
    updateRow_('Items', 'id', itemId, { data: JSON.stringify(data) });
    return { ok: true, status: action === 'read' ? 'read' : 'open' };
  }

  var id = 'act_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  var label = (String(body.label || '').slice(0, 120)) || (command + ' — ' + item.title);
  appendRow_('Actions', { id: id, ts: now.toISOString(), person: person, itemId: itemId, action: action, label: label, payload: JSON.stringify(body.payload || {}), status: 'queued', doneAt: '' });

  var patch = { status: 'queued', updated: now.toISOString() };
  if (item.module === 'houses') { data.decision = action; patch.data = JSON.stringify(data); }
  if (action.indexOf('option:') === 0) { data.choice = action.slice(7); patch.data = JSON.stringify(data); }
  updateRow_('Items', 'id', itemId, patch);

  sendToEA_(
    'Family EA — App request · ' + CFG.PEOPLE[person] + ' · ' + (CFG.MODULE_LABELS[item.module] || item.module),
    [
      'FAMILY EA APP REQUEST',
      'From: ' + CFG.PEOPLE[person] + ' (via the app)',
      'Request ID: ' + id,
      'Item ID: ' + itemId,
      'Area: ' + (CFG.MODULE_LABELS[item.module] || item.module),
      'Item: ' + item.title,
      'Command: ' + command,
      body.note ? 'Note: ' + String(body.note).slice(0, 500) : '',
      '',
      'Please act on this exactly as if ' + CFG.PEOPLE[person] + ' had replied "' + command + '" to the original email.',
      'In your ack, include the app data block with "done": ["' + id + '"].'
    ]
  );
  return { ok: true, id: id, status: 'queued' };
}

function handleMessage_(person, body, now) {
  var text = String(body.text || '').trim().slice(0, 2000);
  var incoming = Array.isArray(body.files) ? body.files : [];
  if (incoming.length > CFG.MAX_FILES) return { ok: false, error: 'too_many_files' };

  // Check every file before saving any, so a bad one never leaves half an upload behind.
  var prepared = [], total = 0;
  for (var i = 0; i < incoming.length; i++) {
    var f = incoming[i] || {};
    var mime = String(f.mime || '').toLowerCase();
    if (!allowedMime_(mime)) return { ok: false, error: 'file_type' };
    var bytes;
    try { bytes = Utilities.base64Decode(String(f.data || '')); } catch (e) { return { ok: false, error: 'bad_file' }; }
    if (!bytes.length) return { ok: false, error: 'bad_file' };
    total += bytes.length;
    if (bytes.length > CFG.MAX_FILE_BYTES || total > CFG.MAX_TOTAL_BYTES) return { ok: false, error: 'file_too_big' };
    prepared.push({ bytes: bytes, mime: mime, name: safeName_(f.name, mime) });
  }
  if (!text && !prepared.length) return { ok: false, error: 'empty' };

  var id = 'msg_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  var saved = [], blobs = [];
  if (prepared.length) {
    var folder = uploadFolder_(person);
    prepared.forEach(function (p) {
      var blob = Utilities.newBlob(p.bytes, p.mime, p.name);
      var file = folder.createFile(blob);
      saved.push({ name: p.name, mime: p.mime, size: p.bytes.length, url: file.getUrl(), id: file.getId() });
      blobs.push(blob);
    });
  }
  if (!text) text = 'Sent ' + saved.length + ' file' + (saved.length === 1 ? '' : 's') + '.';

  var refItem = body.ref ? rows_('Items').filter(function (r) { return r.id === String(body.ref) && canSee_(person, r.person); })[0] : null;
  appendRow_('Messages', { id: id, ts: now.toISOString(), person: person, from: person, text: text, status: 'sent', ref: refItem ? refItem.id : '', files: JSON.stringify(saved) });

  if (saved.length) {
    // Private history entry for the sender only.
    appendRow_('Items', {
      id: 'up_' + id, person: person, module: 'commands', status: 'log',
      title: 'Shared with your EA: ' + saved.map(function (s) { return s.name; }).join(', ').slice(0, 120),
      summary: refItem ? 'About: ' + refItem.title : text.slice(0, 180), detail: text,
      created: now.toISOString(), updated: now.toISOString(), due: '',
      outcome: saved.length + ' file' + (saved.length === 1 ? '' : 's') + ' saved to the family Drive', data: JSON.stringify({ files: saved }), source: ''
    });
  }

  sendToEA_(
    'Family EA — App chat · ' + CFG.PEOPLE[person],
    [
      'FAMILY EA APP CHAT',
      'From: ' + CFG.PEOPLE[person] + ' (via the app)',
      'Request ID: ' + id,
      refItem ? 'About item: ' + refItem.title + ' (Item ID: ' + refItem.id + ')' : '',
      saved.length ? 'Files attached: ' + saved.map(function (s) { return s.name; }).join(', ') + ' (also saved in Drive › ' + CFG.UPLOAD_FOLDER + ' › ' + CFG.PEOPLE[person] + ')' : '',
      '',
      text,
      '',
      'Reply to ' + CFG.PEOPLE[person] + ' only. Put the reply in the app data block: "replies": [{"to": "' + person + '", "ref": "' + id + '", "text": "..."}].'
    ],
    blobs
  );
  return { ok: true, id: id, files: saved.map(function (s) { return { name: s.name, mime: s.mime, size: s.size, url: s.url }; }) };
}

function allowedMime_(m) {
  return /^image\/(jpeg|png|gif|webp|heic|heif)$/.test(m) || [
    'application/pdf', 'text/plain', 'text/csv', 'application/msword', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ].indexOf(m) > -1;
}

function safeName_(name, mime) {
  var n = String(name || '').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 100);
  return n || ('upload.' + (mime.split('/')[1] || 'bin'));
}

function uploadFolder_(person) {
  var it = DriveApp.getFoldersByName(CFG.UPLOAD_FOLDER);
  var root = it.hasNext() ? it.next() : DriveApp.createFolder(CFG.UPLOAD_FOLDER);
  var sub = root.getFoldersByName(CFG.PEOPLE[person]);
  return sub.hasNext() ? sub.next() : root.createFolder(CFG.PEOPLE[person]);
}

function sendToEA_(subject, lines, attachments) {
  var me = Session.getEffectiveUser().getEmail();
  var body = lines.filter(function (l) { return l !== null && l !== undefined; }).join('\n') + '\n\n' + CFG.APP_MARK;
  if (attachments && attachments.length) GmailApp.sendEmail(me, subject, body, { attachments: attachments });
  else GmailApp.sendEmail(me, subject, body);
}

/** Health check: run from the editor to see whether recent EA emails carry the app data block. */
function checkLatest() {
  GmailApp.search(CFG.INGEST_QUERY + ' from:me newer_than:3d', 0, 10).forEach(function (t) {
    var m = t.getMessages().pop();
    var b = extractBlock_(m.getBody()) || extractBlock_(m.getPlainBody());
    Logger.log((b ? 'OK   ' : 'NONE ') + m.getSubject() + (b ? '  → ' + (b.items || []).length + ' items, ' + (b.replies || []).length + ' replies, ' + (b.done || []).length + ' done' : ''));
  });
}

/* ───────────────────────── Reading EA emails ───────────────────────── */

/** Runs every 10 minutes (set by setup). */
function ingest() { ingestQuery_(CFG.INGEST_QUERY + ' from:me newer_than:2d', 100); }

/** Run once after setup to load the last ~6 months into History. */
function backfill() { ingestQuery_(CFG.INGEST_QUERY + ' from:me newer_than:' + CFG.HISTORY_DAYS + 'd', CFG.BACKFILL_THREADS); }

function ingestQuery_(query, maxThreads) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var seen = {};
    var me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
    rows_('Seen').forEach(function (r) { seen[r.msgId] = true; });
    var threads = GmailApp.search(query, 0, maxThreads);
    var added = { ayo: [], itunu: [] };
    threads.forEach(function (thread) {
      thread.getMessages().forEach(function (msg) {
        var mid = msg.getId();
        if (seen[mid]) return;
        seen[mid] = true;
        appendRow_('Seen', { msgId: mid, ts: new Date().toISOString() });
        var html = msg.getBody() || '';
        if (!me || String(msg.getFrom() || '').toLowerCase().indexOf(me) < 0) return; // only the EA's own emails, never outsiders
        if (isOwnAppEmail_(msg.getPlainBody() || '')) return; // our own requests (replies that quote them still count)
        var res = ingestMessage_({ id: mid, subject: msg.getSubject() || '', date: msg.getDate(), html: html, plain: msg.getPlainBody() || '' });
        added.ayo = added.ayo.concat(res.newFor.ayo); added.itunu = added.itunu.concat(res.newFor.itunu);
      });
    });
    setMeta_('lastIngest', new Date().toISOString());
    notify_(added);
  } catch (err) {
    log_('error', 'ingest: ' + err);
  } finally {
    lock.releaseLock();
  }
}

/** Pure-ish: one email in, rows out. Returns how many new open items each person got. */
function ingestMessage_(m) {
  var newFor = { ayo: [], itunu: [] };
  var when = (m.date instanceof Date ? m.date : new Date(m.date)).toISOString();
  var module = moduleFromSubject_(m.subject);
  var block = extractBlock_(m.html) || extractBlock_(m.plain);

  if (!block) {
    if (module === 'chat') return { newFor: newFor };
    // Older or un-tagged email. A name in the subject decides who sees it. Otherwise it's shared,
    // but personal areas (intel, requests) keep only the subject line, never the email text.
    var named = ownerFromText_(m.subject);
    var sharedArea = ['houses', 'migration', 'plan'].indexOf(module) > -1;
    upsertItem_({
      id: 'mail-' + m.id, person: named || 'both', module: module, status: 'log',
      title: cleanSubject_(m.subject), summary: (named || sharedArea) ? snippet_(m.plain || stripTags_(m.html), 180) : '',
      detail: '', created: when, updated: when, due: '', outcome: 'Email from your EA', data: '{}', source: m.id
    });
    return { newFor: newFor };
  }

  var bModule = block.module && has_(CFG.MODULE_LABELS, block.module) ? block.module : module;
  if (block.run) setMeta_('lastRun_' + bModule, String(block.run));

  (block.items || []).forEach(function (it) {
    if (!it || !it.title) return;
    var owner = normOwner_(it['for']);
    if (!owner) { log_('warn', 'Skipped an item with no valid "for": ' + String(it.title).slice(0, 80)); return; }
    var mod = it.module && has_(CFG.MODULE_LABELS, it.module) ? it.module : bModule;
    var id = String(it.id || hashId_(mod + '|' + it.title)).slice(0, 80);
    var existing = rows_('Items').filter(function (r) { return r.id === id; })[0];
    var status = ['open', 'done', 'log', 'read'].indexOf(it.status) > -1 ? it.status : 'open';
    if (existing && existing.status === 'queued' && status === 'open') status = 'queued'; // don't undo a tap
    var newData = cleanData_(it.data || {});
    if (existing) {
      try {
        var old = JSON.parse(existing.data || '{}');
        ['decision', 'choice', 'readBy'].forEach(function (k) { if (old[k] !== undefined && newData[k] === undefined) newData[k] = old[k]; });
      } catch (e) {}
    }
    upsertItem_({
      id: id, person: owner, module: mod, status: status,
      title: String(it.title).slice(0, 160), summary: String(it.summary || '').slice(0, 400),
      detail: String(it.detail || '').slice(0, 2000), created: existing ? existing.created : when, updated: when,
      due: it.due ? String(it.due) : '', outcome: String(it.outcome || ''), data: JSON.stringify(newData), source: m.id
    });
    if (!existing && status === 'open') {
      if (canSee_('ayo', owner)) newFor.ayo.push(String(it.title));
      if (canSee_('itunu', owner)) newFor.itunu.push(String(it.title));
    }
  });

  (block.updates || []).forEach(function (u) {
    if (!u || !u.id) return;
    var patch = { updated: when };
    if (u.status) patch.status = String(u.status);
    if (u.outcome) patch.outcome = String(u.outcome).slice(0, 300);
    updateRow_('Items', 'id', String(u.id), patch);
  });

  (block.done || []).forEach(function (actId) {
    var act = rows_('Actions').filter(function (a) { return a.id === actId; })[0];
    if (!act) return;
    updateRow_('Actions', 'id', act.id, { status: 'done', doneAt: when });
    var item = rows_('Items').filter(function (r) { return r.id === act.itemId; })[0];
    if (item && item.status === 'queued') updateRow_('Items', 'id', item.id, { status: 'done', updated: when });
  });

  (block.groceries || []).forEach(function (g) {
    var name = typeof g === 'string' ? g : g && g.name;
    if (name) addGrocery_(String(name), g && g.qty ? String(g.qty) : '', 'ea', new Date(when));
  });

  (block.replies || []).forEach(function (r) {
    if (!r || !r.text) return;
    var to = String(r.to || '').toLowerCase();
    if (!CFG.PEOPLE[to]) return; // replies always go to one named person
    appendRow_('Messages', { id: 'ea_' + hashId_(m.id + '|' + r.text).slice(0, 12), ts: when, person: to, from: 'ea', text: String(r.text).slice(0, 4000), status: 'received', ref: String(r.ref || '') });
    if (r.ref) updateRow_('Messages', 'id', String(r.ref), { status: 'answered' });
    // A heads-up that the answer is in, for fresh replies only (never when old emails are re-read).
    var meta = metaMap_(), now = new Date();
    if (now.getTime() - (Date.parse(when) || 0) < 2 * 3600000 && alertOn_(meta, to, 'reply') && !inQuiet_(meta, to, londonHour_(now)) && keysFor_(to).length)
      push_(to, 'Your EA replied', snippet_(String(r.text), 160));
  });

  return { newFor: newFor };
}

/** Finds the JSON between the markers, coping with HTML tags and entities. */
function extractBlock_(text) {
  if (!text) return null;
  var a = text.indexOf(CFG.BLOCK_START);
  if (a < 0) return null;
  var b = text.indexOf(CFG.BLOCK_END, a);
  if (b < 0) return null;
  var raw = text.slice(a + CFG.BLOCK_START.length, b);
  raw = stripTags_(raw.replace(/<br\s*\/?>/gi, '\n'));
  raw = decodeEntities_(raw).replace(/[​-‍﻿]/g, '').trim();
  try {
    var obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) {
    log_('warn', 'Bad data block: ' + String(e).slice(0, 120));
    return null;
  }
}

function isOwnAppEmail_(plain) {
  var p = String(plain || '').replace(/^\s+/, '');
  return p.indexOf('FAMILY EA APP REQUEST') === 0 || p.indexOf('FAMILY EA APP CHAT') === 0;
}

function moduleFromSubject_(subject) {
  var s = String(subject || '').toLowerCase();
  for (var i = 0; i < CFG.MODULE_KEYWORDS.length; i++) {
    if (s.indexOf(CFG.MODULE_KEYWORDS[i][0]) > -1) return CFG.MODULE_KEYWORDS[i][1];
  }
  return 'commands';
}

function cleanData_(d) {
  // Only plain JSON survives; links must be http(s).
  var out = JSON.parse(JSON.stringify(d));
  ['listingUrl', 'mapUrl', 'url', 'crimeUrl'].forEach(function (k) {
    if (out[k] && !/^https?:\/\//i.test(String(out[k]))) delete out[k];
  });
  return out;
}

function stripTags_(s) { return String(s || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ''); }
function decodeEntities_(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, function (_, n) { try { return String.fromCodePoint(+n); } catch (e) { return ''; } }).replace(/&amp;/g, '&');
}
function cleanSubject_(s) { return String(s || '').replace(/^\s*(re|fwd?):\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Family EA email'; }
function snippet_(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function hashId_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 16);
}

/* ───────────────────────── Optional phone alerts (ntfy, free) ───────────────────────── */
/* Set Script Properties NTFY_TOPIC_ayo / NTFY_TOPIC_itunu to a long random topic name.
   Alerts never include details — only "open the app". */
function notify_(added) {
  Object.keys(added).forEach(function (p) {
    var list = added[p] || [];
    if (!list.length || !keysFor_(p).length) return;
    var text = list.length === 1 ? list[0] : list.length + ' new items: ' + list.slice(0, 3).join('; ') + (list.length > 3 ? '…' : '');
    push_(p, 'New from your EA', text);
  });
}

/** Sends one phone alert through ntfy to that person's own secret topic. */
/** One phone alert with the task text: to this person's phones (Web Push), and ntfy if it's set up. */
function push_(person, title, message) {
  var props = PropertiesService.getScriptProperties();
  title = String(title || 'Family EA').slice(0, 80); message = String(message || '').slice(0, 400);
  appendRow_('Alerts', { id: 'al' + Utilities.getUuid().slice(0, 8), person: person, ts: new Date().toISOString(), title: title, body: message });
  var sent = 0;
  try { sent = webPush_(person); } catch (e) { log_('warn', 'web push: ' + e); }
  var topic = props.getProperty('NTFY_TOPIC_' + person);
  if (!topic || props.getProperty('NTFY_OFF') === '1') return sent;
  var headers = { Title: title.replace(/[^\x20-\x7E]/g, '').slice(0, 60) || 'Family EA', Tags: 'house' };
  var appUrl = props.getProperty('APP_URL') || CFG.APP_URL;
  if (appUrl) headers.Click = appUrl;
  var tok = ntfyToken_();
  if (tok) headers.Authorization = 'Bearer ' + tok;
  try {
    var res = UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', payload: message, headers: headers, muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code >= 300) log_('warn', 'ntfy ' + code + ': ' + String(res.getContentText()).slice(0, 120));
    return sent + (code < 300 ? 1 : 0);
  } catch (e) { log_('warn', 'ntfy failed: ' + e); return sent; }
}

/* ───────────────────────── Family EA's own phone alerts (Web Push, free) ─────────────────────────
   The phone subscribes once ("Turn on alerts"). We send an empty, signed push; the app's service worker
   then fetches the alert text from here with that person's key and shows it. No third-party service. */

var PUSH_HOSTS_ = /^https:\/\/(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
var EC_ = null;
function ec_() {
  if (EC_) return EC_;
  var B = function (h) { return BigInt('0x' + h); };
  EC_ = {
    p: B('ffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
    n: B('ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
    gx: B('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
    gy: B('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),
    Z: BigInt(0), O: BigInt(1), T: BigInt(2), H: BigInt(3), F: BigInt(4), E: BigInt(8)
  };
  return EC_;
}
function emod_(a, m) { var r = a % m; return r < ec_().Z ? r + m : r; }
function einv_(a, m) {
  var C = ec_(), lm = C.O, hm = C.Z, low = emod_(a, m), high = m;
  while (low > C.O) { var r = high / low, nm = hm - lm * r, nw = high - low * r; hm = lm; high = low; lm = nm; low = nw; }
  return emod_(lm, m);
}
function edbl_(P) {
  var C = ec_(), p = C.p;
  if (P[2] === C.Z) return P;
  var delta = emod_(P[2] * P[2], p), gamma = emod_(P[1] * P[1], p), beta = emod_(P[0] * gamma, p);
  var alpha = emod_(C.H * (P[0] - delta) * (P[0] + delta), p);
  var x3 = emod_(alpha * alpha - C.E * beta, p);
  var z3 = emod_((P[1] + P[2]) * (P[1] + P[2]) - gamma - delta, p);
  var y3 = emod_(alpha * (C.F * beta - x3) - C.E * gamma * gamma, p);
  return [x3, y3, z3];
}
function eadd_(P, Q) {
  var C = ec_(), p = C.p;
  if (P[2] === C.Z) return Q; if (Q[2] === C.Z) return P;
  var z1z1 = emod_(P[2] * P[2], p), z2z2 = emod_(Q[2] * Q[2], p);
  var u1 = emod_(P[0] * z2z2, p), u2 = emod_(Q[0] * z1z1, p);
  var s1 = emod_(P[1] * Q[2] * z2z2, p), s2 = emod_(Q[1] * P[2] * z1z1, p);
  if (u1 === u2) return s1 === s2 ? edbl_(P) : [C.O, C.O, C.Z];
  var h = emod_(u2 - u1, p), i = emod_(C.T * h * C.T * h, p), j = emod_(h * i, p), r = emod_(C.T * (s2 - s1), p), v = emod_(u1 * i, p);
  var x3 = emod_(r * r - j - C.T * v, p);
  var y3 = emod_(r * (v - x3) - C.T * s1 * j, p);
  var z3 = emod_(((P[2] + Q[2]) * (P[2] + Q[2]) - z1z1 - z2z2) * h, p);
  return [x3, y3, z3];
}
function emul_(k) {
  var C = ec_(), R = [C.O, C.O, C.Z], G = [C.gx, C.gy, C.O], bits = k.toString(2);
  for (var i = 0; i < bits.length; i++) { R = edbl_(R); if (bits.charAt(i) === '1') R = eadd_(R, G); }
  if (R[2] === C.Z) return null;
  var zi = einv_(R[2], C.p), zi2 = emod_(zi * zi, C.p);
  return [emod_(R[0] * zi2, C.p), emod_(R[1] * zi2 * zi, C.p)];
}
function hex64_(b) { var h = b.toString(16); while (h.length < 64) h = '0' + h; return h; }
function hexBytes_(h) { var out = []; for (var i = 0; i < h.length; i += 2) { var v = parseInt(h.substr(i, 2), 16); out.push(v > 127 ? v - 256 : v); } return out; }
function bytesHex_(a) { return a.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function b64u_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
// 384 bits from Java's SecureRandom (via UUIDs), reduced into [1, n-1].
function escalar_() {
  var C = ec_(), h = '';
  for (var i = 0; i < 4; i++) h += Utilities.getUuid().replace(/-/g, '');
  return emod_(BigInt('0x' + h), C.n - C.O) + C.O;
}
function vapid_() {
  var props = PropertiesService.getScriptProperties(), d = props.getProperty('VAPID_D'), pub = props.getProperty('VAPID_PUB');
  if (d && pub) return { d: BigInt('0x' + d), pub: pub };
  var k = escalar_(), P = emul_(k);
  pub = b64u_(hexBytes_('04' + hex64_(P[0]) + hex64_(P[1])));
  props.setProperty('VAPID_D', hex64_(k)); props.setProperty('VAPID_PUB', pub);
  return { d: k, pub: pub };
}
/** ES256 signature (r||s, 64 bytes) over a UTF-8 string. */
function es256_(text, d) {
  var C = ec_();
  var e = emod_(BigInt('0x' + bytesHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8))), C.n);
  for (var tries = 0; tries < 8; tries++) {
    var k = escalar_(), R = emul_(k); if (!R) continue;
    var r = emod_(R[0], C.n); if (r === C.Z) continue;
    var s = emod_(einv_(k, C.n) * (e + r * d), C.n); if (s === C.Z) continue;
    return hexBytes_(hex64_(r) + hex64_(s));
  }
  throw new Error('sign failed');
}
function vapidHeader_(endpoint, v) {
  var aud = endpoint.match(/^https:\/\/[^\/]+/)[0];
  var head = b64u_(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  var claims = b64u_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + (Session.getEffectiveUser().getEmail() || 'adhome854@gmail.com') }));
  var jwt = head + '.' + claims + '.' + b64u_(es256_(head + '.' + claims, v.d));
  return 'vapid t=' + jwt + ', k=' + v.pub;
}
/** Phone says "send my alerts here" (or stop). Only real push services are accepted. */
function handlePushSub_(person, body) {
  var sub = body.sub || {}, ep = String(sub.endpoint || '');
  if (!PUSH_HOSTS_.test(ep) || ep.length > 1000) return { ok: false, error: 'bad_endpoint' };
  var existing = rows_('Pushes').filter(function (r) { return r.endpoint === ep; })[0];
  if (body.op === 'remove') { if (existing) updateRow_('Pushes', 'id', existing.id, { status: 'off' }); return { ok: true }; }
  var keys = sub.keys || {}, now = new Date().toISOString();
  var row = { person: person, endpoint: ep, p256dh: String(keys.p256dh || '').slice(0, 200), auth: String(keys.auth || '').slice(0, 100), status: 'on', created: now, lastOk: '' };
  if (existing) updateRow_('Pushes', 'id', existing.id, row); else { row.id = 'ps' + Utilities.getUuid().slice(0, 8); appendRow_('Pushes', row); }
  return { ok: true, devices: devicesFor_(person) };
}
function devicesFor_(person) { return rows_('Pushes').filter(function (r) { return r.person === person && r.status === 'on'; }).length; }
/** Sends an empty signed push to each of this person's phones. Returns how many accepted it. */
function webPush_(person) {
  var subs = rows_('Pushes').filter(function (r) { return r.person === person && r.status === 'on'; });
  if (!subs.length) return 0;
  var v = vapid_(), okN = 0;
  subs.forEach(function (s) {
    try {
      var res = UrlFetchApp.fetch(s.endpoint, { method: 'post', payload: '', muteHttpExceptions: true,
        headers: { Authorization: vapidHeader_(s.endpoint, v), TTL: '86400', Urgency: 'high' } });
      var code = res.getResponseCode();
      if (code >= 200 && code < 300) { okN++; updateRow_('Pushes', 'id', s.id, { lastOk: new Date().toISOString() }); }
      else if (code === 404 || code === 410) updateRow_('Pushes', 'id', s.id, { status: 'gone' });
      else log_('warn', 'web push ' + code + ': ' + String(res.getContentText()).slice(0, 200));
    } catch (e) { log_('warn', 'web push failed: ' + e); }
  });
  return okN;
}
/** The phone's service worker asks: what should I show? (Only this person's, last 2 days.) */
function alertsFor_(person, since) {
  var cut = Math.max(Date.now() - 2 * 86400000, Date.parse(since) || 0);
  return { ok: true, serverTime: new Date().toISOString(), alerts: rows_('Alerts').filter(function (a) { return a.person === person && (Date.parse(a.ts) || 0) > cut; })
    .slice(-5).map(function (a) { return { id: a.id, ts: a.ts, title: a.title, body: a.body }; }) };
}

/** The free ntfy account token: NTFY_TOKEN, or any script property whose value is an ntfy token (tk_…). */
function ntfyToken_() {
  var props = PropertiesService.getScriptProperties(), t = props.getProperty('NTFY_TOKEN');
  if (t) return String(t).trim();
  var all = props.getProperties();
  for (var k in all) if (/^tk_[A-Za-z0-9]{10,}$/.test(String(all[k]).trim())) return String(all[k]).trim();
  return '';
}

/** Run from the editor to see why a phone alert isn't arriving. */
function checkAlerts() {
  var topic = PropertiesService.getScriptProperties().getProperty('NTFY_TOPIC_ayo');
  if (!topic) { Logger.log('No alert channel for Ayo.'); return; }
  var h = { Title: 'Family EA' }, tok = ntfyToken_();
  if (tok) h.Authorization = 'Bearer ' + tok;
  Logger.log(tok ? 'Using your ntfy account token.' : 'No ntfy token set (NTFY_TOKEN).');
  var res = UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', payload: 'Test alert from the editor.', headers: h, muteHttpExceptions: true });
  Logger.log('ntfy replied ' + res.getResponseCode() + ': ' + String(res.getContentText()).slice(0, 300));
}

/* Short quotes and verses for the 8am alert (generated from app/quotes.js). */
// [theme, quote]. Same themes and order as app/quotes.js, so the 8am alert matches the app's theme of the day.
var ALERT_QUOTES = [
  ["Stoicism","“Such as are your habitual thoughts, such also will be the character of your mind.” — Marcus Aurelius, Meditations"],
  ["Stoicism","“If it is not right, do not do it; if it is not true, do not say it.” — Marcus Aurelius, Meditations"],
  ["Stoicism","“What stands in the way becomes the way.” — Marcus Aurelius, Meditations"],
  ["Stoicism","“It is not that we have a short space of time, but that we waste much of it.” — Seneca, On the Shortness of Life"],
  ["Stoicism","“We suffer more often in imagination than in reality.” — Seneca, Letters"],
  ["Stoicism","“Make the best use of what is in your power, and take the rest as it happens.” — Epictetus"],
  ["Stoicism","“It is difficulties that show what men are.” — Epictetus, Discourses"],
  ["Stoicism","“I have learned, in whatsoever state I am, therewith to be content.” — Philippians 4:11"],
  ["Stoicism","“Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself.” — Matthew 6:34"],
  ["Self-improvement","“Every action you take is a vote for the type of person you wish to become.” — James Clear, Atomic Habits"],
  ["Self-improvement","“You do not rise to the level of your goals. You fall to the level of your systems.” — James Clear, Atomic Habits"],
  ["Self-improvement","“We are what we repeatedly do. Excellence, then, is not an act, but a habit.” — Will Durant, on Aristotle"],
  ["Self-improvement","“Knowing is not enough; we must apply. Willing is not enough; we must do.” — Johann Wolfgang von Goethe"],
  ["Self-improvement","“First say to yourself what you would be; and then do what you have to do.” — Epictetus, Discourses"],
  ["Self-improvement","“Forgetting those things which are behind, and reaching forth unto those things which are before, I press toward the mark.” — Philippians 3:13–14"],
  ["Self-improvement","“Iron sharpeneth iron; so a man sharpeneth the countenance of his friend.” — Proverbs 27:17"],
  ["Self-improvement","“And let us not be weary in well doing: for in due season we shall reap, if we faint not.” — Galatians 6:9"],
  ["People & influence","“Remember that a person’s name is to that person the sweetest and most important sound in any language.” — Dale Carnegie"],
  ["People & influence","“The only way to get the best of an argument is to avoid it.” — Dale Carnegie"],
  ["People & influence","“Be a good listener. Encourage others to talk about themselves.” — Dale Carnegie"],
  ["People & influence","“Seek first to understand, then to be understood.” — Stephen Covey, The 7 Habits of Highly Effective People"],
  ["People & influence","“Let every man be swift to hear, slow to speak, slow to wrath.” — James 1:19"],
  ["People & influence","“A soft answer turneth away wrath: but grievous words stir up anger.” — Proverbs 15:1"],
  ["People & influence","“Let your speech be alway with grace, seasoned with salt.” — Colossians 4:6"],
  ["People & influence","“A man that hath friends must shew himself friendly.” — Proverbs 18:24"],
  ["Psychology","“Everything can be taken from a man but one thing: the last of the human freedoms, to choose one’s attitude in any given set of circumstances.” — Viktor Frankl, Man’s Search for Meaning"],
  ["Psychology","“He who has a why to live can bear almost any how.” — Friedrich Nietzsche"],
  ["Psychology","“Who looks outside, dreams; who looks inside, awakes.” — Carl Jung"],
  ["Psychology","“The art of being wise is the art of knowing what to overlook.” — William James, The Principles of Psychology"],
  ["Psychology","“Nothing in life is as important as you think it is, while you are thinking about it.” — Daniel Kahneman, Thinking, Fast and Slow"],
  ["Psychology","“For God hath not given us the spirit of fear; but of power, and of love, and of a sound mind.” — 2 Timothy 1:7"],
  ["Psychology","“Keep thy heart with all diligence; for out of it are the issues of life.” — Proverbs 4:23"],
  ["Society","“If men define situations as real, they are real in their consequences.” — W. I. Thomas, sociologist"],
  ["Society","“Neither the life of an individual nor the history of a society can be understood without understanding both.” — C. Wright Mills, The Sociological Imagination"],
  ["Society","“If you want to go fast, go alone. If you want to go far, go together.” — African proverb"],
  ["Society","“Two are better than one; because they have a good reward for their labour.” — Ecclesiastes 4:9"],
  ["Wealth & work","“It is not from the benevolence of the butcher, the brewer, or the baker that we expect our dinner, but from their regard to their own interest.” — Adam Smith, The Wealth of Nations"],
  ["Wealth & work","“Price is what you pay. Value is what you get.” — Warren Buffett"],
  ["Wealth & work","“Someone’s sitting in the shade today because someone planted a tree a long time ago.” — Warren Buffett"],
  ["Wealth & work","“Remember that time is money.” — Benjamin Franklin, Advice to a Young Tradesman"],
  ["Wealth & work","“Wealth consists not in having great possessions, but in having few wants.” — Epictetus"],
  ["Wealth & work","“The thoughts of the diligent tend only to plenteousness.” — Proverbs 21:5"],
  ["Wealth & work","“Seest thou a man diligent in his business? he shall stand before kings.” — Proverbs 22:29"],
  ["Wealth & work","“Thou shalt remember the LORD thy God: for it is he that giveth thee power to get wealth.” — Deuteronomy 8:18"],
  ["Belonging","“Not everything that is faced can be changed, but nothing can be changed until it is faced.” — James Baldwin"],
  ["Belonging","“You may not control all the events that happen to you, but you can decide not to be reduced by them.” — Maya Angelou, Letter to My Daughter"],
  ["Belonging","“Success is to be measured not so much by the position that one has reached in life as by the obstacles which he has overcome.” — Booker T. Washington, Up from Slavery"],
  ["Belonging","“If there is no struggle, there is no progress.” — Frederick Douglass"],
  ["Belonging","“Until the lions have their own historians, the history of the hunt will always glorify the hunter.” — African proverb, often quoted by Chinua Achebe"],
  ["Belonging","“Be not afraid of greatness: some are born great, some achieve greatness, and some have greatness thrust upon them.” — William Shakespeare, Twelfth Night"],
  ["Belonging","“I will praise thee; for I am fearfully and wonderfully made.” — Psalm 139:14"],
  ["Belonging","“Who knoweth whether thou art come to the kingdom for such a time as this?” — Esther 4:14"],
  ["Belonging","“Be not conformed to this world: but be ye transformed by the renewing of your mind.” — Romans 12:2"],
  ["Energy & stillness","“Nothing rests; everything moves; everything vibrates.” — The Kybalion"],
  ["Energy & stillness","“As above, so below; as below, so above.” — The Kybalion"],
  ["Energy & stillness","“If you want to find the secrets of the universe, think in terms of energy, frequency and vibration.” — Attributed to Nikola Tesla"],
  ["Energy & stillness","“In quietness and in confidence shall be your strength.” — Isaiah 30:15"],
  ["Energy & stillness","“And after the fire a still small voice.” — 1 Kings 19:12"],
  ["Energy & stillness","“Be still, and know that I am God.” — Psalm 46:10"],
  ["Energy & stillness","“Write the vision, and make it plain upon tables, that he may run that readeth it.” — Habakkuk 2:2"],
  ["Energy & stillness","“Thou shalt also decree a thing, and it shall be established unto thee.” — Job 22:28"],
  ["Energy & stillness","“What things soever ye desire, when ye pray, believe that ye receive them, and ye shall have them.” — Mark 11:24"],
  ["Yoga","“Yoga is the stilling of the fluctuations of the mind.” — Patanjali, Yoga Sutras 1.2"],
  ["Yoga","“Posture should be steady and comfortable.” — Patanjali, Yoga Sutras 2.46"],
  ["Yoga","“Yoga teaches us to cure what need not be endured and endure what cannot be cured.” — B. K. S. Iyengar, Light on Yoga"],
  ["Yoga","“You have a right to your actions, but never to the fruits of your actions.” — Bhagavad Gita 2.47"],
  ["Mindfulness","“Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.” — Thich Nhat Hanh"],
  ["Mindfulness","“You can’t stop the waves, but you can learn to surf.” — Jon Kabat-Zinn"],
  ["Mindfulness","“Almost everything will work again if you unplug it for a few minutes, including you.” — Anne Lamott"],
  ["Mindfulness","“Rest is not idleness, and to lie sometimes on the grass under trees on a summer’s day… is by no means a waste of time.” — John Lubbock"],
  ["Mindfulness","“A merry heart doeth good like a medicine.” — Proverbs 17:22"],
  ["Mindfulness","“Beloved, I wish above all things that thou mayest prosper and be in health, even as thy soul prospereth.” — 3 John 1:2"],
  ["Mindfulness","“Come unto me, all ye that labour and are heavy laden, and I will give you rest.” — Matthew 11:28"],
  ["Gratitude","“Gratitude is not only the greatest of virtues, but the parent of all the others.” — Cicero"],
  ["Gratitude","“Do not spoil what you have by desiring what you have not; remember that what you now have was once among the things you only hoped for.” — Epicurus"],
  ["Gratitude","“In every thing give thanks: for this is the will of God in Christ Jesus concerning you.” — 1 Thessalonians 5:18"],
  ["Gratitude","“This is the day which the LORD hath made; we will rejoice and be glad in it.” — Psalm 118:24"]
];

function quoteOfDay_(now) {
  if (!ALERT_QUOTES.length) return '';
  var day = Math.floor((now.getTime() + 3600000) / 86400000), themes = [];
  ALERT_QUOTES.forEach(function (q) { if (themes.indexOf(q[0]) < 0) themes.push(q[0]); });
  var k = themes[day % themes.length], pool = ALERT_QUOTES.filter(function (q) { return q[0] === k; });
  return k + ': ' + pool[Math.floor(day / themes.length) % pool.length][1];
}

/** Run once with your app's web address so tapping an alert opens the app. */
function setAppUrl(url) { PropertiesService.getScriptProperties().setProperty('APP_URL', String(url)); Logger.log('App URL saved.'); }

/* ───────────────────────── Lists, jots and reminders (instant, no EA run needed) ───────────────────────── */

var AISLES = [
  ['Fruit & veg', /\b(apple|banana|orange|lemon|lime|grape|berr|melon|mango|pear|plantain|tomato|potato|onion|garlic|ginger|pepper|chilli|carrot|lettuce|salad|spinach|cabbage|kale|broccoli|cucumber|mushroom|avocado|yam|okra|herb|coriander|parsley|veg|fruit)/],
  ['Meat & fish', /\b(chicken|beef|lamb|pork|mince|turkey|sausage|bacon|ham|goat|fish|salmon|tuna|cod|prawn|shrimp|mackerel|meat)/],
  ['Dairy & eggs', /\b(milk|cheese|butter|yog|cream|egg|custard)/],
  ['Bakery', /\b(bread|loaf|roll|bagel|wrap|pitta|croissant|bun|cake|muffin)/],
  ['Cupboard', /\b(rice|pasta|spaghetti|noodle|flour|sugar|salt|oil|vinegar|beans|lentil|tin|can|sauce|stock|cube|cereal|oats|tea|coffee|honey|jam|spice|seasoning|crisps|biscuit|chocolate|snack|nuts|garri|semolina)/],
  ['Frozen', /\b(frozen|ice cream|peas|chips)/],
  ['Drinks', /\b(water|juice|squash|cola|coke|lemonade|wine|beer|drink)/],
  ['Household', /\b(toilet|kitchen roll|tissue|bin bag|foil|cling|wash|detergent|softener|bleach|cleaner|sponge|dishwasher|battery|bulb)/],
  ['Toiletries', /\b(shampoo|conditioner|soap|shower|toothpaste|toothbrush|deodorant|razor|lotion|cream|pads|tampon|nappies)/]
];
function aisleFor_(name) {
  var n = String(name || '').toLowerCase();
  for (var i = 0; i < AISLES.length; i++) if (AISLES[i][1].test(n)) return AISLES[i][0];
  return 'Other';
}

function uid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

/** Accepts an ISO time between yesterday and ~13 months ahead; anything else means "no reminder". */
function parseWhen_(v, now) {
  if (!v) return '';
  var t = Date.parse(String(v));
  if (isNaN(t)) return '';
  if (t < now.getTime() - 86400000 || t > now.getTime() + 400 * 86400000) return '';
  return new Date(t).toISOString();
}

/** One line of thanks a day (or more). Private unless the person shares that entry. */
function handleGratitude_(person, body, now) {
  var op = String(body.op || '');
  if (op === 'add') {
    var text = String(body.text || '').trim().slice(0, 300);
    if (!text) return { ok: false, error: 'empty' };
    var id = 'gr_' + uid_();
    appendRow_('Gratitude', { id: id, person: person, day: londonDay_(now), text: text, shared: body.shared ? '1' : '', created: now.toISOString() });
    return { ok: true, id: id, day: londonDay_(now) };
  }
  var g = rows_('Gratitude').filter(function (x) { return x.id === String(body.id || ''); })[0];
  if (!g || g.person !== person) return { ok: false, error: 'not_found' };
  if (op === 'share') updateRow_('Gratitude', 'id', g.id, { shared: body.shared ? '1' : '' });
  else if (op === 'delete') updateRow_('Gratitude', 'id', g.id, { person: '', text: '', shared: '' });
  else return { ok: false, error: 'bad_action' };
  return { ok: true, id: g.id };
}
function noteLevel_(v) { return ['gentle', 'important'].indexOf(String(v)) > -1 ? String(v) : 'normal'; }
function handleNote_(person, body, now) {
  var op = String(body.op || '');
  if (op === 'add') {
    var text = String(body.text || '').trim().slice(0, 500);
    if (!text) return { ok: false, error: 'empty' };
    var id = 'note_' + uid_();
    var at = parseWhen_(body.remindAt, now);
    appendRow_('Notes', { id: id, person: person, text: text, created: now.toISOString(), remindAt: at, status: 'open', sentAt: '', doneAt: '', level: noteLevel_(body.level), headsAt: '' });
    return { ok: true, id: id, remindAt: at };
  }
  var note = rows_('Notes').filter(function (n) { return n.id === String(body.id || ''); })[0];
  if (!note || note.person !== person) return { ok: false, error: 'not_found' }; // notes are private to their owner
  var patch;
  if (op === 'done') patch = { status: 'done', doneAt: now.toISOString() };
  else if (op === 'undo') patch = { status: 'open', doneAt: '' };
  else if (op === 'snooze') patch = { remindAt: parseWhen_(body.remindAt, now), sentAt: '', status: 'open' };
  else if (op === 'edit') {
    patch = {};
    if ('text' in body) { var t2 = String(body.text || '').trim().slice(0, 500); if (!t2) return { ok: false, error: 'empty' }; patch.text = t2; }
    if ('remindAt' in body) { patch.remindAt = parseWhen_(body.remindAt, now); patch.sentAt = ''; patch.headsAt = ''; }
    if ('level' in body) patch.level = noteLevel_(body.level);
  }
  else if (op === 'delete') patch = { status: 'deleted' };
  else return { ok: false, error: 'bad_action' };
  updateRow_('Notes', 'id', note.id, patch);
  return { ok: true, id: note.id, remindAt: patch.remindAt };
}

function addGrocery_(name, qty, by, now) {
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) return { ok: false, error: 'empty' };
  var active = rows_('Groceries').filter(function (g) { return !g.removed; });
  var dup = active.filter(function (g) { return !g.ticked && g.name.toLowerCase() === name.toLowerCase(); })[0];
  if (dup) {
    if (qty) updateRow_('Groceries', 'id', dup.id, { qty: String(qty).slice(0, 20) });
    return { ok: true, id: dup.id, dup: true };
  }
  if (active.length >= 300) return { ok: false, error: 'list_full' };
  var id = 'g_' + uid_();
  appendRow_('Groceries', { id: id, name: name, qty: String(qty || '').slice(0, 20), aisle: aisleFor_(name), addedBy: by, created: now.toISOString(), ticked: '', tickedBy: '', tickedAt: '', removed: '' });
  return { ok: true, id: id };
}

/** The grocery list is shared: both people can add, tick and clear. */
function handleGrocery_(person, body, now) {
  var op = String(body.op || '');
  if (op === 'add') return addGrocery_(body.name, body.qty, person, now);
  if (op === 'clear') {
    rows_('Groceries').forEach(function (g) { if (g.ticked && !g.removed) updateRow_('Groceries', 'id', g.id, { removed: '1' }); });
    return { ok: true };
  }
  var g = rows_('Groceries').filter(function (x) { return x.id === String(body.id || '') && !x.removed; })[0];
  if (!g) return { ok: false, error: 'not_found' };
  if (op === 'tick') updateRow_('Groceries', 'id', g.id, { ticked: '1', tickedBy: person, tickedAt: now.toISOString() });
  else if (op === 'untick') updateRow_('Groceries', 'id', g.id, { ticked: '', tickedBy: '', tickedAt: '' });
  else if (op === 'remove') updateRow_('Groceries', 'id', g.id, { removed: '1' });
  else if (op === 'qty') updateRow_('Groceries', 'id', g.id, { qty: String(body.qty || '').slice(0, 20) });
  else return { ok: false, error: 'bad_action' };
  return { ok: true, id: g.id };
}

/** "Remind me later" on any card. Private to the person who snoozed it. */
function handleSnooze_(person, body, now) {
  var itemId = String(body.itemId || '');
  var item = rows_('Items').filter(function (r) { return r.id === itemId; })[0];
  if (!item || !canSee_(person, item.person)) return { ok: false, error: 'not_found' };
  var id = person + '|' + itemId;
  var until = body.op === 'clear' ? '' : parseWhen_(body.until, now);
  if (body.op !== 'clear' && !until) return { ok: false, error: 'bad_time' };
  var row = { id: id, person: person, itemId: itemId, until: until, sentAt: '' };
  if (!updateRow_('Snoozes', 'id', id, row)) appendRow_('Snoozes', row);
  return { ok: true, until: until };
}

function handlePrefs_(person, body) {
  ALERT_KINDS_.forEach(function (k) { if (k in body) setMeta_('alerts_' + k + '_' + person, body[k] ? '1' : '0'); });
  if ('quiet' in body && ['off', '22-7', '21-8', '23-7'].indexOf(String(body.quiet)) > -1) setMeta_('quiet_' + person, String(body.quiet));
  if ('pause' in body) setMeta_('pause_' + person, body.pause ? londonDay_(new Date()) : '');
  if (body.waterLog && typeof body.waterLog === 'object') {
    var w = body.waterLog;
    setMeta_('water_' + person, JSON.stringify({ day: String(w.day || '').slice(0, 10), n: Math.max(0, Math.min(40, +w.n || 0)), goal: Math.max(1, Math.min(20, +w.goal || 8)), game: String(w.game || '').slice(0, 10) }));
  }
  return { ok: true };
}

/* ── Gentle, flexible nudges. Each can be switched off; quiet hours hold everything; at most 3 extra nudges a day. ── */
var ALERT_KINDS_ = ['morning', 'evening', 'water', 'open5', 'week', 'reply'];
function alertOn_(meta, p, k) { var v = meta['alerts_' + k + '_' + p]; return v !== '0'; }
function quietOf_(meta, p) { return meta['quiet_' + p] || '22-7'; }
function inQuiet_(meta, p, hour) {
  var q = quietOf_(meta, p); if (q === 'off') return false;
  var a = +q.split('-')[0], b = +q.split('-')[1];
  return hour >= a || hour < b;
}
function paused_(meta, p, day) { return meta['pause_' + p] === day; }
function gentle_(meta, p, day, title, msg) {
  var k = 'nudged_' + p, parts = String(meta[k] || '').split('|'), n = parts[0] === day ? +parts[1] || 0 : 0;
  if (n >= 3) return false;
  push_(p, title, msg);
  meta[k] = day + '|' + (n + 1); setMeta_(k, meta[k]);
  return true;
}
function dayOf_(iso) { var t = Date.parse(iso); return isNaN(t) ? '' : londonDay_(new Date(t)); }
function stillOpen_(person, now) {
  var today = londonDay_(now), out = [];
  rows_('Notes').filter(function (n) { return n.person === person && n.status === 'open' && n.remindAt && dayOf_(n.remindAt) <= today; })
    .forEach(function (n) { out.push(n.text); });
  rows_('Items').filter(function (r) { return canSee_(person, r.person) && r.status === 'open' && r.module === 'plan' && r.due && dayOf_(r.due) === today; })
    .forEach(function (r) { out.push(r.title); });
  return out;
}
/** What's left of today, soonest first, with times. Gentle jots and untimed things come last. */
function dayAhead_(person, now) {
  var today = londonDay_(now), out = [];
  rows_('Notes').filter(function (n) { return n.person === person && n.status === 'open' && n.remindAt && dayOf_(n.remindAt) === today && Date.parse(n.remindAt) >= now.getTime() - 3600000; })
    .forEach(function (n) { out.push({ t: Date.parse(n.remindAt), label: n.text + ' at ' + Utilities.formatDate(new Date(Date.parse(n.remindAt)), 'Europe/London', 'HH:mm'), gentle: n.level === 'gentle' }); });
  rows_('Items').filter(function (r) { return canSee_(person, r.person) && r.status === 'open' && r.module === 'plan' && r.due && dayOf_(r.due) === today; })
    .forEach(function (r) { out.push({ t: Date.parse(r.due), label: r.title + ' at ' + Utilities.formatDate(new Date(Date.parse(r.due)), 'Europe/London', 'HH:mm') }); });
  return out.sort(function (a, b) { return (a.gentle ? 1 : 0) - (b.gentle ? 1 : 0) || a.t - b.t; });
}
function overdue_(person, now) {
  var today = londonDay_(now);
  return rows_('Notes').filter(function (n) { return n.person === person && n.status === 'open' && n.level !== 'gentle' && n.remindAt && dayOf_(n.remindAt) === today && Date.parse(n.remindAt) < now.getTime(); })
    .map(function (n) { return n.text; });
}
function comingUp_(person, now, days) {
  var from = londonDay_(new Date(now.getTime() + 86400000)), to = londonDay_(new Date(now.getTime() + days * 86400000)), out = [];
  rows_('Items').filter(function (r) { return canSee_(person, r.person) && r.status === 'open' && r.module === 'plan' && r.due && dayOf_(r.due) >= from && dayOf_(r.due) <= to; })
    .sort(function (a, b) { return a.due < b.due ? -1 : 1; }).forEach(function (r) { out.push(r.title + (days > 1 ? ' (' + Utilities.formatDate(new Date(Date.parse(r.due)), 'Europe/London', 'EEE') + ')' : '')); });
  rows_('Notes').filter(function (n) { return n.person === person && n.status === 'open' && n.remindAt && dayOf_(n.remindAt) >= from && dayOf_(n.remindAt) <= to; })
    .forEach(function (n) { out.push(n.text); });
  return out;
}
function bullets_(list, max) { return list.slice(0, max).map(function (x) { return '\u2022 ' + x; }).join('\n') + (list.length > max ? '\n+' + (list.length - max) + ' more' : ''); }

function londonDay_(d) { return Utilities.formatDate(d, 'Europe/London', 'yyyy-MM-dd'); }
function londonHour_(d) { return +Utilities.formatDate(d, 'Europe/London', 'H'); }

function doneToday_(person, now) {
  var day = londonDay_(now);
  var isToday = function (iso) { var t = Date.parse(iso); return !isNaN(t) && londonDay_(new Date(t)) === day; };
  return rows_('Notes').filter(function (n) { return n.person === person && n.status === 'done' && isToday(n.doneAt); }).length +
    rows_('Actions').filter(function (a) { return a.person === person && isToday(a.ts); }).length +
    rows_('Groceries').filter(function (g) { return g.tickedBy === person && g.ticked && isToday(g.tickedAt); }).length;
}

/** Up to three short lines: what this person should do today. */
function planToday_(person, now) {
  var endOfDay = new Date(now.getTime()); endOfDay.setHours(23, 59, 59, 0);
  var snoozed = {};
  rows_('Snoozes').forEach(function (z) { if (z.person === person && z.until && Date.parse(z.until) > now.getTime()) snoozed[z.itemId] = true; });
  var out = [];
  rows_('Notes').filter(function (n) { return n.person === person && n.status === 'open' && n.remindAt && Date.parse(n.remindAt) <= endOfDay.getTime(); })
    .sort(function (a, b) { return a.remindAt < b.remindAt ? -1 : 1; })
    .forEach(function (n) { out.push(n.text); });
  var items = rows_('Items').filter(function (r) { return canSee_(person, r.person) && r.status === 'open' && !snoozed[r.id]; });
  items.filter(function (r) { return r.module === 'plan' && r.due && Date.parse(r.due) <= now.getTime() + 2 * 86400000; })
    .sort(function (a, b) { return a.due < b.due ? -1 : 1; })
    .forEach(function (r) { out.push(r.title); });
  var houses = items.filter(function (r) { return r.module === 'houses'; }).length;
  if (houses) out.push('Look at ' + houses + ' new house match' + (houses === 1 ? '' : 'es'));
  items.filter(function (r) {
    if (r.module !== 'intel' && r.module !== 'migration') return false;
    try { var dd = JSON.parse(r.data || '{}'); return dd.rag === 'act' && (dd.readBy || []).indexOf(person) < 0; } catch (e) { return false; }
  }).forEach(function (r) { out.push('Read: ' + r.title); });
  return out.slice(0, 3);
}

/** Runs every 5 minutes (set by setup): due reminders, snoozes ending, 8am plan, 8pm check-in. */
function tick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try { runTick_(new Date()); } catch (err) { log_('error', 'tick: ' + err); } finally { lock.releaseLock(); }
}

function runTick_(now) {
  var meta = metaMap_(), day = londonDay_(now), hour = londonHour_(now);
  // Your own reminders always come, but wait until quiet hours end.
  rows_('Notes').forEach(function (n) {
    if (n.status !== 'open' || !n.remindAt || n.sentAt || inQuiet_(meta, n.person, hour)) return;
    var due = Date.parse(n.remindAt);
    // Important things get one heads-up 30 minutes before; gentle ones never buzz, they just wait on the list.
    if ((n.level || 'normal') === 'important' && !n.headsAt && due > now.getTime() && due - now.getTime() <= 30 * 60000) {
      push_(n.person, 'Coming up at ' + Utilities.formatDate(new Date(due), 'Europe/London', 'HH:mm'), n.text);
      updateRow_('Notes', 'id', n.id, { headsAt: now.toISOString() });
      return;
    }
    if (due <= now.getTime()) {
      if ((n.level || 'normal') !== 'gentle') push_(n.person, (n.level === 'important' ? 'Now: ' : 'Reminder') + (n.level === 'important' ? n.text.slice(0, 50) : ''), n.text);
      updateRow_('Notes', 'id', n.id, { sentAt: now.toISOString() });
    }
  });
  var items = rows_('Items');
  rows_('Snoozes').forEach(function (z) {
    if (!z.until || z.sentAt || Date.parse(z.until) > now.getTime() || inQuiet_(meta, z.person, hour)) return;
    var it = items.filter(function (r) { return r.id === z.itemId; })[0];
    if (it && canSee_(z.person, it.person) && (it.status === 'open' || it.status === 'read')) push_(z.person, 'Back on your list', it.title);
    updateRow_('Snoozes', 'id', z.id, { sentAt: now.toISOString() });
  });
  Object.keys(CFG.PEOPLE).forEach(function (p) {
    if (!keysFor_(p).length) return; // only people who use the app
    if (inQuiet_(meta, p, hour) || paused_(meta, p, day)) return;
    function once(k, fn) { if (meta[k + '_' + p] === day) return; fn(); meta[k + '_' + p] = day; setMeta_(k + '_' + p, day); }
    if (hour >= 8 && hour < 11 && alertOn_(meta, p, 'morning')) once('morning', function () {
      var up = dayAhead_(p, now), q = quoteOfDay_(now), msg;
      if (!up.length) msg = 'A clear day so far. Jot anything new with + in Family EA.';
      else msg = 'First up: ' + up[0].label + (up.length > 1 ? '\nThen: ' + up[1].label : '') + (up.length > 2 ? '\n+' + (up.length - 2) + ' more today, each reminds you at its time.' : '');
      push_(p, 'Your day', msg + (q ? '\n\n' + q : ''));
    });
    if (hour >= 15 && hour < 17 && alertOn_(meta, p, 'water')) once('waterNudge', function () {
      var w = null; try { w = JSON.parse(meta['water_' + p] || 'null'); } catch (e) { w = null; }
      if (!w) return; // only for people who use the water tracker
      var n = w.day === day ? w.n : 0, goal = w.goal || 8;
      if (n >= Math.ceil(goal / 2)) return; // on track, so no nudge
      gentle_(meta, p, day, 'Water check', n + ' of ' + goal + ' glasses so far today. Time for one?' + (w.game && w.game !== 'off' ? ' Your next glass unlocks a ' + (w.game === 'french' ? 'French challenge' : 'puzzle') + '.' : ''));
    });
    if (hour >= 17 && hour < 19 && alertOn_(meta, p, 'open5')) once('open5', function () {
      var list = overdue_(p, now);
      if (list.length) gentle_(meta, p, day, list.length === 1 ? 'Still to do' : 'Still to do today', bullets_(list, 2) + '\nTick it off or move it to later.');
    });
    if (hour >= 18 && hour < 21 && Utilities.formatDate(now, 'Europe/London', 'u') === '7' && alertOn_(meta, p, 'week')) once('week', function () {
      var list = comingUp_(p, now, 7);
      if (list.length) gentle_(meta, p, day, 'Your week ahead', bullets_(list, 4));
    });
    if (hour >= 20 && hour < 23 && alertOn_(meta, p, 'evening')) once('evening', function () {
      var n = doneToday_(p, now), tomorrow = comingUp_(p, now, 1);
      push_(p, 'What are you grateful for today?', 'One line is enough.' + (n ? ' You got ' + n + ' thing' + (n === 1 ? '' : 's') + ' done today.' : '') + (tomorrow.length ? ' Tomorrow starts with: ' + tomorrow[0] + '.' : ''));
    });
  });
}

/* ───────────────────────── Tiny sheet database ───────────────────────── */

var SS_CACHE_ = null;
function ss_() {
  if (SS_CACHE_) return SS_CACHE_;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : null;
  if (!ss) {
    ss = SpreadsheetApp.create(CFG.SHEET_NAME);
    props.setProperty('SHEET_ID', ss.getId());
  }
  var schemaV = '2', migrate = props.getProperty('SCHEMA_V') !== schemaV;
  Object.keys(TABLES).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(TABLES[name]);
      sh.setFrozenRows(1);
    } else if (migrate) {
      var head = (sh.getDataRange().getValues()[0] || []);
      if (head.length < TABLES[name].length) sh.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]); // new columns get their names
    }
  });
  if (migrate) props.setProperty('SCHEMA_V', schemaV);
  SS_CACHE_ = ss;
  return ss;
}

function sheet_(name) { return ss_().getSheetByName(name); }

function rows_(name) {
  var values = sheet_(name).getDataRange().getValues();
  var head = TABLES[name];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var o = {};
    for (var c = 0; c < head.length; c++) {
      var v = values[i][c];
      v = v instanceof Date ? v.toISOString() : (v === null || v === undefined ? '' : String(v));
      o[head[c]] = /^'[=+\-@]/.test(v) ? v.slice(1) : v;
    }
    o._row = i + 1;
    out.push(o);
  }
  return out;
}

/** Text from emails is untrusted: stop anything that looks like a formula from running in the Sheet. */
function cell_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }

function appendRow_(name, obj) {
  sheet_(name).appendRow(TABLES[name].map(function (k) { return cell_(obj[k] === undefined ? '' : obj[k]); }));
}

function updateRow_(name, keyCol, keyVal, patch) {
  var row = rows_(name).filter(function (r) { return r[keyCol] === keyVal; })[0];
  if (!row) return false;
  var head = TABLES[name];
  var merged = head.map(function (k) { return cell_(has_(patch, k) ? patch[k] : row[k]); });
  sheet_(name).getRange(row._row, 1, 1, head.length).setValues([merged]);
  return true;
}

function upsertItem_(obj) {
  if (!updateRow_('Items', 'id', obj.id, obj)) appendRow_('Items', obj);
}

function metaMap_() {
  var m = {};
  rows_('Meta').forEach(function (r) { m[r.key] = r.value; });
  return m;
}
function setMeta_(key, value) {
  if (!updateRow_('Meta', 'key', key, { value: value })) appendRow_('Meta', { key: key, value: value });
}

function log_(level, text) {
  try { appendRow_('Log', { ts: new Date().toISOString(), level: level, text: String(text).slice(0, 500) }); } catch (e) {}
  try { Logger.log(level + ': ' + text); } catch (e) {}
}
