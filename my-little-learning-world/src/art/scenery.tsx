import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// Soft illustrated backdrops, one per world. Drawn on a 1280x800 canvas and
// scaled to cover the screen. Deliberately low-contrast so content stays clear.
export type SceneId = 'home' | 'body' | 'sun' | 'air' | 'water' | 'food' | 'plain';

const SKY: Record<SceneId, [string, string]> = {
  home: ['#BFE7FF', '#FFF8EC'],
  body: ['#FFD6DC', '#FFF4EC'],
  sun: ['#FFE7A3', '#FFF8EC'],
  air: ['#CDEBFF', '#F4FBFF'],
  water: ['#BDEFEA', '#F0FBFA'],
  food: ['#D7F2C4', '#FFF8EC'],
  plain: ['#FFF8EC', '#FFF8EC'],
};

const Cloud = ({ x, y, s = 1, o = 0.9 }: { x: number; y: number; s?: number; o?: number }) => (
  <G opacity={o} transform={`translate(${x} ${y}) scale(${s})`}>
    <Ellipse cx={0} cy={0} rx={70} ry={34} fill="#fff" />
    <Circle cx={-30} cy={-18} r={30} fill="#fff" />
    <Circle cx={22} cy={-26} r={38} fill="#fff" />
  </G>
);

const Hills = ({ a, b }: { a: string; b: string }) => (
  <G>
    <Path d="M0 640 C 220 560 420 600 640 650 S 1060 560 1280 620 L1280 800 L0 800 Z" fill={a} />
    <Path d="M0 700 C 260 640 520 690 780 720 S 1140 660 1280 690 L1280 800 L0 800 Z" fill={b} />
  </G>
);

function Decor({ id }: { id: SceneId }) {
  switch (id) {
    case 'home':
      return (
        <G>
          <Circle cx={1130} cy={110} r={70} fill="#FFD966" opacity={0.85} />
          <Cloud x={220} y={120} s={1.1} />
          <Cloud x={760} y={80} s={0.8} o={0.8} />
          <Hills a="#BDE6A2" b="#9ED67F" />
          <G opacity={0.9}>
            <Circle cx={120} cy={690} r={9} fill="#FF8FA3" /><Circle cx={160} cy={705} r={7} fill="#FFC83D" />
            <Circle cx={1080} cy={700} r={9} fill="#9B7EDE" /><Circle cx={1130} cy={688} r={7} fill="#FF8FA3" />
          </G>
        </G>
      );
    case 'body':
      return (
        <G opacity={0.55}>
          {[[90, 140, 26], [1180, 220, 34], [210, 640, 22], [1090, 640, 28], [640, 60, 16], [980, 90, 12]].map(([x, y, r], i) => (
            <Circle key={i} cx={x} cy={y} r={r} fill="none" stroke="#FF8FA3" strokeWidth={6} />
          ))}
          <Path d="M1180 520 c10 -18 34 -8 26 10 l-26 26 l-26 -26 c-8 -18 16 -28 26 -10z" fill="#FF8FA3" />
          <Path d="M110 380 c8 -14 26 -6 20 8 l-20 20 l-20 -20 c-6 -14 12 -22 20 -8z" fill="#FFC83D" />
        </G>
      );
    case 'sun':
      return (
        <G>
          {Array.from({ length: 14 }).map((_, i) => {
            const a = (i / 14) * Math.PI * 2;
            return <Path key={i} d={`M1180 90 L${1180 + Math.cos(a) * 260} ${90 + Math.sin(a) * 260} L${1180 + Math.cos(a + 0.12) * 260} ${90 + Math.sin(a + 0.12) * 260} Z`} fill="#FFD966" opacity={0.35} />;
          })}
          <Circle cx={1180} cy={90} r={110} fill="#FFC83D" opacity={0.75} />
          <Cloud x={260} y={130} s={0.9} o={0.7} />
          <Hills a="#E9D98B" b="#BDE6A2" />
        </G>
      );
    case 'air':
      return (
        <G>
          <Cloud x={180} y={110} s={1.2} />
          <Cloud x={700} y={70} s={0.9} />
          <Cloud x={1120} y={160} s={1} />
          {[[120, 520], [880, 600], [420, 690]].map(([x, y], i) => (
            <Path key={i} d={`M${x} ${y} q60 -40 120 0 t120 0`} stroke="#8FD0F2" strokeWidth={8} fill="none" strokeLinecap="round" opacity={0.6} />
          ))}
        </G>
      );
    case 'water':
      return (
        <G>
          <Cloud x={240} y={110} s={1} o={0.8} />
          <Path d="M0 660 q80 -30 160 0 t160 0 t160 0 t160 0 t160 0 t160 0 t160 0 t160 0 L1280 800 L0 800Z" fill="#8FDCD3" opacity={0.7} />
          <Path d="M0 710 q80 -30 160 0 t160 0 t160 0 t160 0 t160 0 t160 0 t160 0 t160 0 L1280 800 L0 800Z" fill="#5CCBC0" opacity={0.6} />
          {[[1120, 160, 14], [1160, 220, 9], [100, 420, 11]].map(([x, y, r], i) => (
            <Path key={i} d={`M${x} ${y - r * 1.6} C ${x + r} ${y - r * 0.2} ${x + r} ${y + r} ${x} ${y + r} C ${x - r} ${y + r} ${x - r} ${y - r * 0.2} ${x} ${y - r * 1.6} Z`} fill="#5BC0EB" opacity={0.5} />
          ))}
        </G>
      );
    case 'food':
      return (
        <G>
          <Circle cx={1150} cy={100} r={60} fill="#FFD966" opacity={0.7} />
          <Cloud x={300} y={110} s={0.9} o={0.8} />
          <Hills a="#BFE59F" b="#93D16E" />
          {[180, 260, 1020, 1100].map((x, i) => (
            <G key={i} opacity={0.75}>
              <Rect x={x - 3} y={650} width={6} height={60} fill="#6FA94A" />
              <Ellipse cx={x} cy={645} rx={10} ry={18} fill="#F2C94C" />
            </G>
          ))}
        </G>
      );
    default:
      return null;
  }
}

export function Scenery({ id = 'plain' }: { id?: SceneId }) {
  const [top, bottom] = SKY[id] ?? SKY.plain;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 1280 800" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={1280} height={800} fill={`url(#sky-${id})`} />
        <Decor id={id} />
      </Svg>
    </View>
  );
}
