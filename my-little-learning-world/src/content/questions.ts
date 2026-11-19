import type { ArtId, BodyPart, LessonId, Question, QuestionKind } from './types';
import { bodyJob } from './lessons/body';

const I: QuestionKind = 'identification';
const R: QuestionKind = 'recall';
const U: QuestionKind = 'understanding';
const A: QuestionKind = 'application';

let counter: Record<string, number> = {};
const nextId = (l: LessonId) => {
  counter[l] = (counter[l] ?? 0) + 1;
  return `${l}.Q${String(counter[l]).padStart(2, '0')}`;
};
const c = (lesson: LessonId, topic: string, kind: QuestionKind, prompt: string, choices: ArtId[], answer: ArtId, explain: string, supplementary = false): Question => ({
  id: nextId(lesson), lesson, topic, kind, prompt, explain, format: 'choice', choices, answer, supplementary,
});
const tf = (lesson: LessonId, topic: string, kind: QuestionKind, prompt: string, art: ArtId, isTrue: boolean, explain: string): Question => ({
  id: nextId(lesson), lesson, topic, kind, prompt, explain, format: 'truefalse', art, isTrue,
});
const ph = (part: BodyPart, prompt: string): Question => ({
  id: nextId('L1'), lesson: 'L1', topic: `L1.${part}`, kind: I, prompt, explain: `Here it is! ${bodyJob(part)}`, format: 'photo', part,
});

