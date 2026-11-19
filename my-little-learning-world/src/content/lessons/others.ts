import type { Lesson } from '../types';

export const L5: Lesson = {
  id: 'L5',
  world: 'sun',
  number: 5,
  title: 'The Sun and Its Uses',
  icon: 'sun',
  character: 'sola',
  topics: [
    { id: 'L5.definition', label: 'what the sun is' },
    { id: 'L5.plants', label: 'helps plants grow' },
    { id: 'L5.warm', label: 'keeps us warm' },
    { id: 'L5.vitamin', label: 'vitamin D for strong bones' },
    { id: 'L5.dry', label: 'dries our clothes' },
    { id: 'L5.safety', label: 'never look at the sun' },
  ],
  welcome: ['Good morning, {name}! I am Sunny Sola.', 'I shine up in the sky every day. Do you know who I am?'],
  learn: [
    { art: 'sun', topic: 'L5.definition', lines: ['I am the sun!', 'The sun is a big ball of fire that gives us light in the day.'] },
    { art: 'plant', topic: 'L5.plants', lines: ['The sun helps plants to grow.'] },
    { art: 'warm', topic: 'L5.warm', lines: ['The sun keeps our bodies warm.'] },
    { art: 'bones', topic: 'L5.vitamin', lines: ['Sunlight helps our bodies make vitamin D.', 'Vitamin D helps our bones stay strong.'] },
    { art: 'clothesDry', topic: 'L5.dry', lines: ['The sun dries our clothes.'] },
    { art: 'eyes', topic: 'L5.safety', lines: ['Never look straight at the sun. It can hurt your eyes.'] },
  ],
  explore: {
    intro: 'It is a sunny day in the compound! Tap each picture.',
    items: [
      { art: 'sun', name: 'The sun.', say: 'The sun gives us light in the day.' },
      { art: 'plant', name: 'A plant.', say: 'The sun helps plants to grow.' },
      { art: 'warm', name: 'Keeping warm.', say: 'The sun keeps our bodies warm.' },
      { art: 'bones', name: 'Strong bones.', say: 'Sunlight helps our bodies make vitamin D for strong bones.' },
      { art: 'clothesDry', name: 'Clothes.', say: 'The sun dries our clothes.' },
      { art: 'moon', name: 'The moon.', say: 'The moon comes out at night. The sun shines in the day.' },
    ],
  },
  practice: [
    {
      type: 'pictureId',
      title: 'Find the sun!',
      rounds: [
        { prompt: 'Where is the sun? Tap the sun.', choices: ['cloud', 'sun', 'bird'], answer: 'sun', topic: 'L5.definition', explain: 'This is the sun. It gives us light in the day.' },
        { prompt: 'Which one gives us light in the day?', choices: ['moon', 'star', 'sun'], answer: 'sun', topic: 'L5.definition', explain: 'The sun gives us light in the day.' },
      ],
    },
    { type: 'sunGrow', title: 'Move the sun over the seed and watch it grow!' },
    { type: 'sunDry', title: 'The clothes are wet. Move the sun over them to dry them!' },
    {
      type: 'dragMatch',
      title: 'Match the sun to the things it helps.',
      pairs: [
        { item: 'sun', target: 'plant', topic: 'L5.plants', say: 'The sun helps plants to grow.' },
        { item: 'sun', target: 'clothesDry', topic: 'L5.dry', say: 'The sun dries our clothes.' },
        { item: 'sun', target: 'warm', topic: 'L5.warm', say: 'The sun keeps our bodies warm.' },
        { item: 'sun', target: 'bones', topic: 'L5.vitamin', say: 'Sunlight helps make vitamin D for strong bones.' },
      ],
    },
    {
      type: 'trueFalse',
      title: 'Is it true? Tap yes or no.',
      rounds: [
        { statement: 'The sun helps plants to grow.', art: 'plant', isTrue: true, topic: 'L5.plants', explain: 'Yes! The sun helps plants to grow.' },
        { statement: 'It is good to look straight at the sun.', art: 'sun', isTrue: false, topic: 'L5.safety', explain: 'Never look straight at the sun. It can hurt your eyes.' },
        { statement: 'The sun dries our clothes.', art: 'clothesDry', isTrue: true, topic: 'L5.dry', explain: 'Yes! The sun dries our clothes.' },
      ],
    },
  ],
  song: {
    title: 'Hello, I Am the Sun',
    tune: 'bright',
    lines: [
      { text: 'Hello, hello, I am the sun.', art: 'sun' },
      { text: 'I give you light and warmth and fun.', art: 'warm' },
      { text: 'I help the plants to grow up tall.', art: 'plant' },
      { text: 'I help to dry your clothes for all!', art: 'clothesDry' },
    ],
  },
  parentNote:
    'The school definition ("a big ball of fire") is kept for her exam. Scientifically, the sun is a very hot ball of gas and plasma that shines by nuclear fusion, not fire.',
};

