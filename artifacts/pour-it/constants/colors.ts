export type AppMode = 'spirits' | 'thc' | 'mocktails';

export const MODE_COLORS: Record<AppMode, string> = {
  spirits: '#D4A843',
  thc: '#7C3AED',
  mocktails: '#10B981',
};

export const MODE_LABELS: Record<AppMode, string> = {
  spirits: 'Spirits',
  thc: 'THC',
  mocktails: 'Mocktails',
};

const colors = {
  dark: {
    text: '#FFFFFF',
    tint: '#D4A843',
    background: '#0A0A0F',
    foreground: '#FFFFFF',
    card: 'rgba(255,255,255,0.07)',
    cardForeground: '#FFFFFF',
    primary: '#D4A843',
    primaryForeground: '#0A0A0F',
    secondary: 'rgba(255,255,255,0.10)',
    secondaryForeground: '#FFFFFF',
    muted: 'rgba(255,255,255,0.08)',
    mutedForeground: 'rgba(255,255,255,0.40)',
    accent: '#D4A843',
    accentForeground: '#0A0A0F',
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',
    border: 'rgba(255,255,255,0.12)',
    input: 'rgba(255,255,255,0.10)',
    spiritsAccent: '#D4A843',
    thcAccent: '#7C3AED',
    mocktailAccent: '#10B981',
  },
  light: {
    text: '#FFFFFF',
    tint: '#D4A843',
    background: '#0A0A0F',
    foreground: '#FFFFFF',
    card: 'rgba(255,255,255,0.07)',
    cardForeground: '#FFFFFF',
    primary: '#D4A843',
    primaryForeground: '#0A0A0F',
    secondary: 'rgba(255,255,255,0.10)',
    secondaryForeground: '#FFFFFF',
    muted: 'rgba(255,255,255,0.08)',
    mutedForeground: 'rgba(255,255,255,0.40)',
    accent: '#D4A843',
    accentForeground: '#0A0A0F',
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',
    border: 'rgba(255,255,255,0.12)',
    input: 'rgba(255,255,255,0.10)',
    spiritsAccent: '#D4A843',
    thcAccent: '#7C3AED',
    mocktailAccent: '#10B981',
  },
  radius: 16,
};

export default colors;
