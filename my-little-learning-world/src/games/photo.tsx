import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import type { Activity, BodyPart } from '../content/types';
import { BODY_PARTS } from '../content/types';
import { P } from '../content';
import { bodyJob } from '../content/lessons/body';
import { say, sfx } from '../audio/audio';
import { useApp } from '../store';
import type { Marker, PhotoRow } from '../db/types';
import { STARTER } from '../private.generated';
import { colors, radius } from '../theme';
import { GameProps, Prompt, shuffle, useLadder } from './common';
import { Confetti } from '../components/ui';

export const photoSource = (p: PhotoRow) => (p.uri === 'starter' && STARTER.photo ? STARTER.photo.source : { uri: p.uri });

// Cartoon body used when there is no photo (and for parts not in the photo).
export const CARTOON_MARKERS: Record<BodyPart, Marker> = {
  head: { x: 0.5, y: 0.1, r: 0.16 }, eyes: { x: 0.5, y: 0.13, r: 0.1 }, ears: { x: 0.31, y: 0.15, r: 0.07 },
  nose: { x: 0.5, y: 0.165, r: 0.05 }, mouth: { x: 0.5, y: 0.2, r: 0.06 }, neck: { x: 0.5, y: 0.255, r: 0.06 },
  hands: { x: 0.14, y: 0.55, r: 0.1 }, fingers: { x: 0.86, y: 0.57, r: 0.08 }, stomach: { x: 0.5, y: 0.45, r: 0.13 },
  legs: { x: 0.4, y: 0.75, r: 0.1 }, feet: { x: 0.6, y: 0.94, r: 0.09 },
};
export function CartoonBody({ width, height }: { width: number; height: number }) {
  const ink = '#2B2A4C', skin = '#7A4A2E';
  return (
    <Svg width={width} height={height} viewBox="0 0 100 160">
      <Rect x="36" y="112" width="11" height="34" rx="5" fill={skin} stroke={ink} strokeWidth={2} />
      <Rect x="53" y="112" width="11" height="34" rx="5" fill={skin} stroke={ink} strokeWidth={2} />
      <Ellipse cx="38" cy="150" rx="10" ry="5" fill={skin} stroke={ink} strokeWidth={2} />
      <Ellipse cx="62" cy="150" rx="10" ry="5" fill={skin} stroke={ink} strokeWidth={2} />
      <Path d="M30 112 v-40 c0 -14 8 -20 20 -20 s20 6 20 20 v40 z" fill="#9B7EDE" stroke={ink} strokeWidth={2.5} />
      <Path d="M31 60 l-17 30" stroke={skin} strokeWidth={9} strokeLinecap="round" />
      <Path d="M69 60 l17 30" stroke={skin} strokeWidth={9} strokeLinecap="round" />
      <Circle cx="14" cy="91" r="6" fill={skin} stroke={ink} strokeWidth={2} />
      <Path d="M84 90 l2 -6 M87 91 l4 -5 M88 94 l5 -2" stroke={ink} strokeWidth={1.5} />
      <Circle cx="86" cy="92" r="5" fill={skin} stroke={ink} strokeWidth={2} />
      <Rect x="45" y="36" width="10" height="10" fill={skin} />
      <Ellipse cx="31" cy="24" rx="4" ry="6" fill={skin} stroke={ink} strokeWidth={2} />
      <Ellipse cx="69" cy="24" rx="4" ry="6" fill={skin} stroke={ink} strokeWidth={2} />
      <Circle cx="50" cy="22" r="17" fill={skin} stroke={ink} strokeWidth={2.5} />
      <Path d="M33 18 c0 -18 34 -18 34 0 c-6 -8 -28 -8 -34 0z" fill="#1E1B2E" />
      <Circle cx="44" cy="21" r="2.4" fill={ink} /><Circle cx="56" cy="21" r="2.4" fill={ink} />
      <Path d="M50 23 q-2 4 0 4.5" stroke={ink} strokeWidth={1.5} fill="none" />
      <Path d="M44 31 q6 4 12 0" stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Ellipse cx="50" cy="74" rx="4" ry="3" fill="#7A5FC0" />
    </Svg>
  );
}

export { fit, toScreen, toFraction, hitPart } from '../engine/geometry';
import { fit, toScreen, hitPart } from '../engine/geometry';

function Ring({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const s = useSharedValue(0.6);
  useEffect(() => { s.value = withRepeat(withSequence(withTiming(1.1, { duration: 450 }), withTiming(0.95, { duration: 450 })), -1); }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: r, borderWidth: 6, borderColor: color, backgroundColor: color + '33' }, st]} />;
}

