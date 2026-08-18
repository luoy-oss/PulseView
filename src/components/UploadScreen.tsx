import { useRef, useState, useCallback } from 'react';
import { version } from '../../package.json';

interface Props {
  onFile: (file: File, mode?: 'normal' | 'ab') => void;
  progress?: string;
}

export function UploadScreen({ onFile, progress }: Props) {
  const normalInputRef = useRef<HTMLInputElement>(null);
  const abInputRef = useRef<HTMLInputElement>(null);
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
      <div
        className={`upload-card ${dragOver ? 'drag-over' : ''}`}
        onClick={() => normalInputRef.current?.click()}
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
        <p className="sep">· · ·</p>
        <div className="upload-actions">
          <button className="upload-btn" onClick={(e) => { e.stopPropagation(); normalInputRef.current?.click(); }}>
            普通频率分析
          </button>
          <button className="upload-btn upload-btn-alt" onClick={(e) => { e.stopPropagation(); abInputRef.current?.click(); }}>
            分析 AB 相数据文件
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
