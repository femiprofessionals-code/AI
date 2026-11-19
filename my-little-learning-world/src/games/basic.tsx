import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import type { Activity, Round } from '../content/types';
import { P } from '../content';
import { say, sfx } from '../audio/audio';
import { Art, BigButton, Bouncy, PopIn } from '../components/ui';
import { colors, radius } from '../theme';
import { GameProps, Prompt, Tile, nameLine, shuffle, useIdleNudge, useLadder } from './common';

type A<T extends Activity['type']> = Extract<Activity, { type: T }>;

// ---------- picture identification / listen and select ----------
export function ChoiceGame({ activity, lessonId, onDone, context }: GameProps<A<'pictureId'> | A<'listenSelect'>>) {
  const rounds: Round[] = activity.rounds;
  const [i, setI] = useState(0);
  const [states, setStates] = useState<Record<string, 'wrong' | 'right' | 'reveal'>>({});
  const [locked, setLocked] = useState(false);
  const ladder = useLadder(lessonId, context);
  const r = rounds[i];
  const choices = useMemo(() => shuffle(r.choices), [i]);
  const listen = activity.type === 'listenSelect';
  useEffect(() => {
    ladder.reset();
    setStates({});
    setLocked(false);
    say(i === 0 ? [activity.title, r.prompt] : r.prompt);
  }, [i]);
  useIdleNudge(r.prompt, [i, states]);

  const pick = async (c: string) => {
    if (locked) return;
    const qid = `${lessonId}.${activity.type}.${i}`;
    if (c === r.answer) {
      setLocked(true);
      setStates({ [c]: 'right' });
      await ladder.right(qid, r.topic, r.explain);
      if (i + 1 >= rounds.length) onDone({ correct: ladder.firstTry.current, total: rounds.length });
      else setI(i + 1);
    } else if (states[r.answer] !== 'reveal') {
      const reveal = await ladder.wrong(qid, r.topic, c, r.prompt, r.explain);
      setStates(reveal ? { [c]: 'wrong', [r.answer]: 'reveal' } : { [c]: 'wrong' });
    }
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Prompt text={r.prompt} hidden={listen} />
      <View style={{ flexDirection: 'row', gap: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
        {choices.map((c) => (
          <PopIn key={`${i}-${c}`}>
            <Tile art={c} size={190} state={states[c] ?? 'idle'} onPress={() => pick(c)} />
          </PopIn>
        ))}
      </View>
      <Text style={{ fontSize: 18, color: colors.inkSoft }}>{i + 1} / {rounds.length}</Text>
    </View>
  );
}

// ---------- true or false with pictures ----------
export function TrueFalseGame({ activity, lessonId, onDone, context }: GameProps<A<'trueFalse'>>) {
  const [i, setI] = useState(0);
  const [state, setState] = useState<{ yes?: 'right' | 'wrong' | 'reveal'; no?: 'right' | 'wrong' | 'reveal' }>({});
  const [locked, setLocked] = useState(false);
  const ladder = useLadder(lessonId, context);
  const r = activity.rounds[i];
  useEffect(() => {
    ladder.reset();
    setState({});
    setLocked(false);
    say(i === 0 ? [activity.title, r.statement] : r.statement);
  }, [i]);
  useIdleNudge(r.statement, [i, state]);
  const pick = async (yes: boolean) => {
    if (locked) return;
    const qid = `${lessonId}.tf.${i}`;
    const key = yes ? 'yes' : 'no';
    if (yes === r.isTrue) {
      setLocked(true);
      setState({ [key]: 'right' });
      await ladder.right(qid, r.topic, r.explain);
      if (i + 1 >= activity.rounds.length) onDone({ correct: ladder.firstTry.current, total: activity.rounds.length });
      else setI(i + 1);
    } else {
      const reveal = await ladder.wrong(qid, r.topic, key, r.statement, r.explain);
      setState(reveal ? { [key]: 'wrong', [r.isTrue ? 'yes' : 'no']: 'reveal' } : { [key]: 'wrong' });
    }
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <PopIn key={i}><Art id={r.art} size={200} /></PopIn>
      <Prompt text={r.statement} />
      <View style={{ flexDirection: 'row', gap: 40 }}>
        <Tile art="yes" label="Yes" size={160} color="#E6F6DC" state={state.yes ?? 'idle'} onPress={() => pick(true)} />
        <Tile art="no" label="No" size={160} color="#FFF3CC" state={state.no ?? 'idle'} onPress={() => pick(false)} />
      </View>
    </View>
  );
}

// ---------- tap all the correct pictures ----------
export function TapAllGame({ activity, lessonId, onDone }: GameProps<A<'tapAll'>>) {
  const items = useMemo(() => shuffle(activity.items), []);
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<Record<number, 'right' | 'wrong' | 'reveal'>>({});
  const ladder = useLadder(lessonId);
  useEffect(() => { say([activity.title, P.tapAllStart]); }, []);
  const toggle = (i: number) => {
    setResult({});
    say(nameLine(items[i].art));
    setSel((s) => ({ ...s, [i]: !s[i] }));
  };
  const check = async () => {
    const ok = items.every((it, i) => !!sel[i] === it.correct);
    const qid = `${lessonId}.tapAll`;
    if (ok) {
      setResult(Object.fromEntries(items.map((it, i) => [i, it.correct ? 'right' : undefined]).filter((x) => x[1])) as any);
      await ladder.right(qid, activity.topic, activity.done);
      onDone({ correct: ladder.firstTry.current, total: 1 });
    } else {
      const reveal = await ladder.wrong(qid, activity.topic, 'mixed', activity.title, activity.done);
      const marks: Record<number, 'wrong' | 'reveal'> = {};
      items.forEach((it, i) => {
        if (!!sel[i] !== it.correct) marks[i] = reveal && it.correct ? 'reveal' : 'wrong';
      });
      setResult(marks);
      if (reveal) setSel(Object.fromEntries(items.map((it, i) => [i, it.correct])));
    }
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Prompt text={activity.title} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'center', maxWidth: 900 }}>
        {items.map((it, i) => (
          <Tile key={i} art={it.art} size={150} state={result[i] ?? (sel[i] ? 'selected' : 'idle')} onPress={() => toggle(i)} />
        ))}
      </View>
      <BigButton label="Done" art="sparkle" color={colors.leaf} onPress={check} small />
    </View>
  );
}

