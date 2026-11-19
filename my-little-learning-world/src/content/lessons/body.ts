import type { Lesson } from '../types';

const BODY_JOBS: Record<string, string> = {
  head: 'We use our head to think.',
  eyes: 'We use our eyes to see.',
  ears: 'We use our ears to hear.',
  nose: 'We use our nose to smell.',
  mouth: 'We use our mouth to eat and talk.',
  neck: 'Our neck holds up our head and helps it turn.',
  hands: 'We use our hands to hold things.',
  fingers: 'We use our fingers to pick up small things and to count.',
  stomach: 'Our stomach, our tummy, holds the food we eat.',
  legs: 'We use our legs to walk.',
  feet: 'We use our feet to stand and walk.',
};
export const bodyJob = (part: string) => BODY_JOBS[part];
export const bodyName = (part: string) => (part === 'stomach' ? 'stomach' : part);
export const isPlural = (part: string) => ['eyes', 'ears', 'hands', 'fingers', 'legs', 'feet'].includes(part);

export const L1: Lesson = {
  id: 'L1',
  world: 'body',
  number: 1,
  title: 'Parts of the Body',
  icon: 'head',
  character: 'bibi',
  topics: Object.keys(BODY_JOBS).map((p) => ({ id: `L1.${p}`, label: p })),
  welcome: [
    'Hello, {name}! I am Bibi the bird.',
    'You have a wonderful body. Let us meet it, from your head down to your feet!',
  ],
  learn: [
    { art: 'head', topic: 'L1.head', lines: ['This is your head.', BODY_JOBS.head] },
    { art: 'eyes', topic: 'L1.eyes', lines: ['These are your eyes.', BODY_JOBS.eyes] },
    { art: 'ears', topic: 'L1.ears', lines: ['These are your ears.', BODY_JOBS.ears] },
    { art: 'nose', topic: 'L1.nose', lines: ['This is your nose.', BODY_JOBS.nose] },
    { art: 'mouth', topic: 'L1.mouth', lines: ['This is your mouth.', BODY_JOBS.mouth] },
    { art: 'neck', topic: 'L1.neck', lines: ['This is your neck.', BODY_JOBS.neck] },
    { art: 'hands', topic: 'L1.hands', lines: ['These are your hands.', BODY_JOBS.hands] },
    { art: 'fingers', topic: 'L1.fingers', lines: ['These are your fingers.', BODY_JOBS.fingers] },
    { art: 'stomach', topic: 'L1.stomach', lines: ['This is your stomach.', BODY_JOBS.stomach] },
    { art: 'legs', topic: 'L1.legs', lines: ['These are your legs.', BODY_JOBS.legs] },
    { art: 'feet', topic: 'L1.feet', lines: ['These are your feet.', BODY_JOBS.feet] },
  ],
  explore: {
    intro: 'Tap each part of the body to hear its name.',
    items: Object.keys(BODY_JOBS).map((p) => ({ art: p, name: `${p}.`, say: BODY_JOBS[p] })),
  },
  practice: [
    { type: 'photoBody', title: 'My Body, My Picture! Tap a part of your body.', mode: 'explore' },
    {
      type: 'dragMatch',
      title: 'Match each body part to its job.',
      pairs: [
        { item: 'eyes', target: 'butterfly', topic: 'L1.eyes', say: BODY_JOBS.eyes },
        { item: 'ears', target: 'drum', topic: 'L1.ears', say: BODY_JOBS.ears },
        { item: 'nose', target: 'flower', topic: 'L1.nose', say: BODY_JOBS.nose },
        { item: 'legs', target: 'walking', topic: 'L1.legs', say: BODY_JOBS.legs },
      ],
    },
    {
      type: 'missing',
      title: 'Oh no! Something is missing from this face. Can you find it?',
      rounds: [
        { missing: 'nose', choices: ['nose', 'eyes', 'mouth'], topic: 'L1.nose' },
        { missing: 'eyes', choices: ['mouth', 'eyes', 'ears'], topic: 'L1.eyes' },
        { missing: 'mouth', choices: ['nose', 'ears', 'mouth'], topic: 'L1.mouth' },
      ],
    },
    {
      type: 'listenSelect',
      title: 'Listen carefully, then tap the right picture.',
      rounds: [
        { prompt: 'What do we use to hear?', choices: ['ears', 'feet', 'nose'], answer: 'ears', topic: 'L1.ears', explain: BODY_JOBS.ears },
        { prompt: 'What do we use to hold things?', choices: ['eyes', 'hands', 'stomach'], answer: 'hands', topic: 'L1.hands', explain: BODY_JOBS.hands },
        { prompt: 'What do we use to stand and walk?', choices: ['feet', 'ears', 'mouth'], answer: 'feet', topic: 'L1.feet', explain: BODY_JOBS.feet },
        { prompt: 'What do we use to eat and talk?', choices: ['nose', 'mouth', 'fingers'], answer: 'mouth', topic: 'L1.mouth', explain: BODY_JOBS.mouth },
      ],
    },
    { type: 'photoBody', title: 'Question time! Find the body part on your picture.', mode: 'question' },
  ],
  song: {
    title: 'Head and Body',
    tune: 'bouncy',
    lines: [
      { text: 'Eyes to see and ears to hear,', art: 'eyes' },
      { text: 'nose to smell the flowers near.', art: 'nose' },
      { text: 'Mouth to eat and talk all day,', art: 'mouth' },
      { text: 'hands to hold and fingers play.', art: 'hands' },
      { text: 'Legs to walk and feet to stand,', art: 'feet' },
      { text: 'my body is wonderful and grand!', art: 'heart' },
    ],
  },
};

