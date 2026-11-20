import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '../components/text';
import { lessonById, worldOfLesson, P } from '../content';
import { lessonIntroLine, starsLine, quickName, tapLine } from '../content/extraLines';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Tile, nameLine, shuffle, useLadder } from '../games/common';
import { StyleSheet } from 'react-native';
import { questions as bank } from '../content/questions';
import { say, sfx, playMusic, stopAll, stopMusic, SONGS } from '../audio/audio';
import timings from '../audio/songTimings.generated.json';
import { useApp, taughtLessons } from '../store';
import { selectQuestions } from '../engine/examSelect';
import { Art, BigButton, Bouncy, Character, Confetti, PopIn, Screen, Stars, shadow } from '../components/ui';
import { GameView } from '../games';
import { ExamRunner, type ExamAnswer } from '../games/exam';
import { colors, radius, worldColors } from '../theme';
import { repo } from '../db/repo';

const STAGES = ['welcome', 'learn', 'explore', 'practice', 'sing', 'exam', 'celebrate'] as const;
const STAGE_ART = ['bibi', 'ears', 'eyes', 'game', 'music', 'book', 'trophy'];

export function LessonScreen({ lessonId, startStage }: { lessonId: string; startStage?: number }) {
  const lesson = lessonById(lessonId);
  const world = worldOfLesson(lesson.id);
  const wc = worldColors[world.id];
  const st = useApp((s) => s.lessonState(lessonId));
  const saveLesson = useApp((s) => s.saveLesson);
  const touchLesson = useApp((s) => s.touchLesson);
  const [stage, setStage] = useState(() => {
    const s = startStage ?? (st.status === 'completed' ? 1 : st.stage);
    return Math.min(7, Math.max(1, s));
  });

  useEffect(() => {
    touchLesson(lessonId);
    if (st.status === 'not_started') saveLesson({ ...st, status: 'in_progress', stage: 1 });
    return () => stopAll();
  }, []);

  const goStage = (n: number) => {
    stopAll();
    const cur = useApp.getState().lessonState(lessonId);
    const taught = cur.taught || n > 2;
    if (cur.status !== 'completed') saveLesson({ ...cur, status: 'in_progress', stage: n, taught });
    else if (taught !== cur.taught) saveLesson({ ...cur, taught });
    setStage(n);
  };
  const next = () => goStage(Math.min(7, stage + 1));
  const key = STAGES[stage - 1];
  const repeatLine = P.stageNames[key];

  return (
    <Screen scene={lesson.world} title={`${lesson.number}. ${lesson.title}`} repeat={repeatLine}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 6 }}>
        {STAGES.map((s, i) => (
          <Bouncy key={s} onPress={() => (i + 1 <= Math.max(stage, st.stage) || st.status === 'completed' ? goStage(i + 1) : say(P.stageNames[s]))}>
            <View style={{ width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: i + 1 === stage ? wc.base : i + 1 < stage ? colors.leaf : colors.white, borderWidth: 3, borderColor: i + 1 === stage ? wc.dark : 'transparent' }}>
              <Art id={STAGE_ART[i] === 'bibi' ? lesson.character : STAGE_ART[i]} size={38} />
            </View>
          </Bouncy>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        {key === 'welcome' && <Welcome lessonId={lessonId} onNext={next} />}
        {key === 'learn' && <Learn lessonId={lessonId} onNext={next} />}
        {key === 'explore' && <Explore lessonId={lessonId} onNext={next} />}
        {key === 'practice' && <Practice lessonId={lessonId} onNext={next} />}
        {key === 'sing' && <Sing lessonId={lessonId} onNext={next} />}
        {key === 'exam' && <LittleExam lessonId={lessonId} onNext={next} />}
        {key === 'celebrate' && <Celebrate lessonId={lessonId} />}
      </View>
    </Screen>
  );
}

function NextButton({ onPress, ready = true, label = 'Next' }: { onPress: () => void; ready?: boolean; label?: string }) {
  return (
    <View style={{ alignItems: 'flex-end', paddingRight: 8 }}>
      <Pulse active={ready}>
        <BigButton label={label} art="sparkle" color={ready ? colors.leaf : colors.white} onPress={onPress} />
      </Pulse>
    </View>
  );
}

function Welcome({ lessonId, onNext }: { lessonId: string; onNext: () => void }) {
  const lesson = lessonById(lessonId);
  const [talking, setTalking] = useState(true);
  useEffect(() => {
    say([lessonIntroLine(lesson.number, lesson.title), ...lesson.welcome]).then(() => setTalking(false));
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <PopIn><Character id={lesson.character} size={260} talking={talking} /></PopIn>
      <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{lesson.title}</Text>
      <Pulse active={!talking}>
        <BigButton label="Let's learn!" art={lesson.icon} color={colors.leaf} onPress={onNext} />
      </Pulse>
    </View>
  );
}

const NO_CHECK = ['healthy', 'energy', 'basket', 'grow'];

type LearnStep = { kind: 'card'; index: number } | { kind: 'check'; target: string; choices: string[]; topic: string };

// Facts with a quick tap-check after every two: hear it, then recall it.
function buildSteps(lessonId: string): LearnStep[] {
  const lesson = lessonById(lessonId);
  const steps: LearnStep[] = [];
  const seen: { art: string; topic: string }[] = [];
  let sinceCheck = 0;
  lesson.learn.forEach((c, i) => {
    steps.push({ kind: 'card', index: i });
    const checkable = quickName(c.art) && !NO_CHECK.includes(c.art) && !(c.topic ?? '').endsWith('.safety');
    if (checkable && !seen.some((x) => x.art === c.art)) seen.push({ art: c.art, topic: c.topic ?? lesson.topics[0].id });
    sinceCheck++;
    const target = seen[seen.length - 1];
    if (sinceCheck >= 2 && seen.length >= 2 && target && target.art === c.art) {
      const others = seen.filter((x) => x.art !== target.art).map((x) => x.art).slice(-2);
      steps.push({ kind: 'check', target: target.art, choices: shuffle([target.art, ...others]), topic: target.topic });
      sinceCheck = 0;
    }
  });
  return steps;
}

function Learn({ lessonId, onNext }: { lessonId: string; onNext: () => void }) {
  const lesson = lessonById(lessonId);
  const steps = useMemo(() => buildSteps(lessonId), [lessonId]);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(false);
  const step = steps[i];
  const last = i + 1 >= steps.length;
  const next = () => { stopAll(); if (last) onNext(); else setI(i + 1); };
  useEffect(() => {
    setDone(false);
    if (step.kind === 'card') say(lesson.learn[step.index].lines).then(() => setDone(true));
  }, [i]);
  const cardsDone = steps.slice(0, i + 1).filter((s) => s.kind === 'card').length;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      {step.kind === 'card' ? (
        <PopIn key={i}>
          <Bouncy onPress={() => say(lesson.learn[step.index].lines)}>
            <View style={[styles.learnCard, shadow(5)]}>
              <Art id={lesson.learn[step.index].art} size={220} />
              {lesson.learn[step.index].lines.map((l, k) => <Text key={k} style={{ fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center', lineHeight: 34 }}>{l}</Text>)}
            </View>
          </Bouncy>
        </PopIn>
      ) : (
        <QuickCheck key={i} lessonId={lessonId} target={step.target} choices={step.choices} topic={step.topic} onDone={() => setDone(true)} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {lesson.learn.map((_, k) => <View key={k} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: k < cardsDone ? colors.leaf : 'rgba(255,255,255,0.9)' }} />)}
        </View>
      </View>
      <View style={{ position: 'absolute', right: 8, bottom: 40 }}>
        <Pulse active={done}>
          <BigButton label={last ? 'Explore!' : 'Next'} art="sparkle" color={done ? colors.leaf : colors.white} onPress={next} />
        </Pulse>
      </View>
      {i > 0 && (
        <View style={{ position: 'absolute', left: 8, bottom: 40 }}>
          <BigButton label="Back" art="sparkle" small color={colors.white} onPress={() => { stopAll(); setI(i - 1); }} />
        </View>
      )}
    </View>
  );
}

// "Tap the nose!" right after learning it.
function QuickCheck({ lessonId, target, choices, topic, onDone }: { lessonId: string; target: string; choices: string[]; topic: string; onDone: () => void }) {
  const [states, setStates] = useState<Record<string, 'right' | 'wrong' | 'reveal'>>({});
  const [solved, setSolved] = useState(false);
  const ladder = useLadder(lessonId, 'practice');
  const prompt = tapLine(target);
  useEffect(() => { say(['Quick check!', prompt]); }, []);
  const pick = async (c: string) => {
    if (solved) return;
    if (c === target) {
      setSolved(true);
      setStates({ [c]: 'right' });
      await ladder.right(`${lessonId}.check.${target}`, topic);
      onDone();
    } else {
      const reveal = await ladder.wrong(`${lessonId}.check.${target}`, topic, c, prompt, nameLine(target));
      setStates(reveal ? { [c]: 'wrong', [target]: 'reveal' } : { [c]: 'wrong' });
    }
  };
  return (
    <View style={{ alignItems: 'center', gap: 18 }}>
      <View style={[styles.checkPill, shadow(3)]}><Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink }}>🧠 {prompt}</Text></View>
      <View style={{ flexDirection: 'row', gap: 26 }}>
        {choices.map((c) => <PopIn key={c}><Tile art={c} size={190} state={states[c] ?? 'idle'} onPress={() => pick(c)} /></PopIn>)}
      </View>
    </View>
  );
}

// Gently pulses its child to show "tap me next".
function Pulse({ active, children }: { active: boolean; children: React.ReactNode }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = active ? withRepeat(withSequence(withTiming(1.07, { duration: 550 }), withTiming(1, { duration: 550 })), -1) : withTiming(1);
  }, [active]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

function Explore({ lessonId, onNext }: { lessonId: string; onNext: () => void }) {
  const lesson = lessonById(lessonId);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const announced = useRef(false);
  useEffect(() => { say(lesson.explore.intro); }, []);
  const tap = async (k: number) => {
    setActive(k);
    const it = lesson.explore.items[k];
    const s = new Set(seen).add(k);
    setSeen(s);
    await say([it.name, it.say]);
    if (s.size === lesson.explore.items.length && !announced.current) {
      announced.current = true;
      sfx('sparkle');
      say(P.exploreDone);
    }
  };
  const all = seen.size === lesson.explore.items.length;
  const many = lesson.explore.items.length > 8;
  const tw = many ? 150 : 180, th = many ? 160 : 200, art = many ? 100 : 130;
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 50 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{lesson.explore.intro}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: many ? 14 : 20, justifyContent: 'center', maxWidth: many ? 1100 : 1000 }}>
        {lesson.explore.items.map((it, k) => (
          <Bouncy key={k} onPress={() => tap(k)} sound={false}>
            <View style={{ width: tw, height: th, borderRadius: radius.lg, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: active === k ? colors.sun : seen.has(k) ? colors.leaf : 'transparent', borderBottomWidth: 9, borderBottomColor: active === k ? colors.sun : seen.has(k) ? colors.leaf : '#E8DCC4' }}>
              <Art id={it.art} size={art} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }} numberOfLines={1}>{it.name.replace(/\.$/, '')}</Text>
            </View>
          </Bouncy>
        ))}
      </View>
      <NextButton onPress={onNext} ready={all} />
    </ScrollView>
  );
}

