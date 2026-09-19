// Best-effort E.164 normalization. Returns null if it can't produce something
// plausible. Assumes North America for bare 10-digit inputs.
export function normalizeE164(input: string): string | null {
  if (!input) return null;
  const s = input.trim().replace(/[\s\-().]/g, '');

  if (s.startsWith('+')) {
    return /^\+\d{7,15}$/.test(s) ? s : null;
  }
  if (/^\d{10}$/.test(s)) return `+1${s}`;
  if (/^1\d{10}$/.test(s)) return `+${s}`;
  if (/^\d{7,15}$/.test(s)) return `+${s}`;
  return null;
}
