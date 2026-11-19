import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle, type StyleProp, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, font } from '../theme';
import { items } from '../content/items';
import { SvgArt, hasDrawing } from '../art/drawings';
import { say, sfx, stopAll } from '../audio/audio';
import { useApp } from '../store';

// ---------- pictures ----------
export function Art({ id, size = 100, mood }: { id: string; size?: number; mood?: string }) {
  if (hasDrawing(id)) return <SvgArt id={id} size={size} mood={mood} />;
  const emoji = items[id]?.emoji ?? '❓';
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.72, lineHeight: size * 0.95, textAlign: 'center' }} allowFontScaling={false}>
        {emoji}
      </Text>
    </View>
  );
}

// A character that gently bobs, and bounces when cheering.
export function Character({ id, size = 140, mood = 'happy', talking }: { id: string; size?: number; mood?: string; talking?: boolean }) {
  const reduce = useApp((s) => s.settings.reduceMotion);
  const bob = useSharedValue(0);
  const jump = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    bob.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce]);
  useEffect(() => {
    if (mood === 'cheer' && !reduce) jump.value = withSequence(withTiming(-24, { duration: 180 }), withSpring(0, { damping: 6 }));
  }, [mood]);
  useEffect(() => {
    if (talking && !reduce) jump.value = withRepeat(withSequence(withTiming(-3, { duration: 160 }), withTiming(0, { duration: 160 })), -1);
    else jump.value = withTiming(0, { duration: 100 });
  }, [talking]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value * -6 + jump.value }, { rotate: `${(bob.value - 0.5) * 3}deg` }] }));
  return (
    <Animated.View style={st}>
      <SvgArt id={id} size={size} mood={mood === 'cheer' ? 'happy' : mood} />
    </Animated.View>
  );
}

// ---------- buttons ----------
export function Bouncy({ onPress, children, style, disabled, sound = true, onLongPress }: { onPress?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle>; disabled?: boolean; sound?: boolean; onLongPress?: () => void }) {
  const s = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => (s.value = withTiming(0.92, { duration: 80 }))}
      onPressOut={() => (s.value = withSpring(1, { damping: 8 }))}
      onPress={() => {
        if (sound) sfx('pop');
        onPress?.();
      }}
      onLongPress={onLongPress}
      delayLongPress={3000}
    >
      <Animated.View style={[st, style, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function BigButton({ label, art, color, onPress, speak, wide, small, testID }: { label: string; art?: string; color: string; onPress: () => void; speak?: string; wide?: boolean; small?: boolean; testID?: string }) {
  return (
    <Bouncy
      onPress={() => {
        if (speak) say(speak);
        onPress();
      }}
      style={[styles.big, { backgroundColor: color, borderBottomColor: shade(color) }, wide && { alignSelf: 'stretch' }, small && styles.bigSmall]}
    >
      <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {art ? <Art id={art} size={small ? 48 : 72} /> : null}
        <Text style={[font.label, { color: colors.ink, fontSize: small ? 20 : 26, flexShrink: 1 }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </Bouncy>
  );
}

export function RoundButton({ art, color = colors.white, onPress, size = 76, label }: { art: string; color?: string; onPress: () => void; size?: number; label?: string }) {
  return (
    <Bouncy onPress={onPress} style={[styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderBottomColor: shade(color) }]}>
      <View accessibilityLabel={label}>
        <Text style={{ fontSize: size * 0.48 }} allowFontScaling={false}>{art}</Text>
      </View>
    </Bouncy>
  );
}

// Repeats the last instruction.
export function SpeakerButton({ lines, size = 76 }: { lines: string | string[]; size?: number }) {
  return <RoundButton art="🔊" color={colors.sun} size={size} onPress={() => say(lines)} label="Repeat" />;
}

export function shade(hex: string, amt = 0.18) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt)) | 0;
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amt)) | 0;
  const b = Math.max(0, (n & 255) * (1 - amt)) | 0;
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------- layout ----------
export function Screen({ children, bg = colors.cream, repeat, title, onBack, noHome }: { children: React.ReactNode; bg?: string; repeat?: string | string[]; title?: string; onBack?: () => void; noHome?: boolean }) {
  const insets = useSafeAreaInsets();
  const home = useApp((s) => s.home);
  const back = useApp((s) => s.back);
  return (
    <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.topBar}>
        {!noHome && <RoundButton art="🏠" onPress={() => { stopAll(); home(); }} label="Home" />}
        {onBack !== undefined || !noHome ? <RoundButton art="⬅️" onPress={() => { stopAll(); (onBack ?? back)(); }} label="Back" /> : null}
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          {title ? <Text style={[font.label, { textAlign: 'center' }]} numberOfLines={1}>{title}</Text> : null}
        </View>
        {repeat ? <SpeakerButton lines={repeat} /> : <View style={{ width: 76 }} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      <Caption />
    </View>
  );
}

