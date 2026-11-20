import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/text';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, withRepeat } from 'react-native-reanimated';
import { P } from '../content';
import { say, sfx } from '../audio/audio';
import { useApp } from '../store';
import type { AttemptContext } from '../db/types';
import { Art, Bouncy, shade } from '../components/ui';
import { colors, radius } from '../theme';
import { itemName } from '../content/items';

export type GameResult = { correct: number; total: number };
export type GameProps<A> = { activity: A; lessonId: string; onDone: (r: GameResult) => void; context?: AttemptContext };

let praiseIdx = 0;
export const praise = () => P.praise[praiseIdx++ % P.praise.length];
let tryIdx = 0;
export const tryAgainLine = () => P.tryAgain[tryIdx++ % P.tryAgain.length];

export function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// Feedback ladder used by every game:
//   correct -> sparkle + praise;  1st wrong -> gentle "try again" + replay prompt;
//   2nd wrong -> reveal the answer (amber glow) + re-explain. Never a buzzer.
export function useLadder(lessonId: string, context: AttemptContext = 'game') {
  const answer = useApp((s) => s.answer);
  const attempts = useRef(0);
  const started = useRef(Date.now());
  const firstTry = useRef(0);
  const reset = () => {
    attempts.current = 0;
    started.current = Date.now();
  };
  const right = async (qid: string, topic: string, extra?: string | string[]) => {
    attempts.current += 1;
    if (attempts.current === 1) firstTry.current += 1;
    answer({ questionId: qid, topicId: topic, lessonId, context, correct: true, attemptNo: attempts.current, responseMs: Date.now() - started.current });
    sfx('correct');
    await say(extra ? [praise(), ...(Array.isArray(extra) ? extra : [extra])] : praise());
  };
  // Returns true when the answer should now be revealed.
  const wrong = async (qid: string, topic: string, chosen: string, prompt: string, explain: string) => {
    attempts.current += 1;
    answer({ questionId: qid, topicId: topic, lessonId, context, chosen, correct: false, attemptNo: attempts.current, responseMs: Date.now() - started.current });
    sfx('tryagain');
    if (attempts.current >= 2) {
      say([explain, P.showAnswer]);
      return true;
    }
    say([tryAgainLine(), prompt]);
    return false;
  };
  return { right, wrong, reset, firstTry, attempts };
}

// Re-speaks the prompt if she has not touched the screen for a while.
export function useIdleNudge(prompt: string | null, deps: unknown[]) {
  useEffect(() => {
    if (!prompt) return;
    const a = setTimeout(() => say(prompt), 12000);
    const b = setTimeout(() => say([P.stillThere, prompt]), 30000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, deps);
}

// A large picture answer tile with glow states.
export function Tile({ art, onPress, state = 'idle', size = 150, label, color = colors.white }: { art: string; onPress?: () => void; state?: 'idle' | 'right' | 'reveal' | 'wrong' | 'selected' | 'faded'; size?: number; label?: string; color?: string }) {
  const wob = useSharedValue(0);
  const glow = useSharedValue(1);
  useEffect(() => {
    if (state === 'wrong') wob.value = withSequence(withTiming(-8, { duration: 60 }), withTiming(8, { duration: 60 }), withTiming(-5, { duration: 60 }), withTiming(0, { duration: 60 }));
    if (state === 'reveal') glow.value = withRepeat(withSequence(withTiming(1.08, { duration: 400 }), withTiming(1, { duration: 400 })), -1);
    else glow.value = withTiming(1);
  }, [state]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: wob.value }, { scale: glow.value }] }));
  const border = state === 'right' ? colors.leaf : state === 'reveal' ? colors.amber : state === 'selected' ? colors.sky : 'transparent';
  return (
    <Animated.View style={st}>
      <Bouncy onPress={onPress} sound={false}>
        <View style={{ width: size, height: size + (label ? 30 : 0), borderRadius: radius.lg, backgroundColor: color, borderWidth: 6, borderColor: border, borderBottomWidth: 10, borderBottomColor: border === 'transparent' ? shade(color, 0.12) : border, alignItems: 'center', justifyContent: 'center', opacity: state === 'faded' ? 0.35 : 1 }}>
          <Art id={art} size={size * 0.68} />
          {label ? <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }} numberOfLines={1}>{label}</Text> : null}
          {state === 'right' && <Text style={{ position: 'absolute', top: 4, right: 8, fontSize: 30 }}>✅</Text>}
        </View>
      </Bouncy>
    </Animated.View>
  );
}

export const nameLine = (art: string) => {
  const n = itemName(art);
  return n.charAt(0).toUpperCase() + n.slice(1) + '.';
};

export function Prompt({ text, hidden }: { text: string; hidden?: boolean }) {
  return (
    <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', marginVertical: 8 }} numberOfLines={3}>
      {hidden ? '👂 Listen…' : text}
    </Text>
  );
}

export function useRoundIndex(total: number, onFinish: () => void) {
  const [i, setI] = useState(0);
  const next = () => {
    if (i + 1 >= total) onFinish();
    else setI(i + 1);
  };
  return [i, next] as const;
}
