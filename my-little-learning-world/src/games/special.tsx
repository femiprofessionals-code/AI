import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import type { Activity } from '../content/types';
import { P } from '../content';
import { say, sfx, playMusic, SONGS, stopMusic } from '../audio/audio';
import { Art, BigButton, Character, PopIn, Confetti } from '../components/ui';
import { colors, radius } from '../theme';
import { GameProps, Prompt, useLadder } from './common';

type A<T extends Activity['type']> = Extract<Activity, { type: T }>;

// ---------- help Kiki brush her teeth ----------
const SPOTS = [
  ...Array.from({ length: 6 }, (_, i) => ({ x: 95 + i * 62, y: 150, top: true })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: 95 + i * 62, y: 262, top: false })),
];
export function BrushGame({ activity, lessonId, onDone }: GameProps<A<'brush'>>) {
  const [step, setStep] = useState<'paste' | 'scrub' | 'done'>('paste');
  const [clean, setClean] = useState<boolean[]>(SPOTS.map(() => false));
  const [brush, setBrush] = useState({ x: 470, y: 380 });
  const ladder = useLadder(lessonId);
  const said = useRef({ top: false, bottom: false });
  useEffect(() => { say([activity.title, P.brush.paste]); }, []);

  const scrubAt = (x: number, y: number) => {
    setBrush({ x, y });
    setClean((c) => {
      let changed = false;
      const n = c.map((v, i) => {
        if (v) return v;
        const s = SPOTS[i];
        if (Math.hypot(s.x - x, s.y - y) < 48) { changed = true; return true; }
        return v;
      });
      if (changed) {
        sfx('sparkle');
        const topDone = n.slice(0, 6).every(Boolean);
        if (topDone && !said.current.top) { said.current.top = true; say(P.brush.bottom); }
        if (n.every(Boolean)) {
          setStep('done');
          ladder.right(`${lessonId}.brush`, 'L4.twice', P.brush.done).then(() => onDone({ correct: 1, total: 1 }));
        }
      }
      return changed ? n : c;
    });
  };
  const pan = Gesture.Pan().runOnJS(true).enabled(step === 'scrub').minDistance(0)
    .onBegin((e) => scrubAt(e.x, e.y))
    .onUpdate((e) => scrubAt(e.x, e.y));

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <Prompt text={step === 'paste' ? P.brush.paste : step === 'scrub' ? P.brush.scrub : P.brush.done} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 30 }}>
        <GestureDetector gesture={pan}>
          <View style={{ width: 520, height: 420 }}>
            <Svg width={520} height={420} viewBox="0 0 520 420">
              <Ellipse cx={260} cy={210} rx={250} ry={200} fill="#B8A4E8" stroke="#2B2A4C" strokeWidth={5} />
              <Ellipse cx={260} cy={206} rx={210} ry={130} fill="#8E2C48" stroke="#2B2A4C" strokeWidth={5} />
              <Ellipse cx={260} cy={290} rx={110} ry={40} fill="#E85D75" />
              {SPOTS.map((s, i) => (
                <React.Fragment key={i}>
                  <Rect x={s.x - 26} y={s.top ? 96 : 236} width={52} height={70} rx={14} fill="#FFFFFF" stroke="#2B2A4C" strokeWidth={3} />
                  {!clean[i] && <Circle cx={s.x} cy={s.top ? 140 : 270} r={15} fill="#C9B458" opacity={0.9} />}
                  {clean[i] && <Path d={`M${s.x - 8} ${s.top ? 110 : 250} l6 -6 l6 6`} stroke="#5BC0EB" strokeWidth={3} fill="none" />}
                </React.Fragment>
              ))}
            </Svg>
            {step === 'scrub' && (
              <View pointerEvents="none" style={{ position: 'absolute', left: brush.x - 50, top: brush.y - 50 }}>
                <Art id="toothbrush" size={100} />
              </View>
            )}
          </View>
        </GestureDetector>
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Character id="kiki" size={150} mood={step === 'done' ? 'cheer' : 'happy'} />
          {step === 'paste' && (
            <BigButton label="Squeeze!" art="toothpaste" color={colors.sky} onPress={() => { sfx('drop'); setStep('scrub'); say(P.brush.scrub); }} />
          )}
          {step !== 'paste' && <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>🪥 + 🟢 pea-sized</Text>}
        </View>
      </View>
      {step === 'done' && <Confetti />}
    </View>
  );
}

