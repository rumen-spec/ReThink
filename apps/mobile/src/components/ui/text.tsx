import { StyleSheet, Text, type TextProps } from 'react-native';

import { T, Type } from '@/constants/theme';

type P = TextProps & { color?: string };
const mk = (base: object) => ({ style, color, ...p }: P) => <Text {...p} style={[base, color ? { color } : null, style]} />;

/** 48/600, tabular. The one loud number on a screen. */
export const Hero = mk({ fontSize: Type.hero, lineHeight: 54, fontWeight: '600', color: T.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.5 });
export const Title = mk({ fontSize: Type.title, lineHeight: 28, fontWeight: '600', color: T.ink });
export const Body = mk({ fontSize: Type.body, lineHeight: 22, fontWeight: '400', color: T.ink });
export const Secondary = mk({ fontSize: Type.secondary, lineHeight: 20, fontWeight: '400', color: T.muted });
export const Caption = mk({ fontSize: Type.caption, lineHeight: 18, fontWeight: '400', color: T.muted });
/** Money in rows: 17/600 tabular. Pass `formatCad(...)` output only. */
export const Money = mk({ fontSize: Type.body, lineHeight: 22, fontWeight: '600', color: T.ink, fontVariant: ['tabular-nums'] });
/** Inline text action (section header "All", "Details"). */
export const Link = mk({ fontSize: Type.secondary, lineHeight: 20, fontWeight: '600', color: T.accent });

export const textStyles = StyleSheet.create({ center: { textAlign: 'center' } });
