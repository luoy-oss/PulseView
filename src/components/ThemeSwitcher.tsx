import { THEME_OPTIONS, ThemeId } from '../theme';

interface Props {
  theme: ThemeId;
  onChange: (theme: ThemeId) => void;
  compact?: boolean;
}

export function ThemeSwitcher({ theme, onChange, compact = false }: Props) {
  return (
    <label className={`theme-switcher ${compact ? 'theme-switcher-compact' : ''}`}>
      <span className="theme-label">配色</span>
      <select value={theme} onChange={(event) => onChange(event.target.value as ThemeId)} aria-label="选择配色主题">
        {THEME_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}
