export const Colors = {
  light: {
    text: '#1a1a1a',
    background: '#fff',
    tint: '#2f95dc',
    tabIconDefault: '#999',
    tabIconSelected: '#2f95dc',
    buttonSecondaryBg: '#eef4fb',
    buttonSecondaryText: '#1a1a1a',
    buttonSecondaryBorder: '#c5d4e8',
  },
  dark: {
    text: '#f0f0f0',
    background: '#000',
    tint: '#4da3ff',
    tabIconDefault: '#888',
    tabIconSelected: '#4da3ff',
    buttonSecondaryBg: '#2a3140',
    buttonSecondaryText: '#e8eef7',
    buttonSecondaryBorder: '#3d4657',
  },
} as const;

export type ColorSchemeName = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorSchemeName];

export function getColors(scheme: string | null | undefined): ThemeColors {
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