export const L6: Lesson = {
  id: 'L6',
  world: 'air',
  number: 6,
  title: 'Air and Its Uses',
  icon: 'wind',
  character: 'breezy',
  topics: [
    { id: 'L6.definition', label: 'what air is' },
    { id: 'L6.breathe', label: 'we breathe air to stay alive' },
    { id: 'L6.cool', label: 'air cools our bodies' },
    { id: 'L6.dry', label: 'air dries clothes' },
    { id: 'L6.moves', label: 'things air can move' },
  ],
  welcome: ['Whoosh! Hello, {name}! I am Breezy.', 'You cannot see me, but you can feel me. Look, the leaves are dancing! Who am I?'],
  learn: [
    { art: 'wind', topic: 'L6.definition', lines: ['I am air!', 'Air is a mixture of gases that we breathe in and out every day.'] },
    { art: 'breathing', topic: 'L6.breathe', lines: ['We breathe air to stay alive.'] },
    { art: 'fan', topic: 'L6.cool', lines: ['Air cools our bodies.', 'When the fan blows air, we feel cool.'] },
    { art: 'clothesDry', topic: 'L6.dry', lines: ['Air helps to dry our clothes.'] },
    { art: 'leaves', topic: 'L6.moves', lines: ['When the wind blows, the moving air pushes things.', 'It makes leaves dance and kites fly!'] },
  ],
  explore: {
    intro: 'Air is all around us. Tap each picture.',
    items: [
      { art: 'breathing', name: 'Breathing.', say: 'We breathe air in and out to stay alive.' },
      { art: 'fan', name: 'A fan.', say: 'The fan blows air to cool our bodies.' },
      { art: 'clothesDry', name: 'Clothes outside.', say: 'Air helps to dry our clothes.' },
      { art: 'leaves', name: 'Leaves.', say: 'The wind makes the leaves move.' },
      { art: 'kite', name: 'A kite.', say: 'The wind lifts the kite up high.' },
      { art: 'balloon', name: 'A balloon.', say: 'When we blow air into a balloon, it gets big.' },
    ],
  },
  practice: [
    { type: 'breathe', title: 'Let us breathe slowly together.' },
    {
      type: 'tapAll',
      title: 'Tap everything that moves when the wind blows.',
      items: [
        { art: 'leaves', correct: true },
        { art: 'house', correct: false },
        { art: 'kite', correct: true },
        { art: 'stone', correct: false },
        { art: 'flag', correct: true },
        { art: 'clothesDry', correct: true },
      ],
      topic: 'L6.moves',
      done: 'Wonderful! The wind moves leaves, kites, flags and clothes. It cannot move a house or a big stone.',
    },
    {
      type: 'dragMatch',
      title: 'Match air to its uses.',
      pairs: [
        { item: 'wind', target: 'breathing', topic: 'L6.breathe', say: 'We breathe air to stay alive.' },
        { item: 'wind', target: 'cool', topic: 'L6.cool', say: 'Air cools our bodies.' },
        { item: 'wind', target: 'clothesDry', topic: 'L6.dry', say: 'Air helps to dry our clothes.' },
      ],
    },
    {
      type: 'listenSelect',
      title: 'Listen carefully, then tap the right picture.',
      rounds: [
        { prompt: 'What do we breathe in and out every day?', choices: ['water', 'wind', 'rice'], answer: 'wind', topic: 'L6.definition', explain: 'We breathe air in and out every day.' },
        { prompt: 'What blows air to cool us down?', choices: ['fan', 'lamp', 'chair'], answer: 'fan', topic: 'L6.cool', explain: 'A fan blows air. Air cools our bodies.' },
      ],
    },
    { type: 'puzzle', title: 'Put the picture back together!', art: 'fan', topic: 'L6.cool', done: 'You fixed it! A fan blows air to cool us.' },
  ],
  song: {
    title: 'Air Everywhere',
    tune: 'gentle',
    lines: [
      { text: 'I can\'t see air, but it\'s everywhere!', art: 'wind' },
      { text: 'I breathe it in, I breathe it out.', art: 'breathing' },
      { text: 'It cools me down and blows about.', art: 'fan' },
      { text: 'It dries my clothes upon the line,', art: 'clothesDry' },
      { text: 'thank you, air, you\'re doing fine!', art: 'heart' },
    ],
  },
  parentNote: 'Air is mostly nitrogen and oxygen; our bodies use the oxygen. The breathing exercise never asks her to hold her breath.',
};

