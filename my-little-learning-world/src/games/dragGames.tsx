import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/text';
import type { Activity } from '../content/types';
import { P } from '../content';
import { say, sfx } from '../audio/audio';
import { Art, PopIn, shade } from '../components/ui';
import { colors, radius } from '../theme';
import { DragArea, Draggable, DropZone } from './drag';
import { GameProps, Prompt, nameLine, shuffle, useLadder } from './common';

type A<T extends Activity['type']> = Extract<Activity, { type: T }>;

const Chip = ({ art, size = 112, glow }: { art: string; size?: number; glow?: string }) => (
  <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.white, borderBottomWidth: 8, borderBottomColor: glow ?? '#E8DCC4', borderWidth: glow ? 5 : 0, borderColor: glow, alignItems: 'center', justifyContent: 'center' }}>
    <Art id={art} size={size * 0.72} />
  </View>
);

// ---------- drag to match ----------
export function DragMatchGame({ activity, lessonId, onDone }: GameProps<A<'dragMatch'>>) {
  const pairs = activity.pairs;
  const leftOrder = useMemo(() => shuffle(pairs.map((_, i) => i)), []);
  const rightOrder = useMemo(() => shuffle(pairs.map((_, i) => i)), []);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [reveal, setReveal] = useState<number | null>(null);
  const [tries, setTries] = useState<Record<number, number>>({});
  const ladder = useLadder(lessonId);
  useEffect(() => { say([activity.title, P.drag.start]); }, []);

  const drop = (i: number) => (zone: string | null) => {
    if (zone == null) return false;
    const target = Number(zone.split(':')[1]);
    const p = pairs[i];
    // Accept any pair with the same item and that target (the same picture may appear twice).
    const ok = target === i || (pairs[target]?.item === p.item && pairs[target]?.target === p.target);
    if (ok && !matched.has(target)) {
      const m = new Set(matched).add(target);
      setMatched(m);
      setReveal(null);
      ladder.attempts.current = tries[i] ?? 0;
      ladder.right(`${lessonId}.match.${target}`, p.topic, p.say).then(() => {
        if (m.size === pairs.length) onDone({ correct: ladder.firstTry.current, total: pairs.length });
      });
      return true;
    }
    ladder.attempts.current = tries[i] ?? 0;
    setTries((t) => ({ ...t, [i]: (t[i] ?? 0) + 1 }));
    ladder.wrong(`${lessonId}.match.${i}`, p.topic, String(target), activity.title, p.say).then((r) => r && setReveal(i));
    return false;
  };

  return (
    <DragArea style={{ flex: 1 }}>
      <Prompt text={activity.title} />
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
        <View style={{ gap: 10 }}>
          {leftOrder.map((i) =>
            matched.has(i) ? <View key={i} style={{ width: 112, height: 112 }} /> : (
              <Draggable key={i} onDrop={drop(i)} onPick={() => say(nameLine(pairs[i].item))}>
                <Chip art={pairs[i].item} glow={reveal === i ? colors.amber : undefined} />
              </Draggable>
            ),
          )}
        </View>
        <Text style={{ fontSize: 48 }}>➡️</Text>
        <View style={{ gap: 10 }}>
          {rightOrder.map((i) => (
            <DropZone key={i} id={`t:${i}`}>
              <View style={{ width: 230, height: 112, borderRadius: radius.md, backgroundColor: matched.has(i) ? '#E6F6DC' : colors.creamDeep, borderWidth: 4, borderStyle: matched.has(i) ? 'solid' : 'dashed', borderColor: matched.has(i) ? colors.leaf : reveal !== null && pairs[reveal].target === pairs[i].target ? colors.amber : colors.inkSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {matched.has(i) && <PopIn><Art id={pairs[i].item} size={70} /></PopIn>}
                <Art id={pairs[i].target} size={88} />
              </View>
            </DropZone>
          ))}
        </View>
      </View>
    </DragArea>
  );
}

// ---------- sort into categories (also the two food baskets) ----------
export function SortGame({ activity, lessonId, onDone }: GameProps<A<'sort'>>) {
  const order = useMemo(() => shuffle(activity.items.map((_, i) => i)), []);
  const [placed, setPlaced] = useState<Record<number, string>>({});
  const [reveal, setReveal] = useState<number | null>(null);
  const [tries, setTries] = useState<Record<number, number>>({});
  const ladder = useLadder(lessonId);
  useEffect(() => { say([activity.title, P.sort.start]); }, []);
  const drop = (i: number) => (zone: string | null) => {
    if (!zone) return false;
    const bin = zone.slice(4);
    const it = activity.items[i];
    const binDef = activity.bins.find((b) => b.id === it.bin)!;
    ladder.attempts.current = tries[i] ?? 0;
    if (bin === it.bin) {
      const next = { ...placed, [i]: bin };
      setPlaced(next);
      setReveal(null);
      ladder.right(`${lessonId}.sort.${i}`, it.topic, [nameLine(it.art), binDef.label]).then(() => {
        if (Object.keys(next).length === activity.items.length) onDone({ correct: ladder.firstTry.current, total: activity.items.length });
      });
      return true;
    }
    setTries((t) => ({ ...t, [i]: (t[i] ?? 0) + 1 }));
    ladder.wrong(`${lessonId}.sort.${i}`, it.topic, bin, activity.title, binDef.label).then((r) => r && setReveal(i));
    return false;
  };
  return (
    <DragArea style={{ flex: 1 }}>
      <Prompt text={activity.title} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap', minHeight: 150 }}>
        {order.map((i) =>
          placed[i] ? null : (
            <Draggable key={i} onDrop={drop(i)} onPick={() => say(nameLine(activity.items[i].art))}>
              <Chip art={activity.items[i].art} size={120} glow={reveal === i ? colors.amber : undefined} />
            </Draggable>
          ),
        )}
      </View>
      <View style={{ flex: 1, flexDirection: 'row', gap: 30, justifyContent: 'center', alignItems: 'center', paddingBottom: 56 }}>
        {activity.bins.map((b, bi) => {
          const c = bi === 0 ? colors.sun : colors.leaf;
          const highlight = reveal !== null && activity.items[reveal].bin === b.id;
          return (
            <DropZone key={b.id} id={`bin:${b.id}`}>
              <View style={{ width: 380, minHeight: 200, borderRadius: radius.lg, backgroundColor: c, borderBottomWidth: 10, borderBottomColor: shade(c), borderWidth: highlight ? 6 : 0, borderColor: colors.amber, padding: 12, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Art id={b.art} size={80} />
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink, flexShrink: 1 }}>{b.label}</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, justifyContent: 'center' }}>
                  {Object.entries(placed).filter(([, bin]) => bin === b.id).map(([i]) => (
                    <PopIn key={i}><Art id={activity.items[Number(i)].art} size={70} /></PopIn>
                  ))}
                </View>
              </View>
            </DropZone>
          );
        })}
      </View>
    </DragArea>
  );
}