export const L2: Lesson = {
  id: 'L2',
  world: 'body',
  number: 2,
  title: 'Taking Care of the Body',
  icon: 'soap',
  character: 'bibi',
  topics: ['soap', 'sponge', 'toothbrush', 'toothpaste', 'towel', 'comb', 'water', 'nailcutter', 'routine'].map((t) => ({ id: `L2.${t}`, label: t })),
  welcome: [
    'Oh dear! Bibi played in the mud. My feathers are dirty!',
    'What do I need to get clean? Let us find out, {name}!',
  ],
  learn: [
    { art: 'soap', topic: 'L2.soap', lines: ['This is soap.', 'We use soap to wash off dirt and germs.'] },
    { art: 'sponge', topic: 'L2.sponge', lines: ['This is a sponge.', 'We use a sponge to scrub our body when we bathe.'] },
    { art: 'toothbrush', topic: 'L2.toothbrush', lines: ['This is a toothbrush.', 'We use a toothbrush to brush our teeth.'] },
    { art: 'toothpaste', topic: 'L2.toothpaste', lines: ['This is toothpaste.', 'We put toothpaste on the toothbrush to clean our teeth.'] },
    { art: 'towel', topic: 'L2.towel', lines: ['This is a towel.', 'We use a towel to dry our body.'] },
    { art: 'comb', topic: 'L2.comb', lines: ['This is a comb.', 'We use a comb to comb our hair.'] },
    { art: 'water', topic: 'L2.water', lines: ['This is water.', 'We use water to wash, to bathe and to rinse.'] },
    { art: 'nailcutter', topic: 'L2.nailcutter', lines: ['This is a nail cutter.', 'It cuts our nails short and clean.', 'A grown-up cuts our nails.'] },
  ],
  explore: {
    intro: 'Welcome to the bathroom! Tap each thing to hear what it is for.',
    items: [
      { art: 'soap', name: 'Soap.', say: 'We use soap to wash off dirt and germs.' },
      { art: 'sponge', name: 'Sponge.', say: 'We use a sponge to scrub our body when we bathe.' },
      { art: 'toothbrush', name: 'Toothbrush.', say: 'We use a toothbrush to brush our teeth.' },
      { art: 'toothpaste', name: 'Toothpaste.', say: 'We put toothpaste on the toothbrush to clean our teeth.' },
      { art: 'towel', name: 'Towel.', say: 'We use a towel to dry our body.' },
      { art: 'comb', name: 'Comb.', say: 'We use a comb to comb our hair.' },
      { art: 'water', name: 'Water.', say: 'We use water to wash, to bathe and to rinse.' },
      { art: 'nailcutter', name: 'Nail cutter.', say: 'A grown-up cuts our nails with a nail cutter.' },
    ],
  },
  practice: [
    {
      type: 'dragMatch',
      title: 'Match each thing to its job.',
      pairs: [
        { item: 'toothbrush', target: 'teeth', topic: 'L2.toothbrush', say: 'The toothbrush is for our teeth.' },
        { item: 'soap', target: 'bath', topic: 'L2.soap', say: 'Soap is for bathing.' },
        { item: 'comb', target: 'hair', topic: 'L2.comb', say: 'The comb is for our hair.' },
        { item: 'towel', target: 'drybody', topic: 'L2.towel', say: 'The towel is for drying our body.' },
      ],
    },
    {
      type: 'pictureId',
      title: 'Tap the right picture.',
      rounds: [
        { prompt: 'What do we use to brush our teeth?', choices: ['comb', 'toothbrush', 'spoon'], answer: 'toothbrush', topic: 'L2.toothbrush', explain: 'We use a toothbrush to brush our teeth.' },
        { prompt: 'What do we use to dry our body?', choices: ['towel', 'soap', 'ball'], answer: 'towel', topic: 'L2.towel', explain: 'We use a towel to dry our body.' },
      ],
    },
    {
      type: 'tapAll',
      title: 'Tap all the things we use to keep our body clean.',
      items: [
        { art: 'soap', correct: true },
        { art: 'ball', correct: false },
        { art: 'toothbrush', correct: true },
        { art: 'spoon', correct: false },
        { art: 'sponge', correct: true },
        { art: 'towel', correct: true },
      ],
      topic: 'L2.routine',
      done: 'Well done! Soap, a toothbrush, a sponge and a towel keep us clean.',
    },
    {
      type: 'routine',
      title: 'Let us watch a clean morning!',
      steps: [
        { art: 'wakeup', say: 'Good morning! First, we wake up.' },
        { art: 'toothbrush', say: 'We brush our teeth with a toothbrush and toothpaste.' },
        { art: 'bath', say: 'We bathe with soap, a sponge and water.' },
        { art: 'towel', say: 'We dry our body with a towel.' },
        { art: 'comb', say: 'We comb our hair.' },
        { art: 'nailcutter', say: 'When our nails are long, a grown-up cuts them.' },
        { art: 'washhands', say: 'And we wash our hands before we eat.' },
      ],
    },
    {
      type: 'sequence',
      title: 'Put the morning in order. What comes first?',
      steps: [
        { art: 'wakeup', say: 'Wake up.' },
        { art: 'toothbrush', say: 'Brush our teeth.' },
        { art: 'bath', say: 'Take a bath.' },
        { art: 'towel', say: 'Dry with a towel.' },
      ],
      topic: 'L2.routine',
    },
    { type: 'memory', title: 'Find the matching pairs!', cards: ['soap', 'toothbrush', 'comb', 'towel'], topic: 'L2.routine' },
  ],
  song: {
    title: 'Scrub, Scrub',
    tune: 'bright',
    lines: [
      { text: 'Scrub, scrub, soap and sponge,', art: 'sponge' },
      { text: 'brush, brush, teeth so bright.', art: 'toothbrush' },
      { text: 'Dry, dry, with my towel,', art: 'towel' },
      { text: 'comb, comb, hair just right!', art: 'comb' },
    ],
  },
};