export const L7: Lesson = {
  id: 'L7',
  world: 'water',
  number: 7,
  title: 'Water, Its Sources and Uses',
  icon: 'water',
  character: 'dodo',
  topics: [
    { id: 'L7.definition', label: 'what water is' },
    { id: 'L7.colourless', label: 'colourless' },
    { id: 'L7.odourless', label: 'odourless' },
    { id: 'L7.tasteless', label: 'tasteless' },
    { id: 'L7.rain', label: 'rain' },
    { id: 'L7.tap', label: 'tap' },
    { id: 'L7.river', label: 'river' },
    { id: 'L7.well', label: 'well' },
    { id: 'L7.uses', label: 'uses of water' },
    { id: 'L7.safety', label: 'clean, safe water' },
  ],
  welcome: ['Splash! Hello, {name}! I am Dodo the water drop.', 'I fell down from a rain cloud. Where else does water come from? Let us find out!'],
  learn: [
    { art: 'water', topic: 'L7.definition', lines: ['Water is a liquid substance that is colourless, odourless and tasteless.'] },
    { art: 'glassWater', topic: 'L7.colourless', lines: ['Colourless means clean water has no colour.', 'Look! The water is clear. The juice is orange.'] },
    { art: 'flower', topic: 'L7.odourless', lines: ['Odourless means clean water has no smell.', 'A flower has a sweet smell. Clean water has no smell at all.'] },
    { art: 'lemon', topic: 'L7.tasteless', lines: ['Tasteless means pure water has no taste.', 'A lemon tastes sour. Pure water has no taste.'] },
    { art: 'rain', topic: 'L7.rain', lines: ['Where does water come from?', 'Number one: rain.'] },
    { art: 'tap', topic: 'L7.tap', lines: ['Number two: the tap.'] },
    { art: 'river', topic: 'L7.river', lines: ['Number three: the river.'] },
    { art: 'well', topic: 'L7.well', lines: ['Number four: the well.'] },
    { art: 'cooking', topic: 'L7.uses', lines: ['What do we use water for?', 'We use water for cooking,'] },
    { art: 'washing', topic: 'L7.uses', lines: ['for washing,'] },
    { art: 'drinking', topic: 'L7.uses', lines: ['for drinking,'] },
    { art: 'bath', topic: 'L7.uses', lines: ['and for bathing.'] },
    { art: 'glassWater', topic: 'L7.safety', lines: ['We drink only clean, safe water.', 'Ask a grown-up before you drink.', 'Never go near a river or a well alone.'] },
  ],
  explore: {
    intro: 'Welcome to the village! Tap each picture.',
    items: [
      { art: 'rain', name: 'Rain.', say: 'Rain is a source of water.' },
      { art: 'tap', name: 'Tap.', say: 'The tap is a source of water.' },
      { art: 'river', name: 'River.', say: 'The river is a source of water.' },
      { art: 'well', name: 'Well.', say: 'The well is a source of water.' },
      { art: 'cooking', name: 'Cooking.', say: 'We use water for cooking.' },
      { art: 'washing', name: 'Washing.', say: 'We use water for washing.' },
      { art: 'drinking', name: 'Drinking.', say: 'We use water for drinking.' },
      { art: 'bath', name: 'Bathing.', say: 'We use water for bathing.' },
    ],
  },
  practice: [
    {
      type: 'pictureId',
      title: 'Where does water come from?',
      rounds: [
        { prompt: 'Tap the well.', choices: ['house', 'well', 'tree'], answer: 'well', topic: 'L7.well', explain: 'This is a well. A well is a source of water.' },
        { prompt: 'Which one is a source of water?', choices: ['rain', 'sun', 'chair'], answer: 'rain', topic: 'L7.rain', explain: 'Rain is a source of water.' },
        { prompt: 'Tap the tap.', choices: ['lamp', 'ball', 'tap'], answer: 'tap', topic: 'L7.tap', explain: 'This is a tap. The tap is a source of water.' },
      ],
    },
    {
      type: 'dragMatch',
      title: 'Match water to its uses.',
      pairs: [
        { item: 'water', target: 'cooking', topic: 'L7.uses', say: 'We use water for cooking.' },
        { item: 'water', target: 'washing', topic: 'L7.uses', say: 'We use water for washing.' },
        { item: 'water', target: 'drinking', topic: 'L7.uses', say: 'We use water for drinking.' },
        { item: 'water', target: 'bath', topic: 'L7.uses', say: 'We use water for bathing.' },
      ],
    },
    {
      type: 'sort',
      title: 'Is it a source of water, or a use of water?',
      bins: [
        { id: 'source', label: 'Where water comes from', art: 'river' },
        { id: 'use', label: 'What we use water for', art: 'drinking' },
      ],
      items: [
        { art: 'rain', bin: 'source', topic: 'L7.rain' },
        { art: 'cooking', bin: 'use', topic: 'L7.uses' },
        { art: 'tap', bin: 'source', topic: 'L7.tap' },
        { art: 'bath', bin: 'use', topic: 'L7.uses' },
        { art: 'well', bin: 'source', topic: 'L7.well' },
        { art: 'washing', bin: 'use', topic: 'L7.uses' },
      ],
    },
    {
      type: 'pictureId',
      title: 'Clean, safe water.',
      rounds: [
        { prompt: 'Which one do we drink?', choices: ['glassWater', 'muddyWater', 'soap'], answer: 'glassWater', topic: 'L7.safety', explain: 'We drink only clean, safe water.' },
        { prompt: 'Which glass has clean water? Clean water has no colour.', choices: ['juice', 'glassWater', 'muddyWater'], answer: 'glassWater', topic: 'L7.colourless', explain: 'Clean water has no colour. It is colourless.' },
      ],
    },
    { type: 'memory', title: 'Find the matching pairs!', cards: ['rain', 'tap', 'river', 'well'], topic: 'L7.uses' },
  ],
  song: {
    title: 'Water Song',
    tune: 'bouncy',
    lines: [
      { text: 'Rain and tap and river and well,', art: 'rain' },
      { text: 'that is where the waters dwell!', art: 'well' },
      { text: 'Cook and wash and drink and bathe,', art: 'cooking' },
      { text: 'clean, safe water every day!', art: 'glassWater' },
    ],
  },
};