// The picture with its markers; reports taps in screen coordinates.
export function BodyPicture({ photo, box, onTap, highlight, showAll }: { photo: PhotoRow | null; box: { w: number; h: number }; onTap: (part: BodyPart | null) => void; highlight?: { part: BodyPart; color: string } | null; showAll?: boolean }) {
  const iw = photo ? photo.width : 100, ih = photo ? photo.height : 160;
  const f = fit(iw, ih, box.w, box.h);
  const markers = photo ? photo.markers : CARTOON_MARKERS;
  // Tap position relative to the picture box (works the same on Android and web).
  const tap = Gesture.Tap().runOnJS(true).maxDuration(5000).onEnd((e, ok) => {
    if (!ok) return;
    const part = hitPart(e.x, e.y, markers, f);
    if (Platform.OS === 'web') (globalThis as any).__lastTap = { x: e.x, y: e.y, part };
    onTap(part);
  });
  const hl = highlight && markers[highlight.part] ? toScreen(markers[highlight.part]!, f) : null;
  return (
    <GestureDetector gesture={tap}>
    <View style={{ width: box.w, height: box.h }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: f.ox, top: f.oy, width: f.w, height: f.h, borderRadius: 16, overflow: 'hidden' }}>
        {photo ? <Image source={photoSource(photo)} style={{ width: f.w, height: f.h }} /> : <CartoonBody width={f.w} height={f.h} />}
      </View>
      {showAll && BODY_PARTS.map((p) => {
        const m = markers[p];
        if (!m) return null;
        const s = toScreen(m, f);
        return <View key={p} pointerEvents="none" style={{ position: 'absolute', left: s.x - 7, top: s.y - 7, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.sun, borderWidth: 2, borderColor: colors.white }} />;
      })}
      {hl && <Ring key={highlight!.part + highlight!.color} x={hl.x} y={hl.y} r={Math.max(28, hl.r)} color={highlight!.color} />}
    </View>
    </GestureDetector>
  );
}

const PART_SFX: Partial<Record<BodyPart, 'sparkle' | 'drop' | 'pop' | 'whoosh'>> = { nose: 'whoosh', ears: 'sparkle', mouth: 'pop', eyes: 'sparkle' };

export function PhotoBodyGame({ activity, lessonId, onDone, context }: GameProps<Extract<Activity, { type: 'photoBody' }>>) {
  const photos = useApp((s) => s.photos);
  const photo = photos.find((p) => p.kind === 'full_body') ?? photos.find((p) => p.kind === 'face') ?? null;
  const markers = photo ? photo.markers : CARTOON_MARKERS;
  const available = BODY_PARTS.filter((p) => markers[p]);
  const [box, setBox] = useState({ w: 400, h: 500 });
  const [hl, setHl] = useState<{ part: BodyPart; color: string } | null>(null);
  const [found, setFound] = useState<Set<string>>(new Set());
  const ladder = useLadder(lessonId, context);
  const record = useApp((s) => s.answer);
  const asks = useMemo(() => shuffle(available).slice(0, 5), [photo?.updatedAt]);
  const [q, setQ] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const busy = useRef(false);
  const ask = (i: number) => P.photoFind[i % 3].replace('{part}', asks[i]);

  useEffect(() => {
    const intro = photo ? activity.title : P.photoNoPhoto;
    if (activity.mode === 'question') say([intro, ask(0)]);
    else say([intro, P.tapToHear]);
  }, []);

  const tapExplore = async (part: BodyPart | null) => {
    if (!part) return;
    setHl({ part, color: colors.sun });
    sfx(PART_SFX[part] ?? 'pop');
    const f = new Set(found).add(part);
    setFound(f);
    // Exploring is logged but does not change mastery (attemptNo 2 = not a first try).
    record({ questionId: `L1.photo.explore.${part}`, topicId: `L1.${part}`, lessonId, context: 'game', correct: true, attemptNo: 2 });
    await say([`Wonderful! That is your ${part}.`, bodyJob(part)]);
    if (f.size >= Math.min(6, available.length) && !celebrate) {
      setCelebrate(true);
      onDone({ correct: f.size, total: f.size });
    }
  };

  const tapQuestion = async (part: BodyPart | null) => {
    if (busy.current) return;
    const want = asks[q];
    const qid = `L1.photo.${want}`;
    if (part === want) {
      busy.current = true;
      setHl({ part, color: colors.leaf });
      await ladder.right(qid, `L1.${want}`, [`That is your ${want}.`, bodyJob(want)]);
      busy.current = false;
      if (q + 1 >= asks.length) { setCelebrate(true); onDone({ correct: ladder.firstTry.current, total: asks.length }); }
      else { setHl(null); ladder.reset(); setQ(q + 1); say(ask(q + 1)); }
    } else {
      const reveal = await ladder.wrong(qid, `L1.${want}`, part ?? 'none', ask(q), bodyJob(want));
      if (reveal) setHl({ part: want, color: colors.amber });
    }
  };

  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 20 }}>
      <View style={{ flex: 1 }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <BodyPicture photo={photo} box={box} highlight={hl} onTap={activity.mode === 'explore' ? tapExplore : tapQuestion} showAll={activity.mode === 'explore'} />
      </View>
      <View style={{ width: 300, justifyContent: 'center', gap: 16 }}>
        {activity.mode === 'question' ? (
          <>
            <Prompt text={ask(q)} />
            <Text style={{ fontSize: 20, color: colors.inkSoft, textAlign: 'center' }}>{q + 1} / {asks.length}</Text>
          </>
        ) : (
          <>
            <Prompt text={photo ? 'Tap a part of your body!' : 'Tap a part of the body!'} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {available.map((p) => (
                <View key={p} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: found.has(p) ? colors.leaf : colors.creamDeep }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink }}>{p}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
      {celebrate && <Confetti />}
    </View>
  );
}
