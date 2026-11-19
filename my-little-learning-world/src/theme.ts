// Design tokens: one place for every colour, size and radius in the app.
export const colors = {
  cream: '#FFF8EC',
  creamDeep: '#FBEBD0',
  ink: '#2B2A4C',
  inkSoft: '#5B5A7A',
  coral: '#FF6F61',
  sun: '#FFC83D',
  sky: '#5BC0EB',
  aqua: '#2EC4B6',
  leaf: '#7BC950',
  amber: '#FFA94D',
  lilac: '#9B7EDE',
  slate: '#475569',
  slateLight: '#E2E8F0',
  white: '#FFFFFF',
};

export type WorldColor = { base: string; tint: string; dark: string };

export const worldColors: Record<string, WorldColor> = {
  body: { base: '#FF6F61', tint: '#FFE3DF', dark: '#D9483B' },
  sun: { base: '#FFC83D', tint: '#FFF3CC', dark: '#E0A100' },
  air: { base: '#5BC0EB', tint: '#DDF2FB', dark: '#2E95C2' },
  water: { base: '#2EC4B6', tint: '#D6F5F2', dark: '#1A988C' },
  food: { base: '#7BC950', tint: '#E6F6DC', dark: '#549E2E' },
};

export const radius = { sm: 16, md: 24, lg: 32, pill: 999 };
export const space = (n: number) => n * 8;

// Child touch targets are deliberately large (adult minimum is 48dp).
export const touch = { min: 80, tile: 150 };

export const font = {
  title: { fontSize: 34, fontWeight: '800' as const, color: colors.ink },
  label: { fontSize: 24, fontWeight: '800' as const, color: colors.ink },
  body: { fontSize: 18, fontWeight: '600' as const, color: colors.ink },
  small: { fontSize: 15, fontWeight: '600' as const, color: colors.inkSoft },
};