// ---------- memory cards ----------
export function MemoryGame({ activity, lessonId, onDone }: GameProps<A<'memory'>>) {
  const cards = useMemo(() => shuffle([...activity.cards, ...activity.cards]), []);
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<Set<string>>(new Set());
  const busy = useRef(false);
  const ladder = useLadder(lessonId);
  useEffect(() => { say([activity.title, P.memory.start]); }, []);
  const flip = (i: number) => {
    if (busy.current || open.includes(i) || found.has(cards[i])) return;
    sfx('flip');
    say(nameLine(cards[i]));
    const next = [...open, i];
    setOpen(next);
    if (next.length === 2) {
      busy.current = true;
      const [a, b] = next;
      setTimeout(async () => {
        if (cards[a] === cards[b]) {
          const f = new Set(found).add(cards[a]);
          setFound(f);
          sfx('correct');
          ladder.reset();
          if (f.size === activity.cards.length) {
            await ladder.right(`${lessonId}.memory`, activity.topic, P.memory.done);
            onDone({ correct: 1, total: 1 });
          } else say(P.memory.match);
        }
        setOpen([]);
        busy.current = false;
      }, 1100);
    }
  };
  const cols = cards.length <= 8 ? 4 : 5;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Prompt text={activity.title} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center', width: cols * 156 }}>
        {cards.map((c, i) => {
          const shown = open.includes(i) || found.has(c);
          return (
            <Bouncy key={i} onPress={() => flip(i)} sound={false}>
              <View style={{ width: 140, height: 140, borderRadius: radius.md, backgroundColor: shown ? colors.white : colors.lilac, borderBottomWidth: 8, borderBottomColor: found.has(c) ? colors.leaf : '#7A5FC0', alignItems: 'center', justifyContent: 'center' }}>
                {shown ? <Art id={c} size={96} /> : <Text style={{ fontSize: 56 }}>❓</Text>}
              </View>
            </Bouncy>
          );
        })}
      </View>
    </View>
  );
}

