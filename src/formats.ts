export type AnalysisMode = 'normal' | 'ab' | 'direction';

export const MODE_FORMATS: Record<AnalysisMode, { label: string; formats: string; hint: string }> = {
  normal: {
    label: '普通频率分析',
    formats: '.vcd / .txt / .sr / .bin / .csv',
    hint: '',
  },
  ab: {
    label: '分析 AB 相数据文件',
    formats: '.vcd',
    hint: '需包含至少 2 个单比特 $var 通道',
  },
  direction: {
    label: '分析脉冲 + 方向 VCD',
    formats: '.vcd',
    hint: '需包含脉冲源与方向源通道',
  },
};

export const FORMAT_LABELS: Record<string, string> = {
  vcd: 'VCD',
  txt: 'TXT',
  sr: 'SR',
  saleae: 'BIN/CSV',
};

const GITHUB_REPO_URL = 'https://github.com/luoy-oss/PulseView';

export function buildIssueUrl(info: { fileName: string; format: string; error: string }): string {
  const title = `无法解析文件：${info.fileName}`;
  const body = [
    '## 无法分析的文件',
    `- 文件名：${info.fileName}`,
    `- 检测格式：${info.format}`,
    `- 错误信息：`,
    '```',
    info.error,
    '```',
    '',
    '## 说明',
    '当前版本无法解析此文件，请作者适配该导出格式或版本变体。',
    '提交前请把无法分析的文件拖入本 Issue 的附件区。',
  ].join('\n');
  const url = new URL('issues/new', GITHUB_REPO_URL + '/');
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  return url.toString();
}
