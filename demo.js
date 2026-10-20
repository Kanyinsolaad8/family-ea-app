/* Demo mode: sample data only, never real. Mirrors the back end's privacy rule. */
(function () {
  'use strict';
  var DAY = 86400000;
  var now = Date.now();
  function at(days, h, m) { var d = new Date(now + days * DAY); d.setHours(h || 9, m || 0, 0, 0); return d.toISOString(); }
  function monthsAgo(n, day) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); d.setDate(Math.min(day, 28)); d.setHours(10, 0, 0, 0); return d.toISOString(); }
  function dayKey(days) { var d = new Date(now + days * DAY); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function canSee(viewer, owner) { return owner === viewer || owner === 'both' || owner === 'either'; }

  var store = {
    items: [
      { id: 'h-yate', module: 'houses', for: 'both', status: 'open', title: '3-bed semi, Yate BS37', created: at(-1), data: {
        price: '£1,150 pcm', score: 86, listed: 'Rightmove · listed yesterday', chips: ['Private garden', 'Driveway', '34 min to BS1'],
        why: 'Garden and driveway both confirmed in photos. Quiet cul-de-sac on a bus route.', lifestyle: 'Gym 0.6 mi · Swimming pool 1.2 mi',
        rows: [['Location', 26, 30], ['Commute', 17, 20], ['Must-haves', 30, 30], ['Nice-to-haves', 13, 20]], listingUrl: 'https://www.rightmove.co.uk/', mapUrl: 'https://maps.google.com/' } },
      { id: 'h-keyn', module: 'houses', for: 'both', status: 'open', title: '2-bed terrace, Keynsham BS31', created: at(-2), data: {
        price: '£1,095 pcm', score: 81, listed: 'Zoopla · listed 2 days ago', chips: ['Rear garden', '1 parking space', '28 min to BS1'],
        why: 'Shortest commute this week. Parking is one allocated space, not a driveway.', lifestyle: 'Gym 0.3 mi · Swimming pool 0.9 mi',
        rows: [['Location', 25, 30], ['Commute', 18, 20], ['Must-haves', 26, 30], ['Nice-to-haves', 12, 20]], listingUrl: 'https://www.zoopla.co.uk/', mapUrl: 'https://maps.google.com/' } },
      { id: 'h-thorn', module: 'houses', for: 'both', status: 'open', title: '3-bed end-terrace, Thornbury BS35', created: at(0), data: {
        price: '£1,195 pcm', score: 78, listed: 'OnTheMarket · listed today', chips: ['Private garden', 'Driveway', '41 min to BS1'],
        why: 'Biggest garden of the week. Close to the £1,200 ceiling, so little room on price.', lifestyle: 'Gym 1.4 mi · Swimming pool 1.6 mi',
        rows: [['Location', 23, 30], ['Commute', 14, 20], ['Must-haves', 30, 30], ['Nice-to-haves', 11, 20]], listingUrl: 'https://www.onthemarket.com/', mapUrl: 'https://maps.google.com/' } },
      { id: 'h-port', module: 'houses', for: 'both', status: 'done', title: '3-bed semi, Portishead BS20', created: at(-6), outcome: 'In the tracker · viewing held', data: {
        price: '£1,175 pcm', score: 84, listed: 'Rightmove', chips: ['Private garden', 'Driveway', '31 min to BS1'], decision: 'approve',
        why: 'Approved last week.', lifestyle: 'Gym 0.8 mi · Swimming pool 1.0 mi', rows: [['Location', 27, 30], ['Commute', 18, 20], ['Must-haves', 28, 30], ['Nice-to-haves', 11, 20]] } },

      { id: 'p-bins', module: 'plan', for: 'either', status: 'open', title: 'Recycling out tonight', summary: 'Collection is first thing tomorrow.', due: at(0, 20, 30), created: at(-1), data: { kind: 'deadline' } },
      { id: 'p-mot', module: 'plan', for: 'either', status: 'open', title: 'Car MOT due', summary: 'From a garage email. Not in your calendar yet.', due: at(4, 9), created: at(-1), data: { kind: 'deadline' } },
      { id: 'p-clash', module: 'plan', for: 'ayo', status: 'open', title: 'Cycling at 9:00 clashes with day trip', summary: 'You agreed cycling by email. The Family calendar has a day trip from 8:00.', due: at(5, 9), created: at(-1), data: { kind: 'clash', options: [{ id: 'a', label: 'Keep the trip, move cycling' }, { id: 'b', label: 'Keep cycling, trip from 12:00' }] } },
      { id: 'p-view', module: 'plan', for: 'both', status: 'open', title: 'House viewing, Yate', summary: '34 min drive · leave 16:50', due: at(8, 17, 30), created: at(0), data: { kind: 'event' } },
      { id: 'p-renew', module: 'plan', for: 'either', status: 'open', title: 'Phone contract renewal window opens', summary: 'Compare deals before it auto-renews.', due: at(10, 9), created: at(0), data: { kind: 'deadline' } },
      { id: 'p-swim', module: 'plan', for: 'itunu', status: 'open', title: 'Swimming lessons start', summary: 'Leisure centre · 19:00', due: at(14, 19), created: at(0), data: { kind: 'event' } },

      { id: 'i-a1', module: 'intel', for: 'ayo', status: 'open', title: 'FCA review of transaction monitoring', summary: 'What changed and what firms are now expected to do.', created: at(0, 9), data: { rag: 'act', source: 'Mon brief · FCA', why: 'Touches your AML controls work. Read before Thursday.' } },
      { id: 'i-a2', module: 'intel', for: 'ayo', status: 'open', title: 'Guidance consultation opens', summary: 'Draft changes to customer due diligence guidance.', created: at(0, 9), data: { rag: 'note', source: 'Mon brief · JMLSG', why: 'Good for your MLRO-track reading.' } },
      { id: 'i-t1', module: 'intel', for: 'itunu', status: 'open', title: 'Pension governance update', summary: 'Private to Itunu.', created: at(0, 9), data: { rag: 'act', source: 'Mon brief · TPR', why: '' } },
      { id: 'm-1', module: 'migration', for: 'both', status: 'open', title: 'Fee change consultation', summary: 'A proposed change to application fees is open for comment.', created: at(0, 10), data: { rag: 'act', source: 'Daily scout · 10:00', why: 'Check before your next application date.' } },
      { id: 'm-2', module: 'migration', for: 'both', status: 'read', title: 'No changes affecting your household', summary: 'Today’s scan found nothing that changes your route.', created: at(0, 10), data: { rag: 'ok', source: 'Daily scout · 10:00', why: 'Checked against your profile first.' } }
    ],
    history: [
      [0, 18, 'houses', 'both', 'Approved 3-bed semi, Portishead', 'In the tracker · viewing held', 'Scored 84/100. Agent message drafted for you to send.'],
      [0, 16, 'plan', 'both', 'London trip done', 'Trains and hotel under budget', 'Prices tracked from the month before.'],
      [0, 13, 'intel', 'ayo', 'FCA monitoring brief read', 'Saved to reading list', 'Two follow-up questions answered in chat.'],
      [0, 9, 'migration', 'both', 'Fee consultation flagged', 'Check · verified against your profile', 'Not urgent. Nothing changes until it closes.'],
      [0, 2, 'commands', 'either', 'Car insurance reminder set', 'Added to Family calendar', 'Reminder 14 days before renewal.'],
      [1, 26, 'houses', 'both', 'Skipped 2-bed flat, Clevedon', 'No private garden', 'Communal garden only. Hidden from later digests.'],
      [1, 19, 'intel', 'itunu', 'Itunu private item', 'Should never show for Ayo', ''],
      [1, 11, 'plan', 'ayo', 'Clash caught: work trip vs dentist', 'Dentist moved', 'Found by Plan ahead. Calendar updated.'],
      [1, 3, 'commands', 'ayo', 'Compared broadband deals', '3 options sent', 'Total cost over 24 months for each.'],
      [2, 28, 'houses', 'both', 'Never: agent with shared houses', 'All their listings hidden', 'Blocked for good.'],
      [2, 20, 'migration', 'both', 'Quiet month', 'All clear across 22 scans', 'Nothing affecting your household.'],
      [2, 12, 'plan', 'either', 'Swimming lessons booked', 'Added to the Family calendar', 'Bucket list item moved to Booked.'],
      [2, 5, 'intel', 'ayo', 'JMLSG consultation brief', 'Read', 'No action needed.'],
      [3, 25, 'plan', 'ayo', 'Clash caught: cycling vs travel', 'Cycling moved a week', 'Flagged the same day you agreed the date.'],
      [3, 18, 'houses', 'both', 'Approved 3-bed, Chepstow', 'Viewed · not taken', 'You passed because of road noise.'],
      [3, 9, 'commands', 'either', 'Car tax reminder', 'Paid on time', 'Reminder 7 days before.'],
      [4, 28, 'plan', 'both', 'Commitment checks switched on', 'Dates you agree by email get checked', 'Checked against both calendars.'],
      [4, 21, 'houses', 'both', 'House cards updated', 'Gym and pool distance added', 'Linked to your bucket list.'],
      [4, 14, 'houses', 'both', 'Portal alerts connected', 'Four portals feeding the search', 'Rightmove, Zoopla, OnTheMarket, OpenRent.'],
      [4, 8, 'migration', 'both', 'Migration scout started', 'Daily 10:00 checks', 'Every alert checked against your profile first.'],
      [5, 27, 'commands', 'either', 'Family EA set up', 'Shared inbox and calendars linked', 'The family Gmail and both calendars connected.'],
      [5, 12, 'intel', 'ayo', 'Sanctions update brief', 'Read', 'No action needed.']
    ].map(function (h, i) { return { id: 'hist-' + i, date: monthsAgo(h[0], h[1]), module: h[2], for: h[3], title: h[4], outcome: h[5], detail: h[6] }; }),
    queue: [],
    notes: [
      { id: 'n1', text: 'Renew the car insurance', created: at(-1), remindAt: at(0, 19), status: 'open', level: 'important' },
      { id: 'n2', text: 'Ask Tunde about the moving van', created: at(-2), remindAt: at(2, 18), status: 'open', level: 'normal' },
      { id: 'n3', text: 'Gift idea: cookbook for Mum', created: at(-3), remindAt: '', status: 'open', level: 'gentle' },
      { id: 'n4', text: 'Email the landlord about the boiler', created: at(-1), remindAt: '', status: 'open', level: 'normal' },
      { id: 'n5', text: 'Call the GP surgery about the letter', created: at(0, 7), remindAt: at(0, 10, 30), status: 'open', level: 'important' },
      { id: 'n6', text: 'Pick up the dry cleaning', created: at(0, 7), remindAt: at(0, 15), status: 'open', level: 'normal' }
    ],
    groceries: [
      { id: 'g1', name: 'Milk', qty: '2', aisle: 'Dairy & eggs', addedBy: 'itunu', created: at(-1), ticked: false },
      { id: 'g2', name: 'Plantain', qty: '4', aisle: 'Fruit & veg', addedBy: 'ayo', created: at(-1), ticked: false },
      { id: 'g3', name: 'Bread', qty: '', aisle: 'Bakery', addedBy: 'itunu', created: at(0), ticked: false },
      { id: 'g4', name: 'Rice', qty: '5kg', aisle: 'Cupboard', addedBy: 'ea', created: at(0), ticked: false },
      { id: 'g5', name: 'Washing up liquid', qty: '', aisle: 'Household', addedBy: 'ayo', created: at(-2), ticked: true, tickedBy: 'itunu' }
    ],
    snoozes: [],
    gratitude: [
      { id: 'gr1', person: 'ayo', day: dayKey(-1), text: 'A slow breakfast with Itunu before work.', shared: true, created: at(-1, 20) },
      { id: 'gr2', person: 'ayo', day: dayKey(-2), text: 'The viewing went better than expected.', shared: false, created: at(-2, 20) },
      { id: 'gr3', person: 'itunu', day: dayKey(-1), text: 'Finished my French lesson without notes.', shared: true, created: at(-1, 21) },
      { id: 'gr4', person: 'itunu', day: dayKey(-1), text: 'Private to Itunu.', shared: false, created: at(-1, 21) }
    ],
    doneToday: 2,
    alerts: { topic: 'fea-ayo-demo0channel', morning: true, evening: true, water: true, open5: true, week: true, reply: true, mindful: true, quiet: '22-7', paused: false },
    messages: [
      { id: 'd1', ts: new Date(now - 5 * 3600000).toISOString(), from: 'ea', text: 'Morning. Three new house matches and one calendar clash this week. Ask me anything or give me a job.' },
      { id: 'd2', ts: new Date(now - 3 * 3600000).toISOString(), from: 'me', text: 'Book a viewing for the Yate house next week, after work.', status: 'answered' },
      { id: 'd3', ts: new Date(now - 2.6 * 3600000).toISOString(), from: 'ea', text: 'Done. I’ve held a slot at 17:30 (leave 16:50).\nThe agent message is ready for you to send. I never contact agents myself.' }
    ]
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var listeners = [];
  window.FEA_DEMO = {
    person: 'ayo',
    onChange: function (fn) { listeners.push(fn); },
    bootstrap: function () {
      var p = this.person;
      return wait(450).then(function () {
        return clone({
          ok: true, person: p, name: 'Ayo', demo: true, serverTime: new Date().toISOString(), lastSync: new Date().toISOString(),
          runs: { houses: at(0, 16), migration: at(0, 10), intel: at(0, 9) },
          items: store.items.filter(function (i) { return canSee(p, i.for); }),
          history: store.history.filter(function (h) { return canSee(p, h.for); })
            .concat(store.items.filter(function (i) { return canSee(p, i.for) && i.status === 'done'; }).map(function (i) { return { id: i.id, date: i.created, module: i.module, for: i.for, title: i.title, outcome: i.outcome || '', detail: i.summary || '' }; }))
            .sort(function (a, b) { return a.date < b.date ? 1 : -1; }),
          queue: store.queue, messages: store.messages,
          notes: store.notes.filter(function (n) { return n.status !== 'deleted'; }), groceries: store.groceries.filter(function (g) { return !g.removed; }),
          snoozes: store.snoozes.filter(function (z) { return Date.parse(z.until) > Date.now(); }), doneToday: store.doneToday, alerts: store.alerts,
          gratitude: store.gratitude.filter(function (g) { return g.person && (g.person === p || g.shared); }).map(function (g) { return { id: g.id, day: g.day, text: g.text, shared: !!g.shared, from: g.person === p ? '' : g.person, created: g.created }; })
        });
      });
    },
    report: function (id) {
      var p = this.person;
      return wait(500).then(function () {
        var h = store.history.filter(function (x) { return x.id === id; })[0] || store.items.filter(function (x) { return x.id === id; })[0];
        if (!h || !canSee(p, h.for)) return { ok: false, error: 'not_found' };
        var it = store.items.filter(function (x) { return x.id === id; })[0] || {};
        var blocks = [
          { t: 'h', text: h.title },
          { t: 'p', text: 'Sample report. In the live app this is the full email your EA sent, tidied up for your phone.' },
          { t: 'li', text: h.outcome || h.summary || 'Outcome recorded by your EA.' },
          { t: 'li', text: h.detail || 'Details as written in the email.' },
          { t: 'p', text: 'Read more at the source.', links: [{ url: 'https://www.gov.uk/', text: 'GOV.UK' }] }
        ];
        return { ok: true, id: id, title: h.title, date: h.date || h.created, module: h.module, for: h.for, status: h.status || 'log',
          summary: it.summary || '', detail: h.detail || '', outcome: h.outcome || '', due: it.due || '', why: (it.data && it.data.why) || '',
          source: (it.data && it.data.source) || 'Demo', url: '', subject: h.title, blocks: blocks, hidden: h.module === 'intel' ? 2 : 0, related: [] };
      });
    },
    post: function (body) {
      var p = this.person;
      return wait(350).then(function () {
        if (body.type === 'note') {
          if (body.op === 'add') {
            if (!String(body.text || '').trim()) return { ok: false, error: 'empty' };
            var nid = 'n' + Date.now();
            store.notes.push({ id: nid, text: String(body.text).trim(), created: new Date().toISOString(), remindAt: body.remindAt || '', status: 'open', level: body.level || 'normal' });
            return { ok: true, id: nid, remindAt: body.remindAt || '' };
          }
          var n = store.notes.filter(function (x) { return x.id === body.id; })[0];
          if (!n) return { ok: false, error: 'not_found' };
          if (body.op === 'done') { n.status = 'done'; n.doneAt = new Date().toISOString(); store.doneToday++; }
          if (body.op === 'undo') { n.status = 'open'; store.doneToday = Math.max(0, store.doneToday - 1); }
          if (body.op === 'snooze') n.remindAt = body.remindAt;
          if (body.op === 'delete') n.status = 'deleted';
          if (body.op === 'edit') { if ('text' in body) n.text = String(body.text).trim(); if ('remindAt' in body) n.remindAt = body.remindAt || ''; if ('level' in body) n.level = body.level; }
          return { ok: true, id: n.id };
        }
        if (body.type === 'gratitude') {
          if (body.op === 'add') {
            if (!String(body.text || '').trim()) return { ok: false, error: 'empty' };
            var grid = 'gr' + Date.now(), dk = dayKey(0);
            store.gratitude.push({ id: grid, person: p, day: dk, text: String(body.text).trim(), shared: !!body.shared, created: new Date().toISOString() });
            return { ok: true, id: grid, day: dk };
          }
          var gg = store.gratitude.filter(function (x) { return x.id === body.id && x.person === p; })[0];
          if (!gg) return { ok: false, error: 'not_found' };
          if (body.op === 'share') gg.shared = !!body.shared;
          if (body.op === 'delete') { gg.person = ''; gg.text = ''; }
          return { ok: true, id: gg.id };
        }
        if (body.type === 'grocery') {
          if (body.op === 'add') {
            var gid = 'g' + Date.now();
            store.groceries.push({ id: gid, name: body.name, qty: body.qty || '', aisle: '', addedBy: p, created: new Date().toISOString(), ticked: false });
            return { ok: true, id: gid };
          }
          if (body.op === 'clear') { store.groceries.forEach(function (x) { if (x.ticked) x.removed = true; }); return { ok: true }; }
          var gr = store.groceries.filter(function (x) { return x.id === body.id; })[0];
          if (!gr) return { ok: false, error: 'not_found' };
          if (body.op === 'tick') { gr.ticked = true; gr.tickedBy = p; store.doneToday++; }
          if (body.op === 'untick') { gr.ticked = false; store.doneToday = Math.max(0, store.doneToday - 1); }
          if (body.op === 'remove') gr.removed = true;
          return { ok: true, id: gr.id };
        }
        if (body.type === 'snooze') {
          store.snoozes = store.snoozes.filter(function (z) { return z.itemId !== body.itemId; });
          if (body.op !== 'clear') store.snoozes.push({ itemId: body.itemId, until: body.until });
          return { ok: true };
        }
        if (body.type === 'prefs') { ['morning', 'evening', 'water', 'open5', 'week', 'reply', 'mindful'].forEach(function (k) { if (k in body) store.alerts[k] = !!body[k]; }); if ('quiet' in body) store.alerts.quiet = body.quiet; if ('pause' in body) store.alerts.paused = !!body.pause; return { ok: true }; }
        if (body.type === 'testalert') return { ok: true };
        if (body.type === 'message') {
          var id = 'm' + Date.now();
          var files = (body.files || []).map(function (f) { return { name: f.name, mime: f.mime, size: Math.round((f.data || '').length * 0.75) }; });
          if (!String(body.text || '').trim() && !files.length) return { ok: false, error: 'empty' };
          store.messages.push({ id: id, ts: new Date().toISOString(), from: 'me', text: String(body.text || '').trim().slice(0, 2000) || ('Sent ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '.'), status: 'sent', files: files });
          if (files.length) store.history.unshift({ id: 'up' + id, date: new Date().toISOString(), module: 'commands', for: p, title: 'Shared with your EA: ' + files.map(function (f) { return f.name; }).join(', '), outcome: files.length + ' file' + (files.length === 1 ? '' : 's') + ' saved to the family Drive', detail: String(body.text || '') });
          setTimeout(function () {
            var m = store.messages.filter(function (x) { return x.id === id; })[0];
            if (m) m.status = 'answered';
            store.messages.push({ id: 'r' + Date.now(), ts: new Date().toISOString(), from: 'ea', text: files.length ? 'Demo reply. Got ' + files.map(function (f) { return f.name; }).join(', ') + '. In the live app it\u2019s saved to your Drive folder and I read it on my next run.' : 'Demo reply. In the live app I answer on my next run and it lands right here.' });
            listeners.forEach(function (f) { f(); });
          }, 9000);
          return { ok: true, id: id, files: files };
        }
        var item = store.items.filter(function (i) { return i.id === body.itemId; })[0];
        if (!item || !canSee(p, item.for)) return { ok: false, error: 'not_found' };
        if (body.action === 'read' || body.action === 'unread') { item.status = body.action === 'read' ? 'read' : 'open'; return { ok: true, status: item.status }; }
        var actId = 'a' + Date.now();
        item.status = 'queued';
        if (item.module === 'houses') item.data.decision = body.action;
        if (String(body.action).indexOf('option:') === 0) item.data.choice = body.action.slice(7);
        store.queue.push({ id: actId, ts: new Date().toISOString(), itemId: item.id, text: body.label || body.action });
        setTimeout(function () {
          item.status = 'done';
          item.outcome = item.module === 'houses' ? (body.action === 'approve' ? 'Added to the tracker' : body.action === 'never' ? 'Blocked for good' : 'Hidden from digests') : 'Done by your EA';
          store.queue = store.queue.filter(function (q) { return q.id !== actId; });
          listeners.forEach(function (f) { f(); });
        }, 12000);
        return { ok: true, id: actId, status: 'queued' };
      });
    }
  };
})();