export const L3: Lesson = {
  id: 'L3',
  world: 'body',
  number: 3,
  title: 'Toothache and Its Causes',
  icon: 'toothOuch',
  character: 'kiki',
  topics: [
    { id: 'L3.definition', label: 'what toothache is' },
    { id: 'L3.nobrush', label: 'not brushing' },
    { id: 'L3.germs', label: 'germs and plaque' },
    { id: 'L3.sweets', label: 'too many sweets' },
    { id: 'L3.sugary', label: 'sugary food and drinks' },
    { id: 'L3.decay', label: 'tooth decay' },
  ],
  welcome: ['Hello {name}. This is my friend, Kiki the Hippo.', 'Kiki has a story to tell you. Let us listen!'],
  learn: [
    { art: 'toothOuch', topic: 'L3.definition', lines: ['Toothache is pain in the tooth.', 'Let us learn what causes toothache.'] },
    { art: 'toothbrush', topic: 'L3.nobrush', lines: ['Not brushing our teeth properly can cause toothache.'] },
    { art: 'germ', topic: 'L3.germs', lines: ['Tiny germs live in our mouth.', 'Germs make sticky dirt on our teeth. It is called plaque.', 'Germs and plaque can hurt our teeth.'] },
    { art: 'sweets', topic: 'L3.sweets', lines: ['Eating too many sweets can cause toothache.'] },
    { art: 'fizzy', topic: 'L3.sugary', lines: ['Too many sugary foods and drinks can cause toothache too.'] },
    { art: 'plaque', topic: 'L3.decay', lines: ['When germs stay on our teeth, they make a little hole.', 'This is called tooth decay. It can give us toothache.'] },
  ],
  explore: {
    intro: 'Tap each picture to find out if it helps our teeth.',
    items: [
      { art: 'toothHappy', name: 'A happy tooth.', say: 'A clean tooth is a happy tooth!' },
      { art: 'germ', name: 'Germs.', say: 'Germs make plaque. Plaque can hurt our teeth.' },
      { art: 'sweets', name: 'Sweets.', say: 'Too many sweets can cause toothache.' },
      { art: 'fizzy', name: 'A sugary drink.', say: 'Too many sugary drinks can cause toothache.' },
      { art: 'toothbrush', name: 'Toothbrush.', say: 'Brushing takes the germs away.' },
      { art: 'toothOuch', name: 'Toothache.', say: 'Toothache is pain in the tooth.' },
    ],
  },
  practice: [
    {
      type: 'story',
      title: 'Kiki the Hippo and the Sweet Tooth',
      pages: [
        { art: ['kiki', 'sweets', 'fizzy'], say: 'Kiki the Hippo loved sweets and sugary drinks. Yum, yum, yum!', mood: 'happy' },
        { art: ['kiki', 'bed'], say: 'One night, Kiki was sleepy and did not brush her teeth.', mood: 'happy' },
        { art: ['germ', 'teeth'], say: 'Tiny germs had a party on Kiki\'s teeth. They made sticky plaque.', mood: 'happy' },
        { art: ['kiki', 'toothOuch'], say: 'The germs made a little hole. Ouch! Kiki had a toothache. Toothache is pain in the tooth.', mood: 'ouch' },
        { art: ['kiki', 'dentist'], say: 'Mama took Kiki to Doctor Ngozi, the kind dentist. She fixed Kiki\'s tooth.', mood: 'happy' },
        { art: ['kiki', 'toothbrush', 'toothHappy'], say: 'Now Kiki brushes her teeth every morning and every night. Kiki smiles a big, clean smile!', mood: 'happy' },
      ],
    },
    {
      type: 'sort',
      title: 'Which things are kind to our teeth? Put them in the right box.',
      bins: [
        { id: 'good', label: 'Good for our teeth', art: 'toothHappy' },
        { id: 'bad', label: 'Too much hurts our teeth', art: 'toothOuch' },
      ],
      items: [
        { art: 'toothbrush', bin: 'good', topic: 'L3.nobrush' },
        { art: 'sweets', bin: 'bad', topic: 'L3.sweets' },
        { art: 'glassWater', bin: 'good', topic: 'L3.sugary' },
        { art: 'fizzy', bin: 'bad', topic: 'L3.sugary' },
        { art: 'apple', bin: 'good', topic: 'L3.sugary' },
        { art: 'lollipop', bin: 'bad', topic: 'L3.sweets' },
      ],
    },
    {
      type: 'trueFalse',
      title: 'Is it true? Tap yes or no.',
      rounds: [
        { statement: 'Eating many sweets is good for our teeth.', art: 'sweets', isTrue: false, topic: 'L3.sweets', explain: 'Too many sweets can give us toothache.' },
        { statement: 'Toothache is pain in the tooth.', art: 'toothOuch', isTrue: true, topic: 'L3.definition', explain: 'Yes! Toothache is pain in the tooth.' },
        { statement: 'Germs and plaque can hurt our teeth.', art: 'germ', isTrue: true, topic: 'L3.germs', explain: 'Yes! Germs and plaque can hurt our teeth.' },
        { statement: 'Not brushing our teeth keeps them strong.', art: 'toothbrush', isTrue: false, topic: 'L3.nobrush', explain: 'Not brushing our teeth can cause toothache.' },
      ],
    },
  ],
  song: {
    title: 'Ouch, Kiki!',
    tune: 'gentle',
    lines: [
      { text: 'Too many sweets and no brushing at night,', art: 'sweets' },
      { text: 'germs make plaque and the tooth won\'t feel right.', art: 'germ' },
      { text: 'Ouch goes the tooth, that\'s a toothache, you see.', art: 'toothOuch' },
      { text: 'Brush away germs and be happy like me!', art: 'toothHappy' },
    ],
  },
};

