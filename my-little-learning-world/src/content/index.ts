import type { Lesson, LessonId, World } from './types';
import { L1, L2, L3, L4 } from './lessons/body';
import { L5, L6, L7, L8, L9 } from './lessons/others';

export const lessons: Lesson[] = [L1, L2, L3, L4, L5, L6, L7, L8, L9];
export const lessonById = (id: string) => lessons.find((l) => l.id === id)!;

export const worlds: World[] = [
  { id: 'body', title: 'My Amazing Body', icon: 'head', character: 'bibi', lessons: ['L1', 'L2', 'L3', 'L4'], badge: { id: 'body-explorer', title: 'Body Explorer', art: 'head' } },
  { id: 'sun', title: 'The Wonderful Sun', icon: 'sun', character: 'sola', lessons: ['L5'], badge: { id: 'sunshine-superstar', title: 'Sunshine Superstar', art: 'sun' } },
  { id: 'air', title: 'The Invisible Air', icon: 'wind', character: 'breezy', lessons: ['L6'], badge: { id: 'little-scientist', title: 'Little Scientist', art: 'scientist' } },
  { id: 'water', title: 'The Magic of Water', icon: 'water', character: 'dodo', lessons: ['L7'], badge: { id: 'water-champion', title: 'Water Champion', art: 'water' } },
  { id: 'food', title: 'My Healthy Food', icon: 'rice', character: 'ada', lessons: ['L8', 'L9'], badge: { id: 'healthy-food-hero', title: 'Healthy Food Hero', art: 'healthy' } },
];
export const worldById = (id: string) => worlds.find((w) => w.id === id)!;
export const worldOfLesson = (id: LessonId) => worlds.find((w) => w.lessons.includes(id))!;

export const PVS_STAR = { id: 'pvs-star', title: 'PVS Star', art: 'star' };

// Friends unlocked with stars (shown in My Rewards, can guide the home screen).
export const unlockables = [
  { id: 'bibi', title: 'Bibi the Bird', stars: 0 },
  { id: 'kiki', title: 'Kiki the Hippo', stars: 10 },
  { id: 'dodo', title: 'Dodo the Drop', stars: 25 },
  { id: 'sola', title: 'Sunny Sola', stars: 40 },
  { id: 'breezy', title: 'Breezy the Cloud', stars: 60 },
  { id: 'ada', title: 'Chef Ada', stars: 80 },
] as const;