// ---------- picture sequencing ----------
export function SequenceGame({ activity, lessonId, onDone }: GameProps<A<'sequence'>>) {
  const order = activity.steps;
  const pool = useMemo(() => shuffle(order.map((_, i) => i)), []);
  const [placed, setPlaced] = useState<number[]>([]);
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const ladder = useLadder(lessonId);
  useEffect(() => { say([activity.title, P.sequence.start]); }, []);
  const tap = async (idx: number) => {
    if (placed.includes(idx)) return;
    const expected = placed.length;
    if (idx === expected) {
      sfx('snap');
      const next = [...placed, idx];
      setPlaced(next);
      setWrongIdx(null);
      setReveal(null);
      ladder.reset();
      await say(order[idx].say);
      if (next.length === order.length) {
        await ladder.right(`${lessonId}.sequence`, activity.topic);
        onDone({ correct: 1, total: 1 });
      }
    } else {
      setWrongIdx(idx);
      const r = await ladder.wrong(`${lessonId}.sequence.${expected}`, activity.topic, String(idx), P.sequence.start, order[expected].say);
      if (r) setReveal(expected);
    }
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Prompt text={activity.title} />
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {order.map((_, slot) => (
          <View key={slot} style={{ width: 150, height: 150, borderRadius: radius.md, borderWidth: 4, borderStyle: 'dashed', borderColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.creamDeep }}>
            {placed[slot] !== undefined ? <PopIn><Art id={order[placed[slot]].art} size={110} /></PopIn> : <Text style={{ fontSize: 40, color: colors.inkSoft, fontWeight: '800' }}>{slot + 1}</Text>}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        {pool.map((idx) =>
          placed.includes(idx) ? <View key={idx} style={{ width: 150 }} /> : (
            <Tile key={idx} art={order[idx].art} size={150} state={reveal === idx ? 'reveal' : wrongIdx === idx ? 'wrong' : 'idle'} onPress={() => tap(idx)} />
          ),
        )}
      </View>
    </View>
  );
}

// ---------- find the missing part of the face ----------
type FacePart = 'eyes' | 'nose' | 'mouth' | 'ears';
export function CartoonFace({ hide, size = 260 }: { hide?: FacePart | null; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {hide !== 'ears' && (
        <>
          <Ellipse cx={17} cy={52} rx={8} ry={11} fill="#7A4A2E" stroke="#2B2A4C" strokeWidth={2.5} />
          <Ellipse cx={83} cy={52} rx={8} ry={11} fill="#7A4A2E" stroke="#2B2A4C" strokeWidth={2.5} />
        </>
      )}
      <Circle cx={50} cy={52} r={34} fill="#7A4A2E" stroke="#2B2A4C" strokeWidth={3} />
      <Path d="M18 44 c0 -34 64 -34 64 0 c-10 -14 -54 -14 -64 0z" fill="#1E1B2E" />
      {hide !== 'eyes' && (
        <>
          <Circle cx={38} cy={50} r={5.5} fill="#fff" /><Circle cx={38} cy={51} r={3.2} fill="#2B2A4C" />
          <Circle cx={62} cy={50} r={5.5} fill="#fff" /><Circle cx={62} cy={51} r={3.2} fill="#2B2A4C" />
        </>
      )}
      {hide !== 'nose' && <Path d="M50 54 q-6 10 0 11 q6 -1 0 -11" fill="#5C3620" stroke="#2B2A4C" strokeWidth={1.5} />}
      {hide !== 'mouth' && <Path d="M38 72 q12 10 24 0" fill="#E85D75" stroke="#2B2A4C" strokeWidth={2.5} strokeLinecap="round" />}
      {hide && <Circle cx={hide === 'eyes' ? 50 : hide === 'ears' ? 17 : 50} cy={hide === 'eyes' ? 50 : hide === 'nose' ? 59 : hide === 'mouth' ? 72 : 52} r={9} fill="none" stroke="#FFA94D" strokeWidth={2.5} strokeDasharray="3 3" />}
    </Svg>
  );
}

export function MissingGame({ activity, lessonId, onDone }: GameProps<A<'missing'>>) {
  const [i, setI] = useState(0);
  const [fixed, setFixed] = useState(false);
  const [states, setStates] = useState<Record<string, 'wrong' | 'right' | 'reveal'>>({});
  const ladder = useLadder(lessonId);
  const r = activity.rounds[i];
  const choices = useMemo(() => shuffle(r.choices), [i]);
  useEffect(() => {
    ladder.reset();
    setFixed(false);
    setStates({});
    say(i === 0 ? [activity.title] : P.missing.start);
  }, [i]);
  const pick = async (c: FacePart) => {
    if (fixed) return;
    if (c === r.missing) {
      setFixed(true);
      setStates({ [c]: 'right' });
      await ladder.right(`${lessonId}.missing.${i}`, r.topic, nameLine(r.missing));
      if (i + 1 >= activity.rounds.length) onDone({ correct: ladder.firstTry.current, total: activity.rounds.length });
      else setI(i + 1);
    } else {
      const reveal = await ladder.wrong(`${lessonId}.missing.${i}`, r.topic, c, P.missing.start, nameLine(r.missing));
      setStates(reveal ? { [c]: 'wrong', [r.missing]: 'reveal' } : { [c]: 'wrong' });
    }
  };
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
      <PopIn key={`${i}-${fixed}`}><CartoonFace hide={fixed ? null : r.missing} size={320} /></PopIn>
      <View style={{ gap: 18 }}>
        {choices.map((c) => <Tile key={c} art={c} size={140} state={states[c] ?? 'idle'} onPress={() => pick(c)} />)}
      </View>
    </View>
  );
}