export const questions: Question[] = [
  // ---------- L1 Parts of the body ----------
  c('L1', 'L1.eyes', I, 'Tap the eyes.', ['ears', 'eyes', 'mouth'], 'eyes', bodyJob('eyes')),
  c('L1', 'L1.nose', I, 'Tap the nose.', ['nose', 'feet', 'hands'], 'nose', bodyJob('nose')),
  c('L1', 'L1.feet', I, 'Tap the feet.', ['hands', 'head', 'feet'], 'feet', bodyJob('feet')),
  c('L1', 'L1.ears', I, 'Tap the ears.', ['ears', 'legs', 'nose'], 'ears', bodyJob('ears')),
  c('L1', 'L1.eyes', R, 'What do we use to see?', ['nose', 'eyes', 'feet'], 'eyes', bodyJob('eyes')),
  c('L1', 'L1.ears', R, 'What do we use to hear?', ['mouth', 'hands', 'ears'], 'ears', bodyJob('ears')),
  c('L1', 'L1.nose', R, 'What do we use to smell?', ['nose', 'fingers', 'legs'], 'nose', bodyJob('nose')),
  c('L1', 'L1.legs', R, 'What do we use to walk?', ['eyes', 'legs', 'ears'], 'legs', bodyJob('legs')),
  c('L1', 'L1.mouth', U, 'What do we use our mouth for?', ['eating', 'walking', 'drum'], 'eating', bodyJob('mouth')),
  c('L1', 'L1.hands', U, 'What do we use our hands for?', ['flower', 'ball', 'butterfly'], 'ball', bodyJob('hands')),
  c('L1', 'L1.eyes', U, 'What do our eyes help us do?', ['butterfly', 'drum', 'flower'], 'butterfly', bodyJob('eyes')),
  c('L1', 'L1.nose', A, 'Mama is cooking jollof rice. What tells you it smells yummy?', ['ears', 'nose', 'feet'], 'nose', bodyJob('nose')),
  c('L1', 'L1.ears', A, 'The drum is playing. What do you use to hear it?', ['ears', 'eyes', 'stomach'], 'ears', bodyJob('ears')),
  c('L1', 'L1.fingers', A, 'You want to count to five. What can you use?', ['fingers', 'nose', 'neck'], 'fingers', bodyJob('fingers')),
  c('L1', 'L1.stomach', R, 'What holds the food we eat?', ['head', 'stomach', 'ears'], 'stomach', bodyJob('stomach')),
  c('L1', 'L1.head', R, 'What do we use to think?', ['head', 'feet', 'hands'], 'head', bodyJob('head')),
  tf('L1', 'L1.feet', U, 'We use our feet to stand and walk.', 'feet', true, bodyJob('feet')),
  ph('nose', 'Can you find your nose?'),
  ph('eyes', 'Where are your eyes?'),
  ph('mouth', 'Show me your mouth.'),
  ph('ears', 'Can you find your ears?'),
  ph('hands', 'Where are your hands?'),

  // ---------- L2 Items for taking care of the body ----------
  c('L2', 'L2.soap', I, 'Tap the soap.', ['soap', 'ball', 'comb'], 'soap', 'We use soap to wash off dirt and germs.'),
  c('L2', 'L2.toothbrush', I, 'Tap the toothbrush.', ['spoon', 'toothbrush', 'towel'], 'toothbrush', 'We use a toothbrush to brush our teeth.'),
  c('L2', 'L2.towel', I, 'Tap the towel.', ['towel', 'sponge', 'car'], 'towel', 'We use a towel to dry our body.'),
  c('L2', 'L2.comb', I, 'Tap the comb.', ['soap', 'chair', 'comb'], 'comb', 'We use a comb to comb our hair.'),
  c('L2', 'L2.sponge', I, 'Tap the sponge.', ['sponge', 'toothpaste', 'ball'], 'sponge', 'We use a sponge to scrub our body when we bathe.'),
  c('L2', 'L2.toothbrush', R, 'What do we use to brush our teeth?', ['comb', 'toothbrush', 'soap'], 'toothbrush', 'We use a toothbrush to brush our teeth.'),
  c('L2', 'L2.towel', R, 'What do we use to dry our body?', ['towel', 'water', 'spoon'], 'towel', 'We use a towel to dry our body.'),
  c('L2', 'L2.comb', R, 'What do we use to comb our hair?', ['sponge', 'nailcutter', 'comb'], 'comb', 'We use a comb to comb our hair.'),
  c('L2', 'L2.toothpaste', R, 'What do we put on the toothbrush?', ['soap', 'toothpaste', 'water'], 'toothpaste', 'We put toothpaste on the toothbrush to clean our teeth.'),
  c('L2', 'L2.nailcutter', R, 'What cuts our nails short and clean?', ['nailcutter', 'comb', 'towel'], 'nailcutter', 'A nail cutter cuts our nails. A grown-up cuts our nails.'),
  c('L2', 'L2.soap', U, 'What is soap for?', ['bath', 'hair', 'teeth'], 'bath', 'We use soap to wash off dirt and germs when we bathe.'),
  c('L2', 'L2.comb', U, 'The comb is for our...', ['teeth', 'hair', 'feet'], 'hair', 'We use a comb to comb our hair.'),
  c('L2', 'L2.soap', A, 'Kiki\'s hands are dirty. What should Kiki use?', ['soap', 'comb', 'ball'], 'soap', 'Soap and water wash off dirt and germs.'),
  c('L2', 'L2.towel', A, 'You just finished your bath and you are wet. What do you need?', ['towel', 'toothbrush', 'spoon'], 'towel', 'We use a towel to dry our body.'),
  c('L2', 'L2.water', A, 'What do we need with soap to wash our body?', ['water', 'sweets', 'chair'], 'water', 'We use water to wash, to bathe and to rinse.'),
  tf('L2', 'L2.nailcutter', U, 'A grown-up cuts our nails.', 'nailcutter', true, 'Yes! A grown-up cuts our nails with a nail cutter.'),

  // ---------- L3 Toothache and its causes ----------
  c('L3', 'L3.definition', I, 'Which tooth has a toothache?', ['toothHappy', 'toothOuch'], 'toothOuch', 'Toothache is pain in the tooth.'),
  c('L3', 'L3.germs', I, 'Tap the germs.', ['germ', 'apple', 'toothbrush'], 'germ', 'Germs make plaque. Plaque can hurt our teeth.'),
  c('L3', 'L3.sweets', I, 'Tap the sweets.', ['sweets', 'carrot', 'water'], 'sweets', 'Eating too many sweets can cause toothache.'),
  tf('L3', 'L3.definition', R, 'Toothache is pain in the tooth.', 'toothOuch', true, 'Yes! Toothache is pain in the tooth.'),
  c('L3', 'L3.definition', R, 'What is toothache? Tap the picture of pain in the tooth.', ['toothOuch', 'bones', 'eyes'], 'toothOuch', 'Toothache is pain in the tooth.'),
  c('L3', 'L3.sweets', R, 'Eating too many of these can cause toothache.', ['apple', 'sweets', 'water'], 'sweets', 'Eating too many sweets can cause toothache.'),
  c('L3', 'L3.sugary', R, 'Which drink can cause toothache if we drink too much?', ['glassWater', 'fizzy'], 'fizzy', 'Too many sugary drinks can cause toothache.'),
  c('L3', 'L3.germs', R, 'Germs make sticky dirt on our teeth. What is it called?', ['plaque', 'soap', 'rain'], 'plaque', 'The sticky germ dirt on our teeth is called plaque.'),
  tf('L3', 'L3.nobrush', U, 'Not brushing our teeth properly can cause toothache.', 'toothbrush', true, 'Yes! We must brush our teeth properly.'),
  tf('L3', 'L3.sweets', U, 'Eating many sweets is good for our teeth.', 'sweets', false, 'Too many sweets can cause toothache.'),
  tf('L3', 'L3.decay', U, 'Germs can make a little hole in our tooth. That is tooth decay.', 'plaque', true, 'Yes! That is tooth decay, and it can cause toothache.'),
  tf('L3', 'L3.germs', U, 'Germs are good for our teeth.', 'germ', false, 'Germs and plaque can hurt our teeth.'),
  c('L3', 'L3.nobrush', A, 'Kiki forgot to brush her teeth at night. What can happen?', ['toothOuch', 'toothHappy'], 'toothOuch', 'Not brushing properly can cause toothache.'),
  c('L3', 'L3.sugary', A, 'Which snack is better for your teeth?', ['lollipop', 'carrot', 'cake'], 'carrot', 'Too many sugary foods can cause toothache.'),
  c('L3', 'L3.sweets', A, 'Which snack is too sweet for your teeth?', ['apple', 'lollipop', 'carrot'], 'lollipop', 'Too many sweets can cause toothache.'),

  // ---------- L4 Prevention of toothache ----------
  c('L4', 'L4.paste', I, 'Tap the toothpaste.', ['toothpaste', 'soap', 'comb'], 'toothpaste', 'We use a toothbrush and fluoride toothpaste.'),
  c('L4', 'L4.dentist', I, 'Tap the dentist.', ['dentist', 'cow', 'hen'], 'dentist', 'The dentist keeps our teeth healthy.'),
  c('L4', 'L4.twice', I, 'Tap the toothbrush.', ['spoon', 'toothbrush', 'comb'], 'toothbrush', 'We brush our teeth with a toothbrush.'),
  c('L4', 'L4.twice', R, 'We brush in the morning. When else do we brush our teeth?', ['night', 'cake', 'ball'], 'night', 'We brush our teeth two times every day: morning and night.'),
  tf('L4', 'L4.twice', R, 'We brush our teeth two times every day.', 'toothbrush', true, 'Yes! Morning and night.'),
  c('L4', 'L4.rinse', R, 'What do we rinse our mouth with after eating?', ['water', 'fizzy', 'juice'], 'water', 'We rinse our mouth with water after eating.'),
  c('L4', 'L4.dentist', R, 'Who do we visit for a check-up of our teeth?', ['dentist', 'bird', 'cow'], 'dentist', 'We visit the dentist for regular check-ups.'),
  c('L4', 'L4.paste', R, 'What do we use with our toothbrush?', ['toothpaste', 'soap', 'sweets'], 'toothpaste', 'We use a toothbrush and fluoride toothpaste.'),
  tf('L4', 'L4.sweets', U, 'Eating too many sweets keeps our teeth healthy.', 'sweets', false, 'We should not eat too many sweets.'),
  tf('L4', 'L4.dentist', U, 'The dentist is our friend who keeps our teeth healthy.', 'dentist', true, 'Yes! The dentist keeps our teeth healthy.'),
  c('L4', 'L4.twice', U, 'When do we brush our teeth?', ['morning', 'cake', 'ball'], 'morning', 'We brush in the morning and at night.'),
  c('L4', 'L4.twice', A, 'It is bedtime. What should you do before you sleep?', ['toothbrush', 'lollipop', 'fizzy'], 'toothbrush', 'We brush our teeth at night before bed.'),
  c('L4', 'L4.rinse', A, 'You just finished eating. What should you do?', ['rinse', 'sweets', 'bed'], 'rinse', 'We rinse our mouth with water after eating.'),
  c('L4', 'L4.sweets', A, 'Kiki wants a snack. Which one helps her teeth?', ['lollipop', 'apple', 'cake'], 'apple', 'Do not eat too many sweets. Fruit is a kind snack.'),
  tf('L4', 'L4.paste', A, 'We swallow our toothpaste.', 'toothpaste', false, 'We spit out the toothpaste. We do not swallow it.'),

  // ---------- L5 The sun ----------
  c('L5', 'L5.definition', I, 'Tap the sun.', ['moon', 'sun', 'cloud'], 'sun', 'The sun is a big ball of fire that gives us light in the day.'),
  c('L5', 'L5.definition', I, 'Which one shines in the day?', ['sun', 'moon', 'star'], 'sun', 'The sun gives us light in the day.'),
  c('L5', 'L5.plants', I, 'Tap the plant that the sun helps.', ['plant', 'stone', 'car'], 'plant', 'The sun helps plants to grow.'),
  tf('L5', 'L5.definition', R, 'The sun is a big ball of fire that gives us light in the day.', 'sun', true, 'Yes! The sun gives us light in the day.'),
  c('L5', 'L5.definition', R, 'What gives us light in the day?', ['lamp', 'sun', 'moon'], 'sun', 'The sun gives us light in the day.'),
  c('L5', 'L5.plants', R, 'The sun helps these to grow.', ['plant', 'stone', 'chair'], 'plant', 'The sun helps plants to grow.'),
  c('L5', 'L5.dry', R, 'The sun dries our...', ['clothesDry', 'river', 'rain'], 'clothesDry', 'The sun dries our clothes.'),
  c('L5', 'L5.vitamin', R, 'Sunlight helps make vitamin D. Vitamin D helps our bones stay...', ['bones', 'sweets', 'cloud'], 'bones', 'Vitamin D helps our bones stay strong.'),
  tf('L5', 'L5.warm', U, 'The sun keeps our bodies warm.', 'warm', true, 'Yes! The sun keeps our bodies warm.'),
  tf('L5', 'L5.safety', U, 'It is good to look straight at the sun.', 'sun', false, 'Never look straight at the sun. It can hurt your eyes.'),
  tf('L5', 'L5.dry', U, 'The sun makes our clothes wet.', 'clothesWet', false, 'The sun dries our clothes.'),
  c('L5', 'L5.dry', A, 'Mama washed the clothes. What will dry them?', ['sun', 'moon', 'rain'], 'sun', 'The sun dries our clothes.'),
  c('L5', 'L5.plants', A, 'Your plant is in a dark room. What does it need to grow?', ['sun', 'sweets', 'ball'], 'sun', 'The sun helps plants to grow.'),
  c('L5', 'L5.warm', A, 'You feel cold. What can help warm you up?', ['sun', 'fan', 'rain'], 'sun', 'The sun keeps our bodies warm.'),
  c('L5', 'L5.safety', A, 'The sun is very bright. What should you NOT do?', ['eyes', 'plant', 'clothesDry'], 'eyes', 'Never look straight at the sun. It can hurt your eyes.'),

  // ---------- L6 Air ----------
  c('L6', 'L6.cool', I, 'Tap the fan.', ['fan', 'lamp', 'tap'], 'fan', 'A fan blows air to cool our bodies.'),
  c('L6', 'L6.moves', I, 'Tap the thing the wind is moving.', ['kite', 'house', 'stone'], 'kite', 'The wind moves the kite.'),
  c('L6', 'L6.breathe', I, 'Tap the child breathing.', ['breathing', 'bed', 'car'], 'breathing', 'We breathe air to stay alive.'),
  tf('L6', 'L6.definition', R, 'Air is a mixture of gases that we breathe in and out every day.', 'wind', true, 'Yes! We breathe air in and out every day.'),
  c('L6', 'L6.definition', R, 'What do we breathe in and out every day?', ['wind', 'water', 'rice'], 'wind', 'Air is what we breathe in and out every day.'),
  c('L6', 'L6.breathe', R, 'We breathe air to stay...', ['healthy', 'stone', 'moon'], 'healthy', 'We breathe air to stay alive.'),
  c('L6', 'L6.cool', R, 'Air cools our...', ['body', 'house', 'stone'], 'body', 'Air cools our bodies.'),
  c('L6', 'L6.dry', R, 'Air helps to dry our...', ['clothesDry', 'rice', 'teeth'], 'clothesDry', 'Air helps to dry our clothes.'),
  tf('L6', 'L6.definition', U, 'We can see the air.', 'wind', false, 'We cannot see air, but we can feel it.'),
  tf('L6', 'L6.moves', U, 'The wind can move leaves.', 'leaves', true, 'Yes! The wind makes the leaves move.'),
  tf('L6', 'L6.moves', U, 'The wind can move a big house.', 'house', false, 'The wind moves light things like leaves and kites, not a house.'),
  c('L6', 'L6.cool', A, 'It is a very hot day. What can cool you down?', ['fan', 'sun', 'candle'], 'fan', 'A fan blows air. Air cools our bodies.'),
  c('L6', 'L6.moves', A, 'You want your kite to fly. What do you need?', ['wind', 'rain', 'sweets'], 'wind', 'The wind lifts the kite up high.'),
  c('L6', 'L6.dry', A, 'The clothes are on the line outside. What helps them dry?', ['wind', 'rain', 'river'], 'wind', 'Air helps to dry our clothes.'),
  c('L6', 'L6.moves', A, 'Which one will the wind blow away?', ['leaves', 'stone', 'house'], 'leaves', 'The wind can move light things like leaves.'),

  // ---------- L7 Water ----------
  c('L7', 'L7.well', I, 'Tap the well.', ['well', 'house', 'tree'], 'well', 'A well is a source of water.'),
  c('L7', 'L7.tap', I, 'Tap the tap.', ['tap', 'lamp', 'fan'], 'tap', 'The tap is a source of water.'),
  c('L7', 'L7.river', I, 'Tap the river.', ['river', 'sun', 'house'], 'river', 'The river is a source of water.'),
  c('L7', 'L7.rain', I, 'Tap the rain.', ['sun', 'rain', 'moon'], 'rain', 'Rain is a source of water.'),
  tf('L7', 'L7.definition', R, 'Water is a liquid that is colourless, odourless and tasteless.', 'water', true, 'Yes! Water is colourless, odourless and tasteless.'),
  c('L7', 'L7.rain', R, 'Which one is a source of water?', ['rain', 'chair', 'stone'], 'rain', 'Rain, tap, river and well are sources of water.'),
  c('L7', 'L7.uses', R, 'What do we use water for?', ['drinking', 'ball', 'car'], 'drinking', 'We use water for cooking, washing, drinking and bathing.'),
  c('L7', 'L7.uses', R, 'What do we use for bathing?', ['water', 'sweets', 'rice'], 'water', 'We use water for bathing.'),
  c('L7', 'L7.colourless', U, 'Colourless means clean water has no colour. Which glass has clean water?', ['juice', 'glassWater', 'muddyWater'], 'glassWater', 'Clean water has no colour.'),
  tf('L7', 'L7.odourless', U, 'Clean water has a strong smell.', 'water', false, 'Odourless means clean water has no smell.'),
  tf('L7', 'L7.tasteless', U, 'Pure water has no taste.', 'glassWater', true, 'Yes! Tasteless means pure water has no taste.'),
  c('L7', 'L7.safety', A, 'You are thirsty. Which water should you drink?', ['glassWater', 'muddyWater'], 'glassWater', 'We drink only clean, safe water.'),
  c('L7', 'L7.uses', A, 'Mama wants to cook rice. What does she need?', ['water', 'ball', 'chair'], 'water', 'We use water for cooking.'),
  c('L7', 'L7.uses', A, 'Your hands are dirty. What do you use with soap?', ['water', 'juice', 'rice'], 'water', 'We use water for washing.'),
  tf('L7', 'L7.safety', A, 'It is safe to go to the river alone.', 'river', false, 'Never go near a river or a well alone. Ask a grown-up.'),

  // ---------- L8 Food ----------
  c('L8', 'L8.rice', I, 'Tap the rice.', ['rice', 'egg', 'fish'], 'rice', 'This is rice. Rice is food.'),
  c('L8', 'L8.beans', I, 'Tap the beans.', ['noodles', 'beans', 'egg'], 'beans', 'These are beans. Beans are food.'),
  c('L8', 'L8.fish', I, 'Tap the fish.', ['fish', 'rice', 'beans'], 'fish', 'This is fish. Fish is food.'),
  c('L8', 'L8.noodles', I, 'Tap the noodles.', ['egg', 'noodles', 'rice'], 'noodles', 'These are noodles. Noodles are food.'),
  c('L8', 'L8.egg', I, 'Tap the egg.', ['beans', 'fish', 'egg'], 'egg', 'This is an egg. Egg is food.'),
  tf('L8', 'L8.definition', R, 'Food is what we eat that makes us grow and stay alive.', 'eating', true, 'Yes! Food makes us grow and stay alive.'),
  c('L8', 'L8.definition', R, 'Which one is food?', ['rice', 'ball', 'chair'], 'rice', 'Rice is food.'),
  c('L8', 'L8.definition', R, 'Which one is food?', ['car', 'stone', 'egg'], 'egg', 'Egg is food.'),
  c('L8', 'L8.why', R, 'Food gives us...', ['energy', 'rain', 'moon'], 'energy', 'Food gives us energy.'),
  tf('L8', 'L8.why', U, 'Food helps us grow.', 'grow', true, 'Yes! Food helps us grow.'),
  tf('L8', 'L8.definition', U, 'A ball is food.', 'ball', false, 'We cannot eat a ball. Rice, beans, fish, noodles and egg are food.'),
  tf('L8', 'L8.why', U, 'Food keeps us healthy.', 'healthy', true, 'Yes! Food keeps us healthy.'),
  c('L8', 'L8.why', A, 'You want lots of energy to play. What do you need?', ['rice', 'stone', 'car'], 'rice', 'Food gives us energy to run and play.'),
  c('L8', 'L8.definition', A, 'It is lunch time. What will you eat?', ['beans', 'chair', 'ball'], 'beans', 'Beans are food.'),
  c('L8', 'L8.definition', A, 'Chef Ada is making breakfast. Which one can she cook?', ['egg', 'soap', 'comb'], 'egg', 'Egg is food.'),

  // ---------- L9 Sources of food ----------
  c('L9', 'L9.eggs', I, 'Tap the animal that gives us eggs.', ['hen', 'cow', 'fish'], 'hen', 'The hen gives us eggs. Eggs come from animals.'),
  c('L9', 'L9.rice', I, 'Tap the rice plant.', ['riceplant', 'hen', 'cow'], 'riceplant', 'Rice comes from plants.'),
  c('L9', 'L9.meat', I, 'Tap the meat.', ['meat', 'rice', 'beans'], 'meat', 'Meat comes from animals.'),
  tf('L9', 'L9.definition', R, 'We get food from animals and plants.', 'basket', true, 'Yes! We get food from animals and plants.'),
  c('L9', 'L9.meat', R, 'Which food comes from animals?', ['meat', 'rice', 'beans'], 'meat', 'Meat comes from animals.'),
  c('L9', 'L9.eggs', R, 'Which food comes from animals?', ['beans', 'egg', 'rice'], 'egg', 'Eggs come from animals.'),
  c('L9', 'L9.rice', R, 'Which food comes from plants?', ['rice', 'meat', 'egg'], 'rice', 'Rice comes from plants.'),
  c('L9', 'L9.beans', R, 'Which food comes from plants?', ['egg', 'meat', 'beans'], 'beans', 'Beans come from plants.'),
  c('L9', 'L9.eggs', U, 'Where do eggs come from?', ['animals', 'plants'], 'animals', 'Eggs come from animals.'),
  c('L9', 'L9.rice', U, 'Where does rice come from?', ['animals', 'plants'], 'plants', 'Rice comes from plants.'),
  c('L9', 'L9.meat', U, 'Where does meat come from?', ['plants', 'animals'], 'animals', 'Meat comes from animals.'),
  c('L9', 'L9.beans', U, 'Where do beans come from?', ['plants', 'animals'], 'plants', 'Beans come from plants.'),
  tf('L9', 'L9.rice', A, 'Rice comes from animals.', 'rice', false, 'Rice comes from plants.'),
  c('L9', 'L9.eggs', A, 'Chef Ada needs eggs. Where should she go?', ['hen', 'riceplant', 'tree'], 'hen', 'Eggs come from animals, like the hen.'),
  c('L9', 'L9.beans', A, 'Chef Ada needs beans. Where do they grow?', ['beanplant', 'cow', 'hen'], 'beanplant', 'Beans come from plants.'),
  c('L9', 'L9.more', U, 'More to learn: Where does milk come from?', ['animals', 'plants'], 'animals', 'Milk comes from animals, like the cow.', true),
  c('L9', 'L9.more', U, 'More to learn: Where does yam come from?', ['plants', 'animals'], 'plants', 'Yam comes from plants.', true),
];

counter = {};

export function questionsFor(lesson: string, opts: { includeSupplementary?: boolean; includePhoto?: boolean } = {}) {
  return questions.filter(
    (q) =>
      q.lesson === lesson &&
      (opts.includeSupplementary || !q.supplementary) &&
      (opts.includePhoto || q.format !== 'photo'),
  );
}
