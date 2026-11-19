import React from 'react';
import type { Activity } from '../content/types';
import type { AttemptContext } from '../db/types';
import type { GameResult } from './common';
import { ChoiceGame, TrueFalseGame, TapAllGame, MemoryGame, SequenceGame, MissingGame } from './basic';
import { DragMatchGame, SortGame, PuzzleGame } from './dragGames';
import { BrushGame, BrushTimer, SunGrowGame, SunDryGame, BreatheGame, RoutineGame, StoryGame } from './special';
import { PhotoBodyGame } from './photo';

const MAP: Record<Activity['type'], React.ComponentType<any>> = {
  pictureId: ChoiceGame,
  listenSelect: ChoiceGame,
  trueFalse: TrueFalseGame,
  tapAll: TapAllGame,
  memory: MemoryGame,
  sequence: SequenceGame,
  missing: MissingGame,
  dragMatch: DragMatchGame,
  sort: SortGame,
  puzzle: PuzzleGame,
  photoBody: PhotoBodyGame,
  brush: BrushGame,
  brushTimer: BrushTimer,
  sunGrow: SunGrowGame,
  sunDry: SunDryGame,
  breathe: BreatheGame,
  routine: RoutineGame,
  story: StoryGame,
};

export const GAME_ICONS: Record<Activity['type'], string> = {
  pictureId: 'eyes', listenSelect: 'ears', trueFalse: 'yes', tapAll: 'sparkle', memory: 'brain', sequence: 'counting',
  missing: 'nose', dragMatch: 'hands', sort: 'basket', puzzle: 'game', photoBody: 'camera', brush: 'toothbrush',
  brushTimer: 'toothbrush', sunGrow: 'plant', sunDry: 'clothesDry', breathe: 'flower', routine: 'wakeup', story: 'book',
};

export function GameView({ activity, lessonId, onDone, context, nonce }: { activity: Activity; lessonId: string; onDone: (r: GameResult) => void; context?: AttemptContext; nonce?: number }) {
  const C = MAP[activity.type];
  return <C key={`${lessonId}-${activity.title}-${nonce ?? 0}`} activity={activity} lessonId={lessonId} onDone={onDone} context={context} />;
}
