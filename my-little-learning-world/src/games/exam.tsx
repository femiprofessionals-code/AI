import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/text';
import type { Question } from '../content/types';
import { P } from '../content';
import { say, sfx } from '../audio/audio';
import { useApp } from '../store';
import type { AttemptContext } from '../db/types';
import { Art, BigButton, PopIn } from '../components/ui';
import { colors } from '../theme';
import { Prompt, Tile, praise, shuffle, tryAgainLine } from './common';
import { BodyPicture } from './photo';
import type { BodyPart } from '../content/types';

export type ExamAnswer = { q: Question; firstTryCorrect: boolean; chosen: string | null };

// Runs a list of questions. `feedback`: practice modes teach after each answer;
// the mock exam only says "Thank you!" and reviews mistakes at the end.
export function ExamRunner({ questions, context, examId, feedback, hideText, onFinish }: { questions: Question[]; context: AttemptContext; examId: number | null; feedback: boolean; hideText?: boolean; onFinish: (answers: ExamAnswer[]) => void }) {
  const record = useApp((s) => s.answer);
  const photos = useApp((s) => s.photos);
  const photo = photos.find((p) => p.kind === 'full_body') ?? null;
  const [i, setI] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [states, setStates] = useState<Record<string, 'right' | 'wrong' | 'reveal'>>({});
  const [box, setBox] = useState({ w: 300, h: 380 });
  const answers = useRef<ExamAnswer[]>([]);
  const locked = useRef(false);
  const started = useRef(Date.now());
  const q = questions[i];
  const choices = useMemo(() => (q && q.format === 'choice' ? shuffle(q.choices) : []), [i]);

  useEffect(() => {
    if (!q) return;
    setAttempt(1);
    setStates({});
    locked.current = false;
    started.current = Date.now();
    say(q.prompt);
  }, [i]);

  if (!q) return null;
  const correctKey = q.format === 'choice' ? q.answer : q.format === 'truefalse' ? (q.isTrue ? 'yes' : 'no') : q.part;

  const advance = () => (i + 1 >= questions.length ? onFinish(answers.current) : setI(i + 1));

  const choose = async (key: string) => {
    if (locked.current) return;
    const ok = key === correctKey;
    record({ questionId: q.id, topicId: q.topic, lessonId: q.lesson, context, examId, chosen: key, correct: ok, attemptNo: attempt, responseMs: Date.now() - started.current });
    if (attempt === 1) answers.current.push({ q, firstTryCorrect: ok, chosen: key });
    if (!feedback) {
      locked.current = true;
      sfx('pop');
      await say(P.examThanks);
      return advance();
    }
    if (ok) {
      locked.current = true;
      setStates({ [key]: 'right' });
      sfx('correct');
      await say([praise(), q.explain]);
      return advance();
    }
    sfx('tryagain');
    if (attempt >= 2) {
      setStates({ [key]: 'wrong', [correctKey]: 'reveal' });
      say([q.explain, P.showAnswer]);
    } else {
      setStates({ [key]: 'wrong' });
      say([tryAgainLine(), q.prompt]);
    }
    setAttempt(attempt + 1);
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {questions.map((_, k) => <View key={k} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: k < i ? colors.leaf : k === i ? colors.sun : colors.creamDeep }} />)}
      </View>
      <Prompt text={q.prompt} hidden={hideText} />
      {q.format === 'choice' && (
        <View style={{ flexDirection: 'row', gap: 26, flexWrap: 'wrap', justifyContent: 'center' }}>
          {choices.map((c) => <PopIn key={`${i}-${c}`}><Tile art={c} size={choices.length > 3 ? 150 : 180} state={states[c] ?? 'idle'} onPress={() => choose(c)} /></PopIn>)}
        </View>
      )}
      {q.format === 'truefalse' && (
        <>
          <PopIn key={i}><Art id={q.art} size={170} /></PopIn>
          <View style={{ flexDirection: 'row', gap: 40 }}>
            <Tile art="yes" label="Yes" size={150} color="#E6F6DC" state={states.yes ?? 'idle'} onPress={() => choose('yes')} />
            <Tile art="no" label="No" size={150} color="#FFF3CC" state={states.no ?? 'idle'} onPress={() => choose('no')} />
          </View>
        </>
      )}
      {q.format === 'photo' && (
        <View style={{ width: 420, height: 460 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          <BodyPicture photo={photo} box={box} highlight={states[correctKey] === 'reveal' ? { part: q.part as BodyPart, color: colors.amber } : states[correctKey] === 'right' ? { part: q.part as BodyPart, color: colors.leaf } : null} onTap={(p) => choose(p ?? 'none')} />
        </View>
      )}
      <Text style={{ fontSize: 18, color: colors.inkSoft }}>{i + 1} / {questions.length}</Text>
    </View>
  );
}

// Friendly review of the questions she missed (shown after the mock exam).
export function ExamReview({ missed, onDone }: { missed: ExamAnswer[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => { if (missed.length) say(i === 0 ? [P.examReview, missed[0].q.prompt, missed[0].q.explain] : [missed[i].q.prompt, missed[i].q.explain]); }, [i]);
  if (!missed.length) return null; // the exam screen only shows the review when something was missed
  const a = missed[i];
  const art = a.q.format === 'choice' ? a.q.answer : a.q.format === 'truefalse' ? a.q.art : 'body';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <Prompt text={a.q.prompt} />
      <PopIn key={i}><View style={{ padding: 16, borderRadius: 30, borderWidth: 6, borderColor: colors.leaf, backgroundColor: colors.white }}><Art id={art} size={200} /></View></PopIn>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{a.q.explain}</Text>
      <BigButton label={i + 1 < missed.length ? 'Next' : 'Finish'} art="sparkle" color={colors.leaf} onPress={() => (i + 1 < missed.length ? setI(i + 1) : onDone())} />
    </View>
  );
}
