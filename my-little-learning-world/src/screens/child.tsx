import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Text } from '../components/text';
import { lessons, lessonById, worlds, worldById, P, unlockables, PVS_STAR } from '../content';
import { scoreLine } from '../content/extraLines';
import { questions as bank } from '../content/questions';
import { items } from '../content/items';
import { say, sfx, stopAll } from '../audio/audio';
import { useApp, nextLesson, worldOpen, lessonOpen, taughtLessons } from '../store';
import { selectQuestions, mockUnlocked, type ExamMode } from '../engine/examSelect';
import { Art, BigButton, Bouncy, Character, Confetti, PopIn, Screen, Stars, shade } from '../components/ui';
import { GameView, GAME_ICONS } from '../games';
import { ExamRunner, ExamReview, type ExamAnswer } from '../games/exam';
import { SongPlayer } from './lesson';
import { colors, radius, worldColors } from '../theme';
import { repo } from '../db/repo';

const useTimeUp = () => {
  const today = useApp((s) => s.today);
  const mins = useApp((s) => s.settings.dailyMinutes);
  return today.activeSeconds >= mins * 60 && !today.unlockedExtra;
};

// ---------------- Home ----------------
export function HomeScreen() {
  const name = useApp((s) => s.name);
  const progress = useApp((s) => s.progress);
  const stars = useApp((s) => s.stars);
  const companion = useApp((s) => s.settings.companion);
  const go = useApp((s) => s.go);
  const timeUp = useTimeUp();
  const { width } = useWindowDimensions();
  const [talking, setTalking] = useState(true);
  const next = nextLesson(progress);
  useEffect(() => {
    say([P.welcomeHome[Math.floor(Math.random() * 2)], P.homeHelp]).then(() => setTalking(false));
    return () => stopAll();
  }, []);
  const wide = width > 900;
  return (
    <Screen noHome repeat={[P.welcomeHome[0], P.homeHelp]}>
      <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', gap: 24, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 44, fontWeight: '900', color: colors.ink }}>Hello, {name || 'friend'}!</Text>
          <Bouncy onPress={() => say(P.welcomeHome[1])}><Character id={companion} size={wide ? 260 : 200} talking={talking} /></Bouncy>
          <Bouncy onPress={() => go({ name: 'rewards' })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, paddingHorizontal: 18, paddingVertical: 8, borderRadius: radius.pill }}>
              <Text style={{ fontSize: 34 }}>⭐</Text><Text style={{ fontSize: 32, fontWeight: '900', color: colors.ink }}>{stars}</Text>
            </View>
          </Bouncy>
        </View>
        <View style={{ gap: 16, width: wide ? 520 : '100%' }}>
          <BigButton testID="continue" label={timeUp ? 'All done for today' : `${P.homeButtons.continue}: ${next.title}`} art={timeUp ? 'bed' : next.icon} color={colors.leaf} speak={P.homeButtons.continue}
            onPress={() => (timeUp ? go({ name: 'done' }) : go({ name: 'lesson', lesson: next.id }))} wide />
          <BigButton label="My Learning Worlds" art="globe" color={colors.sky} speak={P.homeButtons.worlds} onPress={() => go({ name: 'worlds' })} wide />
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: 1 }}><BigButton label="Play and Practise" art="game" color={colors.sun} speak={P.homeButtons.play} onPress={() => go({ name: 'play' })} wide /></View>
            <View style={{ flex: 1 }}><BigButton label="Revision Time" art="brain" color={colors.coral} speak={P.homeButtons.revision} onPress={() => go({ name: 'revision' })} wide /></View>
          </View>
          <BigButton label="My Rewards" art="trophy" color={colors.lilac} speak={P.homeButtons.rewards} onPress={() => go({ name: 'rewards' })} wide />
        </View>
      </View>
      <ParentLock />
    </Screen>
  );
}

