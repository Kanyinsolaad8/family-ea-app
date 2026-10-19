/* Mini challenges unlocked by each glass of water.
   Puzzles adapt to how you're doing; French follows the same levels. No network, no tracking. */
(function () {
  'use strict';

  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function uniq(a) { var s = {}; return a.filter(function (x) { var k = String(x); if (s[k]) return false; s[k] = 1; return true; }); }
  function choices(answer, near) {
    var opts = uniq([answer].concat(near.filter(function (x) { return x !== answer; })));
    var extra = 1;
    while (opts.length < 4) { opts = uniq(opts.concat([typeof answer === 'number' ? answer + extra * (extra % 2 ? 1 : -1) * (1 + rnd(3)) : answer + extra])); extra++; }
    return shuffle(opts.slice(0, 4));
  }
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /* ── Puzzles: number and letter patterns, odd one out. Level 1 (easy) to 6 (hard). ── */
  var PUZZLES = {
    1: [
      function () { var a = 2 + rnd(9), d = 2 + rnd(6), s = [0, 1, 2, 3].map(function (i) { return a + i * d; }), x = a + 4 * d;
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [x + d, x - 1, x + 1, x - d]), why: 'Each number goes up by ' + d + '.' }; },
      function () { var a = 40 + rnd(40), d = 3 + rnd(6), s = [0, 1, 2, 3].map(function (i) { return a - i * d; }), x = a - 4 * d;
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [x - d, x + d, x + 1, x - 2]), why: 'Each number goes down by ' + d + '.' }; }
    ],
    2: [
      function () { var a = 1 + rnd(4), r = 2 + rnd(2), s = [0, 1, 2, 3].map(function (i) { return a * Math.pow(r, i); }), x = a * Math.pow(r, 4);
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [x + a * r, x - r, s[3] + s[2], x * r]), why: 'Each number is ' + (r === 2 ? 'doubled' : 'multiplied by 3') + '.' }; },
      function () { var m = 3 + rnd(7), base = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).slice(0, 3).map(function (k) { return k * m; }), odd = m * (2 + rnd(9)) + 1 + rnd(m - 1);
        var all = shuffle(base.concat([odd])); return { q: 'Which one is the odd one out? ' + all.join(', '), a: odd, o: all, why: 'All the others are in the ' + m + ' times table.' }; }
    ],
    3: [
      function () { var a = 1 + rnd(5), p = 1 + rnd(4), s = [a], k; for (k = 1; k < 5; k++) s.push(k % 2 ? s[k - 1] + p : s[k - 1] * 2); var x = s[4] + p;
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [s[4] * 2, x + 1, x - 1, s[4] + 2 * p]), why: 'It alternates: add ' + p + ', then double.' }; },
      function () { var o = 1 + rnd(4), s = [0, 1, 2, 3].map(function (i) { return (i + o) * (i + o); }), x = (4 + o) * (4 + o);
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [x - 1, x + 1, s[3] + (s[3] - s[2]), x + 2]), why: 'They are square numbers: ' + o + '², ' + (o + 1) + '², ' + (o + 2) + '²…' }; },
      function () { var st = rnd(6), step = 2, s = [0, 1, 2, 3].map(function (i) { return ABC[st + i * step]; }), x = ABC[st + 4 * step];
        return { q: s.join(', ') + ', ?', a: x, o: shuffle(uniq([x, ABC[st + 4 * step + 1], ABC[st + 4 * step - 1], ABC[st + 5 * step]])), why: 'Skip one letter each time.' }; }
    ],
    4: [
      function () { var a = 1 + rnd(3), b = a + 1 + rnd(3), s = [a, b], k; for (k = 2; k < 6; k++) s.push(s[k - 1] + s[k - 2]); var x = s[5] + s[4];
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [x - 1, s[5] * 2, x + s[3] - s[4], x + 2]), why: 'Each number is the sum of the two before it.' }; },
      function () { var a = 1 + rnd(9), s = [a], d = 1 + rnd(2), k; for (k = 1; k < 5; k++) s.push(s[k - 1] + d * k); var x = s[4] + d * 5;
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [x + d, x - d, s[4] + d * 4, x + 1]), why: 'The gap grows by ' + d + ' each time.' }; },
      function () { var st = rnd(5), s = [st], k; for (k = 1; k < 4; k++) s.push(s[k - 1] + k + 1); var nx = s[3] + 5;
        return { q: s.map(function (i) { return ABC[i]; }).join(', ') + ', ?', a: ABC[nx], o: shuffle(uniq([ABC[nx], ABC[nx - 1], ABC[nx + 1], ABC[nx + 2]])), why: 'The gap grows: skip 1, then 2, then 3, then 4 letters.' }; }
    ],
    5: [
      function () { var a = 2 + rnd(5), b = 20 + rnd(10), s = [a, b, a + 3, b - 2, a + 6, b - 4], x = a + 9;
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [b - 6, x + 1, a + 8, x - 3]), why: 'Two patterns take turns: ' + a + ', ' + (a + 3) + ', ' + (a + 6) + '… and ' + b + ', ' + (b - 2) + ', ' + (b - 4) + '…' }; },
      function () { var o = 1 + rnd(3), s = [0, 1, 2, 3].map(function (i) { return Math.pow(i + o, 3); }), x = Math.pow(4 + o, 3);
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [Math.pow(4 + o, 2), x - (4 + o), x + 1, s[3] * 2]), why: 'They are cube numbers.' }; },
      function () { var primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41], st = rnd(6), s = primes.slice(st, st + 4), x = primes[st + 4];
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [x + 1, x - 1, x + 2, s[3] + 2]), why: 'They are prime numbers, in order.' }; }
    ],
    6: [
      function () { var a = 2 + rnd(4), s = [a], k; for (k = 1; k < 5; k++) s.push(s[k - 1] * 2 + (k % 2 ? 1 : -1)); var x = s[4] * 2 + 1;
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [s[4] * 2 - 1, s[4] * 2, x + 2, x - 3]), why: 'Double, then add 1 and subtract 1 in turn.' }; },
      function () { var n = 3 + rnd(4), s = [1, 2, 3, 4].map(function (i) { return i * (i + n); }), x = 5 * (5 + n);
        return { q: s.join(', ') + ', ?', a: x, o: choices(x, [x - 5, x + 5, s[3] + (s[3] - s[2]), x + 1]), why: 'Each is k × (k + ' + n + '): 1×' + (1 + n) + ', 2×' + (2 + n) + '…' }; },
      function () { var words = shuffle([['RIVER', 'OCEAN', 'LAKE', 'STREAM'], ['VIOLIN', 'CELLO', 'HARP', 'GUITAR']])[0], odd = pick(['MOUNTAIN', 'CANDLE', 'PILLOW']);
        var all = shuffle(words.slice(0, 3).concat([odd])); return { q: 'Which word doesn’t belong? ' + all.join(', '), a: odd, o: all, why: 'The other three belong together.' }; }
    ]
  };

  /* ── French: level 1 basics to level 4 work and life. fr → en. ── */
  var FRENCH = {
    1: [['bonjour', 'hello'], ['bonsoir', 'good evening'], ['merci', 'thank you'], ['s’il vous plaît', 'please'], ['au revoir', 'goodbye'], ['oui', 'yes'], ['non', 'no'],
      ['salut', 'hi'], ['l’eau', 'water'], ['le pain', 'bread'], ['le lait', 'milk'], ['la maison', 'house'], ['le chat', 'cat'], ['le chien', 'dog'], ['rouge', 'red'], ['bleu', 'blue'],
      ['vert', 'green'], ['jaune', 'yellow'], ['noir', 'black'], ['blanc', 'white'], ['deux', 'two'], ['trois', 'three'], ['cinq', 'five'], ['huit', 'eight'], ['dix', 'ten'],
      ['la pomme', 'apple'], ['le café', 'coffee'], ['le thé', 'tea'], ['l’ami', 'friend'], ['la famille', 'family'], ['le jour', 'day'], ['la nuit', 'night'],
      ['aujourd’hui', 'today'], ['demain', 'tomorrow'], ['hier', 'yesterday']],
    2: [['lundi', 'Monday'], ['mardi', 'Tuesday'], ['mercredi', 'Wednesday'], ['jeudi', 'Thursday'], ['vendredi', 'Friday'], ['samedi', 'Saturday'], ['dimanche', 'Sunday'],
      ['le travail', 'work'], ['la voiture', 'car'], ['la ville', 'town'], ['l’école', 'school'], ['le livre', 'book'], ['la cuisine', 'kitchen'], ['la chambre', 'bedroom'],
      ['le petit-déjeuner', 'breakfast'], ['le déjeuner', 'lunch'], ['le dîner', 'dinner'], ['manger', 'to eat'], ['boire', 'to drink'], ['dormir', 'to sleep'],
      ['parler', 'to speak'], ['aller', 'to go'], ['venir', 'to come'], ['avoir', 'to have'], ['être', 'to be'], ['faire', 'to do or make'], ['vouloir', 'to want'],
      ['heureux', 'happy'], ['fatigué', 'tired'], ['petit', 'small'], ['grand', 'big or tall'], ['chaud', 'hot'], ['froid', 'cold']],
    3: [['Comment ça va ?', 'How are you?'], ['Je m’appelle…', 'My name is…'], ['Je ne comprends pas.', 'I don’t understand.'], ['Pouvez-vous répéter ?', 'Can you repeat that?'],
      ['Où sont les toilettes ?', 'Where are the toilets?'], ['Combien ça coûte ?', 'How much does it cost?'], ['Je voudrais un café.', 'I would like a coffee.'],
      ['L’addition, s’il vous plaît.', 'The bill, please.'], ['Je suis désolé.', 'I’m sorry.'], ['Bonne journée !', 'Have a good day!'], ['À bientôt !', 'See you soon!'],
      ['De rien.', 'You’re welcome.'], ['Il fait beau.', 'The weather is nice.'], ['J’ai faim.', 'I’m hungry.'], ['J’ai soif.', 'I’m thirsty.'], ['Je suis en retard.', 'I’m late.'],
      ['Quelle heure est-il ?', 'What time is it?'], ['Parlez-vous anglais ?', 'Do you speak English?']],
    4: [['la réunion', 'meeting'], ['la conformité', 'compliance'], ['le risque', 'risk'], ['la gestion des risques', 'risk management'], ['l’éthique', 'ethics'],
      ['l’intelligence artificielle', 'artificial intelligence'], ['la réglementation', 'regulation'], ['le contrat', 'contract'], ['l’entretien d’embauche', 'job interview'],
      ['l’équipe', 'team'], ['le rendez-vous', 'appointment'], ['le loyer', 'rent'], ['le propriétaire', 'landlord'], ['le déménagement', 'house move'],
      ['reconnaissant', 'grateful'], ['la paix', 'peace'], ['l’espoir', 'hope'], ['la confiance', 'trust'], ['la réussite', 'success'], ['Tout est possible.', 'Everything is possible.'],
      ['Petit à petit, l’oiseau fait son nid.', 'Little by little, the bird builds its nest.']]
  };
  var FR_MAX = 4;

  function french(level) {
    var lv = Math.max(1, Math.min(FR_MAX, level));
    var pool = FRENCH[lv], pair = pick(pool), toEnglish = Math.random() < 0.55, plain = function (x) { return String(x).replace(/\s*[.!?]$/, ''); };
    var others = shuffle(pool.filter(function (p) { return p !== pair; })).slice(0, 3);
    if (toEnglish) return { q: 'What does « ' + pair[0] + ' » mean?', a: pair[1], o: shuffle([pair[1]].concat(others.map(function (p) { return p[1]; }))), why: '« ' + plain(pair[0]) + ' » means “' + plain(pair[1]) + '”.' };
    return { q: 'How do you say “' + plain(pair[1]) + '” in French?', a: pair[0], o: shuffle([pair[0]].concat(others.map(function (p) { return p[0]; }))), why: '“' + plain(pair[1]) + '” is « ' + plain(pair[0]) + ' ».' };
  }
  function puzzle(level) { var lv = Math.max(1, Math.min(6, level)); return pick(PUZZLES[lv])(); }

  window.FEA_GAMES = {
    kinds: { puzzle: 'Brain puzzles', french: 'French' },
    maxLevel: { puzzle: 6, french: FR_MAX },
    make: function (kind, level) {
      var c = kind === 'french' ? french(level) : puzzle(level);
      c.o = c.o.map(String); c.a = String(c.a); c.kind = kind; c.level = level;
      return c;
    },
    // Adaptive: two right in a row moves you up a level, a miss moves you down one.
    next: function (state, kind, right) {
      var s = Object.assign({ level: 1, run: 0, played: 0, correct: 0, best: 1 }, state || {});
      s.played++; if (right) { s.correct++; s.run++; } else s.run = 0;
      if (right && s.run >= 2) { s.level = Math.min(this.maxLevel[kind] || 6, s.level + 1); s.run = 0; }
      if (!right) s.level = Math.max(1, s.level - 1);
      s.best = Math.max(s.best, s.level);
      return s;
    }
  };
})();
