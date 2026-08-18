import { useRef, useState, useCallback } from 'react';
import { version } from '../../package.json';

interface Props {
  onFile: (file: File) => void;
  progress?: string;
}

export function UploadScreen({ onFile, progress }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  return (
    <div className="upload-overlay">
      <div
        className={`upload-card ${dragOver ? 'drag-over' : ''}`}
        onClick={() => inputRef.current?.click()}
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
        <label
          className="upload-btn"
          onClick={(e) => e.stopPropagation()}
        >
          选择文件
          <input
            ref={inputRef}
            type="file"
            accept=".vcd,.txt,.csv,.sr,.bin"
            hidden
            onChange={handleInput}
          />
        </label>
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
