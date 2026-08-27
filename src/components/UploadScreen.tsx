import { useRef, useState, useCallback } from 'react';
import { version } from '../../package.json';
import { ThemeSwitcher } from './ThemeSwitcher';
import { ThemeId } from '../theme';
import { GithubLink } from './GithubLink';
import { MODE_FORMATS } from '../formats';
import { FileCheckPanel, FileCheckResult } from './FileCheckPanel';

interface Props {
  onFile: (file: File, mode?: 'normal' | 'ab' | 'direction') => void;
  onCheckFile: (file: File, onProgress: (message: string) => void) => Promise<FileCheckResult>;
  onOpenFailure: (info: { fileName: string; format: string; error: string }) => void;
  progress?: string;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  experimentalAccelerationEnabled: boolean;
  experimentalAccelerationStatus: 'off' | 'loading' | 'ready' | 'error';
  onExperimentalAccelerationChange: (enabled: boolean) => void;
}

export function UploadScreen({
  onFile,
  onCheckFile,
  onOpenFailure,
  progress,
  theme,
  onThemeChange,
  experimentalAccelerationEnabled,
  experimentalAccelerationStatus,
  onExperimentalAccelerationChange,
}: Props) {
  const normalInputRef = useRef<HTMLInputElement>(null);
  const abInputRef = useRef<HTMLInputElement>(null);
  const directionInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f, 'normal');
    },
    [onFile]
  );

  return (
    <div className="upload-overlay">
      <ThemeSwitcher theme={theme} onChange={onThemeChange} />
      <GithubLink />
      <FileCheckPanel onCheck={onCheckFile} onOpenFailure={onOpenFailure} disabled={Boolean(progress)} />
      <div
        className={`upload-card ${dragOver ? 'drag-over' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="upload-icon">⚡</div>
        <h1>PulseView</h1>
          <p style={{ marginBottom: 4 }}>
            频率分析器 <span className="upload-ver">v{version}</span>
          </p>
          <p className="upload-sub">拖放 .vcd / .txt / .sr / .bin / .csv 文件到此处</p>
          <label className={`experimental-toggle ${experimentalAccelerationEnabled ? 'enabled' : ''}`}>
            <input
              type="checkbox"
              checked={experimentalAccelerationEnabled}
              disabled={experimentalAccelerationStatus === 'loading' || Boolean(progress)}
              onChange={(event) => onExperimentalAccelerationChange(event.target.checked)}
            />
            <span className="experimental-toggle-copy">
              <strong>是否启用测试性功能【可加速解析】</strong>
              <small>当前加速 AB 相与脉冲方向分析；测试性功能可能不稳定，异常时自动回退</small>
            </span>
            <span className={`experimental-status ${experimentalAccelerationStatus}`}>
              {experimentalAccelerationStatus === 'loading'
                ? '正在启用…'
                : experimentalAccelerationStatus === 'ready'
                  ? '已启用'
                  : experimentalAccelerationStatus === 'error'
                    ? '启用失败'
                    : '未启用'}
            </span>
          </label>
          <p className="sep">· · ·</p>
          <div className="upload-actions">
            <button
              className="upload-btn mode-btn"
              data-tip={`支持格式：${MODE_FORMATS.normal.formats}`}
              onClick={(e) => { e.stopPropagation(); normalInputRef.current?.click(); }}
            >
              普通频率分析
            </button>
            <button
              className="upload-btn upload-btn-alt mode-btn"
              data-tip={`支持格式：${MODE_FORMATS.ab.formats}（${MODE_FORMATS.ab.hint}）`}
              onClick={(e) => { e.stopPropagation(); abInputRef.current?.click(); }}
            >
              分析 AB 相数据文件
            </button>
            <button
              className="upload-btn upload-btn-alt mode-btn"
              data-tip={`支持格式：${MODE_FORMATS.direction.formats}（${MODE_FORMATS.direction.hint}）`}
              onClick={(e) => { e.stopPropagation(); directionInputRef.current?.click(); }}
            >
              分析脉冲 + 方向 VCD
            </button>
          </div>
          <input
            ref={normalInputRef}
            type="file"
            accept=".vcd,.txt,.csv,.sr,.bin"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f, 'normal'); e.currentTarget.value = ''; }}
          />
          <input
            ref={abInputRef}
            type="file"
            accept=".vcd"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f, 'ab'); e.currentTarget.value = ''; }}
          />
          <input
            ref={directionInputRef}
            type="file"
            accept=".vcd"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f, 'direction'); e.currentTarget.value = ''; }}
          />
          {progress && (
            <div className="upload-progress">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: progress ? '80%' : '5%' }} />
              </div>
              <div className="progress-label">{progress}</div>
            </div>
          )}
      </div>
    </div>
  );
}
