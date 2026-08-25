export function fmtFreq(f: number): string {
  if (f >= 1e9) return (f / 1e9).toPrecision(6) + ' GHz';
  if (f >= 1e6) return (f / 1e6).toPrecision(6) + ' MHz';
  if (f >= 1e3) return (f / 1e3).toPrecision(6) + ' kHz';
  return f.toPrecision(6) + ' Hz';
}

export function fmtFreqShort(f: number): string {
  if (f >= 1e9) return (f / 1e9).toFixed(2) + 'G';
  if (f >= 1e6) return (f / 1e6).toFixed(2) + 'M';
  if (f >= 1e3) return (f / 1e3).toFixed(2) + 'k';
  return f.toFixed(2);
}

export function fmtTime(s: number): string {
  if (Math.abs(s) < 1e-9) return (s * 1e12).toPrecision(4) + ' ps';
  if (Math.abs(s) < 1e-6) return (s * 1e9).toPrecision(4) + ' ns';
  if (Math.abs(s) < 1e-3) return (s * 1e6).toPrecision(4) + ' μs';
  if (Math.abs(s) < 1) return (s * 1e3).toPrecision(4) + ' ms';
  return s.toPrecision(4) + ' s';
}

export function fmtTimeShort(s: number): string {
  if (Math.abs(s) < 1e-9) return (s * 1e12).toFixed(1) + 'ps';
  if (Math.abs(s) < 1e-6) return (s * 1e9).toFixed(1) + 'ns';
  if (Math.abs(s) < 1e-3) return (s * 1e6).toFixed(1) + 'μs';
  if (Math.abs(s) < 1) return (s * 1e3).toFixed(2) + 'ms';
  return s.toFixed(3) + 's';
}

export function fmtRate(r: number): string {
  const ar = Math.abs(r);
  if (ar >= 1e9) return (r / 1e9).toPrecision(3) + ' GHz/s';
  if (ar >= 1e6) return (r / 1e6).toPrecision(3) + ' MHz/s';
  if (ar >= 1e3) return (r / 1e3).toPrecision(3) + ' kHz/s';
  return r.toPrecision(3) + ' Hz/s';
}

export function fmtRateShort(r: number): string {
  const ar = Math.abs(r);
  if (ar >= 1e9) return (r / 1e9).toFixed(2) + 'G';
  if (ar >= 1e6) return (r / 1e6).toFixed(2) + 'M';
  if (ar >= 1e3) return (r / 1e3).toFixed(2) + 'k';
  return r.toFixed(2);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function detectFormat(file: File): 'vcd' | 'txt' | 'sr' | 'saleae' {
  const name = file.name.toLowerCase();
  if (name.endsWith('.vcd')) return 'vcd';
  if (name.endsWith('.sr')) return 'sr';
  if (name.endsWith('.bin') || name.endsWith('.csv')) return 'saleae';
  return 'txt';
}