export const L4: Lesson = {
  id: 'L4',
  world: 'body',
  number: 4,
  title: 'Prevention of Toothache',
  icon: 'toothbrush',
  character: 'kiki',
  topics: [
    { id: 'L4.twice', label: 'brush twice a day' },
    { id: 'L4.paste', label: 'toothbrush and fluoride toothpaste' },
    { id: 'L4.sweets', label: 'avoid too many sweets' },
    { id: 'L4.rinse', label: 'rinse after eating' },
    { id: 'L4.dentist', label: 'visit the dentist' },
  ],
  welcome: ['Kiki is back, and her teeth are getting stronger!', 'Will you help Kiki keep her teeth strong, {name}?'],
  learn: [
    { art: 'toothbrush', topic: 'L4.twice', lines: ['Brush your teeth two times every day.', 'Brush in the morning, and brush at night.'] },
    { art: 'toothpaste', topic: 'L4.paste', lines: ['Use a toothbrush and fluoride toothpaste.', 'A tiny bit of toothpaste, as small as a pea, is enough.', 'Spit it out. Do not swallow it.'] },
    { art: 'sweets', topic: 'L4.sweets', lines: ['Do not eat too many sweets.'] },
    { art: 'rinse', topic: 'L4.rinse', lines: ['Rinse your mouth with water after eating.'] },
    { art: 'dentist', topic: 'L4.dentist', lines: ['Visit the dentist for a check-up.', 'The dentist is our friend who keeps our teeth healthy.'] },
  ],
  explore: {
    intro: 'This is Kiki\'s day. Tap each picture.',
    items: [
      { art: 'morning', name: 'Morning.', say: 'In the morning, Kiki brushes her teeth.' },
      { art: 'night', name: 'Night.', say: 'At night, before bed, Kiki brushes her teeth again.' },
      { art: 'toothpaste', name: 'Toothpaste.', say: 'Kiki uses a tiny bit of fluoride toothpaste, as small as a pea.' },
      { art: 'rinse', name: 'Rinsing.', say: 'After eating, Kiki rinses her mouth with water.' },
      { art: 'apple', name: 'An apple.', say: 'Kiki eats fruit instead of too many sweets.' },
      { art: 'dentist', name: 'The dentist.', say: 'Kiki visits the dentist for a check-up.' },
    ],
  },
  practice: [
    { type: 'brush', title: 'Help Kiki brush her teeth!' },
    {
      type: 'pictureId',
      title: 'Tap the right picture.',
      rounds: [
        { prompt: 'Which snack is kind to our teeth?', choices: ['lollipop', 'apple', 'fizzy'], answer: 'apple', topic: 'L4.sweets', explain: 'Fruit is kind to our teeth. Do not eat too many sweets.' },
        { prompt: 'Who helps keep our teeth healthy?', choices: ['dentist', 'cow', 'bird'], answer: 'dentist', topic: 'L4.dentist', explain: 'The dentist checks our teeth and keeps them healthy.' },
        { prompt: 'What do we do with water after eating?', choices: ['rinse', 'sweets', 'bed'], answer: 'rinse', topic: 'L4.rinse', explain: 'We rinse our mouth with water after eating.' },
      ],
    },
    {
      type: 'sequence',
      title: 'When do we brush? Put the day in order.',
      steps: [
        { art: 'morning', say: 'Morning: brush your teeth.' },
        { art: 'eating', say: 'Eat your food, then rinse with water.' },
        { art: 'night', say: 'Night: brush your teeth again.' },
      ],
      topic: 'L4.twice',
    },
    { type: 'brushTimer', title: 'Brush along with me for two minutes! Get your real toothbrush.' },
  ],
  song: {
    title: 'Brush Brush',
    tune: 'bouncy',
    lines: [
      { text: 'Brush, brush, brush your teeth,', art: 'toothbrush' },
      { text: 'top and bottom, round and neat.', art: 'teeth' },
      { text: 'Morning, night, two times a day,', art: 'morning' },
      { text: 'that\'s the way we brush germs away!', art: 'toothHappy' },
    ],
  },
  parentNote:
    'For ages 3 to 6, the usual advice is a pea-sized amount of fluoride toothpaste, a grown-up helping or watching, and spitting out rather than swallowing. Please confirm with your dentist.',
};
