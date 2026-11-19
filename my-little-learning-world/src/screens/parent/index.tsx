import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Switch, Text, TextInput, View, Platform } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lessons, lessonById, worlds } from '../../content';
import { questions as bank } from '../../content/questions';
import { BODY_PARTS, type BodyPart } from '../../content/types';
import { LEVEL_NAMES } from '../../engine/mastery';
import { VOICE_TEXT } from '../../audio/voiceManifest.generated';
import { lineKey } from '../../audio/keys';
import { say, playFile, stopAll } from '../../audio/audio';
import { repo } from '../../db/repo';
import type { PhotoKind, PhotoRow, Marker } from '../../db/types';
import { useApp, taughtLessons } from '../../store';
import { colors, radius } from '../../theme';
import { BodyPicture, fit, toScreen, toFraction, photoSource } from '../../games/photo';
import { checkPin, hasPin, setPin, clearPin } from './pin';
import { pickPhoto, deletePhoto, deleteAllPhotos } from './photos';
import { STARTER } from '../../private.generated';

const T = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.slate },
  h2: { fontSize: 20, fontWeight: '800' as const, color: colors.slate, marginTop: 8 },
  p: { fontSize: 16, color: '#334155' },
  small: { fontSize: 13, color: '#64748B' },
};
const Btn = ({ label, onPress, danger, primary, disabled }: { label: string; onPress: () => void; danger?: boolean; primary?: boolean; disabled?: boolean }) => (
  <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.7 : 1, backgroundColor: danger ? '#FEE2E2' : primary ? colors.slate : colors.white, borderColor: danger ? '#FCA5A5' : '#CBD5E1', borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, justifyContent: 'center' })}>
    <Text style={{ fontSize: 16, fontWeight: '700', color: danger ? '#B91C1C' : primary ? colors.white : colors.slate }}>{label}</Text>
  </Pressable>
);
const Box = ({ children }: { children: React.ReactNode }) => <View style={{ backgroundColor: colors.white, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>{children}</View>;
const confirm = (title: string, msg: string, onYes: () => void) => {
  if (Platform.OS === 'web') { if (globalThis.confirm?.(`${title}\n${msg}`)) onYes(); return; }
  Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: onYes }]);
};

