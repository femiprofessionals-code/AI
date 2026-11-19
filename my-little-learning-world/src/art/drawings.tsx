import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect, Line, Polygon } from 'react-native-svg';

// Original vector drawings, all on a 100x100 canvas with soft ink outlines.
const INK = '#2B2A4C';
const SKIN = '#7A4A2E';
const SKIN_DARK = '#5C3620';
const sw = 3;

type D = (p: { mood?: string }) => React.ReactElement;

const Face = ({ cx, cy, r, mood = 'happy' }: { cx: number; cy: number; r: number; mood?: string }) => (
  <G>
    <Circle cx={cx - r * 0.35} cy={cy - r * 0.1} r={r * 0.12} fill={INK} />
    <Circle cx={cx + r * 0.35} cy={cy - r * 0.1} r={r * 0.12} fill={INK} />
    <Circle cx={cx - r * 0.32} cy={cy - r * 0.15} r={r * 0.04} fill="#fff" />
    <Circle cx={cx + r * 0.38} cy={cy - r * 0.15} r={r * 0.04} fill="#fff" />
    {mood === 'ouch' ? (
      <Path d={`M${cx - r * 0.3} ${cy + r * 0.4} q${r * 0.3} -${r * 0.25} ${r * 0.6} 0`} stroke={INK} strokeWidth={sw} fill="none" strokeLinecap="round" />
    ) : (
      <Path d={`M${cx - r * 0.35} ${cy + r * 0.25} q${r * 0.35} ${r * 0.35} ${r * 0.7} 0`} stroke={INK} strokeWidth={sw} fill="none" strokeLinecap="round" />
    )}
    <Circle cx={cx - r * 0.6} cy={cy + r * 0.2} r={r * 0.12} fill="#FF8FA3" opacity={0.6} />
    <Circle cx={cx + r * 0.6} cy={cy + r * 0.2} r={r * 0.12} fill="#FF8FA3" opacity={0.6} />
  </G>
);

const Tooth = ({ mood }: { mood: 'happy' | 'ouch' }) => (
  <G>
    <Path d="M28 22 C20 22 16 32 18 44 C20 56 24 64 26 80 C27 88 34 88 36 80 L40 64 C42 58 48 58 50 64 L54 80 C56 88 63 88 64 80 C66 64 70 56 72 44 C74 32 70 22 62 22 C56 22 54 26 45 26 C36 26 34 22 28 22 Z" fill={mood === 'happy' ? '#FFFFFF' : '#FFF5D6'} stroke={INK} strokeWidth={sw} />
    <Face cx={45} cy={44} r={14} mood={mood} />
    {mood === 'ouch' ? (
      <G>
        <Path d="M74 18 l6 -8 M80 26 l9 -3 M70 12 l1 -9" stroke="#FF6F61" strokeWidth={3} strokeLinecap="round" />
        <Rect x="10" y="30" width="10" height="34" rx="5" fill="#9BD3F5" stroke={INK} strokeWidth={2} transform="rotate(-20 15 47)" />
      </G>
    ) : (
      <Path d="M76 18 l4 -4 M82 26 l5 0 M74 10 l0 -5" stroke="#FFC83D" strokeWidth={3} strokeLinecap="round" />
    )}
  </G>
);

const Germ = () => (
  <G>
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
      <Line key={a} x1={50} y1={52} x2={50 + 38 * Math.cos((a * Math.PI) / 180)} y2={52 + 38 * Math.sin((a * Math.PI) / 180)} stroke="#6BBF59" strokeWidth={5} strokeLinecap="round" />
    ))}
    <Circle cx={50} cy={52} r={28} fill="#8FD66F" stroke={INK} strokeWidth={sw} />
    <Circle cx={41} cy={46} r={7} fill="#fff" stroke={INK} strokeWidth={2} />
    <Circle cx={59} cy={46} r={7} fill="#fff" stroke={INK} strokeWidth={2} />
    <Circle cx={42} cy={47} r={3} fill={INK} />
    <Circle cx={58} cy={47} r={3} fill={INK} />
    <Path d="M40 62 q10 8 20 0" stroke={INK} strokeWidth={sw} fill="none" strokeLinecap="round" />
  </G>
);

