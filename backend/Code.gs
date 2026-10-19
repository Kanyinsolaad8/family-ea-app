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
  Notes: ['id', 'person', 'text', 'created', 'remindAt', 'status', 'sentAt', 'doneAt'],
  Groceries: ['id', 'name', 'qty', 'aisle', 'addedBy', 'created', 'ticked', 'tickedBy', 'tickedAt', 'removed'],
  Snoozes: ['id', 'person', 'itemId', 'until', 'sentAt'],
  Seen: ['msgId', 'ts'],
  Meta: ['key', 'value'],
  Log: ['ts', 'level', 'text']
};

/* ───────────────────────── Web endpoints ───────────────────────── */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return json_({ ok: true, app: 'family-ea', time: new Date().toISOString() });
    var person = personForKey_(p.key);
    if (!person) return json_({ ok: false, error: 'bad_key' });
    return json_(buildBootstrap_(person, new Date()));
  } catch (err) {
    log_('error', 'doGet: ' + err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad_json' }); }
  var person = personForKey_(body.key);
  if (!person) return json_({ ok: false, error: 'bad_key' });
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (body.type === 'action') return json_(handleAction_(person, body, new Date()));
    if (body.type === 'message') return json_(handleMessage_(person, body, new Date()));
    if (body.type === 'note') return json_(handleNote_(person, body, new Date()));
    if (body.type === 'grocery') return json_(handleGrocery_(person, body, new Date()));
    if (body.type === 'snooze') return json_(handleSnooze_(person, body, new Date()));
    if (body.type === 'prefs') return json_(handlePrefs_(person, body));
    if (body.type === 'testalert') return json_({ ok: push_(person, 'Family EA', 'Test alert: phone alerts are working.') });
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
    }).map(function (n) { return { id: n.id, text: n.text, created: n.created, remindAt: n.remindAt, status: n.status, doneAt: n.doneAt }; }),
    groceries: rows_('Groceries').filter(function (g) {
      return !g.removed && (!g.ticked || (Date.parse(g.tickedAt) || 0) > now.getTime() - 2 * dayMs);
    }).map(function (g) { return { id: g.id, name: g.name, qty: g.qty, aisle: g.aisle, addedBy: g.addedBy, created: g.created, ticked: !!g.ticked, tickedBy: g.tickedBy }; }),
    snoozes: rows_('Snoozes').filter(function (z) { return z.person === person && z.until && Date.parse(z.until) > now.getTime(); })
      .map(function (z) { return { itemId: z.itemId, until: z.until }; }),
    doneToday: doneToday_(person, now),
    alerts: {
      topic: PropertiesService.getScriptProperties().getProperty('NTFY_TOPIC_' + person) || '',
      morning: meta['alerts_morning_' + person] !== '0',
      evening: meta['alerts_evening_' + person] !== '0'
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
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&');
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
function push_(person, title, message) {
  var props = PropertiesService.getScriptProperties();
  var topic = props.getProperty('NTFY_TOPIC_' + person);
  if (!topic) return false;
  var headers = { Title: String(title).replace(/[^\x20-\x7E]/g, '').slice(0, 60) || 'Family EA', Tags: 'house' };
  var appUrl = props.getProperty('APP_URL');
  if (appUrl) headers.Click = appUrl;
  try {
    var res = UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', payload: String(message).slice(0, 400), headers: headers, muteHttpExceptions: true });
    return res.getResponseCode() < 300;
  } catch (e) { log_('warn', 'ntfy failed: ' + e); return false; }
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

function handleNote_(person, body, now) {
  var op = String(body.op || '');
  if (op === 'add') {
    var text = String(body.text || '').trim().slice(0, 500);
    if (!text) return { ok: false, error: 'empty' };
    var id = 'note_' + uid_();
    var at = parseWhen_(body.remindAt, now);
    appendRow_('Notes', { id: id, person: person, text: text, created: now.toISOString(), remindAt: at, status: 'open', sentAt: '', doneAt: '' });
    return { ok: true, id: id, remindAt: at };
  }
  var note = rows_('Notes').filter(function (n) { return n.id === String(body.id || ''); })[0];
  if (!note || note.person !== person) return { ok: false, error: 'not_found' }; // notes are private to their owner
  var patch;
  if (op === 'done') patch = { status: 'done', doneAt: now.toISOString() };
  else if (op === 'undo') patch = { status: 'open', doneAt: '' };
  else if (op === 'snooze') patch = { remindAt: parseWhen_(body.remindAt, now), sentAt: '', status: 'open' };
  else if (op === 'edit') { var t2 = String(body.text || '').trim().slice(0, 500); if (!t2) return { ok: false, error: 'empty' }; patch = { text: t2 }; }
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
  if ('morning' in body) setMeta_('alerts_morning_' + person, body.morning ? '1' : '0');
  if ('evening' in body) setMeta_('alerts_evening_' + person, body.evening ? '1' : '0');
  return { ok: true };
}

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
  rows_('Notes').forEach(function (n) {
    if (n.status === 'open' && n.remindAt && !n.sentAt && Date.parse(n.remindAt) <= now.getTime()) {
      push_(n.person, 'Reminder', n.text);
      updateRow_('Notes', 'id', n.id, { sentAt: now.toISOString() });
    }
  });
  var items = rows_('Items');
  rows_('Snoozes').forEach(function (z) {
    if (!z.until || z.sentAt || Date.parse(z.until) > now.getTime()) return;
    var it = items.filter(function (r) { return r.id === z.itemId; })[0];
    if (it && canSee_(z.person, it.person) && (it.status === 'open' || it.status === 'read')) push_(z.person, 'Back on your list', it.title);
    updateRow_('Snoozes', 'id', z.id, { sentAt: now.toISOString() });
  });
  var meta = metaMap_(), day = londonDay_(now), hour = londonHour_(now);
  Object.keys(CFG.PEOPLE).forEach(function (p) {
    if (!keysFor_(p).length) return; // only people who use the app
    if (hour >= 8 && hour < 11 && meta['morning_' + p] !== day && meta['alerts_morning_' + p] !== '0') {
      var plan = planToday_(p, now);
      push_(p, 'Your plan for today', plan.length ? plan.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') : 'Nothing urgent today. Jot anything new with + in Family EA.');
      setMeta_('morning_' + p, day);
    }
    if (hour >= 20 && hour < 23 && meta['evening_' + p] !== day && meta['alerts_evening_' + p] !== '0') {
      var n = doneToday_(p, now);
      push_(p, 'Evening check', (n ? 'Done today: ' + n + '. ' : '') + 'Anything to jot down for tomorrow? Tap + in Family EA.');
      setMeta_('evening_' + p, day);
    }
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
  Object.keys(TABLES).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.appendRow(TABLES[name]);
      sh.setFrozenRows(1);
    }
  });
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