// Small corner lock: needs a 3-second press, so a child's taps do nothing.
function ParentLock() {
  const go = useApp((s) => s.go);
  return (
    <View style={{ position: 'absolute', right: 0, bottom: 0 }}>
      <Bouncy sound={false} onLongPress={() => { stopAll(); go({ name: 'parentGate' }); }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.slateLight, alignItems: 'center', justifyContent: 'center', opacity: 0.6 }}>
          <Text style={{ fontSize: 28 }}>🔒</Text>
        </View>
      </Bouncy>
    </View>
  );
}

// ---------------- Worlds ----------------
export function WorldsScreen() {
  const progress = useApp((s) => s.progress);
  const go = useApp((s) => s.go);
  useEffect(() => { say(P.worldsIntro); }, []);
  return (
    <Screen title="My Learning Worlds" repeat={P.worldsIntro}>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 22, justifyContent: 'center', paddingVertical: 10 }}>
        {worlds.map((w, i) => {
          const open = worldOpen(w.id, progress);
          const done = w.lessons.filter((l) => progress[l]?.status === 'completed').length;
          const wc = worldColors[w.id];
          return (
            <PopIn key={w.id} delay={i * 80}>
              <Bouncy onPress={() => (open ? (say(w.title), go({ name: 'world', world: w.id })) : say(P.lockedWorld))}>
                <View style={{ width: 300, height: 300, borderRadius: radius.lg, backgroundColor: open ? wc.base : '#D9D6CF', borderBottomWidth: 10, borderBottomColor: open ? wc.dark : '#B9B5AC', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }}>
                  <View style={{ opacity: open ? 1 : 0.45 }}><Character id={w.character === 'sola' ? 'sun' : w.character} size={150} /></View>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>{i + 1}. {w.title}</Text>
                  <Text style={{ fontSize: 20 }}>{open ? `${'⭐'.repeat(done)}${'☆'.repeat(w.lessons.length - done)}` : '🔒'}</Text>
                </View>
              </Bouncy>
            </PopIn>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

export function WorldScreen({ worldId }: { worldId: string }) {
  const w = worldById(worldId);
  const progress = useApp((s) => s.progress);
  const go = useApp((s) => s.go);
  const wc = worldColors[w.id];
  useEffect(() => { say(P.lessonsIntro); }, []);
  return (
    <Screen scene={w.id} title={w.title} repeat={[w.title, P.lessonsIntro]}>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'center', alignItems: 'center' }}>
        {w.lessons.map((id, i) => {
          const l = lessonById(id);
          const p = progress[id];
          const open = lessonOpen(id, progress);
          return (
            <PopIn key={id} delay={i * 80}>
              <Bouncy onPress={() => (open ? go({ name: 'lesson', lesson: id }) : say(P.lockedWorld))}>
                <View style={{ width: 280, height: 320, borderRadius: radius.lg, backgroundColor: colors.white, borderBottomWidth: 10, borderBottomColor: shade(wc.base), alignItems: 'center', justifyContent: 'center', gap: 10, padding: 12, opacity: open ? 1 : 0.5 }}>
                  <Art id={l.icon} size={150} />
                  <Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>{l.number}. {l.title}</Text>
                  {open ? <Stars n={p?.stars ?? 0} size={30} /> : <Text style={{ fontSize: 30 }}>🔒</Text>}
                </View>
              </Bouncy>
            </PopIn>
          );
        })}
      </View>
    </Screen>
  );
}

// ---------------- Play and Practise ----------------
export function PlayScreen() {
  const progress = useApp((s) => s.progress);
  const go = useApp((s) => s.go);
  const taught = taughtLessons(progress);
  useEffect(() => { say(taught.length ? P.playIntro : P.revisionNothing); }, []);
  return (
    <Screen title="Play and Practise" repeat={P.playIntro}>
      {!taught.length ? <Empty /> : (
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 30 }}>
          {taught.map((id) => {
            const l = lessonById(id);
            const wc = worldColors[l.world];
            return (
              <View key={id} style={{ backgroundColor: wc.tint, borderRadius: radius.lg, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Art id={l.icon} size={50} /><Text style={{ fontSize: 22, fontWeight: '900', color: colors.ink }}>{l.title}</Text>
                </View>
                <ScrollView horizontal contentContainerStyle={{ gap: 14 }}>
                  {l.practice.map((a, i) => (
                    <Bouncy key={i} onPress={() => { say(a.title); go({ name: 'game', lesson: id, index: i }); }}>
                      <View style={{ width: 170, height: 170, borderRadius: radius.md, backgroundColor: wc.base, borderBottomWidth: 8, borderBottomColor: wc.dark, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                        <Art id={GAME_ICONS[a.type]} size={90} />
                        <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, textAlign: 'center' }} numberOfLines={2}>{a.title}</Text>
                      </View>
                    </Bouncy>
                  ))}
                  <Bouncy onPress={() => go({ name: 'songs' })}>
                    <View style={{ width: 170, height: 170, borderRadius: radius.md, backgroundColor: colors.sun, borderBottomWidth: 8, borderBottomColor: shade(colors.sun), alignItems: 'center', justifyContent: 'center' }}>
                      <Art id="music" size={90} /><Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>Songs</Text>
                    </View>
                  </Bouncy>
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}

function Empty() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Character id="bibi" size={220} />
      <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{P.revisionNothing}</Text>
      <BigButton label="Start Lesson 1" art="head" color={colors.leaf} onPress={() => useApp.getState().go({ name: 'lesson', lesson: 'L1' })} />
    </View>
  );
}

export function GameScreen({ lessonId, index }: { lessonId: string; index: number }) {
  const l = lessonById(lessonId);
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);
  const a = l.practice[index];
  return (
    <Screen scene={l.world} title={l.title} repeat={a.title}>
      <View style={{ flex: 1 }}>
        <GameView activity={a} lessonId={lessonId} nonce={n} onDone={() => { setDone(true); useApp.getState().addStars(1, `game:${lessonId}:${index}`); }} />
      </View>
      {done && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
          <BigButton label="Play again" art="game" small color={colors.sun} onPress={() => { setDone(false); setN(n + 1); say(P.playAgain); }} />
          <BigButton label="More games" art="sparkle" small color={colors.leaf} onPress={() => useApp.getState().back()} />
        </View>
      )}
    </Screen>
  );
}

export function SongsScreen() {
  const progress = useApp((s) => s.progress);
  const taught = taughtLessons(progress);
  const [id, setId] = useState<string>(taught[0] ?? 'L1');
  return (
    <Screen title="My Songs" repeat={P.allDoneSongs}>
      <View style={{ flexDirection: 'row', flex: 1, gap: 16 }}>
        <ScrollView style={{ width: 220, flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
          {(taught.length ? taught : ['L1']).map((l) => (
            <BigButton key={l} label={lessonById(l).song.title} art={lessonById(l).icon} small color={l === id ? colors.sun : colors.white} onPress={() => setId(l)} />
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <SongPlayer key={id} lessonId={id} />
        </ScrollView>
      </View>
    </Screen>
  );
}

// ---------------- Revision: Let's Remember What We Learned! ----------------
export function RevisionScreen() {
  const progress = useApp((s) => s.progress);
  const mastery = useApp((s) => s.mastery);
  const photos = useApp((s) => s.photos);
  const go = useApp((s) => s.go);
  const taught = taughtLessons(progress);
  const [step, setStep] = useState<'menu' | 'song' | 'flash' | 'quiz' | 'game' | 'done'>('menu');
  const now = Date.now();
  // Weakest taught lesson: lowest average mastery level across its topics.
  const weakest = useMemo(() => {
    let best = taught[0], bestScore = Infinity;
    for (const id of taught) {
      const l = lessonById(id);
      const lv: number[] = l.topics.map((t) => mastery[t.id]?.level ?? 0);
      const avg = lv.reduce((a, b) => a + b, 0) / lv.length;
      if (avg < bestScore) { bestScore = avg; best = id; }
    }
    return best;
  }, []);
  const flash = useMemo(() => {
    const cards = taught.flatMap((id) => lessonById(id).learn.map((c) => ({ ...c, lesson: id })));
    cards.sort((a, b) => (mastery[a.topic ?? '']?.level ?? 0) - (mastery[b.topic ?? '']?.level ?? 0) || Math.random() - 0.5);
    return cards.slice(0, 6);
  }, []);
  const quiz = useMemo(() => {
    const photo = photos.find((p) => p.kind === 'full_body');
    return selectQuestions('revision', { bank, taught, mastery: new Map(Object.entries(mastery)), now, hasPhoto: (p) => !!photo?.markers[p], supplementaryUnlocked: (mastery['L9.beans']?.level ?? 0) >= 2 }).slice(0, 5);
  }, []);
  const [fi, setFi] = useState(0);
  useEffect(() => { say(taught.length ? P.revisionIntro : P.revisionNothing); }, []);
  useEffect(() => { if (step === 'flash' && flash[fi]) say(flash[fi].lines); }, [step, fi]);
  if (!taught.length) return <Screen title="Revision Time"><Empty /></Screen>;
  const wl = lessonById(weakest);
  const gameIdx = wl.practice.findIndex((a) => !['photoBody', 'routine', 'story', 'brushTimer', 'breathe'].includes(a.type));
  return (
    <Screen title="Let's Remember What We Learned!" repeat={P.revisionIntro}>
      {step === 'menu' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <Character id="bibi" size={200} />
          <BigButton label="Start remembering!" art="brain" color={colors.leaf} onPress={() => setStep('song')} />
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <BigButton label="Songs" art="music" small color={colors.sun} onPress={() => go({ name: 'songs' })} />
            <BigButton label="Exams" art="book" small color={colors.sky} onPress={() => go({ name: 'exams' })} />
          </View>
        </View>
      )}
      {step === 'song' && (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
          <SongPlayer lessonId={weakest} />
          <BigButton label="Picture cards" art="sparkle" small color={colors.leaf} onPress={() => { stopAll(); setStep('flash'); }} />
        </ScrollView>
      )}
      {step === 'flash' && flash[fi] && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <PopIn key={fi}><Bouncy onPress={() => say(flash[fi].lines)}><View style={{ backgroundColor: colors.white, borderRadius: radius.lg, padding: 24, alignItems: 'center', width: 460 }}>
            <Art id={flash[fi].art} size={220} />
            {flash[fi].lines.map((l, k) => <Text key={k} style={{ fontSize: 24, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{l}</Text>)}
          </View></Bouncy></PopIn>
          <BigButton label={fi + 1 < flash.length ? 'Next card' : 'Quiz time'} art="sparkle" small color={colors.leaf} onPress={() => (fi + 1 < flash.length ? setFi(fi + 1) : setStep('quiz'))} />
        </View>
      )}
      {step === 'quiz' && (
        <ExamRunner questions={quiz} context="revision" examId={null} feedback onFinish={() => setStep(gameIdx >= 0 ? 'game' : 'done')} />
      )}
      {step === 'game' && (
        <View style={{ flex: 1 }}>
          <View style={{ flex: 1 }}><GameView activity={wl.practice[gameIdx]} lessonId={weakest} context="revision" onDone={() => setTimeout(() => setStep('done'), 1500)} /></View>
        </View>
      )}
      {step === 'done' && <Finished onAgain={() => { setFi(0); setStep('menu'); }} />}
    </Screen>
  );
}

function Finished({ onAgain }: { onAgain: () => void }) {
  useEffect(() => { sfx('fanfare'); useApp.getState().addStars(2, 'revision'); say(P.examDone); }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Confetti />
      <Character id="bibi" size={220} mood="cheer" />
      <Stars n={2} of={2} size={60} />
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <BigButton label="Again" art="brain" small color={colors.sun} onPress={onAgain} />
        <BigButton label="Home" art="house" small color={colors.leaf} onPress={() => useApp.getState().home()} />
      </View>
    </View>
  );
}

// ---------------- Examinations ----------------
export function ExamsScreen() {
  const progress = useApp((s) => s.progress);
  const go = useApp((s) => s.go);
  const taught = taughtLessons(progress);
  useEffect(() => { say(taught.length ? P.examsIntro : P.revisionNothing); }, []);
  if (!taught.length) return <Screen title="Examinations"><Empty /></Screen>;
  const full = mockUnlocked(taught);
  return (
    <Screen title="Examinations" repeat={P.examsIntro}>
      <ScrollView contentContainerStyle={{ gap: 18, alignItems: 'center', paddingBottom: 30 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
          <BigButton label={full ? 'Mock examination (20)' : 'Little mock examination (10)'} art="trophy" color={colors.lilac} speak={P.examModes.mock} onPress={() => go({ name: 'exam', mode: full ? 'mock' : 'minimock' })} />
          <BigButton label="Revision quiz" art="brain" color={colors.coral} speak={P.examModes.revision} onPress={() => go({ name: 'exam', mode: 'revision' })} />
          <BigButton label="Picture examination" art="eyes" color={colors.sky} speak={P.examModes.picture} onPress={() => go({ name: 'exam', mode: 'picture' })} />
          <BigButton label="Oral examination" art="ears" color={colors.sun} speak={P.examModes.oral} onPress={() => go({ name: 'exam', mode: 'oral' })} />
        </View>
        <Text style={{ fontSize: 24, fontWeight: '900', color: colors.ink, marginTop: 10 }}>{P.examModes.practice}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' }}>
          {taught.map((id) => <BigButton key={id} label={`${lessonById(id).number}. ${lessonById(id).title}`} art={lessonById(id).icon} small color={worldColors[lessonById(id).world].base} onPress={() => go({ name: 'exam', mode: 'practice', lesson: id })} />)}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function ExamScreen({ mode, lesson }: { mode: ExamMode; lesson?: string }) {
  const progress = useApp((s) => s.progress);
  const mastery = useApp((s) => s.mastery);
  const photos = useApp((s) => s.photos);
  const taught = taughtLessons(progress);
  const [phase, setPhase] = useState<'intro' | 'run' | 'review' | 'result'>('intro');
  const [answers, setAnswers] = useState<ExamAnswer[]>([]);
  const examId = useRef<number | null>(null);
  const startedAt = useRef(Date.now());
  const qs = useMemo(() => {
    const photo = photos.find((p) => p.kind === 'full_body');
    return selectQuestions(mode, { bank, lesson, taught, mastery: new Map(Object.entries(mastery)), now: Date.now(), hasPhoto: (p) => !!photo?.markers[p], supplementaryUnlocked: (mastery['L9.beans']?.level ?? 0) >= 2 });
  }, []);
  const ctx = mode === 'minimock' ? 'mock' : mode === 'lesson_exam' ? 'lesson_exam' : mode;
  const feedback = mode !== 'mock' && mode !== 'minimock';
  const intro = mode === 'mock' ? P.mockIntro : mode === 'minimock' ? P.miniMockIntro : P.examIntro;
  useEffect(() => {
    say(intro).then(() => {
      examId.current = repo.addExam({ mode: ctx, lessons: [...new Set(qs.map((q) => q.lesson))], startedAt: Date.now(), finishedAt: null, total: qs.length, correct: 0 });
      startedAt.current = Date.now();
      setPhase('run');
    });
    return () => stopAll();
  }, []);
  const finish = (a: ExamAnswer[]) => {
    setAnswers(a);
    const correct = a.filter((x) => x.firstTryCorrect).length;
    if (examId.current != null) repo.updateExam({ id: examId.current, mode: ctx, lessons: [], startedAt: startedAt.current, finishedAt: Date.now(), total: a.length, correct });
    const missed = a.filter((x) => !x.firstTryCorrect);
    setPhase(!feedback && missed.length ? 'review' : 'result');
  };
  const correct = answers.filter((x) => x.firstTryCorrect).length;
  const starCount = !answers.length ? 1 : correct / answers.length >= 0.8 ? 3 : correct / answers.length >= 0.5 ? 2 : 1;
  return (
    <Screen title={P.examModes[mode as keyof typeof P.examModes] ?? 'Examination'} repeat={intro}>
      {phase === 'intro' && <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Character id="joy" size={240} talking /></View>}
      {phase === 'run' && <ExamRunner questions={qs} context={ctx as any} examId={examId.current} feedback={feedback} hideText={mode === 'oral'} onFinish={finish} />}
      {phase === 'review' && <ExamReview missed={answers.filter((x) => !x.firstTryCorrect)} onDone={() => setPhase('result')} />}
      {phase === 'result' && <ExamResult stars={starCount} line={scoreLine(correct, answers.length)} onDone={() => useApp.getState().back()} />}
    </Screen>
  );
}

function ExamResult({ stars, line, onDone }: { stars: number; line: string; onDone: () => void }) {
  useEffect(() => {
    sfx('fanfare');
    useApp.getState().addStars(stars, 'exam');
    useApp.getState().checkRewards();
    say([P.examDone, line]);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Confetti />
      <Character id="joy" size={220} mood="cheer" />
      <Stars n={stars} size={70} />
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{P.examDone}</Text>
      <BigButton label="Finish" art="sparkle" color={colors.leaf} onPress={onDone} />
    </View>
  );
}

// ---------------- Rewards ----------------
export function RewardsScreen() {
  const stars = useApp((s) => s.stars);
  const rewards = useApp((s) => s.rewards);
  const progress = useApp((s) => s.progress);
  const setSetting = useApp((s) => s.setSetting);
  const companion = useApp((s) => s.settings.companion);
  useEffect(() => { say(P.rewardsIntro); }, []);
  const has = (k: string, id: string) => rewards.some((r) => r.kind === k && r.rewardId === id);
  const stickers = useMemo(() => [...new Set(taughtLessons(progress).flatMap((id) => lessonById(id).explore.items.map((i) => i.art)))], [progress]);
  const badges = [...worlds.map((w) => ({ ...w.badge })), PVS_STAR];
  return (
    <Screen title="My Rewards" repeat={P.rewardsIntro}>
      <ScrollView contentContainerStyle={{ gap: 20, paddingBottom: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, alignSelf: 'center', backgroundColor: colors.white, padding: 16, borderRadius: radius.lg }}>
          <Text style={{ fontSize: 70 }}>🫙</Text><Text style={{ fontSize: 56, fontWeight: '900', color: colors.ink }}>⭐ {stars}</Text>
        </View>
        <Section title="Badges">
          {badges.map((b) => (
            <Bouncy key={b.id} onPress={() => say(b.title)}>
              <View style={{ width: 160, alignItems: 'center', opacity: has('badge', b.id) ? 1 : 0.3 }}>
                <View style={{ width: 130, height: 130, borderRadius: 65, backgroundColor: has('badge', b.id) ? colors.sun : colors.creamDeep, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: colors.amber }}><Art id={b.art} size={90} /></View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{b.title}</Text>
              </View>
            </Bouncy>
          ))}
        </Section>
        <Section title="Trophies">
          {worlds.map((w) => (
            <Bouncy key={w.id} onPress={() => say(w.title)}>
              <View style={{ alignItems: 'center', opacity: has('trophy', w.id) ? 1 : 0.25, width: 140 }}>
                <Text style={{ fontSize: 80 }}>🏆</Text><Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{w.title}</Text>
              </View>
            </Bouncy>
          ))}
        </Section>
        <Section title="My friends">
          {unlockables.map((u) => {
            const open = u.stars === 0 || has('character', u.id);
            return (
              <Bouncy key={u.id} onPress={() => { say(u.title); if (open) setSetting('companion', u.id === 'sola' ? 'sun' : u.id); }}>
                <View style={{ alignItems: 'center', width: 150, opacity: open ? 1 : 0.3, borderWidth: 4, borderColor: companion === (u.id === 'sola' ? 'sun' : u.id) ? colors.leaf : 'transparent', borderRadius: radius.md, padding: 6 }}>
                  <Character id={u.id === 'sola' ? 'sun' : u.id} size={110} />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{open ? u.title : `⭐ ${u.stars}`}</Text>
                </View>
              </Bouncy>
            );
          })}
        </Section>
        <Section title="Sticker book">
          {stickers.length ? stickers.map((s) => (
            <Bouncy key={s} onPress={() => say(items[s] ? items[s].name.charAt(0).toUpperCase() + items[s].name.slice(1) + '.' : s)}>
              <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}><Art id={s} size={70} /></View>
            </Bouncy>
          )) : <Text style={{ fontSize: 20, color: colors.inkSoft }}>Finish a lesson to get stickers!</Text>}
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: radius.lg, padding: 14, gap: 10 }}>
      <Text style={{ fontSize: 26, fontWeight: '900', color: colors.ink }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{children}</View>
    </View>
  );
}

// ---------------- All done for today ----------------
export function DoneScreen() {
  const go = useApp((s) => s.go);
  useEffect(() => { sfx('sparkle'); say([P.allDone, P.allDoneSongs]); }, []);
  return (
    <Screen title="All done!" repeat={P.allDone}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Text style={{ fontSize: 80 }}>🌙</Text>
        <Character id="bibi" size={220} />
        <Text style={{ fontSize: 30, fontWeight: '900', color: colors.ink, textAlign: 'center' }}>Great learning today!</Text>
        <BigButton label="Sing my songs" art="music" color={colors.sun} onPress={() => go({ name: 'songs' })} />
      </View>
    </Screen>
  );
}

// Celebrates a new badge or friend wherever it is earned.
export function CelebrationOverlay() {
  const c = useApp((s) => s.celebration);
  const clear = useApp((s) => s.clearCelebration);
  const route = useApp((s) => s.stack[s.stack.length - 1].name);
  const inParentArea = route === 'parent' || route === 'parentGate';
  useEffect(() => {
    if (!c || inParentArea) return;
    sfx('fanfare');
    say(c.badge ? [P.newBadge, c.badge.title] : [P.newFriend, unlockables.find((u) => u.id === c.friend)?.title ?? '']);
  }, [c, inParentArea]);
  if (!c || inParentArea) return null;
  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(43,42,76,0.55)', alignItems: 'center', justifyContent: 'center' } as any}>
      <Confetti />
      <PopIn><View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, padding: 30, alignItems: 'center', gap: 16, minWidth: 420 }}>
        {c.badge ? <View style={{ width: 180, height: 180, borderRadius: 90, backgroundColor: colors.sun, alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: colors.amber }}><Art id={c.badge.art} size={120} /></View> : <Character id={c.friend === 'sola' ? 'sun' : c.friend!} size={180} mood="cheer" />}
        <Text style={{ fontSize: 32, fontWeight: '900', color: colors.ink }}>{c.badge ? c.badge.title : unlockables.find((u) => u.id === c.friend)?.title}</Text>
        <BigButton label="Yay!" art="heart" color={colors.leaf} onPress={clear} />
      </View></PopIn>
    </View>
  );
}