const ClothesLine = ({ wet }: { wet: boolean }) => (
  <G>
    <Line x1="6" y1="24" x2="94" y2="24" stroke={INK} strokeWidth={2} />
    <Path d="M14 24 h28 v8 l-6 4 v34 h-16 v-34 l-6 -4 z" fill={wet ? '#6FA3D9' : '#FF6F61'} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
    <Path d="M56 24 h30 l-4 50 h-8 l-3 -30 l-3 30 h-8 z" fill={wet ? '#5E86B0' : '#FFC83D'} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
    {wet ? (
      <G fill="#5BC0EB">
        <Path d="M28 80 q-3 6 0 8 q3 -2 0 -8z" />
        <Path d="M70 84 q-3 6 0 8 q3 -2 0 -8z" />
        <Path d="M36 88 q-3 6 0 8 q3 -2 0 -8z" />
      </G>
    ) : (
      <G stroke="#FFC83D" strokeWidth={2.5} strokeLinecap="round">
        <Line x1="4" y1="6" x2="10" y2="12" /><Line x1="50" y1="4" x2="50" y2="12" /><Line x1="96" y1="6" x2="90" y2="12" />
      </G>
    )}
  </G>
);

const Child = ({ children, shirt = '#9B7EDE' }: { children?: React.ReactNode; shirt?: string }) => (
  <G>
    <Path d="M30 96 v-26 c0 -12 8 -18 20 -18 s20 6 20 18 v26 z" fill={shirt} stroke={INK} strokeWidth={sw} />
    <Rect x="44" y="44" width="12" height="10" fill={SKIN} />
    <Circle cx={50} cy={32} r={17} fill={SKIN} stroke={INK} strokeWidth={sw} />
    <Path d="M33 30 c0 -14 34 -14 34 0 c-6 -6 -28 -6 -34 0z" fill="#1E1B2E" />
    <Circle cx={34} cy={24} r={5} fill="#1E1B2E" />
    <Circle cx={66} cy={24} r={5} fill="#1E1B2E" />
    <Circle cx={44} cy={33} r={2} fill={INK} />
    <Circle cx={56} cy={33} r={2} fill={INK} />
    <Path d="M45 40 q5 4 10 0" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
    {children}
  </G>
);

