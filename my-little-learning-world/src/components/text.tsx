import React from 'react';
import { Text as RNText, StyleSheet, type TextProps } from 'react-native';

// Every child-facing word uses the rounded Baloo 2 typeface, embedded in the app.
// fontWeight is mapped to the matching font file (Android ignores weight with custom fonts).
const FACE: Record<string, string> = {
  '400': 'Baloo2_500Medium', '500': 'Baloo2_500Medium', '600': 'Baloo2_600SemiBold',
  '700': 'Baloo2_700Bold', '800': 'Baloo2_800ExtraBold', '900': 'Baloo2_800ExtraBold',
  normal: 'Baloo2_500Medium', bold: 'Baloo2_700Bold',
};

export function Text(props: TextProps) {
  const flat = StyleSheet.flatten(props.style) ?? {};
  const w = String((flat as any).fontWeight ?? '600');
  const family = FACE[w] ?? 'Baloo2_600SemiBold';
  const style = [props.style, { fontFamily: family, fontWeight: 'normal' as const, includeFontPadding: false }];
  return <RNText allowFontScaling={false} {...props} style={style} />;
}

export const FONT_FILES = {
  Baloo2_500Medium: require('../../assets/fonts/Baloo2_500Medium.ttf'),
  Baloo2_600SemiBold: require('../../assets/fonts/Baloo2_600SemiBold.ttf'),
  Baloo2_700Bold: require('../../assets/fonts/Baloo2_700Bold.ttf'),
  Baloo2_800ExtraBold: require('../../assets/fonts/Baloo2_800ExtraBold.ttf'),
};