function Practice({ lessonId, onNext }: { lessonId: string; onNext: () => void }) {
  const lesson = lessonById(lessonId);
  const [i, setI] = useState(0);
  const [finished, setFinished] = useState(false);
  const [nonce, setNonce] = useState(0);
  const act = lesson.practice[i];
  const last = i + 1 >= lesson.practice.length;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <GameView activity={act} lessonId={lessonId} nonce={nonce * 100 + i} onDone={() => setFinished(true)} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, color: colors.inkSoft, fontWeight: '700' }}>Game {i + 1} of {lesson.practice.length}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {finished && <BigButton label="Play again" art="game" small color={colors.white} onPress={() => { setFinished(false); setNonce(nonce + 1); }} />}
          <BigButton label={last ? 'Sing time!' : 'Next game'} art={last ? 'music' : 'sparkle'} small color={finished ? colors.leaf : colors.white}
            onPress={() => { stopAll(); setFinished(false); if (last) onNext(); else setI(i + 1); }} />
        </View>
      </View>
    </View>
  );
}

export function SongPlayer({ lessonId, compact, extra }: { lessonId: string; compact?: boolean; extra?: React.ReactNode }) {
  const lesson = lessonById(lessonId);
  const starts: number[] = (timings as Record<string, number[]>)[lessonId] ?? [];
  const [line, setLine] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const play = () => {
    stopAll();
    setPlaying(true);
    stopRef.current = playMusic(SONGS[lessonId], (t, done) => {
      const ms = t * 1000;
      let idx = -1;
      starts.forEach((s, k) => { if (ms >= s - 150) idx = k; });
      setLine(idx < 0 ? -1 : idx % lesson.song.lines.length);
      if (done) { setPlaying(false); setLine(-1); }
    });
  };
  useEffect(() => {
    if (!compact) say([P.stageNames.sing, lesson.song.title]).then(play);
    return () => { stopRef.current(); stopMusic(); };
  }, []);
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 30, fontWeight: '800', color: colors.ink, marginBottom: 6 }}>🎵 {lesson.song.title}</Text>
      {lesson.song.lines.map((l, k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: line === k ? colors.sun : 'transparent' }}>
          <Art id={l.art} size={line === k ? 60 : 46} />
          <Text style={{ fontSize: line === k ? 28 : 23, fontWeight: '800', color: colors.ink }}>{l.text}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <BigButton label={playing ? 'Singing…' : 'Sing again'} art="music" color={colors.sun} small onPress={play} />
        {extra}
      </View>
    </View>
  );
}