export const drawings: Record<string, D> = {
  neck: () => (
    <G>
      <Path d="M20 96 c4 -18 16 -24 30 -24 s26 6 30 24 z" fill="#9B7EDE" stroke={INK} strokeWidth={sw} />
      <Rect x="40" y="50" width="20" height="26" fill={SKIN} stroke={INK} strokeWidth={sw} />
      <Circle cx={50} cy={32} r={22} fill={SKIN} stroke={INK} strokeWidth={sw} />
      <Path d="M38 62 l24 0" stroke="#FFC83D" strokeWidth={4} strokeLinecap="round" />
      <Path d="M72 54 l14 -6 M74 62 l14 2" stroke="#FF6F61" strokeWidth={3} strokeLinecap="round" />
    </G>
  ),
  stomach: () => (
    <G>
      <Path d="M24 10 h52 c4 30 8 50 0 80 h-52 c-8 -30 -4 -50 0 -80z" fill={SKIN} stroke={INK} strokeWidth={sw} />
      <Ellipse cx={50} cy={58} rx={18} ry={16} fill="#FF8FA3" stroke={INK} strokeWidth={2} opacity={0.7} />
      <Circle cx={50} cy={62} r={2.5} fill={SKIN_DARK} />
      <Path d="M40 54 q10 8 20 0" stroke={INK} strokeWidth={2} fill="none" />
    </G>
  ),
  body: () => (
    <G>
      <Child />
    </G>
  ),
  toothpaste: () => (
    <G>
      <Path d="M14 40 h56 l16 6 v8 l-16 6 h-56 z" fill="#FFFFFF" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Rect x="84" y="44" width="8" height="12" rx="2" fill="#2EC4B6" stroke={INK} strokeWidth={2} />
      <Rect x="20" y="44" width="34" height="12" rx="4" fill="#5BC0EB" />
      <Path d="M58 40 v20" stroke={INK} strokeWidth={2} />
      <Path d="M88 34 q6 -10 0 -16 q-8 2 -4 10z" fill="#E6F6FF" stroke={INK} strokeWidth={2} />
    </G>
  ),
  towel: () => (
    <G>
      <Rect x="20" y="14" width="60" height="74" rx="6" fill="#FF8FA3" stroke={INK} strokeWidth={sw} />
      <Rect x="20" y="70" width="60" height="8" fill="#FFFFFF" opacity={0.8} />
      <Rect x="20" y="24" width="60" height="6" fill="#FFFFFF" opacity={0.8} />
      <Path d="M28 88 v6 M36 88 v6 M44 88 v6 M52 88 v6 M60 88 v6 M68 88 v6" stroke={INK} strokeWidth={2} />
    </G>
  ),
  comb: () => (
    <G>
      <Rect x="10" y="30" width="80" height="16" rx="6" fill="#FFC83D" stroke={INK} strokeWidth={sw} />
      {Array.from({ length: 13 }).map((_, i) => (
        <Rect key={i} x={14 + i * 6} y={44} width={3.5} height={i % 2 ? 22 : 26} rx={1.5} fill="#FFC83D" stroke={INK} strokeWidth={1.5} />
      ))}
    </G>
  ),
  nailcutter: () => (
    <G>
      <Path d="M12 50 L78 40 Q90 40 90 50 Q90 60 78 60 Z" fill="#CBD5E1" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M12 50 L74 30 Q84 26 86 32" fill="none" stroke={INK} strokeWidth={sw} />
      <Path d="M22 38 L80 24" stroke="#94A3B8" strokeWidth={6} strokeLinecap="round" />
      <Circle cx={30} cy={50} r={4} fill="#94A3B8" stroke={INK} strokeWidth={2} />
    </G>
  ),
  drybody: () => (
    <Child shirt="#FF8FA3">
      <Path d="M26 60 q24 16 48 0 v14 q-24 14 -48 0z" fill="#FF8FA3" stroke={INK} strokeWidth={2} />
      <Path d="M18 20 q-3 6 0 8 q3 -2 0 -8z M82 26 q-3 6 0 8 q3 -2 0 -8z" fill="#5BC0EB" />
    </Child>
  ),
  washhands: () => (
    <G>
      <Path d="M20 60 c0 -14 10 -20 18 -20 h8 v30 h-10 c-8 0 -16 -2 -16 -10z" fill={SKIN} stroke={INK} strokeWidth={sw} />
      <Path d="M80 60 c0 -14 -10 -20 -18 -20 h-8 v30 h10 c8 0 16 -2 16 -10z" fill={SKIN} stroke={INK} strokeWidth={sw} />
      {[[30, 34, 6], [50, 26, 8], [70, 34, 5], [42, 78, 5], [60, 80, 6]].map(([x, y, r], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill="#E6F6FF" stroke="#5BC0EB" strokeWidth={2} />
      ))}
    </G>
  ),
  germ: () => <Germ />,
  plaque: () => (
    <G>
      <Tooth mood="ouch" />
      <Circle cx={30} cy={70} r={6} fill="#C9B458" opacity={0.8} />
      <Circle cx={60} cy={30} r={5} fill="#C9B458" opacity={0.8} />
      <Circle cx={45} cy={66} r={4} fill={INK} />
    </G>
  ),
  toothHappy: () => <Tooth mood="happy" />,
  toothOuch: () => <Tooth mood="ouch" />,
  rinse: () => (
    <G>
      <Path d="M30 30 h40 l-6 60 h-28 z" fill="#E6F6FF" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M33 50 h34 l-4 38 h-26 z" fill="#9BD3F5" />
      <Path d="M44 24 q6 -14 12 0" stroke="#5BC0EB" strokeWidth={3} fill="none" />
      <Path d="M38 14 q2 -6 4 0 M58 12 q2 -6 4 0" stroke="#5BC0EB" strokeWidth={3} fill="none" />
    </G>
  ),
  sun: ({ mood }) => (
    <G>
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        return <Line key={i} x1={50 + 32 * Math.cos(a)} y1={50 + 32 * Math.sin(a)} x2={50 + 46 * Math.cos(a)} y2={50 + 46 * Math.sin(a)} stroke="#FFA94D" strokeWidth={6} strokeLinecap="round" />;
      })}
      <Circle cx={50} cy={50} r={28} fill="#FFC83D" stroke={INK} strokeWidth={sw} />
      <Face cx={50} cy={52} r={20} mood={mood} />
    </G>
  ),
  warm: () => (
    <G>
      <Circle cx={80} cy={18} r={12} fill="#FFC83D" stroke={INK} strokeWidth={2} />
      <G transform="translate(-8 6) scale(0.94)">
        <Child shirt="#FFA94D" />
      </G>
      <Path d="M74 38 q4 -4 0 -8 M84 40 q4 -4 0 -8" stroke="#FF6F61" strokeWidth={2.5} fill="none" strokeLinecap="round" />
    </G>
  ),
  clothesWet: () => <ClothesLine wet />,
  clothesDry: () => <ClothesLine wet={false} />,
  fan: () => (
    <G>
      <Rect x="46" y="54" width="8" height="30" fill="#94A3B8" stroke={INK} strokeWidth={2} />
      <Ellipse cx={50} cy={88} rx={22} ry={7} fill="#CBD5E1" stroke={INK} strokeWidth={sw} />
      <Circle cx={50} cy={38} r={30} fill="#DDF2FB" stroke={INK} strokeWidth={sw} />
      {[0, 120, 240].map((a) => (
        <Ellipse key={a} cx={50} cy={24} rx={8} ry={14} fill="#5BC0EB" stroke={INK} strokeWidth={2} transform={`rotate(${a} 50 38)`} />
      ))}
      <Circle cx={50} cy={38} r={5} fill="#FFC83D" stroke={INK} strokeWidth={2} />
    </G>
  ),
  breathing: () => (
    <G>
      <Child shirt="#5BC0EB" />
      <Path d="M70 30 q8 -2 12 -8 M72 36 q10 0 16 -4 M70 42 q8 2 14 6" stroke="#5BC0EB" strokeWidth={3} fill="none" strokeLinecap="round" />
    </G>
  ),
  cool: () => (
    <G>
      <Child shirt="#2EC4B6" />
      <Path d="M4 30 q10 -6 20 0 t20 0 M2 44 q10 -6 20 0 t20 0" stroke="#5BC0EB" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.9} />
    </G>
  ),
  tap: () => (
    <G>
      <Rect x="10" y="20" width="16" height="24" rx="3" fill="#94A3B8" stroke={INK} strokeWidth={sw} />
      <Path d="M26 26 h38 c10 0 14 6 14 14 v8 h-12 v-6 c0 -2 -2 -4 -4 -4 h-36 z" fill="#CBD5E1" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Rect x="42" y="12" width="12" height="14" rx="2" fill="#FF6F61" stroke={INK} strokeWidth={2} />
      <Path d="M72 54 q-5 10 0 14 q5 -4 0 -14z" fill="#5BC0EB" stroke={INK} strokeWidth={1.5} />
      <Path d="M72 74 q-5 10 0 14 q5 -4 0 -14z" fill="#5BC0EB" stroke={INK} strokeWidth={1.5} />
    </G>
  ),
  well: () => (
    <G>
      <Path d="M18 26 L50 8 L82 26 Z" fill="#FF6F61" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Line x1="26" y1="26" x2="26" y2="56" stroke={INK} strokeWidth={4} />
      <Line x1="74" y1="26" x2="74" y2="56" stroke={INK} strokeWidth={4} />
      <Line x1="26" y1="34" x2="74" y2="34" stroke="#8B5E3C" strokeWidth={3} />
      <Line x1="50" y1="34" x2="50" y2="48" stroke={INK} strokeWidth={1.5} />
      <Path d="M44 48 h12 l-2 8 h-8 z" fill="#5BC0EB" stroke={INK} strokeWidth={2} />
      <Rect x="16" y="56" width="68" height="34" rx="4" fill="#C8A27C" stroke={INK} strokeWidth={sw} />
      <Path d="M16 68 h68 M16 80 h68 M36 56 v12 M60 56 v12 M28 68 v12 M50 68 v12 M72 68 v12 M38 80 v10 M62 80 v10" stroke={INK} strokeWidth={1.5} />
    </G>
  ),
  washing: () => (
    <G>
      <Ellipse cx={50} cy={62} rx={42} ry={14} fill="#5BC0EB" stroke={INK} strokeWidth={sw} />
      <Path d="M8 62 c0 22 84 22 84 0" fill="#9BD3F5" stroke={INK} strokeWidth={sw} />
      <Path d="M30 58 c8 -16 22 -16 34 -4" fill="#FF6F61" stroke={INK} strokeWidth={2} />
      {[[28, 40, 6], [46, 30, 8], [68, 40, 6], [78, 28, 4]].map(([x, y, r], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill="#FFFFFF" stroke="#5BC0EB" strokeWidth={2} />
      ))}
    </G>
  ),
  drinking: () => (
    <G>
      <Child shirt="#2EC4B6" />
      <Path d="M58 42 h16 l-2 22 h-12 z" fill="#E6F6FF" stroke={INK} strokeWidth={2} />
      <Path d="M59 48 h14 l-1.5 15 h-11 z" fill="#9BD3F5" />
    </G>
  ),
  glassWater: () => (
    <G>
      <Path d="M24 14 h52 l-8 76 h-36 z" fill="#F1FAFF" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M27 34 h46 l-6 54 h-34 z" fill="#CFEFFF" opacity={0.7} />
      <Path d="M34 40 v36" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
      <Path d="M80 18 l6 -6 M84 28 l8 0" stroke="#FFC83D" strokeWidth={3} strokeLinecap="round" />
    </G>
  ),
  muddyWater: () => (
    <G>
      <Path d="M24 14 h52 l-8 76 h-36 z" fill="#F1FAFF" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M27 34 h46 l-6 54 h-34 z" fill="#8B6B3E" />
      <Circle cx={42} cy={60} r={4} fill="#5C4424" />
      <Circle cx={56} cy={72} r={3} fill="#5C4424" />
      <Circle cx={50} cy={48} r={2.5} fill="#5C4424" />
    </G>
  ),
  animals: () => (
    <G>
      <Path d="M10 52 h80 l-8 38 h-64 z" fill="#C8A27C" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M14 62 h72 M16 74 h68" stroke={INK} strokeWidth={1.5} />
      <Circle cx={36} cy={34} r={14} fill="#FFFFFF" stroke={INK} strokeWidth={sw} />
      <Path d="M30 20 l4 -8 l4 8 l4 -8 l2 8" fill="#FF6F61" stroke={INK} strokeWidth={2} />
      <Polygon points="50,34 58,37 50,40" fill="#FFC83D" stroke={INK} strokeWidth={1.5} />
      <Circle cx={40} cy={31} r={2.5} fill={INK} />
      <Ellipse cx={70} cy={42} rx={10} ry={13} fill="#FFF3CC" stroke={INK} strokeWidth={sw} />
    </G>
  ),
  plants: () => (
    <G>
      <Path d="M10 52 h80 l-8 38 h-64 z" fill="#C8A27C" stroke={INK} strokeWidth={sw} strokeLinejoin="round" />
      <Path d="M14 62 h72 M16 74 h68" stroke={INK} strokeWidth={1.5} />
      <Path d="M34 52 v-34" stroke="#549E2E" strokeWidth={3} />
      <Path d="M34 22 q-12 -4 -14 -14 q12 2 14 14z M34 32 q12 -4 14 -14 q-12 2 -14 14z" fill="#7BC950" stroke={INK} strokeWidth={1.5} />
      <Path d="M62 52 v-30" stroke="#549E2E" strokeWidth={3} />
      {[22, 28, 34, 40].map((y) => (
        <Ellipse key={y} cx={y % 12 ? 66 : 58} cy={y} rx={4} ry={2.5} fill="#FFE8A3" stroke={INK} strokeWidth={1} />
      ))}
    </G>
  ),
};

