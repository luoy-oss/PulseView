import { useState } from 'react';
import { buildIssueUrl, FORMAT_LABELS } from '../formats.ts';

interface Props {
  fileName: string;
  format: string;
  error: string;
  onClose: () => void;
}

export function ParseFailureModal({ fileName, format, error, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const issueUrl = buildIssueUrl({ fileName, format, error });

  const copyIssueText = async () => {
    const text = `标题：无法解析文件：${fileName}\n\n当前版本无法解析此文件，请作者适配。\n检测格式：${FORMAT_LABELS[format] ?? format}\n错误信息：\n${error}\n\n附件为无法分析的文件。`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="无法分析该文件" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>×</button>
        <h2>无法分析该文件</h2>
        <p className="modal-file">
          {fileName}
          <span className="modal-format">{FORMAT_LABELS[format] ?? format}</span>
        </p>
        <pre className="modal-error">{error}</pre>
        <p className="modal-hint">
          文件可能来自尚未适配的导出格式或版本变体。请在 GitHub 提交 Issue 请作者适配，
          <strong>并务必附上无法分析的文件</strong>。
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-p" onClick={() => window.open(issueUrl, '_blank', 'noopener')}>
            打开 Issue 页面
          </button>
          <button type="button" className="btn btn-sm" onClick={copyIssueText}>
            {copied ? '已复制' : '复制 Issue 文案'}
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