function Sing({ lessonId, onNext }: { lessonId: string; onNext: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flexGrow: 1, paddingBottom: 40 }}>
      <SongPlayer lessonId={lessonId} extra={<BigButton label="Little exam" art="book" small color={colors.leaf} onPress={onNext} />} />
    </ScrollView>
  );
}

function LittleExam({ lessonId, onNext }: { lessonId: string; onNext: () => void }) {
  const progress = useApp((s) => s.progress);
  const mastery = useApp((s) => s.mastery);
  const photos = useApp((s) => s.photos);
  const [started, setStarted] = useState(false);
  const examId = useRef<number | null>(null);
  const qs = useMemo(() => {
    const photo = photos.find((p) => p.kind === 'full_body');
    return selectQuestions('lesson_exam', {
      bank, lesson: lessonId, taught: [...new Set([...taughtLessons(progress), lessonId])], mastery: new Map(Object.entries(mastery)), now: Date.now(),
      hasPhoto: (part) => !!photo?.markers[part], supplementaryUnlocked: false,
    });
  }, []);
  useEffect(() => { say(P.examIntro).then(() => setStarted(true)); }, []);
  const finish = (answers: ExamAnswer[]) => {
    const correct = answers.filter((a) => a.firstTryCorrect).length;
    if (examId.current != null) repo.updateExam({ id: examId.current, mode: 'lesson_exam', lessons: [lessonId], startedAt: Date.now(), finishedAt: Date.now(), total: answers.length, correct });
    const cur = useApp.getState().lessonState(lessonId);
    const stars = correct >= 4 ? 3 : correct >= 3 ? 2 : 1;
    useApp.setState({ lastExam: { lessonId, correct, total: answers.length, stars } });
    useApp.getState().saveLesson({ ...cur, stage: 7, taught: true });
    onNext();
  };
  if (!started) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Character id="joy" size={220} talking /></View>;
  if (examId.current == null) examId.current = repo.addExam({ mode: 'lesson_exam', lessons: [lessonId], startedAt: Date.now(), finishedAt: null, total: qs.length, correct: 0 });
  return <ExamRunner questions={qs} context="lesson_exam" examId={examId.current} feedback onFinish={finish} />;
}