// Spoken phrases used by the app shell and games. Kept here so the voice
// tool can generate clips for every one of them.
export const P = {
  praise: [
    'Wow! You got it right! You are a superstar!',
    'Wonderful!',
    'Excellent, {name}!',
    'Yes! Well done!',
    'Brilliant! You are so clever!',
    'Hooray! That is right!',
    'Super job, {name}!',
    'You did it!',
    'Fantastic!',
    'Great listening!',
    'Clever girl!',
    'That is correct! Amazing!',
  ],
  tryAgain: ['Good try! Let\'s learn together. Listen carefully.', 'Nice try! Let\'s try again.', 'Almost! Have another go.'],
  showAnswer: 'Look, here is the right one. Tap it.',
  stillThere: 'Are you there, {name}? Let\'s keep playing!',
  tapToHear: 'Tap a picture to hear about it.',
  next: 'Let\'s go on!',
  playAgain: 'Do you want to play again?',
  welcomeHome: ['Hello, {name}! Welcome back to your learning world!', 'Hello, {name}! I am so happy to see you!'],
  homeHelp: 'Tap the big green button to keep learning.',
  homeButtons: {
    continue: 'Continue learning',
    worlds: 'My learning worlds',
    play: 'Play and practise',
    revision: 'Revision time',
    rewards: 'My rewards',
  },
  worldsIntro: 'Choose a world to visit!',
  lockedWorld: 'This world is waiting for you. Finish the lessons before it first!',
  lessonsIntro: 'Choose a lesson.',
  stageNames: {
    welcome: 'Hello!',
    learn: 'Listen and learn.',
    explore: 'See and explore.',
    practice: 'Let\'s play and practise!',
    sing: 'Sing and remember!',
    exam: 'Little examination time!',
    celebrate: 'Celebration!',
  },
  learnHint: 'Tap the arrow when you are ready for the next one.',
  exploreDone: 'You found them all! Well done!',
  examIntro: 'Let\'s see what you remember. Listen to each question and tap your answer.',
  mockIntro: 'This is a big examination with twenty questions. Take your time. Listen carefully.',
  miniMockIntro: 'This is a little mock examination with ten questions. Listen carefully.',
  examThanks: 'Thank you!',
  examReview: 'Let\'s look at the ones to learn again.',
  examDone: 'You finished the examination! I am so proud of you!',
  lessonDone: ['Hooray! You have completed your lesson. You earned one star!', 'Hooray! You have completed your lesson. You earned two stars!', 'Hooray! You have completed your lesson. You earned three stars!'],
  newBadge: 'You earned a new badge!',
  newFriend: 'You unlocked a new friend!',
  allDone: 'Great learning today, {name}! See you tomorrow!',
  allDoneSongs: 'You can still sing your songs.',
  playIntro: 'Choose a game to play!',
  revisionIntro: 'Let\'s remember what we learned!',
  revisionNothing: 'Finish your first lesson, then come back here to remember it!',
  rewardsIntro: 'Look at all your stars and badges!',
  examsIntro: 'Choose an examination.',
  examModes: {
    practice: 'Lesson practice',
    revision: 'Revision quiz',
    mock: 'Mock examination',
    picture: 'Picture examination',
    oral: 'Oral examination',
  },
  trueOrFalse: 'Is it true? Tap yes or no.',
  yes: 'Yes!',
  no: 'No!',
  photoFind: ['Can you find your {part}?', 'Where is your {part}?', 'Show me your {part}.'],
  photoNoPhoto: 'This is a picture of a body. Tap each part.',
  brush: {
    paste: 'First, tap the toothpaste to squeeze a tiny bit, as small as a pea.',
    scrub: 'Now scrub Kiki\'s teeth! Rub all the sticky plaque away.',
    top: 'Brush the top teeth.',
    bottom: 'Now brush the bottom teeth.',
    done: 'Sparkly clean! Now spit out the toothpaste. Do not swallow it. Kiki is smiling!',
  },
  timer: {
    start: 'Get your toothbrush and a tiny bit of toothpaste. Brush along with me!',
    zones: ['Brush the top teeth on this side.', 'Now the top teeth on the other side.', 'Now the bottom teeth on this side.', 'And the bottom teeth on the other side.'],
    done: 'Two minutes! Your teeth are sparkly clean. Spit out the toothpaste. Well done!',
  },
  sunGrow: { start: 'Drag the sun over the seed.', grow: 'Look! The plant is growing!', done: 'The sun helps plants to grow!' },
  sunDry: { start: 'Drag the sun over the wet clothes.', done: 'The sun dries our clothes!' },
  breathe: {
    intro: 'Sit nicely. We will breathe slowly together.',
    in: 'Smell the flower. Breathe in slowly.',
    out: 'Blow out the candle. Breathe out slowly.',
    done: 'Well done. Air goes in and out. We breathe air to stay alive.',
  },
  memory: { start: 'Turn over two cards. Find the pictures that match.', match: 'A match!', done: 'You found all the pairs!' },
  sort: { start: 'Drag each picture into the right box.' },
  drag: { start: 'Drag each picture to its partner.' },
  sequence: { start: 'Tap the pictures in the right order. What comes first?' },
  puzzle: { start: 'Drag each piece to its place.' },
  missing: { start: 'What is missing from this face?' },
  tapAllStart: 'Tap all the right pictures. Then tap the green tick.',
  sessionStop: 'Shall we stop here?',
  parentAsk: 'Ask a grown-up to help.',
};