export const L8: Lesson = {
  id: 'L8',
  world: 'food',
  number: 8,
  title: 'Food and Examples',
  icon: 'rice',
  character: 'ada',
  topics: [
    { id: 'L8.definition', label: 'what food is' },
    { id: 'L8.rice', label: 'rice' },
    { id: 'L8.beans', label: 'beans' },
    { id: 'L8.fish', label: 'fish' },
    { id: 'L8.noodles', label: 'noodles' },
    { id: 'L8.egg', label: 'egg' },
    { id: 'L8.why', label: 'why we eat food' },
  ],
  welcome: ['Hello, {name}! I am Chef Ada. Welcome to my kitchen!', 'My tummy is rumbling. I am hungry! What is food?'],
  learn: [
    { art: 'eating', topic: 'L8.definition', lines: ['Food is what we eat that makes us grow and stay alive.'] },
    { art: 'rice', topic: 'L8.rice', lines: ['This is rice. Rice is food.'] },
    { art: 'beans', topic: 'L8.beans', lines: ['These are beans. Beans are food.'] },
    { art: 'fish', topic: 'L8.fish', lines: ['This is fish. Fish is food.'] },
    { art: 'noodles', topic: 'L8.noodles', lines: ['These are noodles. Noodles are food.'] },
    { art: 'egg', topic: 'L8.egg', lines: ['This is an egg. Egg is food.'] },
    { art: 'grow', topic: 'L8.why', lines: ['Food helps us grow.'] },
    { art: 'energy', topic: 'L8.why', lines: ['Food gives us energy to run and play.'] },
    { art: 'healthy', topic: 'L8.why', lines: ['Food keeps us healthy.'] },
  ],
  explore: {
    intro: 'Dinner is ready! Tap each food to hear its name.',
    items: [
      { art: 'rice', name: 'Rice.', say: 'Rice is food. Yum!' },
      { art: 'beans', name: 'Beans.', say: 'Beans are food. Yum!' },
      { art: 'fish', name: 'Fish.', say: 'Fish is food. Yum!' },
      { art: 'noodles', name: 'Noodles.', say: 'Noodles are food. Yum!' },
      { art: 'egg', name: 'Egg.', say: 'Egg is food. Yum!' },
    ],
  },
  practice: [
    {
      type: 'listenSelect',
      title: 'Listen to the name, then tap the food.',
      rounds: [
        { prompt: 'Tap the rice.', choices: ['rice', 'egg', 'fish'], answer: 'rice', topic: 'L8.rice', explain: 'This is rice.' },
        { prompt: 'Tap the beans.', choices: ['noodles', 'beans', 'egg'], answer: 'beans', topic: 'L8.beans', explain: 'These are beans.' },
        { prompt: 'Tap the fish.', choices: ['fish', 'rice', 'noodles'], answer: 'fish', topic: 'L8.fish', explain: 'This is fish.' },
        { prompt: 'Tap the noodles.', choices: ['egg', 'beans', 'noodles'], answer: 'noodles', topic: 'L8.noodles', explain: 'These are noodles.' },
        { prompt: 'Tap the egg.', choices: ['beans', 'egg', 'rice'], answer: 'egg', topic: 'L8.egg', explain: 'This is an egg.' },
      ],
    },
    {
      type: 'tapAll',
      title: 'Tap all the food.',
      items: [
        { art: 'rice', correct: true },
        { art: 'ball', correct: false },
        { art: 'fish', correct: true },
        { art: 'chair', correct: false },
        { art: 'egg', correct: true },
        { art: 'noodles', correct: true },
      ],
      topic: 'L8.definition',
      done: 'Yes! Rice, fish, egg and noodles are food. We cannot eat a ball or a chair!',
    },
    { type: 'memory', title: 'Food memory cards! Find the pairs.', cards: ['rice', 'beans', 'fish', 'egg'], topic: 'L8.definition' },
    {
      type: 'pictureId',
      title: 'Why do we eat food?',
      rounds: [
        { prompt: 'Food gives us energy to run and play. Tap the picture of energy.', choices: ['energy', 'bed', 'stone'], answer: 'energy', topic: 'L8.why', explain: 'Food gives us energy to run and play.' },
        { prompt: 'Food helps us to grow. Tap growing tall.', choices: ['car', 'grow', 'moon'], answer: 'grow', topic: 'L8.why', explain: 'Food helps us grow.' },
      ],
    },
  ],
  song: {
    title: 'Yummy Food',
    tune: 'bouncy',
    lines: [
      { text: 'Rice and beans and fish and egg,', art: 'rice' },
      { text: 'noodles in a bowl!', art: 'noodles' },
      { text: 'Food helps me grow, gives me go,', art: 'energy' },
      { text: 'and keeps me healthy and whole!', art: 'healthy' },
    ],
  },
};

