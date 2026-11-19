import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

// Drop zones register their on-screen rectangle; a draggable asks which zone
// it was released over. Zones are enlarged by SLOP so small fingers succeed.
const SLOP = 30;
type Rect = { x: number; y: number; w: number; h: number };
type Registry = { zones: Map<string, Rect>; refs: Map<string, View | null> };
const Ctx = createContext<Registry | null>(null);

export function DragArea({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reg = useRef<Registry>({ zones: new Map(), refs: new Map() });
  return (
    <Ctx.Provider value={reg.current}>
      <View style={style}>{children}</View>
    </Ctx.Provider>
  );
}

function measureAll(reg: Registry) {
  return Promise.all(
    [...reg.refs.entries()].map(
      ([id, ref]) =>
        new Promise<void>((res) => {
          if (!ref) return res();
          ref.measureInWindow((x, y, w, h) => {
            reg.zones.set(id, { x, y, w, h });
            res();
          });
        }),
    ),
  );
}

export function DropZone({ id, children, style }: { id: string; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reg = useContext(Ctx)!;
  const ref = useRef<View>(null);
  useEffect(() => {
    reg.refs.set(id, ref.current);
    return () => {
      reg.refs.delete(id);
      reg.zones.delete(id);
    };
  }, [id]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

export function Draggable({ children, onDrop, onPick, disabled, style }: {
  children: React.ReactNode;
  // Return true to accept (item stays hidden/snapped by parent), false to spring back.
  onDrop: (zoneId: string | null) => boolean;
  onPick?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reg = useContext(Ctx)!;
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const z = useSharedValue(0);

  const finish = useCallback(async (ax: number, ay: number) => {
    await measureAll(reg);
    let hit: string | null = null;
    let best = Infinity;
    for (const [id, r] of reg.zones) {
      if (ax >= r.x - SLOP && ax <= r.x + r.w + SLOP && ay >= r.y - SLOP && ay <= r.y + r.h + SLOP) {
        const d = Math.hypot(ax - (r.x + r.w / 2), ay - (r.y + r.h / 2));
        if (d < best) { best = d; hit = id; }
      }
    }
    const ok = onDrop(hit);
    if (!ok) {
      tx.value = withSpring(0, { damping: 12 });
      ty.value = withSpring(0, { damping: 12 });
    } else {
      tx.value = 0;
      ty.value = 0;
    }
    sc.value = withTiming(1, { duration: 120 });
    z.value = 0;
  }, [onDrop]);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .runOnJS(true)
    .minDistance(4)
    .onStart(() => {
      sc.value = withTiming(1.12, { duration: 100 });
      z.value = 100;
      onPick?.();
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      finish(e.absoluteX, e.absoluteY);
    });

  const st = useAnimatedStyle(() => ({ zIndex: z.value, elevation: z.value ? 12 : 0, transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }] }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, st]}>{children}</Animated.View>
    </GestureDetector>
  );
}