// ---------- optional two-minute brush-along ----------
export function BrushTimer({ activity, onDone }: GameProps<A<'brushTimer'>>) {
  const [started, setStarted] = useState(false);
  const [sec, setSec] = useState(0);
  const total = 120;
  useEffect(() => { say([activity.title]); return () => stopMusic(); }, []);
  useEffect(() => {
    if (!started) return;
    say(P.timer.start).then(() => say(P.timer.zones[0]));
    let stop = playMusic(SONGS.L4, (_, done) => { if (done) stop = playMusic(SONGS.L4); });
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => { clearInterval(t); stop(); };
  }, [started]);
  useEffect(() => {
    if (!started) return;
    if (sec > 0 && sec < total && sec % 30 === 0) { sfx('sparkle'); say(P.timer.zones[sec / 30]); }
    if (sec >= total) { stopMusic(); sfx('fanfare'); say(P.timer.done).then(() => onDone({ correct: 1, total: 1 })); }
  }, [sec]);
  const zone = Math.min(3, Math.floor(sec / 30));
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Prompt text={activity.title} />
      <Character id="kiki" size={180} talking={started && sec < total} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[0, 1, 2, 3].map((z) => (
          <View key={z} style={{ width: 120, height: 36, borderRadius: 18, backgroundColor: colors.creamDeep, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(0, Math.min(1, (sec - z * 30) / 30)) * 100}%`, height: '100%', backgroundColor: z === zone ? colors.sky : colors.leaf }} />
          </View>
        ))}
      </View>
      {!started ? (
        <BigButton label="Start brushing" art="toothbrush" color={colors.leaf} onPress={() => setStarted(true)} />
      ) : sec < total ? (
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink }}>{P.timer.zones[zone]}</Text>
      ) : <Confetti />}
      {!started && <BigButton label="Skip" art="sparkle" small color={colors.white} onPress={() => onDone({ correct: 0, total: 0 })} />}
    </View>
  );
}

// ---------- drag the sun over something ----------
function SunScene({ title, startLine, doneLine, render, topic, lessonId, onDone }: { title: string; startLine: string; doneLine: string; render: (progress: number) => React.ReactNode; topic: string; lessonId: string; onDone: GameProps<any>['onDone'] }) {
  const [progress, setProgress] = useState(0);
  const [sun, setSun] = useState({ x: 120, y: 90 });
  const target = { x: 560, y: 290 };
  const ladder = useLadder(lessonId);
  const finished = useRef(false);
  const lastSaid = useRef(0);
  useEffect(() => { say([title, startLine]); }, []);
  useEffect(() => {
    const t = setInterval(() => {
      const over = Math.hypot(sun.x - target.x, sun.y - (target.y - 170)) < 170;
      if (!over || finished.current) return;
      setProgress((p) => {
        const n = Math.min(1, p + 0.05);
        if (Math.floor(n * 4) > Math.floor(p * 4)) {
          sfx('sparkle');
          if (Date.now() - lastSaid.current > 3000 && n < 1 && lessonId === 'L5' && startLine === P.sunGrow.start) { lastSaid.current = Date.now(); say(P.sunGrow.grow); }
        }
        if (n >= 1 && !finished.current) {
          finished.current = true;
          ladder.right(`${lessonId}.sun.${topic}`, topic, doneLine).then(() => onDone({ correct: 1, total: 1 }));
        }
        return n;
      });
    }, 150);
    return () => clearInterval(t);
  }, [sun]);
  const pan = Gesture.Pan().runOnJS(true).minDistance(0).onBegin((e) => setSun({ x: e.x, y: e.y })).onUpdate((e) => setSun({ x: e.x, y: e.y }));
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Prompt text={title} />
      <GestureDetector gesture={pan}>
        <View style={{ width: 760, height: 470, borderRadius: radius.lg, backgroundColor: '#DDF2FB', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 110, backgroundColor: '#B6E39A' }} />
          <View style={{ position: 'absolute', left: target.x - 130, top: target.y - 180 }}>{render(progress)}</View>
          <View pointerEvents="none" style={{ position: 'absolute', left: sun.x - 75, top: sun.y - 75 }}>
            <Character id="sun" size={150} mood="happy" />
          </View>
        </View>
      </GestureDetector>
      {progress >= 1 && <Confetti />}
    </View>
  );
}

const PLANT_STAGES = ['🟤', '🌱', '🌿', '🪴', '🌻'];
export function SunGrowGame({ activity, lessonId, onDone }: GameProps<A<'sunGrow'>>) {
  return (
    <SunScene title={activity.title} startLine={P.sunGrow.start} doneLine={P.sunGrow.done} topic="L5.plants" lessonId={lessonId} onDone={onDone}
      render={(p) => (
        <View style={{ width: 260, height: 260, alignItems: 'center', justifyContent: 'flex-end' }}>
          <Text style={{ fontSize: 60 + p * 140 }}>{PLANT_STAGES[Math.min(4, Math.floor(p * 4.99))]}</Text>
        </View>
      )} />
  );
}
export function SunDryGame({ activity, lessonId, onDone }: GameProps<A<'sunDry'>>) {
  return (
    <SunScene title={activity.title} startLine={P.sunDry.start} doneLine={P.sunDry.done} topic="L5.dry" lessonId={lessonId} onDone={onDone}
      render={(p) => (
        <View style={{ width: 260, height: 260 }}>
          <View style={{ position: 'absolute', opacity: 1 - p }}><Art id="clothesWet" size={260} /></View>
          <View style={{ position: 'absolute', opacity: p }}><Art id="clothesDry" size={260} /></View>
        </View>
      )} />
  );
}

// ---------- safe breathing (never holding the breath) ----------
export function BreatheGame({ activity, onDone }: GameProps<A<'breathe'>>) {
  const [phase, setPhase] = useState<'intro' | 'in' | 'out' | 'done'>('intro');
  const [round, setRound] = useState(0);
  const grow = useSharedValue(0.6);
  useEffect(() => {
    let alive = true;
    (async () => {
      await say([activity.title, P.breathe.intro]);
      for (let r = 0; r < 3 && alive; r++) {
        setRound(r + 1);
        setPhase('in');
        grow.value = withTiming(1.25, { duration: 4000, easing: Easing.inOut(Easing.sin) });
        await Promise.all([say(P.breathe.in), new Promise((res) => setTimeout(res, 4000))]);
        if (!alive) return;
        setPhase('out');
        grow.value = withTiming(0.6, { duration: 4500, easing: Easing.inOut(Easing.sin) });
        await Promise.all([say(P.breathe.out), new Promise((res) => setTimeout(res, 4500))]);
      }
      if (!alive) return;
      setPhase('done');
      sfx('correct');
      await say(P.breathe.done);
      onDone({ correct: 1, total: 1 });
    })();
    return () => { alive = false; cancelAnimation(grow); };
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: grow.value }] }));
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Prompt text={phase === 'in' ? P.breathe.in : phase === 'out' ? P.breathe.out : phase === 'done' ? P.breathe.done : P.breathe.intro} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 60 }}>
        <Animated.View style={st}><Art id={phase === 'out' ? 'candle' : 'flower'} size={220} /></Animated.View>
        <Art id="breathing" size={220} />
      </View>
      <Text style={{ fontSize: 22, color: colors.inkSoft, fontWeight: '700' }}>{round > 0 ? `${round} / 3` : ''}</Text>
    </View>
  );
}

// ---------- animated routine (watch and listen) ----------
export function RoutineGame({ activity, onDone }: GameProps<A<'routine'>>) {
  const [i, setI] = useState(-1);
  useEffect(() => {
    let alive = true;
    (async () => {
      await say(activity.title);
      for (let k = 0; k < activity.steps.length && alive; k++) {
        setI(k);
        sfx('whoosh');
        await say(activity.steps[k].say);
        await new Promise((r) => setTimeout(r, 500));
      }
      if (alive) onDone({ correct: 1, total: 1 });
    })();
    return () => { alive = false; };
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Prompt text={activity.title} />
      {i >= 0 && (
        <PopIn key={i}><View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: 20 }}><Art id={activity.steps[i].art} size={260} /></View></PopIn>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {activity.steps.map((s, k) => (
          <View key={k} style={{ opacity: k <= i ? 1 : 0.25 }}><Art id={s.art} size={70} /></View>
        ))}
      </View>
      {i >= 0 && <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{activity.steps[i].say}</Text>}
    </View>
  );
}

// ---------- picture story ----------
export function StoryGame({ activity, onDone }: GameProps<A<'story'>>) {
  const [i, setI] = useState(0);
  const [ready, setReady] = useState(false);
  const page = activity.pages[i];
  useEffect(() => {
    setReady(false);
    (i === 0 ? say([activity.title, page.say]) : say(page.say)).then(() => setReady(true));
  }, [i]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <PopIn key={i} style={{ flexDirection: 'row', gap: 20, backgroundColor: page.mood === 'ouch' ? '#FFF3CC' : colors.white, padding: 24, borderRadius: radius.lg }}>
        {page.art.map((a, k) => (a === 'kiki' ? <Character key={k} id="kiki" size={200} mood={page.mood} /> : <Art key={k} id={a} size={180} mood={page.mood} />))}
      </PopIn>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', maxWidth: 900 }}>{page.say}</Text>
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <BigButton label="Again" art="music" small color={colors.white} onPress={() => say(page.say)} />
        <BigButton label={i + 1 < activity.pages.length ? 'Next page' : 'The end'} art={i + 1 < activity.pages.length ? 'book' : 'heart'} color={ready ? colors.leaf : colors.creamDeep} onPress={() => (i + 1 < activity.pages.length ? setI(i + 1) : onDone({ correct: 1, total: 1 }))} />
      </View>
      <Text style={{ fontSize: 18, color: colors.inkSoft }}>{i + 1} / {activity.pages.length}</Text>
    </View>
  );
}
