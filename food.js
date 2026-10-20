/* Family EA: food ideas for a busy couple. Nigerian at heart, Bristol in practice.
   One Sunday batch cook feeds most of the week; other meals are 15-minute put-togethers or no-cook.
   Calories, protein and prices are rough guides per portion (UK supermarket prices, 2026). */
window.FEA_FOOD = (function () {
  // ── Sunday batch cooks: one pot + one tray, about 75–90 minutes, smells once a week
  var BASES = [
    { id: 'stew', name: 'Tomato stew and oven chicken', mins: 80, cost: 24,
      what: 'A big pot of stew and a tray of seasoned chicken thighs. The stew carries jollof, wraps and spaghetti through the week.',
      week: { sun: 'Stew, chicken and rice with steamed veg', mon: 'Jollof rice with chicken (stew as the base)', tue: 'Stew-chicken wraps with salad', thu: 'Nigerian-style spaghetti in stew sauce' },
      lunch: 'Stew-chicken wrap with lettuce and cucumber',
      shop: ['2kg chicken thighs', '4 tins plum tomatoes', '4 red peppers', '2 scotch bonnets', '4 onions', 'Tomato purée', 'Stock cubes', 'Thyme and curry powder', '2kg rice', 'Tortilla wraps', '2 bagged salads', 'Frozen mixed veg', 'Spaghetti'] },
    { id: 'egusi', name: 'Egusi with spinach and beef', mins: 85, cost: 26,
      what: 'One pot of egusi, frozen in portions. Pairs with rice or a small swallow, and keeps for weeks in the freezer.',
      week: { sun: 'Egusi and beef with rice', mon: 'Egusi with a fist-sized swallow', tue: 'Chicken and veg noodle stir-fry (15 min)', thu: 'Egusi from the freezer with rice' },
      lunch: 'Leftover egusi and rice bowl',
      shop: ['400g ground egusi', '1kg frozen spinach', '1.2kg beef or assorted meat', 'Palm oil', 'Ground crayfish', '3 onions', '2 scotch bonnets', 'Stock cubes', 'Pounded yam flour', '2kg rice', '1kg chicken breast', '2 stir-fry veg packs', 'Egg noodles'] },
    { id: 'beans', name: 'Beans pot and suya chicken tray', mins: 75, cost: 20,
      what: 'A pot of beans (ewa) and a tray of suya-spiced chicken. Cheap, high in protein, and good with plantain from the air-fryer.',
      week: { sun: 'Beans and plantain with suya chicken', mon: 'Suya chicken bowls with rice and salad', tue: 'Beans and egg sauce with bread', thu: 'Suya chicken pittas with yoghurt sauce' },
      lunch: 'Beans and air-fryer plantain',
      shop: ['1kg brown or black-eyed beans (or 6 tins)', '6 plantains', 'Palm oil', '3 onions', '3 red peppers', '12 eggs', '1.5kg chicken thighs', 'Suya spice (yaji)', 'Pitta bread', 'Cucumber and tomatoes', '500g Greek yoghurt', '1kg rice'] },
    { id: 'pepper', name: 'Pepper soup and Greek chicken tray', mins: 80, cost: 25,
      what: 'A light pepper soup pot plus lemon-oregano chicken for Greek-style pittas. Lighter week, still filling.',
      week: { sun: 'Chicken pepper soup with yam', mon: 'Greek chicken with rice, tomato and cucumber', tue: 'Pepper soup with potatoes', thu: 'Greek chicken pittas with tzatziki' },
      lunch: 'Greek chicken pitta with cucumber and tomato',
      shop: ['1.5kg chicken or goat (soup)', 'Pepper soup spice', '1 yam or 1kg potatoes', '2 scotch bonnets', '1.5kg chicken thighs', '2 lemons', 'Garlic', 'Dried oregano', '2 packs pitta', 'Tzatziki (or yoghurt and cucumber)', 'Tomatoes and red onion', '1kg rice'] }
  ];

  // ── Ideas by part of the day. kcal and protein (g) are per portion, rough.
  var MEALS = [
    // breakfast: 10 minutes or less
    { slot: 'breakfast', name: 'Greek yoghurt, berries and oats', mins: 5, kcal: 320, protein: 22, cost: 0.9 },
    { slot: 'breakfast', name: 'Eggs on wholemeal toast with tomatoes', mins: 10, kcal: 380, protein: 20, cost: 0.8 },
    { slot: 'breakfast', name: 'Overnight oats with banana and peanut butter', mins: 2, kcal: 420, protein: 15, cost: 0.6, note: 'Make it the night before' },
    { slot: 'breakfast', name: 'Bread and egg (Naija street style) with peppers', mins: 10, kcal: 420, protein: 20, cost: 0.7 },
    { slot: 'breakfast', name: 'Moi moi slice and a boiled egg', mins: 3, kcal: 330, protein: 18, cost: 0.8, note: 'From the freezer' },
    { slot: 'breakfast', name: 'Banana, milk, oats and peanut butter smoothie', mins: 5, kcal: 400, protein: 20, cost: 0.8 },
    { slot: 'breakfast', name: 'Weekend: air-fryer plantain and scrambled eggs', mins: 15, kcal: 430, protein: 16, cost: 1.0 },
    { slot: 'breakfast', name: 'Weekend: akara and pap (or akara with bread)', mins: 25, kcal: 420, protein: 18, cost: 0.7, note: 'Blend the beans the night before' },
    // lunch: working from home, 15 minutes, one pan or none
    { slot: 'lunch', name: 'Leftover jollof bowl with chicken and salad', mins: 5, kcal: 550, protein: 35, cost: 1.8 },
    { slot: 'lunch', name: 'Greek-style chicken pitta with tzatziki', mins: 12, kcal: 520, protein: 38, cost: 2.0 },
    { slot: 'lunch', name: 'Tuna and sweetcorn jacket potato (microwave)', mins: 12, kcal: 480, protein: 30, cost: 1.2 },
    { slot: 'lunch', name: 'Egg fried rice with frozen veg (leftover rice)', mins: 12, kcal: 500, protein: 20, cost: 0.9 },
    { slot: 'lunch', name: 'Suya-spiced chicken salad bowl', mins: 10, kcal: 450, protein: 38, cost: 2.0 },
    { slot: 'lunch', name: 'Lentil and veg soup with bread', mins: 5, kcal: 400, protein: 20, cost: 0.8, note: 'Batch a pot when you can' },
    { slot: 'lunch', name: 'Hummus, falafel and salad wrap', mins: 8, kcal: 480, protein: 16, cost: 1.4 },
    { slot: 'lunch', name: 'Sardines on toast with tomatoes', mins: 6, kcal: 420, protein: 28, cost: 0.9 },
    // dinner: quick nights (the batch nights come from the plan)
    { slot: 'dinner', name: 'Yam or plantain with egg sauce', mins: 20, kcal: 550, protein: 22, cost: 1.3, style: 'quick' },
    { slot: 'dinner', name: 'Chicken and veg noodle stir-fry', mins: 15, kcal: 580, protein: 35, cost: 1.8, style: 'quick' },
    { slot: 'dinner', name: 'Air-fryer salmon with sweet potato wedges and greens', mins: 20, kcal: 560, protein: 34, cost: 2.6, style: 'quick' },
    { slot: 'dinner', name: 'Turkey mince chilli with rice (one pot)', mins: 20, kcal: 560, protein: 40, cost: 1.9, style: 'quick' },
    { slot: 'dinner', name: 'Fakeaway: Greek chicken gyros with chips and salad', mins: 25, kcal: 650, protein: 42, cost: 2.4, style: 'fakeaway' },
    { slot: 'dinner', name: 'Fakeaway: Thai-style peanut chicken noodles', mins: 20, kcal: 600, protein: 36, cost: 2.0, style: 'fakeaway' },
    { slot: 'dinner', name: 'Fakeaway: suya beef or chicken with onions, tomato and wraps', mins: 25, kcal: 600, protein: 40, cost: 2.5, style: 'fakeaway' },
    { slot: 'dinner', name: 'Fakeaway: peri-peri chicken, rice and corn', mins: 25, kcal: 620, protein: 42, cost: 2.2, style: 'fakeaway' },
    { slot: 'dinner', name: 'No-cook: rotisserie chicken, bagged salad and pitta', mins: 5, kcal: 550, protein: 45, cost: 3.0, style: 'nocook' }
  ];

  // ── Snacks. "Everyday" fits a gym week; "Treat" is fine, just measure it.
  var SNACKS = [
    { name: 'Greek yoghurt (150g) with a little honey', kcal: 130, protein: 15, kind: 'Everyday' },
    { name: '2 boiled eggs', kcal: 150, protein: 12, kind: 'Everyday' },
    { name: 'Roasted chickpeas (30g)', kcal: 120, protein: 6, kind: 'Everyday' },
    { name: 'Apple and 1 tbsp peanut butter', kcal: 190, protein: 4, kind: 'Everyday' },
    { name: 'Groundnuts, one small handful (25g)', kcal: 145, protein: 6, kind: 'Everyday', note: 'Measure it; easy to overdo' },
    { name: 'Protein yoghurt pot', kcal: 100, protein: 15, kind: 'Everyday' },
    { name: 'Cucumber and carrot sticks with 2 tbsp hummus', kcal: 110, protein: 3, kind: 'Everyday' },
    { name: 'Beef jerky or kilishi (30g)', kcal: 100, protein: 15, kind: 'Everyday' },
    { name: '2 rice cakes with cottage cheese', kcal: 150, protein: 10, kind: 'Everyday' },
    { name: 'Air-popped popcorn (20g)', kcal: 80, protein: 2, kind: 'Everyday' },
    { name: 'Banana or orange', kcal: 90, protein: 1, kind: 'Everyday' },
    { name: 'Plantain chips (25g)', kcal: 130, protein: 1, kind: 'Treat' },
    { name: 'Chin chin (30g)', kcal: 150, protein: 2, kind: 'Treat' },
    { name: '2 squares dark chocolate', kcal: 110, protein: 1, kind: 'Treat' },
    { name: '2 puff-puff', kcal: 200, protein: 3, kind: 'Treat' }
  ];

  // ── Friday treat night: one planned order, kept to about £25–30 for two
  var TREAT = {
    budget: '£25–30 for two',
    cuisines: ['Greek', 'Thai', 'Nigerian', 'Lebanese', 'Caribbean', 'Indian', 'Turkish', 'Vietnamese'],
    tips: [
      'Collect instead of delivery: it often saves the delivery and service fees.',
      'Share one big main and one side, then add rice or bread at home.',
      'Check the app’s offers tab first; pick from places with a deal that night.',
      'Wraps, gyros, rice bowls and pho are usually cheaper than platters and mixed grills.',
      'Order by 7pm, eat at the table, and leave the leftovers for Saturday lunch.'
    ]
  };

  var TIPS = [
    'Batch on Sunday with the window open and the extractor on: one smell, once a week.',
    'One pot and one oven tray lined with foil means very little washing up.',
    'Freeze stew and soups flat in bags; they thaw in minutes in a bowl of water.',
    'A gym-friendly plate: half veg or salad, a quarter protein, a quarter rice or swallow.',
    'Keep a fist-sized swallow, and add protein instead of extra carbs when you’re hungrier.',
    'Snack from a bowl, not the bag.'
  ];

  return { BASES: BASES, MEALS: MEALS, SNACKS: SNACKS, TREAT: TREAT, TIPS: TIPS, weekly: '£90–£115' };
})();
