/* Mini challenges unlocked by each glass of water.
   Puzzles adapt to how you're doing. French (A1 to C2) and Data & cloud grow by mastery. No network, no tracking. */
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

  /* ── Learning tracks: grow through levels by mastery, never knocked back a whole level.
     Each level has words ([a, b] pairs, asked both ways) and questions ([q, answer, [three wrong], why, say?]).
     "say" is French read aloud by the phone's own voice. ── */

  var FRENCH = [
    { name: 'A1', title: 'Beginner', goal: 15,
      words: [['bonjour', 'hello'], ['bonsoir', 'good evening'], ['merci', 'thank you'], ['s’il vous plaît', 'please'], ['au revoir', 'goodbye'], ['oui', 'yes'], ['non', 'no'],
        ['l’eau', 'water'], ['le pain', 'bread'], ['la maison', 'house'], ['le chien', 'dog'], ['rouge', 'red'], ['vert', 'green'], ['noir', 'black'], ['deux', 'two'], ['cinq', 'five'],
        ['dix', 'ten'], ['la famille', 'family'], ['l’ami', 'friend (male)'], ['aujourd’hui', 'today'], ['demain', 'tomorrow'], ['hier', 'yesterday'], ['le matin', 'morning'], ['le soir', 'evening']],
      qs: [
        ['Je ___ Itunu.', 'suis', ['es', 'est', 'ai'], '« Je suis » = I am. Être: je suis, tu es, il/elle est.', 'Je suis Itunu.'],
        ['J’___ deux frères.', 'ai', ['suis', 'as', 'a'], '« J’ai » = I have. Avoir: j’ai, tu as, il a.', 'J’ai deux frères.'],
        ['___ maison (the house)', 'la', ['le', 'les', 'un'], 'Maison is feminine: la maison.', 'la maison'],
        ['You meet someone at 9pm. You say…', 'Bonsoir !', ['Bonjour !', 'Bonne nuit !', 'Salut, à demain !'], 'Bonsoir is for the evening. Bonne nuit is only when going to bed.', 'Bonsoir !'],
        ['How do you ask someone’s name, politely?', 'Comment vous appelez-vous ?', ['Comment ça va ?', 'Où habitez-vous ?', 'Quel âge as-tu ?'], 'Vous is the polite “you”.', 'Comment vous appelez-vous ?'],
        ['« Ça va ? » A natural reply is…', 'Ça va bien, merci. Et toi ?', ['Je m’appelle Itunu.', 'J’ai vingt ans.', 'De rien.'], 'Ça va ? = How’s it going? Answer and bounce it back.', 'Ça va bien, merci. Et toi ?'],
        ['Nous ___ anglais. (we speak)', 'parlons', ['parle', 'parlez', 'parlent'], '-er verbs: nous parlons, vous parlez, ils parlent.', 'Nous parlons anglais.'],
        ['Which is plural?', 'les enfants', ['l’enfant', 'un enfant', 'cet enfant'], 'Les = the (plural).', 'les enfants'],
        ['J’habite ___ Bristol.', 'à', ['en', 'au', 'dans le'], 'Use à before a city.', 'J’habite à Bristol.'],
        ['“I don’t understand.”', 'Je ne comprends pas.', ['Je comprends pas ne.', 'Je ne pas comprends.', 'Ne je comprends pas.'], 'Negation wraps the verb: ne … pas.', 'Je ne comprends pas.']
      ] },
    { name: 'A2', title: 'Elementary', goal: 20,
      words: [['lundi', 'Monday'], ['mercredi', 'Wednesday'], ['samedi', 'Saturday'], ['le travail', 'work'], ['la voiture', 'car'], ['la gare', 'train station'], ['la cuisine', 'kitchen'],
        ['le petit-déjeuner', 'breakfast'], ['le dîner', 'dinner'], ['acheter', 'to buy'], ['payer', 'to pay'], ['chercher', 'to look for'], ['trouver', 'to find'], ['le loyer', 'rent'],
        ['la semaine prochaine', 'next week'], ['le week-end dernier', 'last weekend'], ['fatigué', 'tired'], ['content', 'pleased'], ['à gauche', 'on the left'], ['tout droit', 'straight on']],
      qs: [
        ['Hier, j’___ mangé une pizza.', 'ai', ['suis', 'avais', 'vais'], 'Passé composé with avoir: j’ai mangé.', 'Hier, j’ai mangé une pizza.'],
        ['Elle ___ allée au marché.', 'est', ['a', 'ai', 'va'], 'Aller takes être in the passé composé: elle est allée (note the extra -e).', 'Elle est allée au marché.'],
        ['Demain, je ___ travailler. (going to)', 'vais', ['va', 'suis', 'allais'], 'Near future: aller + infinitive. Je vais travailler.', 'Demain, je vais travailler.'],
        ['Je me ___ à 7 heures. (I get up)', 'lève', ['lèves', 'levé', 'lever'], 'Reflexive verb se lever: je me lève.', 'Je me lève à sept heures.'],
        ['You want to try a jacket on. You ask…', 'Je peux l’essayer ?', ['Je peux le payer ?', 'Vous avez la monnaie ?', 'C’est trop cher.'], 'Essayer = to try (on).', 'Je peux l’essayer ?'],
        ['Je vais ___ France en mai.', 'en', ['à', 'au', 'aux'], 'En before feminine countries (la France). Au for masculine (au Canada).', 'Je vais en France en mai.'],
        ['“How much is it?”', 'C’est combien ?', ['C’est quand ?', 'C’est où ?', 'C’est qui ?'], 'Combien = how much / how many.', 'C’est combien ?'],
        ['On a phone call: “Can you speak more slowly, please?”', 'Pouvez-vous parler plus lentement, s’il vous plaît ?', ['Pouvez-vous parler plus fort ?', 'Je peux parler, s’il vous plaît ?', 'Parlez-vous anglais ?'], 'Lentement = slowly. A life-saver on the phone.', 'Pouvez-vous parler plus lentement, s’il vous plaît ?'],
        ['Il y a une pharmacie ___ de la gare. (near)', 'près', ['loin', 'devant', 'sous'], 'Près de = near. Loin de = far from.', 'Il y a une pharmacie près de la gare.'],
        ['Tu ___ le film ? (did you see)', 'as vu', ['es vu', 'as voir', 'vois vu'], 'Voir → vu, with avoir: tu as vu.', 'Tu as vu le film ?']
      ] },
    { name: 'B1', title: 'Intermediate', goal: 25,
      words: [['la réunion', 'meeting'], ['le rendez-vous', 'appointment'], ['l’entretien', 'interview'], ['le congé', 'leave (time off)'], ['le délai', 'deadline / time allowed'],
        ['la conformité', 'compliance'], ['le risque', 'risk'], ['l’équipe', 'team'], ['améliorer', 'to improve'], ['réussir', 'to succeed'], ['oublier', 'to forget'],
        ['se souvenir de', 'to remember'], ['déménager', 'to move house'], ['le propriétaire', 'landlord / owner'], ['pourtant', 'yet / however'], ['donc', 'so / therefore']],
      qs: [
        ['Quand j’étais petite, j’___ souvent à la plage.', 'allais', ['irai', 'irais', 'avais'], 'Imparfait for habits in the past: j’allais.', 'Quand j’étais petite, j’allais souvent à la plage.'],
        ['Je lisais quand le téléphone ___.', 'a sonné', ['sonnait', 'sonnera', 'sonne'], 'Background in the imparfait, the interruption in the passé composé.', 'Je lisais quand le téléphone a sonné.'],
        ['L’année prochaine, nous ___ à Paris.', 'irons', ['allons aller', 'allions', 'irions'], 'Futur simple of aller: nous irons.', 'L’année prochaine, nous irons à Paris.'],
        ['Tu veux du café ? — Oui, j’___ veux bien.', 'en', ['y', 'le', 'lui'], 'En replaces du / de la / des + noun.', 'Oui, j’en veux bien.'],
        ['Tu vas à Londres ? — Oui, j’___ vais demain.', 'y', ['en', 'la', 'lui'], 'Y replaces a place (à Londres).', 'Oui, j’y vais demain.'],
        ['Say “the colleague I work with” correctly:', 'la collègue avec qui je travaille', ['la collègue que je travaille avec', 'la collègue où je travaille', 'la collègue dont je travaille'], 'French never ends on a preposition: la collègue avec qui je travaille.', 'C’est la collègue avec qui je travaille.'],
        ['Giving your opinion in a meeting:', 'À mon avis, il faut revoir ce processus.', ['À ma avis, il faut revoir ce processus.', 'Dans mon avis, il faut revoir ce processus.', 'Pour mon avis, il faut revoir ce processus.'], 'À mon avis = in my opinion (avis is masculine).', 'À mon avis, il faut revoir ce processus.'],
        ['Polite request: “Could you send me the report?”', 'Pourriez-vous m’envoyer le rapport ?', ['Pouvez-vous m’envoyez le rapport ?', 'Vous m’envoyer le rapport ?', 'Pourriez-vous envoyer moi le rapport ?'], 'Conditional pourriez-vous softens the request; pronoun before the infinitive.', 'Pourriez-vous m’envoyer le rapport ?'],
        ['Je ___ venir, mais je suis malade. (would like)', 'voudrais', ['voulais', 'voudrai', 'veux bien'], 'Conditional: je voudrais = I would like.', 'Je voudrais venir, mais je suis malade.'],
        ['Je lui ai parlé. « lui » means…', 'to him or to her', ['him only', 'them', 'it (a thing)'], 'Lui is the indirect pronoun for one person, either gender.', 'Je lui ai parlé.']
      ] },
    { name: 'B2', title: 'Upper intermediate', goal: 30,
      words: [['actuellement', 'currently (not “actually”)'], ['éventuellement', 'possibly (not “eventually”)'], ['une librairie', 'a bookshop (not a library)'], ['sensible', 'sensitive (not “sensible”)'],
        ['la gestion des risques', 'risk management'], ['la réglementation', 'regulation'], ['un enjeu', 'what is at stake'], ['un atout', 'an asset / strength'], ['en revanche', 'on the other hand'],
        ['néanmoins', 'nevertheless'], ['davantage', 'more'], ['malgré', 'despite'], ['une piste', 'a lead / an avenue'], ['mettre en œuvre', 'to implement']],
      qs: [
        ['Il faut que tu ___ ce dossier avant vendredi.', 'finisses', ['finis', 'finiras', 'finirais'], 'Il faut que + subjonctif: que tu finisses.', 'Il faut que tu finisses ce dossier avant vendredi.'],
        ['Bien qu’il ___ tard, elle continue.', 'soit', ['est', 'était', 'sera'], 'Bien que always takes the subjunctive.', 'Bien qu’il soit tard, elle continue.'],
        ['Si j’avais su, je ___ venue plus tôt.', 'serais', ['suis', 'serai', 'étais'], 'Si + plus-que-parfait → conditionnel passé: je serais venue.', 'Si j’avais su, je serais venue plus tôt.'],
        ['Le projet ___ je t’ai parlé avance bien.', 'dont', ['que', 'qui', 'où'], 'Parler de → dont.', 'Le projet dont je t’ai parlé avance bien.'],
        ['Quand je suis arrivée, la réunion ___ déjà commencé.', 'avait', ['a', 'aura', 'avais'], 'Plus-que-parfait: an action before another past action.', 'Quand je suis arrivée, la réunion avait déjà commencé.'],
        ['Which joins a contrast best? “Le coût est élevé; ___, les bénéfices sont clairs.”', 'en revanche', ['donc', 'parce que', 'ainsi'], 'En revanche = on the other hand.', 'Le coût est élevé ; en revanche, les bénéfices sont clairs.'],
        ['« Je suis actuellement en réunion » means…', 'I’m in a meeting right now', ['I’m actually in a meeting', 'I’ll eventually be in a meeting', 'I was in a meeting'], 'False friend: actuellement = currently.', 'Je suis actuellement en réunion.'],
        ['Disagreeing politely:', 'Je comprends votre point de vue, mais je ne suis pas tout à fait d’accord.', ['Vous avez tort, c’est tout.', 'Je suis pas d’accord du tout, voilà.', 'C’est n’importe quoi.'], 'Acknowledge, then nuance with “pas tout à fait”.', 'Je comprends votre point de vue, mais je ne suis pas tout à fait d’accord.'],
        ['Je cherche quelqu’un qui ___ parler arabe.', 'sache', ['sait', 'saura', 'savait'], 'Looking for someone who may not exist → subjunctive: qui sache.', 'Je cherche quelqu’un qui sache parler arabe.'],
        ['Pour que le client ___ satisfait, nous devons répondre vite.', 'soit', ['est', 'sera', 'serait'], 'Pour que + subjonctif.', 'Pour que le client soit satisfait, nous devons répondre vite.']
      ] },
    { name: 'C1', title: 'Advanced', goal: 35,
      words: [['avoir le cafard', 'to feel down'], ['poser un lapin', 'to stand someone up'], ['coûter les yeux de la tête', 'to cost a fortune'], ['tomber dans les pommes', 'to faint'],
        ['un bouquin', 'a book (informal)'], ['la bagnole', 'the car (slang)'], ['bosser', 'to work (informal)'], ['un enjeu de taille', 'a major stake'], ['à l’instar de', 'like / following the example of'],
        ['quand bien même', 'even if'], ['pour autant', 'for all that / even so'], ['d’autant plus que', 'all the more so since'], ['en l’occurrence', 'in this case'], ['faire preuve de', 'to show (a quality)']],
      qs: [
        ['Quand bien même il ___ raison, il aurait dû demander.', 'aurait', ['a', 'avait', 'ait'], 'Quand bien même + conditionnel.', 'Quand bien même il aurait raison, il aurait dû demander.'],
        ['Partons avant qu’il ne ___. (ne explétif)', 'pleuve', ['pleut', 'pleuvra', 'pleuvait'], 'Avant que + subjonctif; the “ne” adds no negation.', 'Partons avant qu’il ne pleuve.'],
        ['« Il fut nommé directeur en 1998. » « fut » is…', 'passé simple of être', ['imparfait of être', 'future of être', 'subjunctive of être'], 'Passé simple appears in writing and news: il fut = he was.', 'Il fut nommé directeur en mille neuf cent quatre-vingt-dix-huit.'],
        ['C’est le meilleur rapport que j’___ jamais lu.', 'aie', ['ai', 'avais', 'aurai'], 'After a superlative, the subjunctive is usual: que j’aie lu.', 'C’est le meilleur rapport que j’aie jamais lu.'],
        ['Most formal register for “I’m writing to you about…”:', 'Je me permets de vous contacter au sujet de…', ['Je t’écris pour…', 'Salut, c’est pour…', 'Bon, alors, c’est à propos de…'], 'Je me permets de… is the polished professional opener.', 'Je me permets de vous contacter au sujet de…'],
        ['« Il m’a posé un lapin » means…', 'He stood me up', ['He gave me a rabbit', 'He asked me a question', 'He tricked me'], 'Poser un lapin = not turning up.', 'Il m’a posé un lapin.'],
        ['“The risk is low; that said, we must stay vigilant.”', 'Le risque est faible ; cela dit, nous devons rester vigilants.', ['Le risque est faible ; donc, nous devons rester vigilants.', 'Le risque est faible ; parce que nous devons rester vigilants.', 'Le risque est faible ; alors que nous devons rester vigilants.'], 'Cela dit = that said.', 'Le risque est faible ; cela dit, nous devons rester vigilants.'],
        ['Le projet est risqué ; il n’est pas ___ voué à l’échec.', 'pour autant', ['par conséquent', 'c’est pourquoi', 'de ce fait'], 'Pour autant = for all that, even so (usually with a negative).', 'Le projet est risqué ; il n’est pas pour autant voué à l’échec.'],
        ['Which is informal French?', 'J’ai bossé toute la journée.', ['J’ai travaillé toute la journée.', 'J’ai œuvré toute la journée.', 'J’ai été à l’ouvrage toute la journée.'], 'Bosser is everyday, informal French.', 'J’ai bossé toute la journée.'],
        ['Elle a fait preuve d’un grand courage. Meaning…', 'She showed great courage', ['She proved she was brave once', 'She tested her courage', 'She needed great courage'], 'Faire preuve de = to show, demonstrate.', 'Elle a fait preuve d’un grand courage.']
      ] },
    { name: 'C2', title: 'Mastery', goal: 999,
      words: [['avoir maille à partir avec', 'to be at odds with'], ['à son corps défendant', 'reluctantly'], ['battre la campagne', 'to ramble / let the mind wander'], ['tirer les marrons du feu', 'to do the hard work for another’s benefit'],
        ['un pis-aller', 'a last resort'], ['de surcroît', 'moreover'], ['nonobstant', 'notwithstanding'], ['avoir l’apanage de', 'to have a monopoly on'], ['sans coup férir', 'effortlessly'],
        ['une gageure', 'a near-impossible challenge'], ['à l’envi', 'to one’s heart’s content'], ['faire florès', 'to be all the rage']],
      qs: [
        ['« Il eût fallu qu’il le sût. » « sût » is…', 'imparfait du subjonctif of savoir', ['passé simple of savoir', 'conditionnel of savoir', 'participe passé of savoir'], 'Literary concordance: imparfait du subjonctif. Spoken French would say “qu’il le sache”.', 'Il eût fallu qu’il le sût.'],
        ['Bring a person to a place (and leave them):', 'amener', ['apporter', 'emporter', 'rapporter'], 'Amener/emmener for people, apporter/emporter for things.', 'J’amène les enfants à l’école.'],
        ['Take something with you when you leave:', 'emporter', ['emmener', 'amener', 'apporter'], 'Emporter = take a thing away with you (à emporter = takeaway).', 'N’oublie pas d’emporter ton parapluie.'],
        ['« Il a accepté, à son corps défendant. » means…', 'He agreed, against his will', ['He agreed to defend himself', 'He agreed with enthusiasm', 'He agreed physically'], 'À son corps défendant = reluctantly.', 'Il a accepté, à son corps défendant.'],
        ['Most elegant: “Moreover, the report is late.”', 'De surcroît, le rapport est en retard.', ['En plus de ça, le rapport est en retard.', 'Et puis, le rapport est en retard.', 'Aussi, le rapport est en retard, quoi.'], 'De surcroît is formal and precise.', 'De surcroît, le rapport est en retard.'],
        ['« Ce n’est qu’un pis-aller. » means…', 'It’s only a last resort', ['It’s only getting worse', 'It’s a step forward', 'It’s just a rumour'], 'Un pis-aller = a stopgap, the lesser evil.', 'Ce n’est qu’un pis-aller.'],
        ['Nuance: « Je crains qu’il ne vienne » means…', 'I fear he will come', ['I fear he won’t come', 'I hope he comes', 'I know he’s coming'], 'Ne explétif: no negation. “I fear he won’t come” is « je crains qu’il ne vienne pas ».', 'Je crains qu’il ne vienne.'],
        ['Concordance: Je voulais qu’il ___ (spoken, modern French)', 'vienne', ['vînt', 'viendrait', 'venait'], 'Modern spoken French keeps the present subjunctive; « vînt » is literary.', 'Je voulais qu’il vienne.'],
        ['« Réussir en trois mois : une gageure ! » means…', 'Succeeding in three months: a near-impossible challenge!', ['…a guaranteed result!', '…a small bet!', '…an easy win!'], 'Une gageure (pronounced “gajure”) = a feat close to impossible.', 'Réussir en trois mois : une gageure !'],
        ['Which sentence has a literary passé simple used correctly?', 'Ils arrivèrent à l’aube et repartirent le soir.', ['Ils arrivèrent à l’aube et sont repartirent le soir.', 'Ils arrivaient à l’aube et repartîmes le soir.', 'Ils arrivâmes à l’aube et repartirent le soir.'], 'Ils arrivèrent / ils repartirent: third person plural -èrent / -irent.', 'Ils arrivèrent à l’aube et repartirent le soir.']
      ] }
  ];

  var DATA = [
    { name: 'Level 1', title: 'Data basics', goal: 15,
      words: [['a primary key', 'uniquely identifies each row'], ['metadata', 'data about data'], ['a schema', 'the structure: tables, columns, types'], ['structured data', 'fits rows and columns'],
        ['unstructured data', 'emails, PDFs, images'], ['a CSV file', 'comma-separated plain text'], ['a foreign key', 'points to a row in another table'], ['a null', 'a missing value']],
      qs: [
        ['Which is the best primary key for customers?', 'A system-generated customer ID', ['Customer surname', 'Date of birth', 'Postcode'], 'Keys must be unique and stable. Names and postcodes repeat and change.'],
        ['A spreadsheet column holds “£1,200”, “1200” and “twelve hundred”. The problem is…', 'Inconsistent format', ['Too many rows', 'A missing primary key', 'Unstructured storage'], 'Same meaning, different formats: standardise before analysis.'],
        ['Which is unstructured data?', 'A scanned passport image', ['A transactions table', 'A CSV of account balances', 'A list of sort codes'], 'Images and free text have no fixed rows and columns.'],
        ['Data type for “date of account opening”?', 'Date', ['Text', 'Integer', 'Boolean'], 'Store dates as dates so you can sort, compare and calculate ages.'],
        ['A null in “risk rating” means…', 'The value is missing or unknown', ['The rating is zero', 'The rating is low', 'The customer is closed'], 'Null is not zero. Treat it as “unknown” and investigate.'],
        ['1 terabyte is roughly…', '1,000 gigabytes', ['100 megabytes', '1,000 kilobytes', '10 gigabytes'], 'KB → MB → GB → TB, each about 1,000 times bigger.']
      ] },
    { name: 'Level 2', title: 'Quality & governance', goal: 20,
      words: [['completeness', 'all required values are present'], ['timeliness', 'available when needed, up to date'], ['validity', 'values follow the agreed rules'], ['uniqueness', 'no unwanted duplicates'],
        ['a data owner', 'accountable for a data set'], ['a data steward', 'looks after quality and definitions day to day'], ['data lineage', 'where data came from and how it changed'],
        ['a golden source', 'the single trusted origin'], ['reference data', 'shared code lists, e.g. country codes'], ['master data', 'core entities, e.g. customers']],
      qs: [
        ['BCBS 239 is mainly about…', 'Risk data aggregation and reporting', ['Capital ratios', 'Customer onboarding', 'Cyber security'], 'BCBS 239: banks must aggregate risk data accurately, completely and on time, especially under stress.'],
        ['A customer appears twice with slightly different names. Which dimension failed?', 'Uniqueness', ['Timeliness', 'Validity', 'Completeness'], 'Duplicates break uniqueness. Fix with matching rules and a golden record.'],
        ['“Date of birth: 31/02/1990.” Which dimension failed?', 'Validity', ['Uniqueness', 'Timeliness', 'Lineage'], '31 February cannot exist: it breaks a validity rule.'],
        ['Who is accountable for a data set’s quality?', 'The data owner', ['The data steward', 'The database admin', 'The end user'], 'Owners are accountable; stewards do the day-to-day care.'],
        ['A regulator asks how a figure in a risk report was produced. You need…', 'Data lineage', ['A bigger database', 'A new dashboard', 'More reference data'], 'Lineage traces the figure back through each transformation to its source.'],
        ['Which is reference data?', 'ISO country codes', ['A customer’s address', 'Today’s transactions', 'An alert narrative'], 'Reference data is a shared, slow-changing code list.'],
        ['A KYC refresh field is filled 9 months late. Which dimension?', 'Timeliness', ['Accuracy', 'Uniqueness', 'Validity'], 'The value may be right, but it arrived too late to be useful.']
      ] },
    { name: 'Level 3', title: 'SQL', goal: 25,
      words: [['SELECT', 'chooses columns'], ['WHERE', 'filters rows before grouping'], ['GROUP BY', 'groups rows for totals'], ['HAVING', 'filters after grouping'], ['INNER JOIN', 'only rows matching in both'],
        ['LEFT JOIN', 'all rows from the left, matches from the right'], ['COUNT(DISTINCT x)', 'number of different values'], ['ORDER BY', 'sorts the result']],
      qs: [
        ['Find customers with more than 5 alerts. Which clause filters the count?', 'HAVING COUNT(*) > 5', ['WHERE COUNT(*) > 5', 'ORDER BY COUNT(*) > 5', 'LIMIT 5'], 'WHERE cannot use aggregates. HAVING filters after GROUP BY.'],
        ['How do you find rows where email is missing?', 'WHERE email IS NULL', ['WHERE email = NULL', 'WHERE email = ""', 'WHERE NOT email'], 'Nothing equals NULL, not even NULL. Use IS NULL.'],
        ['Customers with NO transactions: customers LEFT JOIN transactions, then…', 'WHERE transactions.id IS NULL', ['WHERE transactions.id IS NOT NULL', 'GROUP BY customers.id', 'INNER JOIN instead'], 'The anti-join pattern: keep left rows that found no match.'],
        ['SELECT COUNT(DISTINCT country) FROM customers returns…', 'How many different countries there are', ['How many customers there are', 'The most common country', 'Every country once'], 'DISTINCT inside COUNT counts unique values.'],
        ['Keep only the latest row per customer. A common tool is…', 'ROW_NUMBER() OVER (PARTITION BY customer ORDER BY updated DESC)', ['GROUP BY *', 'SELECT TOP 1', 'UNION ALL'], 'Number rows within each customer, newest first, then keep row 1.'],
        ['Order of execution: which runs first?', 'FROM / JOIN', ['SELECT', 'ORDER BY', 'HAVING'], 'Logically: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY.'],
        ['customers INNER JOIN accounts returns…', 'Only customers that have a matching account', ['Every customer, with or without an account', 'Every account, even without a customer', 'Only customers with no account'], 'Inner joins drop rows with no match on either side.']
      ] },
    { name: 'Level 4', title: 'Cloud fundamentals', goal: 30,
      words: [['IaaS', 'rent servers, storage, networks'], ['PaaS', 'a managed platform to run your code'], ['SaaS', 'finished software, e.g. email'], ['a region', 'a geographic area of data centres'],
        ['an availability zone', 'separate data centres within a region'], ['elasticity', 'scale up and down automatically with demand'], ['object storage', 'files as objects in buckets'],
        ['serverless', 'run code without managing servers'], ['OpEx', 'pay as you go running costs']],
      qs: [
        ['Shared responsibility model: in IaaS, who patches the operating system?', 'The customer', ['The cloud provider', 'Nobody', 'The regulator'], 'In IaaS you own the OS and up. The provider secures the hardware and facilities.'],
        ['Which is SaaS?', 'Microsoft 365', ['A virtual machine', 'A managed database engine', 'A container platform'], 'SaaS is finished software you just use.'],
        ['Why deploy across two availability zones?', 'To survive one data centre failing', ['To cut costs in half', 'To store data in two countries', 'To speed up coding'], 'Zones are isolated, so one outage doesn’t take you down.'],
        ['Customer data must stay in the UK. You choose…', 'A UK region and check backups stay there too', ['Any region, encryption is enough', 'The cheapest region', 'A global CDN'], 'Data residency is set by region, and backups and replicas count.'],
        ['Best fit for storing millions of PDFs cheaply?', 'Object storage', ['A relational database', 'A virtual machine disk', 'A spreadsheet'], 'Object storage is cheap, durable and scales without limit.'],
        ['Cloud moves spending from CapEx towards…', 'OpEx', ['Fixed assets', 'Depreciation', 'Capital reserves'], 'You pay for what you use, as a running cost.'],
        ['“Scale out” means…', 'Add more machines', ['Use a bigger machine', 'Delete old data', 'Move to another region'], 'Scale out = more instances; scale up = a bigger instance.']
      ] },
    { name: 'Level 5', title: 'Data architecture', goal: 35,
      words: [['a data warehouse', 'clean, modelled data for reporting'], ['a data lake', 'raw data in any format, cheaply'], ['a lakehouse', 'lake storage with warehouse features'], ['ETL', 'transform before loading'],
        ['ELT', 'load raw, transform inside the platform'], ['a fact table', 'measurable events, e.g. transactions'], ['a dimension table', 'context, e.g. customer, date'], ['CDC', 'capturing only changed rows'],
        ['Parquet', 'a columnar file format'], ['partitioning', 'splitting data, e.g. by date, to read less']],
      qs: [
        ['Keep the full history when a customer’s risk rating changes. Use…', 'Slowly changing dimension type 2', ['Overwrite the old value', 'Delete and re-insert', 'A bigger server'], 'SCD2 adds a new row with valid-from and valid-to dates, so history is kept.'],
        ['Screening needs alerts within seconds of a payment. You need…', 'Streaming', ['A nightly batch', 'A monthly extract', 'A spreadsheet macro'], 'Streaming processes events as they happen.'],
        ['Why is Parquet fast for analytics?', 'It stores by column, so queries read only the columns they need', ['It is always encrypted', 'It stores one row per file', 'It is plain text'], 'Columnar storage plus compression means far less to read.'],
        ['An idempotent pipeline…', 'Gives the same result if re-run', ['Never fails', 'Runs only once a year', 'Has no tests'], 'Safe re-runs matter when jobs fail halfway.'],
        ['Star schema: “transaction amount” belongs in…', 'The fact table', ['A dimension table', 'The metadata catalogue', 'A lookup of countries'], 'Facts hold the numbers; dimensions describe them.'],
        ['Most queries filter by date. To speed them up…', 'Partition the table by date', ['Add more columns', 'Store it as CSV', 'Remove the date column'], 'Partition pruning skips data that can’t match.'],
        ['ELT became popular because…', 'Cloud warehouses can transform large data cheaply in place', ['Transforming is no longer needed', 'It removes the need for storage', 'It avoids SQL'], 'Load raw first, then transform with the warehouse’s power.']
      ] },
    { name: 'Level 6', title: 'Security & operations', goal: 999,
      words: [['least privilege', 'only the access needed, nothing more'], ['encryption at rest', 'stored data is unreadable without keys'], ['encryption in transit', 'data is protected as it moves, e.g. TLS'],
        ['tokenisation', 'swapping a value for a meaningless token'], ['masking', 'hiding parts of a value, e.g. ****1234'], ['RPO', 'how much data you can afford to lose'], ['RTO', 'how fast you must be back up'],
        ['a data contract', 'agreed schema and quality between producer and consumer'], ['FinOps', 'managing cloud cost as a team sport']],
      qs: [
        ['An analyst needs to count alerts by region but not see names. Best control?', 'Mask or remove names in their view', ['Give full access and trust them', 'Email them a full extract', 'Share the admin password'], 'Least privilege plus masking: they get what the task needs.'],
        ['Tokenisation vs encryption: tokenisation…', 'Replaces the value with a token, with the real value kept in a separate vault', ['Is the same as hashing', 'Can be reversed by anyone with the token', 'Makes data bigger'], 'Tokens have no mathematical link to the value; only the vault maps them back.'],
        ['RPO of 15 minutes means…', 'You can lose at most 15 minutes of data', ['You must recover within 15 minutes', 'Backups take 15 minutes', 'The system restarts every 15 minutes'], 'RPO = data loss tolerance; RTO = downtime tolerance.'],
        ['Under UK GDPR, a key principle for analytics data is…', 'Data minimisation', ['Keep everything forever', 'Collect first, decide later', 'Public by default'], 'Process only what you need, for a stated purpose.'],
        ['A pipeline silently starts sending nulls in “country”. What catches it early?', 'Data quality checks and a data contract', ['A faster server', 'More storage', 'A new colour scheme'], 'Contracts and automated tests turn silent breaks into alerts.'],
        ['RBAC grants access based on…', 'The person’s role', ['The time of day only', 'The file size', 'The person’s name alone'], 'ABAC goes further, using attributes like department or data sensitivity.'],
        ['Cloud bill jumped 40% overnight. First FinOps step?', 'Check cost by resource and tag to find the cause', ['Delete random resources', 'Switch provider immediately', 'Ignore it until month end'], 'Tag resources so every pound has an owner.']
      ] }
  ];

  var TRACKS = { french: FRENCH, data: DATA };

  function fromTrack(kind, levelIdx) {
    var tr = TRACKS[kind], lv = Math.max(0, Math.min(tr.length - 1, levelIdx));
    if (lv > 0 && Math.random() < 0.25) lv = rnd(lv); // a quick review from an earlier level now and then
    var L = tr[lv], useWord = L.words.length && Math.random() < (kind === 'french' ? 0.4 : 0.35);
    if (useWord) {
      var pair = pick(L.words), others = shuffle(L.words.filter(function (p) { return p !== pair; })).slice(0, 3), plain = function (x) { return String(x).replace(/\s*[.!?]$/, ''); };
      if (kind === 'french') {
        if (Math.random() < 0.55) return { q: 'What does « ' + pair[0] + ' » mean?', a: pair[1], o: shuffle([pair[1]].concat(others.map(function (p) { return p[1]; }))), why: '« ' + plain(pair[0]) + ' » means “' + plain(pair[1]) + '”.', say: pair[0], from: L.name };
        return { q: 'How do you say “' + plain(pair[1]) + '” in French?', a: pair[0], o: shuffle([pair[0]].concat(others.map(function (p) { return p[0]; }))), why: '“' + plain(pair[1]) + '” is « ' + plain(pair[0]) + ' ».', say: pair[0], from: L.name };
      }
      return { q: 'Which best describes ' + pair[0] + '?', a: pair[1], o: shuffle([pair[1]].concat(others.map(function (p) { return p[1]; }))), why: pair[0].charAt(0).toUpperCase() + pair[0].slice(1) + ': ' + pair[1] + '.', from: L.title };
    }
    var it = pick(L.qs);
    return { q: it[0], a: it[1], o: shuffle([it[1]].concat(it[2])), why: it[3], say: it[4] || '', from: kind === 'french' ? L.name : L.title };
  }
  function puzzle(level) { var lv = Math.max(1, Math.min(6, level)); return pick(PUZZLES[lv])(); }

  window.FEA_GAMES = {
    kinds: { puzzle: 'Brain puzzles', french: 'French', data: 'Data & cloud' },
    maxLevel: { puzzle: 6, french: FRENCH.length, data: DATA.length },
    tracks: TRACKS,
    isTrack: function (kind) { return !!TRACKS[kind]; },
    // Level label: "B1", or "SQL"; levels count from 1.
    label: function (kind, level) { var tr = TRACKS[kind]; if (!tr) return 'level ' + level; var L = tr[Math.max(0, Math.min(tr.length - 1, level - 1))]; return kind === 'french' ? L.name : L.title; },
    goal: function (kind, level) { var tr = TRACKS[kind]; return tr ? tr[Math.max(0, Math.min(tr.length - 1, level - 1))].goal : 2; },
    make: function (kind, level) {
      var c = TRACKS[kind] ? fromTrack(kind, level - 1) : puzzle(level);
      c.o = c.o.map(String); c.a = String(c.a); c.kind = kind; c.level = level;
      return c;
    },
    // Puzzles: two right in a row moves you up, a miss moves you down one.
    // Tracks: each right answer is a step towards the next level (3 in a row earns a bonus step); a miss costs one step, never a level.
    next: function (state, kind, right) {
      var s = Object.assign({ level: 1, run: 0, played: 0, correct: 0, best: 1, pts: 0 }, state || {});
      s.played++; if (right) { s.correct++; s.run++; } else s.run = 0;
      if (TRACKS[kind]) {
        if (right) s.pts += s.run >= 3 && s.run % 3 === 0 ? 2 : 1; else s.pts = Math.max(0, s.pts - 1);
        var goal = this.goal(kind, s.level);
        if (s.pts >= goal && s.level < TRACKS[kind].length) { s.level++; s.pts = 0; s.run = 0; }
      } else {
        if (right && s.run >= 2) { s.level = Math.min(this.maxLevel[kind] || 6, s.level + 1); s.run = 0; }
        if (!right) s.level = Math.max(1, s.level - 1);
      }
      s.best = Math.max(s.best, s.level);
      return s;
    }
  };
})();
