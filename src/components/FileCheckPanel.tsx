import { useCallback, useRef, useState } from 'react';
import { FORMAT_LABELS } from '../formats.ts';

export interface FileCheckResult {
  ok: boolean;
  format: 'vcd' | 'txt' | 'sr' | 'saleae';
  reason?: string;
  samplingRate?: number;
  sampleCount?: number;
  pointCount?: number;
}

interface Props {
  onCheck: (file: File, onProgress: (message: string) => void) => Promise<FileCheckResult>;
  onOpenFailure: (info: { fileName: string; format: string; error: string }) => void;
  disabled?: boolean;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'checking'; progress: string }
  | { kind: 'ok'; result: FileCheckResult }
  | { kind: 'fail'; result: FileCheckResult; fileName: string };

export function FileCheckPanel({ onCheck, onOpenFailure, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [fileName, setFileName] = useState('');

  const run = useCallback(async (file: File) => {
    setFileName(file.name);
    setStatus({ kind: 'checking', progress: '读取文件…' });
    try {
      const result = await onCheck(file, (message) => {
        setStatus({ kind: 'checking', progress: message });
      });
      setStatus(result.ok ? { kind: 'ok', result } : { kind: 'fail', result, fileName: file.name });
    } catch (error) {
      setStatus({
        kind: 'fail',
        result: {
          ok: false,
          format: 'txt',
          reason: error instanceof Error ? error.message : String(error),
        },
        fileName: file.name,
      });
    }
  }, [onCheck]);

  return (
    <aside className="upload-check">
      <h2>检验文件是否可分析</h2>
      <p className="upload-check-sub">
        选择文件后在后台完整解析，无需进入分析页；解析失败可提交 Issue 请作者适配。
      </p>
      <button
        type="button"
        className="btn btn-p upload-check-btn"
        disabled={disabled || status.kind === 'checking'}
        onClick={() => inputRef.current?.click()}
      >
        {status.kind === 'checking' ? '正在解析…' : '选择文件并检验'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".vcd,.txt,.csv,.sr,.bin"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void run(file);
          event.currentTarget.value = '';
        }}
      />
      <div className="upload-check-status">
        {status.kind === 'idle' && <span className="check-idle">未选择文件</span>}
        {status.kind === 'checking' && (
          <span className="check-progress">{status.progress}</span>
        )}
        {status.kind === 'ok' && (
          <div className="check-ok">
            <div className="check-result-title">✓ 可分析</div>
            <dl className="check-metrics">
              <dt>格式</dt><dd>{FORMAT_LABELS[status.result.format] ?? status.result.format}</dd>
              {status.result.samplingRate !== undefined && (
                <><dt>采样率</dt><dd>{status.result.samplingRate.toLocaleString()} Hz</dd></>
              )}
              {status.result.sampleCount !== undefined && (
                <><dt>样本数</dt><dd>{status.result.sampleCount.toLocaleString()}</dd></>
              )}
              {status.result.pointCount !== undefined && (
                <><dt>频率点数</dt><dd>{status.result.pointCount.toLocaleString()}</dd></>
              )}
            </dl>
            {fileName && <div className="check-file-name">{fileName}</div>}
          </div>
        )}
        {status.kind === 'fail' && (
          <div className="check-fail">
            <div className="check-result-title">✗ 无法分析</div>
            <div className="check-reason">{status.result.reason}</div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onOpenFailure({
                fileName: status.fileName,
                format: status.result.format,
                error: status.result.reason ?? '未知错误',
              })}
            >
              查看 Issue 提交引导
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