export const L9: Lesson = {
  id: 'L9',
  world: 'food',
  number: 9,
  title: 'Sources of Food',
  icon: 'basket',
  character: 'ada',
  topics: [
    { id: 'L9.definition', label: 'food comes from animals and plants' },
    { id: 'L9.meat', label: 'meat from animals' },
    { id: 'L9.eggs', label: 'eggs from animals' },
    { id: 'L9.rice', label: 'rice from plants' },
    { id: 'L9.beans', label: 'beans from plants' },
    { id: 'L9.more', label: 'more foods (extra)' },
  ],
  welcome: ['Chef Ada is visiting the farm today, {name}!', 'Look, a hen, a cow, and a rice field. Where does our food come from?'],
  learn: [
    { art: 'basket', topic: 'L9.definition', lines: ['We get food from animals and plants.'] },
    { art: 'cow', topic: 'L9.meat', lines: ['Some food comes from animals.', 'Meat comes from animals.'] },
    { art: 'hen', topic: 'L9.eggs', lines: ['Eggs come from animals too. The hen lays eggs.'] },
    { art: 'riceplant', topic: 'L9.rice', lines: ['Some food comes from plants.', 'Rice comes from plants.'] },
    { art: 'beanplant', topic: 'L9.beans', lines: ['Beans come from plants too.'] },
  ],
  explore: {
    intro: 'Welcome to the farm! Tap each picture.',
    items: [
      { art: 'hen', name: 'A hen.', say: 'The hen gives us eggs. Eggs come from animals.' },
      { art: 'cow', name: 'A cow.', say: 'The cow gives us meat. Meat comes from animals.' },
      { art: 'riceplant', name: 'A rice plant.', say: 'Rice grows on a plant. Rice comes from plants.' },
      { art: 'beanplant', name: 'A bean plant.', say: 'Beans grow on a plant. Beans come from plants.' },
    ],
  },
  practice: [
    {
      type: 'sort',
      title: 'Put each food in the right basket.',
      bins: [
        { id: 'animals', label: 'Food from animals', art: 'animals' },
        { id: 'plants', label: 'Food from plants', art: 'plants' },
      ],
      items: [
        { art: 'meat', bin: 'animals', topic: 'L9.meat' },
        { art: 'rice', bin: 'plants', topic: 'L9.rice' },
        { art: 'egg', bin: 'animals', topic: 'L9.eggs' },
        { art: 'beans', bin: 'plants', topic: 'L9.beans' },
      ],
    },
    {
      type: 'dragMatch',
      title: 'Where does it come from? Match the food to its home.',
      pairs: [
        { item: 'egg', target: 'hen', topic: 'L9.eggs', say: 'Eggs come from the hen.' },
        { item: 'meat', target: 'cow', topic: 'L9.meat', say: 'Meat comes from animals like the cow.' },
        { item: 'rice', target: 'riceplant', topic: 'L9.rice', say: 'Rice comes from plants.' },
        { item: 'beans', target: 'beanplant', topic: 'L9.beans', say: 'Beans come from plants.' },
      ],
    },
    {
      type: 'trueFalse',
      title: 'Is it true? Tap yes or no.',
      rounds: [
        { statement: 'Eggs come from animals.', art: 'egg', isTrue: true, topic: 'L9.eggs', explain: 'Yes! Eggs come from animals, like the hen.' },
        { statement: 'Rice comes from animals.', art: 'rice', isTrue: false, topic: 'L9.rice', explain: 'Rice comes from plants.' },
        { statement: 'We get food from animals and plants.', art: 'basket', isTrue: true, topic: 'L9.definition', explain: 'Yes! We get food from animals and plants.' },
      ],
    },
    {
      type: 'sort',
      title: 'More to learn! Sort these foods too.',
      bins: [
        { id: 'animals', label: 'Food from animals', art: 'animals' },
        { id: 'plants', label: 'Food from plants', art: 'plants' },
      ],
      items: [
        { art: 'fish', bin: 'animals', topic: 'L9.more' },
        { art: 'yam', bin: 'plants', topic: 'L9.more' },
        { art: 'milk', bin: 'animals', topic: 'L9.more' },
        { art: 'plantain', bin: 'plants', topic: 'L9.more' },
        { art: 'maize', bin: 'plants', topic: 'L9.more' },
        { art: 'orange', bin: 'plants', topic: 'L9.more' },
      ],
    },
  ],
  song: {
    title: 'Animals and Plants',
    tune: 'bright',
    lines: [
      { text: 'Meat and eggs, meat and eggs, from animals they come!', art: 'animals' },
      { text: 'Rice and beans, rice and beans, from plants, yum yum yum!', art: 'plants' },
    ],
  },
};