// ---------- simple 4-piece picture puzzle ----------
const PIECE = 150;
function Piece({ art, q }: { art: string; q: number }) {
  const col = q % 2, row = Math.floor(q / 2);
  return (
    <View style={{ width: PIECE, height: PIECE, overflow: 'hidden', borderRadius: 12, backgroundColor: colors.white }}>
      <View style={{ position: 'absolute', left: -col * PIECE, top: -row * PIECE }}>
        <Art id={art} size={PIECE * 2} />
      </View>
    </View>
  );
}
export function PuzzleGame({ activity, lessonId, onDone }: GameProps<A<'puzzle'>>) {
  const order = useMemo(() => shuffle([0, 1, 2, 3]), []);
  const [placed, setPlaced] = useState<Set<number>>(new Set());
  const ladder = useLadder(lessonId);
  useEffect(() => { say([activity.title, P.puzzle.start]); }, []);
  const drop = (q: number) => (zone: string | null) => {
    if (zone === `slot:${q}`) {
      sfx('snap');
      const next = new Set(placed).add(q);
      setPlaced(next);
      if (next.size === 4) ladder.right(`${lessonId}.puzzle`, activity.topic, activity.done).then(() => onDone({ correct: 1, total: 1 }));
      return true;
    }
    sfx('tryagain');
    return false;
  };
  return (
    <DragArea style={{ flex: 1 }}>
      <Prompt text={activity.title} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
        <View style={{ width: PIECE * 2 + 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {order.map((q) => placed.has(q) ? <View key={q} style={{ width: PIECE, height: PIECE }} /> : (
            <Draggable key={q} onDrop={drop(q)}><Piece art={activity.art} q={q} /></Draggable>
          ))}
        </View>
        <View style={{ width: PIECE * 2 + 24, flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: 16, backgroundColor: colors.creamDeep, borderWidth: 4, borderColor: colors.inkSoft, borderStyle: 'dashed' }}>
          {[0, 1, 2, 3].map((q) => (
            <DropZone key={q} id={`slot:${q}`}>
              {placed.has(q) ? <Piece art={activity.art} q={q} /> : <View style={{ width: PIECE, height: PIECE, opacity: 0.15 }}><Piece art={activity.art} q={q} /></View>}
            </DropZone>
          ))}
        </View>
      </View>
    </DragArea>
  );
}
