// Display helpers for the terminal dashboard.

// +1XXXXXXXXXX -> "+1 (XXX) XXX-XXXX"
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

// Best-effort area-code -> short region tag; falls back to AC-<code>.
const AREA_TAGS: Record<string, string> = {
  '212': 'NY-METRO', '646': 'NY-METRO', '415': 'SF-BAY', '408': 'SV-SOUTH',
  '512': 'ATX-CORE', '312': 'CHI-LOOP', '206': 'SEA-TECH', '305': 'MIA-DADE',
  '213': 'LA-CORE', '617': 'BOS-HUB', '702': 'LV-STRIP', '303': 'DEN-MTN',
};
export function areaTag(e164: string): string {
  const m = /^\+1(\d{3})/.exec(e164);
  const code = m?.[1];
  if (!code) return 'INTL';
  return AREA_TAGS[code] ?? `AC-${code}`;
}

// email -> operator handle, e.g. "alex.c@office" -> "ALEX.C"
export function opHandle(email: string | null | undefined): string {
  if (!email) return 'UNASSIGNED';
  return (email.split('@')[0] ?? email).toUpperCase();
}

// Relative time -> "JUST NOW" / "2M AGO" / "4H AGO" / "3D AGO"
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'NEVER';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 45_000) return 'JUST NOW';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}M AGO`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}H AGO`;
  return `${Math.floor(hrs / 24)}D AGO`;
}

// Timestamp -> "HH:MM AM" in UTC+6 (Asia/Dhaka has no DST).
export function timeUtc6(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Zero-pad to 3 digits like the reference (142, 089, 000).
export function pad3(n: number): string {
  return String(n).padStart(3, '0');
}