// Shows the words being spoken (for the grown-up, and for when sound is off).
export function Caption() {
  const caption = useApp((s) => s.caption);
  if (!caption) return null;
  return (
    <View pointerEvents="none" style={styles.caption}>
      <Text style={styles.captionText} numberOfLines={3}>{caption}</Text>
    </View>
  );
}

export function Card({ children, style, color = colors.white }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; color?: string }) {
  return <View style={[styles.card, { backgroundColor: color, borderBottomColor: shade(color, 0.1) }, style]}>{children}</View>;
}

export function Stars({ n, of = 3, size = 34 }: { n: number; of?: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {Array.from({ length: of }).map((_, i) => (
        <Text key={i} style={{ fontSize: size, opacity: i < n ? 1 : 0.25 }} allowFontScaling={false}>⭐</Text>
      ))}
    </View>
  );
}

// ---------- confetti ----------
const CONFETTI_COLORS = [colors.coral, colors.sun, colors.sky, colors.aqua, colors.leaf, colors.lilac];
function Piece({ i, w, h }: { i: number; w: number; h: number }) {
  const y = useSharedValue(-40);
  const r = useSharedValue(0);
  const x0 = useMemo(() => Math.random() * w, [w]);
  const drift = useMemo(() => (Math.random() - 0.5) * 120, []);
  useEffect(() => {
    const d = 1600 + Math.random() * 1200;
    y.value = withDelay(Math.random() * 400, withTiming(h + 40, { duration: d, easing: Easing.in(Easing.quad) }));
    r.value = withTiming(360 * (Math.random() > 0.5 ? 2 : -2), { duration: d });
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x0 + (drift * y.value) / h }, { translateY: y.value }, { rotate: `${r.value}deg` }] }));
  return <Animated.View style={[{ position: 'absolute', width: 14, height: 20, borderRadius: 4, backgroundColor: CONFETTI_COLORS[i % 6] }, st]} />;
}
export function Confetti({ count = 50 }: { count?: number }) {
  const { width, height } = useWindowDimensions();
  const reduce = useApp((s) => s.settings.reduceMotion);
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: Math.min(60, count) }).map((_, i) => <Piece key={i} i={i} w={width} h={height} />)}
    </View>
  );
}

// Fade + pop in on mount.
export function PopIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const s = useSharedValue(0.6);
  const o = useSharedValue(0);
  useEffect(() => {
    s.value = withDelay(delay, withSpring(1, { damping: 9 }));
    o.value = withDelay(delay, withTiming(1, { duration: 250 }));
  }, []);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  return <Animated.View style={[st, style]}>{children}</Animated.View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  big: { minHeight: 96, borderRadius: radius.lg, paddingHorizontal: 24, paddingVertical: 14, justifyContent: 'center', borderBottomWidth: 7 },
  bigSmall: { minHeight: 76, paddingHorizontal: 16 },
  round: { alignItems: 'center', justifyContent: 'center', borderBottomWidth: 5 },
  card: { borderRadius: radius.lg, padding: 16, borderBottomWidth: 6, alignItems: 'center', justifyContent: 'center' },
  caption: { position: 'absolute', left: 120, right: 120, bottom: 10, backgroundColor: 'rgba(43,42,76,0.85)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  captionText: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
});
