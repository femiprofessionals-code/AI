// Plays the real games in the web build: taps answers, drags pieces, answers
// photo questions and uses the parent PIN. Audio autoplay is allowed so the
// clip-finished events drive the flow exactly as on the tablet.
// Usage: node tools/ui-interact.js <web-export-dir> <out-dir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [dir, out] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg', '.png': 'image/png' };
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  const captions = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.route('https://app.local/**', (route) => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(dir, p);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
  });
  await page.goto('https://app.local/');
  await page.waitForTimeout(1500);
  // Record every caption the app shows (= every line it speaks).
  await page.evaluate(() => {
    globalThis.__captions = [];
    globalThis.__app.subscribe((s, prev) => { if (s.caption && s.caption !== prev.caption) globalThis.__captions.push(s.caption); });
  });
  const nav = (r) => page.evaluate((r) => { const s = globalThis.__app.getState(); s.home(); s.go(r); globalThis.__captions = []; }, r);
  const said = () => page.evaluate(() => globalThis.__captions.slice());
  const waitSaid = async (text, ms = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if ((await said()).some((c) => c.includes(text))) return true; await page.waitForTimeout(250); }
    return false;
  };
  const center = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const drag = async (from, to) => {
    const a = await center(from), b = await center(to);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12); await page.waitForTimeout(20); }
    await page.mouse.up();
  };

  try {
  // 1. Audio really plays: the home greeting finishes and the help line follows.
  check('home greeting plays and is followed by the help line', await waitSaid('Tap the big green button', 25000));

  // 2. Listen and select: correct answers advance through the rounds.
  await nav({ name: 'game', lesson: 'L8', index: 0 });
  check('listen-and-select speaks its first prompt', await waitSaid('Tap the rice.'));
  await page.getByText('🍚').first().click();
  check('a correct tap is praised and explained', await waitSaid('This is rice.'));
  check('the next round starts', await waitSaid('Tap the beans.'));
  // 3. Wrong twice: gentle retry, then the answer is shown.
  await page.getByText('🍜').first().click();
  check('first wrong answer gets a gentle "try again"', await waitSaid('try', 8000) || await waitSaid('Almost', 1));
  await page.waitForTimeout(500);
  await page.getByText('🥚').first().click();
  check('second wrong answer reveals the right one', await waitSaid('Look, here is the right one. Tap it.'));
  await page.screenshot({ path: `${out}/reveal.png` });

  // 4. Drag and drop matching.
  await nav({ name: 'game', lesson: 'L2', index: 0 });
  await waitSaid('Drag each picture to its partner.');
  await drag(page.getByText('🪥').first(), page.getByText('🦷').first());
  check('dragging the toothbrush onto the teeth is accepted', await waitSaid('The toothbrush is for our teeth.'));
  await drag(page.getByText('🧼').first(), page.getByText('🦷').first());
  check('a wrong drop springs back with a gentle retry', await waitSaid('Match each thing to its job.', 8000));
  await page.screenshot({ path: `${out}/dragmatch.png` });

  // 5. The two food baskets.
  await nav({ name: 'game', lesson: 'L9', index: 0 });
  await waitSaid('Drag each picture into the right box.');
  await drag(page.getByText('🍖').first(), page.getByText('Food from animals').first());
  check('meat dropped in "Food from animals" is accepted', await waitSaid('Food from animals'));
  await drag(page.getByText('🍚').first(), page.getByText('Food from plants').first());
  check('rice dropped in "Food from plants" is accepted', await waitSaid('Food from plants'));
  await page.screenshot({ path: `${out}/baskets.png` });

  // 6. My Body, My Picture: answer the photo questions by tapping her photo.
  await nav({ name: 'game', lesson: 'L1', index: 4 });
  let photoOk = 0;
  for (let round = 0; round < 5; round++) {
    let prompt = null;
    for (let w = 0; w < 60 && !prompt; w++) {
      prompt = (await said()).reverse().find((c) => /(find your|Where is your|Show me your) (\w+)/.test(c));
      if (!prompt) await page.waitForTimeout(250);
    }
    if (!prompt) { check('photo question prompt heard', false, (await said()).join(' / ').slice(0, 300)); break; }
    const part = prompt.match(/(find your|Where is your|Show me your) (\w+)/)[2];
    const m = await page.evaluate((part) => globalThis.__app.getState().photos.find((p) => p.kind === 'full_body').markers[part], part);
    const img = page.locator('img').first();
    const b = await img.boundingBox();
    await page.evaluate(() => (globalThis.__captions = []));
    await page.mouse.click(b.x + m.x * b.width, b.y + m.y * b.height);
    if (await waitSaid(`That is your ${part}.`, 15000)) photoOk++;
    await page.screenshot({ path: `${out}/photo-${round}.png` });
  }
  check('photo questions: tapping the marked spot on her photo is correct', photoOk === 5, `${photoOk}/5`);

  // 7. Memory cards reveal a picture when turned.
  await nav({ name: 'game', lesson: 'L8', index: 2 });
  await waitSaid('Turn over two cards');
  await page.getByText('❓').first().click();
  await page.waitForTimeout(600);
  check('a memory card turns over and names its picture', (await said()).some((c) => /^(Rice|Beans|Fish|Egg)\.$/.test(c)));

  // 8. A full little exam in Lesson 5 records five answers.
  await page.evaluate(() => { const s = globalThis.__app.getState(); s.saveLesson({ ...s.lessonState('L5'), taught: true }); });
  const before = await page.evaluate(() => Object.values(globalThis.__app.getState().mastery).reduce((a, m) => a + m.totalAttempts, 0));
  await nav({ name: 'lesson', lesson: 'L5', stage: 6 });
  await waitSaid('Listen to each question');
  for (let q = 0; q < 5; q++) {
    await page.waitForTimeout(2500);
    const tiles = page.locator('[tabindex="0"]').filter({ hasNot: page.locator('text=🏠') });
    // tap Yes for true/false, otherwise the first picture tile in the answer row
    const yes = page.getByText('Yes', { exact: true });
    if (await yes.count()) await yes.first().click(); else await page.mouse.click(640, 430);
    await page.waitForTimeout(1500);
    await page.mouse.click(640, 430);
    await page.waitForTimeout(3500);
  }
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => Object.values(globalThis.__app.getState().mastery).reduce((a, m) => a + m.totalAttempts, 0));
  check('little exam answers update mastery', after > before, `${after - before} new first-try answers`);
  await page.screenshot({ path: `${out}/after-exam.png` });

  // 8b. A complete Little Exam (Lesson 8) answered correctly ends in the celebration with 3 stars.
  await page.evaluate(() => { const s = globalThis.__app.getState(); s.saveLesson({ ...s.lessonState('L8'), taught: true, status: 'in_progress' }); });
  const starsBefore = await page.evaluate(() => globalThis.__app.getState().stars);
  await nav({ name: 'lesson', lesson: 'L8', stage: 6 });
  await waitSaid('Listen to each question');
  let answered = 0;
  for (let q = 0; q < 5; q++) {
    let found = null;
    for (let w = 0; w < 80 && !found; w++) {
      found = await page.evaluate(() => {
        const caps = globalThis.__captions;
        for (let i = caps.length - 1; i >= 0; i--) {
          const q = globalThis.__bank.find((x) => x.lesson === 'L8' && x.prompt === caps[i]);
          if (q) return { id: q.id, format: q.format, answer: q.answer, isTrue: q.isTrue, emoji: q.answer ? globalThis.__items[q.answer].emoji : null };
        }
        return null;
      });
      if (!found) await page.waitForTimeout(250);
    }
    if (!found) break;
    await page.evaluate(() => (globalThis.__captions = []));
    if (found.format === 'truefalse') await page.getByText(found.isTrue ? 'Yes' : 'No', { exact: true }).first().click();
    else await page.getByText(found.emoji, { exact: true }).last().click();
    answered++;
    await page.waitForTimeout(400);
  }
  check('little exam: five questions answered', answered === 5, `${answered}/5`);
  check('the celebration announces three stars', await waitSaid('You earned three stars!', 30000));
  const prog = await page.evaluate(() => globalThis.__app.getState().lessonState('L8'));
  check('the lesson is saved as completed with 3 stars', prog.status === 'completed' && prog.stars === 3, JSON.stringify({ status: prog.status, stars: prog.stars }));
  check('stars are added to her jar', (await page.evaluate(() => globalThis.__app.getState().stars)) > starsBefore);
  await page.screenshot({ path: `${out}/celebration.png` });

  // 9. Parent PIN: create, confirm, enter; a wrong PIN is refused.
  await nav({ name: 'parentGate' });
  await page.waitForTimeout(600);
  const tap = async (digits) => { for (const d of digits) { await page.getByText(d, { exact: true }).first().click(); await page.waitForTimeout(80); } };
  await tap('2468'); await page.waitForTimeout(300); await tap('2468'); await page.waitForTimeout(800);
  check('creating a PIN opens the parent dashboard', await page.getByText('Parent dashboard').count() > 0);
  await nav({ name: 'parentGate' });
  await page.waitForTimeout(600);
  await tap('1111'); await page.waitForTimeout(600);
  check('a wrong PIN is refused', await page.getByText('Wrong PIN.').count() > 0);
  await tap('2468'); await page.waitForTimeout(800);
  check('the right PIN opens the dashboard', await page.getByText('Parent dashboard').count() > 0);

  } catch (e) { check('walkthrough completed', false, e.message.split('\n')[0]); }
  const voiceMissing = logs.filter((l) => l.includes('[voice] no clip'));
  check('every line spoken in these tests had a bundled clip', voiceMissing.length === 0, voiceMissing.slice(0, 3).join(' | '));
  const errors = logs.filter((l) => !l.includes('[voice]'));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  fs.writeFileSync(`${out}/results.txt`, results.join('\n') + '\n\n' + logs.join('\n'));
  console.log(results.join('\n'));
  await browser.close();
})();