function Celebrate({ lessonId }: { lessonId: string }) {
  const lesson = lessonById(lessonId);
  const go = useApp((s) => s.go);
  const replace = useApp((s) => s.replace);
  const settings = useApp((s) => s.settings);
  const today = useApp((s) => s.today);
  const last = useApp((s) => s.lastExam);
  const stars = last?.lessonId === lessonId ? last.stars : 1;
  const awarded = useRef(false);
  useEffect(() => {
    if (awarded.current) return;
    awarded.current = true;
    const s = useApp.getState();
    const cur = s.lessonState(lessonId);
    const firstTime = cur.status !== 'completed';
    s.saveLesson({ ...cur, status: 'completed', stage: 1, taught: true, stars: Math.max(cur.stars, stars), timesCompleted: cur.timesCompleted + 1, firstCompletedAt: cur.firstCompletedAt ?? Date.now() });
    s.addStars(firstTime ? stars : 1, `lesson:${lessonId}`);
    sfx('fanfare');
    say([P.lessonDone[stars - 1], 'Super job, {name}!']);
  }, []);
  const timeUp = today.activeSeconds >= settings.dailyMinutes * 60 && !today.unlockedExtra;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Confetti count={60} />
      <PopIn><Character id={lesson.character} size={220} mood="cheer" /></PopIn>
      <Text style={{ fontSize: 40, fontWeight: '900', color: colors.ink }}>Hooray!</Text>
      <PopIn delay={300}><Stars n={stars} size={70} /></PopIn>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{starsLine(stars)}</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <BigButton label="Rewards" art="trophy" color={colors.lilac} onPress={() => go({ name: 'rewards' })} small />
        <BigButton label={timeUp ? 'All done' : 'Home'} art={timeUp ? 'bed' : 'house'} color={colors.leaf} onPress={() => (timeUp ? replace({ name: 'done' }) : useApp.getState().home())} small />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  learnCard: { width: 520, minHeight: 380, backgroundColor: colors.white, borderRadius: radius.lg, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 10 },
  checkPill: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999, paddingHorizontal: 30, paddingVertical: 8 },
});