// ---- Characters ----
export const characters: Record<string, D> = {
  bibi: ({ mood }) => (
    <G>
      {/* tail */}
      <Path d="M74 58 q18 -10 22 -24 q-4 20 -18 30z" fill="#FFA94D" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      {/* body */}
      <Ellipse cx={50} cy={58} rx={28} ry={27} fill="#FFC83D" stroke={INK} strokeWidth={sw} />
      <Ellipse cx={46} cy={68} rx={15} ry={12} fill="#FFF3CC" />
      {/* wing */}
      <Path d="M52 56 q16 -4 20 10 q-12 8 -22 0z" fill="#FFA94D" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      {/* eye and beak (facing left) */}
      <Circle cx={40} cy={47} r={7} fill="#fff" stroke={INK} strokeWidth={2} />
      <Circle cx={38.5} cy={48} r={3.5} fill={INK} />
      <Path d="M27 52 l-15 4 l15 5 z" fill="#FF6F61" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
      <Circle cx={36} cy={60} r={3.5} fill="#FF8FA3" opacity={0.7} />
      {/* crest and legs */}
      <Path d="M46 32 q-2 -12 6 -14 M52 31 q4 -10 12 -8" stroke={INK} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Path d="M42 84 v8 M56 84 v8" stroke="#FF6F61" strokeWidth={3} strokeLinecap="round" />
      {mood === 'cheer' && <Path d="M10 20 l4 4 M90 16 l-4 4 M20 8 l2 5" stroke="#FF6F61" strokeWidth={3} strokeLinecap="round" />}
    </G>
  ),
  kiki: ({ mood }) => (
    <G>
      <Ellipse cx={50} cy={60} rx={38} ry={32} fill="#B8A4E8" stroke={INK} strokeWidth={sw} />
      <Circle cx={26} cy={28} r={8} fill="#B8A4E8" stroke={INK} strokeWidth={2.5} />
      <Circle cx={74} cy={28} r={8} fill="#B8A4E8" stroke={INK} strokeWidth={2.5} />
      <Circle cx={38} cy={44} r={5} fill={INK} />
      <Circle cx={62} cy={44} r={5} fill={INK} />
      <Ellipse cx={50} cy={70} rx={26} ry={16} fill="#D9CCF5" stroke={INK} strokeWidth={2} />
      <Circle cx={42} cy={64} r={2.5} fill={INK} />
      <Circle cx={58} cy={64} r={2.5} fill={INK} />
      {mood === 'ouch' ? (
        <Path d="M40 80 q10 -6 20 0" stroke={INK} strokeWidth={sw} fill="none" strokeLinecap="round" />
      ) : (
        <G>
          <Path d="M36 76 q14 12 28 0" stroke={INK} strokeWidth={sw} fill="#fff" strokeLinecap="round" />
          <Rect x="44" y="76" width="5" height="5" fill="#fff" stroke={INK} strokeWidth={1} />
          <Rect x="51" y="76" width="5" height="5" fill="#fff" stroke={INK} strokeWidth={1} />
        </G>
      )}
      <Path d="M70 12 c6 -6 12 0 6 6 l-6 6 l-6 -6 c-6 -6 0 -12 6 -6z" fill="#FF8FA3" />
    </G>
  ),
  sola: drawings.sun,
  breezy: ({ mood }) => (
    <G>
      <Path d="M22 70 c-14 0 -16 -22 0 -22 c0 -18 24 -24 32 -8 c8 -12 30 -6 28 10 c14 2 12 20 -2 20 z" fill="#FFFFFF" stroke={INK} strokeWidth={sw} />
      <Face cx={50} cy={56} r={14} mood={mood} />
      <Path d="M6 82 q12 -6 24 0 t24 0 M40 92 q12 -6 24 0 t24 0" stroke="#5BC0EB" strokeWidth={3} fill="none" strokeLinecap="round" />
    </G>
  ),
  dodo: ({ mood }) => (
    <G>
      <Path d="M50 8 C62 28 80 44 80 62 C80 80 66 92 50 92 C34 92 20 80 20 62 C20 44 38 28 50 8 Z" fill="#5BC0EB" stroke={INK} strokeWidth={sw} />
      <Path d="M34 50 q4 -10 10 -14" stroke="#FFFFFF" strokeWidth={4} fill="none" strokeLinecap="round" />
      <Face cx={50} cy={64} r={16} mood={mood} />
    </G>
  ),
  ada: ({ mood }) => (
    <G>
      <Path d="M28 96 v-22 c0 -12 10 -18 22 -18 s22 6 22 18 v22 z" fill="#FFFFFF" stroke={INK} strokeWidth={sw} />
      <Path d="M44 60 l6 14 l6 -14" fill="#FF6F61" />
      <Circle cx={50} cy={42} r={16} fill={SKIN} stroke={INK} strokeWidth={sw} />
      <Path d="M32 26 c-6 -14 12 -22 18 -12 c6 -10 24 -2 18 12 z" fill="#FFFFFF" stroke={INK} strokeWidth={sw} />
      <Rect x="34" y="24" width="32" height="6" fill="#FFFFFF" stroke={INK} strokeWidth={2} />
      <Circle cx={44} cy={42} r={2.2} fill={INK} />
      <Circle cx={56} cy={42} r={2.2} fill={INK} />
      {mood === 'ouch' ? (
        <Path d="M44 52 q6 -4 12 0" stroke={INK} strokeWidth={2} fill="none" />
      ) : (
        <Path d="M44 49 q6 5 12 0" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
      )}
    </G>
  ),
  joy: () => (
    <G>
      <Path d="M24 96 v-18 c0 -14 12 -20 26 -20 s26 6 26 20 v18 z" fill="#2EC4B6" stroke={INK} strokeWidth={sw} />
      <Circle cx={50} cy={40} r={18} fill={SKIN} stroke={INK} strokeWidth={sw} />
      <Path d="M30 40 c-4 -26 44 -26 40 0 c-2 -10 -10 -14 -20 -14 s-18 4 -20 14z" fill="#1E1B2E" />
      <Path d="M30 22 q20 -16 40 0 q-20 -6 -40 0z" fill="#FF6F61" stroke={INK} strokeWidth={2} />
      <Circle cx={43} cy={41} r={2.2} fill={INK} />
      <Circle cx={57} cy={41} r={2.2} fill={INK} />
      <Path d="M43 49 q7 5 14 0" stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx={32} cy={46} r={2.5} fill="#FFC83D" />
      <Circle cx={68} cy={46} r={2.5} fill="#FFC83D" />
    </G>
  ),
};

export function SvgArt({ id, size, mood }: { id: string; size: number; mood?: string }) {
  const D = drawings[id] ?? characters[id];
  if (!D) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <D mood={mood} />
    </Svg>
  );
}

export const hasDrawing = (id: string) => !!(drawings[id] ?? characters[id]);
