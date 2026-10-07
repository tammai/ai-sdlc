import { useColorScheme } from 'react-native';

// 4pt scale; inside a group < between groups < between sections.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { input: 8, card: 12 } as const;
export const font = { small: 14, body: 16, title: 20, heading: 24 } as const;
export const MIN_TARGET = 48; // ≥ 44pt iOS / 48dp Android

// Semantic tokens only; components never reference raw colors. Dark is designed, not inverted:
// tinted near-black canvas, off-white text, elevation by lighter surfaces + 1px borders.
const light = {
  background: '#F6F6F3',
  surface: '#FFFFFF',
  border: '#D8D9DE',
  text: '#1B1B1F',
  textMuted: '#5A5D66',
  primary: '#3347C6',
  onPrimary: '#FFFFFF',
  danger: '#B3261E',
  skeleton: '#E4E5E9',
};

const dark: typeof light = {
  background: '#111216',
  surface: '#1B1C22',
  border: '#33353E',
  text: '#E8E9ED',
  textMuted: '#A4A7B0',
  primary: '#AEB9FF',
  onPrimary: '#101437',
  danger: '#FFB4AB',
  skeleton: '#2A2C34',
};

export type Palette = typeof light;

export function useTheme(): Palette & { dark: boolean } {
  const dim = useColorScheme() === 'dark';
  return { ...(dim ? dark : light), dark: dim };
}
