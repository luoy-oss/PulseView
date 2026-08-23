export type ThemeId = 'default' | 'reference' | 'claude';

export interface ThemeColors {
  accent: string;
  teal: string;
  green: string;
  rose: string;
  text: string;
  text2: string;
  text3: string;
  bg: string;
  surface: string;
  border: string;
  tooltip: string;
  tooltipTitle: string;
  tooltipBody: string;
}

export const THEME_OPTIONS: Array<{ id: ThemeId; label: string; note: string }> = [
  { id: 'default', label: '经典暗色', note: 'Amber / Teal' },
  { id: 'reference', label: '工程纸张', note: 'Ink / Paper / Orange' },
  { id: 'claude', label: 'Claude 暖棕', note: 'Terracotta / Sand' },
];

export const THEME_COLORS: Record<ThemeId, ThemeColors> = {
  default: {
    accent: '#d4a24e', teal: '#4ecdc4', green: '#7ec699', rose: '#e06c75',
    text: '#e8e4f0', text2: '#9a93a8', text3: '#5c5668', bg: '#0c0b0f',
    surface: '#17151c', border: '#2a2735', tooltip: 'rgba(23,21,28,0.96)',
    tooltipTitle: '#ffffff', tooltipBody: '#e8e4f0',
  },
  reference: {
    accent: '#d34b28', teal: '#176f89', green: '#357250', rose: '#a63c2a',
    text: '#19232c', text2: '#46545a', text3: '#6f7b7d', bg: '#f3f1ea',
    surface: '#ffffff', border: '#c9c6b9', tooltip: 'rgba(25,35,44,0.96)',
    tooltipTitle: '#ffffff', tooltipBody: '#e8eee9',
  },
  claude: {
    accent: '#c15f3c', teal: '#5d7c78', green: '#6f8065', rose: '#b85c5c',
    text: '#31251f', text2: '#75665c', text3: '#9b8b80', bg: '#f4eee7',
    surface: '#fffaf4', border: '#d8cbbd', tooltip: 'rgba(49,37,31,0.96)',
    tooltipTitle: '#ffffff', tooltipBody: '#fff7f0',
  },
};

export function getInitialTheme(): ThemeId {
  const saved = window.localStorage.getItem('pulseview-theme');
  return saved === 'reference' || saved === 'claude' || saved === 'default' ? saved : 'default';
}
