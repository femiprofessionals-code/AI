// Lines that screens build from numbers. Building them here (and only here)
// means every variant gets a bundled voice clip.
import { lessons } from './index';
import { items } from './items';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const numberWord = (n: number) => WORDS[n] ?? String(n);

export const scoreLine = (correct: number, total: number) =>
  `You got ${numberWord(correct)} out of ${numberWord(total)}!`;

export const lessonIntroLine = (n: number, title: string) => `Lesson ${numberWord(n)}: ${title}.`;

export const starsLine = (n: number) => (n === 1 ? 'You earned one star!' : `You earned ${numberWord(n)} stars!`);

export const sessionMinutesLine = (n: number) => `You learned for ${numberWord(n)} minutes today.`;

// "Tap the nose!" for quick checks. Only for pictures with a plain noun name.
export function quickName(art: string): string | null {
  const n = items[art]?.name;
  if (!n || n.includes(',') || /ing\b/.test(n) || n.split(' ').length > 3) return null;
  return n.replace(/^(a|an|the) /, '');
}
export const tapLine = (art: string) => `Tap the ${quickName(art)}!`;

export function extraLines(): string[] {
  const out: string[] = [];
  for (const total of [5, 8, 10, 20]) for (let c = 0; c <= total; c++) out.push(scoreLine(c, total));
  for (const l of lessons) out.push(lessonIntroLine(l.number, l.title));
  for (let n = 1; n <= 10; n++) out.push(starsLine(n));
  for (const l of lessons) for (const c of l.learn) if (quickName(c.art) && !['healthy', 'energy', 'basket', 'grow'].includes(c.art)) out.push(tapLine(c.art));
  out.push('Quick check!', 'Now you try!');
  return out;
}