// ---------------- PIN gate ----------------
export function ParentGate() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'loading' | 'create' | 'confirm' | 'enter'>('loading');
  const [pin, setPinText] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const replace = useApp((s) => s.replace);
  const back = useApp((s) => s.back);
  useEffect(() => { stopAll(); hasPin().then((h) => setMode(h ? 'enter' : 'create')); }, []);
  const press = async (d: string) => {
    const next = d === '⌫' ? pin.slice(0, -1) : (pin + d).slice(0, 4);
    setPinText(next);
    setError('');
    if (next.length < 4) return;
    if (mode === 'create') { setFirst(next); setPinText(''); setMode('confirm'); }
    else if (mode === 'confirm') {
      if (next === first) { await setPin(next); useApp.getState().setSetting('pinSet', true); replace({ name: 'parent' }); }
      else { setError('The PINs did not match. Try again.'); setMode('create'); setPinText(''); }
    } else {
      if (await checkPin(next)) replace({ name: 'parent' });
      else { setError('Wrong PIN.'); setPinText(''); }
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingTop: insets.top, gap: 16 }}>
      <Text style={T.h1}>Parent area</Text>
      <Text style={T.p}>{mode === 'create' ? 'Create a 4-digit parent PIN.' : mode === 'confirm' ? 'Enter the same PIN again.' : 'Enter your parent PIN.'}</Text>
      <Text style={{ fontSize: 40, letterSpacing: 16, color: colors.slate }}>{'●'.repeat(pin.length)}{'○'.repeat(4 - pin.length)}</Text>
      {!!error && <Text style={{ color: '#B91C1C', fontSize: 16 }}>{error}</Text>}
      <View style={{ width: 300, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => d ? (
          <Pressable key={i} onPress={() => press(d)} style={({ pressed }) => ({ width: 84, height: 70, borderRadius: 14, backgroundColor: pressed ? '#E2E8F0' : colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CBD5E1' })}>
            <Text style={{ fontSize: 28, color: colors.slate, fontWeight: '700' }}>{d}</Text>
          </Pressable>
        ) : <View key={i} style={{ width: 84 }} />)}
      </View>
      <Btn label="Back to the child's app" onPress={back} />
    </View>
  );
}

// ---------------- Dashboard shell ----------------
const TABS = ['Overview', 'Profile', 'Photos', 'Progress', 'Exams', 'Routine', 'Sound & voice', 'Reset'] as const;
type Tab = (typeof TABS)[number];

export function ParentScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('Overview');
  const home = useApp((s) => s.home);
  const [editing, setEditing] = useState<PhotoKind | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: '#F1F5F9', paddingTop: insets.top + 8, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
        <Text style={[T.h1, { flex: 1 }]}>Parent dashboard</Text>
        <Btn label="Exit to child's app" primary onPress={() => { stopAll(); home(); }} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ width: 200, padding: 12, gap: 6 }}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => { setEditing(null); setTab(t); }} style={{ padding: 12, borderRadius: 10, backgroundColor: tab === t ? colors.slate : 'transparent' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: tab === t ? colors.white : colors.slate }}>{t}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
          {editing ? <MarkerEditor kind={editing} onDone={() => setEditing(null)} /> : (
            <>
              {tab === 'Overview' && <Overview />}
              {tab === 'Profile' && <Profile />}
              {tab === 'Photos' && <Photos onEdit={setEditing} />}
              {tab === 'Progress' && <Progress />}
              {tab === 'Exams' && <Exams />}
              {tab === 'Routine' && <Routine />}
              {tab === 'Sound & voice' && <SoundVoice />}
              {tab === 'Reset' && <Reset />}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ---------------- Overview ----------------
function weakTopics(mastery: Record<string, any>, taught: string[]) {
  const out: { lesson: string; topic: string; label: string; level: number }[] = [];
  for (const id of taught) for (const t of lessonById(id).topics) {
    const m = mastery[t.id];
    if (m && m.totalAttempts > 0 && m.level <= 1) out.push({ lesson: id, topic: t.id, label: t.label, level: m.level });
  }
  return out;
}

function Overview() {
  const s = useApp();
  const taught = taughtLessons(s.progress);
  const done = lessons.filter((l) => s.progress[l.id]?.status === 'completed');
  const exams = repo.getExams().filter((e) => e.finishedAt);
  const weak = weakTopics(s.mastery, taught);
  const mins = Math.round(s.today.activeSeconds / 60);
  return (
    <>
      <Box>
        <Text style={T.h2}>Today</Text>
        <Text style={T.p}>Learning time: {mins} of {s.settings.dailyMinutes} minutes{s.today.unlockedExtra ? ' (extra time unlocked)' : ''}</Text>
        <Text style={T.p}>Lessons opened today: {s.today.lessonsTouched.length ? s.today.lessonsTouched.map((l) => lessonById(l).title).join(', ') : 'none yet'}</Text>
      </Box>
      <Box>
        <Text style={T.h2}>Lessons</Text>
        <Text style={T.p}>{done.length} of 9 completed · {taught.length} taught · {s.stars} stars · {s.rewards.filter((r) => r.kind === 'badge').length} badges</Text>
      </Box>
      <Box>
        <Text style={T.h2}>Topics that need revision</Text>
        {weak.length ? weak.map((w) => <Text key={w.topic} style={T.p}>• {lessonById(w.lesson).title}: {w.label} ({LEVEL_NAMES[w.level]})</Text>) : <Text style={T.p}>None right now.</Text>}
      </Box>
      <Box>
        <Text style={T.h2}>Latest examination</Text>
        {exams[0] ? <Text style={T.p}>{modeName(exams[0].mode)}: {exams[0].correct} of {exams[0].total} correct ({pct(exams[0].correct, exams[0].total)}%) on {new Date(exams[0].startedAt).toLocaleDateString()}</Text> : <Text style={T.p}>No examinations yet.</Text>}
      </Box>
    </>
  );
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const modeName = (m: string) => ({ lesson_exam: 'Little exam', practice: 'Lesson practice', revision: 'Revision quiz', mock: 'Mock exam', picture: 'Picture exam', oral: 'Oral exam' } as Record<string, string>)[m] ?? m;

// ---------------- Profile ----------------
function Profile() {
  const name = useApp((s) => s.name);
  const setName = useApp((s) => s.setName);
  const settings = useApp((s) => s.settings);
  const setSetting = useApp((s) => s.setSetting);
  const [text, setText] = useState(name);
  return (
    <Box>
      <Text style={T.h2}>Child's name</Text>
      <TextInput value={text} onChangeText={setText} style={{ borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 18, backgroundColor: '#F8FAFC' }} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Btn label="Save name" primary onPress={() => setName(text.trim())} />
        <Btn label="Hear it" onPress={() => say('Hello, {name}!')} />
      </View>
      {STARTER.nameClip ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={settings.useParentNameClip} onValueChange={(v) => setSetting('useParentNameClip', v)} />
          <Text style={T.p}>Say her name in your recorded voice (used when the name is {STARTER.childName})</Text>
        </View>
      ) : null}
      <Text style={T.small}>You can also record the name yourself under Sound & voice.</Text>
    </Box>
  );
}

// ---------------- Photos ----------------
const KINDS: { kind: PhotoKind; label: string }[] = [
  { kind: 'full_body', label: 'Full body (used in the lesson)' },
  { kind: 'face', label: 'Face (used if there is no full-body photo)' },
  { kind: 'hands', label: 'Hands (optional)' },
  { kind: 'feet', label: 'Feet (optional)' },
];
function Photos({ onEdit }: { onEdit: (k: PhotoKind) => void }) {
  const photos = useApp((s) => s.photos);
  const refresh = useApp((s) => s.refreshPhotos);
  const go = useApp((s) => s.go);
  const take = async (kind: PhotoKind, from: 'camera' | 'gallery') => {
    const row = await pickPhoto(kind, from);
    refresh();
    if (row) onEdit(kind);
  };
  return (
    <>
      <Box>
        <Text style={T.p}>Photos stay on this tablet only. They are never uploaded, and no face detection runs: you place each body-part marker yourself.</Text>
      </Box>
      {KINDS.map(({ kind, label }) => {
        const p = photos.find((x) => x.kind === kind);
        return (
          <Box key={kind}>
            <Text style={T.h2}>{label}</Text>
            {p ? <BodyPicture photo={p} box={{ w: 220, h: 260 }} onTap={() => {}} showAll /> : <Text style={T.p}>No photo yet.</Text>}
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Btn label={p ? 'Replace: take photo' : 'Take photo'} onPress={() => take(kind, 'camera')} />
              <Btn label={p ? 'Replace: from gallery' : 'Choose from gallery'} onPress={() => take(kind, 'gallery')} />
              {p && <Btn label="Adjust markers" primary onPress={() => onEdit(kind)} />}
              {p && kind === 'full_body' && <Btn label="Preview lesson" onPress={() => go({ name: 'photo', mode: 'explore' })} />}
              {p && <Btn label="Delete photo" danger onPress={() => confirm('Delete photo?', 'This removes the photo from this tablet.', () => { deletePhoto(kind); refresh(); })} />}
            </View>
          </Box>
        );
      })}
    </>
  );
}

function MarkerEditor({ kind, onDone }: { kind: PhotoKind; onDone: () => void }) {
  const photo = useApp((s) => s.photos.find((p) => p.kind === kind))!;
  const refresh = useApp((s) => s.refreshPhotos);
  const [markers, setMarkers] = useState<Record<string, Marker | null>>(() => ({ ...photo.markers }));
  const [sel, setSel] = useState<BodyPart>('head');
  const box = { w: 520, h: 620 };
  const f = fit(photo.width, photo.height, box.w, box.h);
  const move = (x: number, y: number) => {
    const fr = toFraction(x, y, f);
    setMarkers((m) => ({ ...m, [sel]: { x: Math.min(1, Math.max(0, fr.x)), y: Math.min(1, Math.max(0, fr.y)), r: m[sel]?.r ?? 0.07 } }));
  };
  const pan = Gesture.Pan().runOnJS(true).minDistance(0).onBegin((e) => move(e.x, e.y)).onUpdate((e) => move(e.x, e.y));
  const resize = (d: number) => setMarkers((m) => (m[sel] ? { ...m, [sel]: { ...m[sel]!, r: Math.min(0.3, Math.max(0.03, m[sel]!.r + d)) } } : m));
  const save = () => { repo.savePhoto({ ...photo, markers, updatedAt: Date.now() }); refresh(); onDone(); };
  return (
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <GestureDetector gesture={pan}>
        <View style={{ width: box.w, height: box.h, backgroundColor: '#0F172A', borderRadius: 12 }}>
          <View style={{ position: 'absolute', left: f.ox, top: f.oy }}><ImageView photo={photo} w={f.w} h={f.h} /></View>
          {BODY_PARTS.map((p) => {
            const m = markers[p];
            if (!m) return null;
            const s = toScreen(m, f);
            return (
              <View key={p} pointerEvents="none" style={{ position: 'absolute', left: s.x - s.r, top: s.y - s.r, width: s.r * 2, height: s.r * 2, borderRadius: s.r, borderWidth: p === sel ? 4 : 2, borderColor: p === sel ? colors.sun : 'rgba(255,255,255,0.8)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12, textShadowColor: '#000', textShadowRadius: 3 }}>{p}</Text>
              </View>
            );
          })}
        </View>
      </GestureDetector>
      <View style={{ flex: 1, gap: 10 }}>
        <Text style={T.h2}>Place the markers</Text>
        <Text style={T.p}>Choose a body part, then touch or drag on the photo to place it.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BODY_PARTS.map((p) => (
            <Pressable key={p} onPress={() => setSel(p)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: sel === p ? colors.slate : markers[p] ? '#E2E8F0' : '#FEF3C7' }}>
              <Text style={{ fontWeight: '700', color: sel === p ? '#fff' : colors.slate }}>{p}{markers[p] ? '' : ' (off)'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn label="Smaller circle" onPress={() => resize(-0.01)} />
          <Btn label="Bigger circle" onPress={() => resize(0.01)} />
          <Btn label={markers[sel] ? 'Not in this photo' : 'Put back'} onPress={() => setMarkers((m) => ({ ...m, [sel]: m[sel] ? null : { x: 0.5, y: 0.5, r: 0.07 } }))} />
        </View>
        <Text style={T.small}>Parts marked "not in this photo" are taught with the cartoon body instead.</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn label="Save markers" primary onPress={save} />
          <Btn label="Cancel" onPress={onDone} />
        </View>
      </View>
    </View>
  );
}
const ImageView = ({ photo, w, h }: { photo: PhotoRow; w: number; h: number }) => <Image source={photoSource(photo)} style={{ width: w, height: h }} />;

// ---------------- Progress ----------------
function Progress() {
  const progress = useApp((s) => s.progress);
  const mastery = useApp((s) => s.mastery);
  return (
    <>
      {worlds.map((w) => (
        <Box key={w.id}>
          <Text style={T.h2}>{w.title}</Text>
          {w.lessons.map((id) => {
            const l = lessonById(id);
            const p = progress[id];
            return (
              <View key={id} style={{ gap: 4, marginBottom: 6 }}>
                <Text style={[T.p, { fontWeight: '700' }]}>{l.number}. {l.title}: {p?.status === 'completed' ? `completed ${p.timesCompleted}×, ${p.stars}★` : p?.status === 'in_progress' ? `in progress (stage ${p.stage} of 7)` : 'not started'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {l.topics.map((t) => {
                    const m = mastery[t.id];
                    const lv = m?.level ?? 0;
                    const bg = ['#F1F5F9', '#FEF3C7', '#DBEAFE', '#DCFCE7'][lv];
                    return <View key={t.id} style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={T.small}>{t.label}: {LEVEL_NAMES[lv]}{m ? ` (${m.totalCorrect}/${m.totalAttempts})` : ''}</Text></View>;
                  })}
                </View>
              </View>
            );
          })}
        </Box>
      ))}
    </>
  );
}

// ---------------- Exam reports ----------------
function Exams() {
  const exams = useMemo(() => repo.getExams().filter((e) => e.finishedAt), []);
  const attempts = useMemo(() => repo.getAttempts(), []);
  const [open, setOpen] = useState<number | null>(null);
  const byWeek = useMemo(() => {
    const m = new Map<string, { c: number; t: number }>();
    attempts.filter((a) => a.attemptNo === 1).forEach((a) => {
      const d = new Date(a.at); d.setDate(d.getDate() - d.getDay());
      const k = d.toISOString().slice(0, 10);
      const v = m.get(k) ?? { c: 0, t: 0 };
      v.t++; if (a.correct) v.c++;
      m.set(k, v);
    });
    return [...m.entries()].sort();
  }, []);
  const first = attempts.filter((a) => a.attemptNo === 1);
  return (
    <>
      <Box>
        <Text style={T.h2}>All answers (first tries)</Text>
        <Text style={T.p}>Attempted {first.length} · correct {first.filter((a) => a.correct).length} · incorrect {first.filter((a) => !a.correct).length} · {pct(first.filter((a) => a.correct).length, first.length)}%</Text>
        <Text style={T.h2}>Improvement by week</Text>
        {byWeek.length ? byWeek.map(([wk, v]) => (
          <View key={wk} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[T.small, { width: 110 }]}>Week of {wk}</Text>
            <View style={{ flex: 1, height: 18, backgroundColor: '#E2E8F0', borderRadius: 9 }}><View style={{ width: `${pct(v.c, v.t)}%`, height: 18, backgroundColor: colors.aqua, borderRadius: 9 }} /></View>
            <Text style={[T.small, { width: 80 }]}>{pct(v.c, v.t)}% of {v.t}</Text>
          </View>
        )) : <Text style={T.p}>No answers yet.</Text>}
      </Box>
      {exams.map((e) => {
        const wrong = attempts.filter((a) => a.examId === e.id && a.attemptNo === 1 && !a.correct);
        return (
          <Box key={e.id}>
            <Pressable onPress={() => setOpen(open === e.id ? null : e.id!)}>
              <Text style={[T.p, { fontWeight: '700' }]}>{new Date(e.startedAt).toLocaleString()} · {modeName(e.mode)} · {e.correct}/{e.total} ({pct(e.correct, e.total)}%) {wrong.length ? `· ${wrong.length} to review ▾` : ''}</Text>
            </Pressable>
            {open === e.id && wrong.map((a, i) => {
              const q = bank.find((x) => x.id === a.questionId);
              return <Text key={i} style={T.small}>• {q?.prompt ?? a.questionId} — she chose "{a.chosen}". {q?.explain}</Text>;
            })}
          </Box>
        );
      })}
    </>
  );
}

// ---------------- Routine ----------------
function Routine() {
  const settings = useApp((s) => s.settings);
  const setSetting = useApp((s) => s.setSetting);
  const unlock = useApp((s) => s.unlockExtraTime);
  const today = useApp((s) => s.today);
  return (
    <>
      <Box>
        <Text style={T.h2}>Daily learning target</Text>
        <Text style={T.p}>After this many minutes, the app gently says "All done for today". Songs stay available.</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[10, 15, 20, 25, 30, 45].map((m) => <Btn key={m} label={`${m} min`} primary={settings.dailyMinutes === m} onPress={() => setSetting('dailyMinutes', m)} />)}
        </View>
        <Btn label={today.unlockedExtra ? 'Extra time unlocked today' : 'Unlock more time today'} disabled={today.unlockedExtra} onPress={unlock} />
        <Text style={T.small}>Suggested 15–20 minutes: welcome and recap 2, new lesson 5, game 5, little exam 3, revision and rewards 2.</Text>
      </Box>
      <Box>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={settings.reduceMotion} onValueChange={(v) => setSetting('reduceMotion', v)} />
          <Text style={T.p}>Reduce motion (fades instead of movement)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={settings.timedMode} onValueChange={(v) => setSetting('timedMode', v)} />
          <Text style={T.p}>Timed mode (off by default; no game ever ends because of time)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={settings.unlockAll} onValueChange={(v) => setSetting('unlockAll', v)} />
          <Text style={T.p}>Unlock all lessons (use this if her school teaches the topics in a different order)</Text>
        </View>
      </Box>
    </>
  );
}

// ---------------- Sound & voice ----------------
function Vol({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={[T.p, { width: 150 }]}>{label}</Text>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => <Btn key={v} label={v === 0 ? 'Off' : `${v * 100}%`} primary={Math.abs(value - v) < 0.01} onPress={() => onChange(v)} />)}
    </View>
  );
}
function SoundVoice() {
  const settings = useApp((s) => s.settings);
  const setSetting = useApp((s) => s.setSetting);
  const recordings = useApp((s) => s.recordings);
  const refreshRec = useApp((s) => s.refreshRecordings);
  const [query, setQuery] = useState('');
  const [recKey, setRecKey] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const lines = useMemo(() => [{ key: '{name}', text: "Her name (used in greetings and praise)" }, ...Object.entries(VOICE_TEXT).map(([key, text]) => ({ key, text }))], []);
  const shown = lines.filter((l) => !query || l.text.toLowerCase().includes(query.toLowerCase())).slice(0, 40);
  const start = async (key: string) => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return;
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecKey(key);
  };
  const stop = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (uri && recKey) {
      let dest = uri;
      if (Platform.OS !== 'web') {
        const d = new Directory(Paths.document, 'recordings');
        if (!d.exists) d.create({ intermediates: true, idempotent: true });
        const f = new File(d, `${recKey === '{name}' ? 'name' : recKey}-${Date.now()}.m4a`);
        new File(uri).copy(f);
        dest = f.uri;
      }
      repo.saveRecording({ lineKey: recKey, uri: dest, at: Date.now() });
      refreshRec();
    }
    setRecKey(null);
  };
  return (
    <>
      <Box>
        <Text style={T.h2}>Volumes</Text>
        <Vol label="Teacher's voice" value={settings.narrationVolume} onChange={(v) => setSetting('narrationVolume', v)} />
        <Vol label="Music and songs" value={settings.musicVolume} onChange={(v) => setSetting('musicVolume', v)} />
        <Vol label="Sound effects" value={settings.sfxVolume} onChange={(v) => setSetting('sfxVolume', v)} />
      </Box>
      <Box>
        <Text style={T.h2}>Voice check and your recordings</Text>
        <Text style={T.p}>Every line Teacher Joy says is listed here. Play any line to check it. Tap Record to replace it with your own voice; your recording plays instead from then on.</Text>
        <TextInput placeholder="Search lines…" value={query} onChangeText={setQuery} style={{ borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 10, fontSize: 16, backgroundColor: '#F8FAFC' }} />
        <Text style={T.small}>{lines.length - 1} lines. Showing {shown.length}.</Text>
        {shown.map((l) => (
          <View key={l.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderColor: '#F1F5F9', paddingVertical: 4 }}>
            <Text style={[T.p, { flex: 1 }]}>{recordings[l.key] ? '🎙️ ' : ''}{l.text}</Text>
            <Btn label="Play" onPress={() => (l.key === '{name}' ? say('{name}') : recordings[l.key] ? playFile(recordings[l.key]) : say(l.text))} />
            {recKey === l.key ? <Btn label="Stop" danger onPress={stop} /> : <Btn label="Record" disabled={!!recKey} onPress={() => start(l.key)} />}
            {recordings[l.key] && <Btn label="Remove mine" onPress={() => { repo.deleteRecording(l.key); refreshRec(); }} />}
          </View>
        ))}
      </Box>
    </>
  );
}

// ---------------- Reset ----------------
function Reset() {
  const resetProgress = useApp((s) => s.resetProgress);
  const deleteEverything = useApp((s) => s.deleteEverything);
  const refresh = useApp((s) => s.refreshPhotos);
  return (
    <Box>
      <Text style={T.h2}>Reset and delete</Text>
      <Btn label="Reset learning progress" danger onPress={() => confirm('Reset progress?', 'Lessons, answers, stars and badges are cleared. The name, photos and settings stay.', resetProgress)} />
      <Btn label="Delete all photos" danger onPress={() => confirm('Delete all photos?', 'All photos are removed from this tablet.', () => { deleteAllPhotos(); refresh(); })} />
      <Btn label="Delete everything" danger onPress={() => confirm('Delete everything?', 'Progress, photos, recordings, name, settings and the PIN are removed.', async () => { deleteAllPhotos(); await clearPin(); deleteEverything(); })} />
      <Text style={T.small}>Note: the starter photo built into this app copy cannot be erased from the installed app file, but "Delete photo" hides it everywhere.</Text>
    </Box>
  );
}
