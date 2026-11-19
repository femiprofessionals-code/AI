// Lines that screens build from numbers. Building them here (and only here)
// means every variant gets a bundled voice clip.
import { lessons } from './index';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
export const numberWord = (n: number) => WORDS[n] ?? String(n);

export const scoreLine = (correct: number, total: number) =>
  `You got ${numberWord(correct)} out of ${numberWord(total)}!`;

export const lessonIntroLine = (n: number, title: string) => `Lesson ${numberWord(n)}: ${title}.`;

export const starsLine = (n: number) => (n === 1 ? 'You earned one star!' : `You earned ${numberWord(n)} stars!`);

export const sessionMinutesLine = (n: number) => `You learned for ${numberWord(n)} minutes today.`;

export function extraLines(): string[] {
  const out: string[] = [];
  for (const total of [5, 8, 10, 20]) for (let c = 0; c <= total; c++) out.push(scoreLine(c, total));
  for (const l of lessons) out.push(lessonIntroLine(l.number, l.title));
  for (let n = 1; n <= 10; n++) out.push(starsLine(n));
  return out;
}
