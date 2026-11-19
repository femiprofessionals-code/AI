// Content model. Every spoken string in the app is a `Line`; the voice tool
// collects them all and generates one audio clip per line.
// `{name}` inside a line is replaced by the child's name (spoken separately).
export type Line = string;
export type ArtId = string;
export type TopicId = string;
export type LessonId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L9';
export type WorldId = 'body' | 'sun' | 'air' | 'water' | 'food';
export type CharId = 'bibi' | 'kiki' | 'sola' | 'breezy' | 'dodo' | 'ada' | 'joy';

export const BODY_PARTS = [
  'head', 'eyes', 'ears', 'nose', 'mouth', 'neck', 'hands', 'fingers', 'stomach', 'legs', 'feet',
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export type Round = {
  prompt: Line;
  choices: ArtId[];
  answer: ArtId;
  topic: TopicId;
  explain: Line;
};

export type Activity =
  | { type: 'pictureId'; title: Line; rounds: Round[] }
  | { type: 'listenSelect'; title: Line; rounds: Round[] }
  | { type: 'dragMatch'; title: Line; pairs: { item: ArtId; target: ArtId; topic: TopicId; say: Line }[] }
  | { type: 'memory'; title: Line; cards: ArtId[]; topic: TopicId }
  | { type: 'missing'; title: Line; rounds: { missing: 'eyes' | 'nose' | 'mouth' | 'ears'; choices: ('eyes' | 'nose' | 'mouth' | 'ears')[]; topic: TopicId }[] }
  | { type: 'sort'; title: Line; bins: { id: string; label: Line; art: ArtId }[]; items: { art: ArtId; bin: string; topic: TopicId }[] }
  | { type: 'tapAll'; title: Line; items: { art: ArtId; correct: boolean }[]; topic: TopicId; done: Line }
  | { type: 'sequence'; title: Line; steps: { art: ArtId; say: Line }[]; topic: TopicId }
  | { type: 'puzzle'; title: Line; art: ArtId; topic: TopicId; done: Line }
  | { type: 'trueFalse'; title: Line; rounds: { statement: Line; art: ArtId; isTrue: boolean; topic: TopicId; explain: Line }[] }
  | { type: 'photoBody'; title: Line; mode: 'explore' | 'question' }
  | { type: 'brush'; title: Line }
  | { type: 'brushTimer'; title: Line }
  | { type: 'sunGrow'; title: Line }
  | { type: 'sunDry'; title: Line }
  | { type: 'breathe'; title: Line }
  | { type: 'routine'; title: Line; steps: { art: ArtId; say: Line }[] }
  | { type: 'story'; title: Line; pages: { art: ArtId[]; say: Line; mood?: 'happy' | 'ouch' }[] };

export type ActivityType = Activity['type'];

export type Lesson = {
  id: LessonId;
  world: WorldId;
  number: number;
  title: Line;
  icon: ArtId;
  character: CharId;
  topics: { id: TopicId; label: string }[];
  welcome: Line[];
  learn: { art: ArtId; lines: Line[]; topic?: TopicId }[];
  explore: { intro: Line; items: { art: ArtId; name: Line; say: Line }[] };
  practice: Activity[];
  song: { title: Line; tune: 'bright' | 'bouncy' | 'gentle'; lines: { text: Line; art: ArtId }[] };
  parentNote?: string;
};

export type QuestionKind = 'identification' | 'recall' | 'understanding' | 'application';

export type Question = {
  id: string;
  lesson: LessonId;
  topic: TopicId;
  kind: QuestionKind;
  prompt: Line;
  explain: Line;
  supplementary?: boolean;
} & (
  | { format: 'choice'; choices: ArtId[]; answer: ArtId }
  | { format: 'truefalse'; art: ArtId; isTrue: boolean }
  | { format: 'photo'; part: BodyPart }
);

export type World = {
  id: WorldId;
  title: Line;
  icon: ArtId;
  character: CharId;
  lessons: LessonId[];
  badge: { id: string; title: Line; art: ArtId };
};
