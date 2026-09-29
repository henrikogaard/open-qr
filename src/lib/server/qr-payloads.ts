/**
 * Encoders for static QR content types (WiFi, vCard, calendar event, email,
 * SMS, geo, plain text).
 *
 * Static codes encode their payload directly — no short URL, no redirect, no
 * scan tracking. They are not URLs our redirector will ever send a scanner
 * to, so they bypass the URL allow-list/blacklist; instead each builder
 * validates and length-caps its own fields so a payload can't balloon into
 * an unscannable 10k-module QR.
 */

export type StaticKind = 'text' | 'wifi' | 'vcard' | 'event' | 'email' | 'sms' | 'geo';

export const STATIC_KINDS: StaticKind[] = ['text', 'wifi', 'vcard', 'event', 'email', 'sms', 'geo'];

export function isStaticKind(kind: unknown): kind is StaticKind {
  return typeof kind === 'string' && (STATIC_KINDS as string[]).includes(kind);
}

/** Total cap on any encoded payload — keeps QRs dense-but-scannable. */
export const MAX_PAYLOAD_LENGTH = 1200;

class ValidationError extends Error {}
export { ValidationError as PayloadValidationError };

function str(value: unknown, max: number, field: string, required = false): string {
  if (value === undefined || value === null) {
    if (required) throw new ValidationError(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  const s = value.trim();
  if (required && !s) throw new ValidationError(`${field} is required`);
  if (s.length > max) throw new ValidationError(`${field} must be ${max} characters or fewer`);
  return s;
}

/** Wi-Fi Alliance escaping for WIFI: payloads. */
function escapeWifi(s: string): string {
  return s.replace(/([\\;,:"])/g, '\\$1');
}

export interface WifiPayload {
  ssid: string;
  password: string;
  encryption: 'WPA' | 'WEP' | 'nopass';
  hidden: boolean;
}

export function buildWifiPayload(input: unknown): string {
  const v = (input ?? {}) as Record<string, unknown>;
  const ssid = str(v.ssid, 64, 'Network name (SSID)', true);
  const password = str(v.password, 96, 'Password');
  const encryption = v.encryption === 'WEP' ? 'WEP' : v.encryption === 'nopass' ? 'nopass' : 'WPA';
  const hidden = v.hidden === true || v.hidden === 'true';

  if (encryption !== 'nopass' && !password) {
    throw new ValidationError('Password is required for WPA/WEP networks');
  }

  let payload = `WIFI:T:${encryption};S:${escapeWifi(ssid)};`;
  if (encryption !== 'nopass') payload += `P:${escapeWifi(password)};`;
  if (hidden) payload += 'H:true;';
  payload += ';';
  return payload;
}

/** vCard 3.0 (RFC 2426) value escaping: backslash, semicolon, comma. */
function escapeVcard(s: string): string {
  return s.replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

export interface VcardPayload {
  firstName: string;
  lastName: string;
  org: string;
  title: string;
  phone: string;
  email: string;
  url: string;
  address: string;
  note: string;
}

export function buildVcardPayload(input: unknown): string {
  const v = (input ?? {}) as Record<string, unknown>;
  const firstName = str(v.firstName, 64, 'First name');
  const lastName = str(v.lastName, 64, 'Last name');
  const org = str(v.org, 80, 'Organization');
  const title = str(v.title, 80, 'Job title');
  const phone = str(v.phone, 32, 'Phone');
  const email = str(v.email, 96, 'Email');
  const url = str(v.url, 200, 'Website');
  const address = str(v.address, 200, 'Address');
  const note = str(v.note, 200, 'Note');

  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  if (!fullName) throw new ValidationError('First or last name is required');
  if (!phone && !email && !url) {
    throw new ValidationError('At least one contact field is required (phone, email or website)');
  }

  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcard(fullName)}`];
  const n = [lastName, firstName, '', '', ''].map((part) => escapeVcard(part ?? ''));
  lines.push(`N:${n.join(';')}`);
  if (org) lines.push(`ORG:${escapeVcard(org)}`);
  if (title) lines.push(`TITLE:${escapeVcard(title)}`);
  if (phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(phone)}`);
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(email)}`);
  if (url) lines.push(`URL:${escapeVcard(url)}`);
  if (address) lines.push(`ADR;TYPE=WORK:;;${escapeVcard(address)};;;;`);
  if (note) lines.push(`NOTE:${escapeVcard(note)}`);
  lines.push('END:VCARD');
  return lines.join('\n');
}

/** ICS escaping: semicolon, comma, newline (newlines fold as literal \n). */
function escapeIcs(s: string): string {
  return s.replace(/([;,])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

/**
 * Accepts datetime-local strings (YYYY-MM-DDTHH:mm). All-day events pass a
 * plain date (YYYY-MM-DD). Floating local times are emitted without a UTC
 * designator, which phones interpret in the scanner's own timezone — the
 * least surprising choice for e.g. posters with local start times.
 */
function icsDate(value: string, isAllDay: boolean): string {
  if (isAllDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new ValidationError('Invalid date/time format');
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}00`;
}

export interface EventPayload {
  title: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
  description: string;
}

export function buildEventPayload(input: unknown): string {
  const v = (input ?? {}) as Record<string, unknown>;
  const title = str(v.title, 96, 'Event title', true);
  const location = str(v.location, 120, 'Location');
  const start = str(v.start, 32, 'Start', true);
  const end = str(v.end, 32, 'End');
  const allDay = v.allDay === true || v.allDay === 'true';
  const description = str(v.description, 300, 'Description');

  const lines = [
    'BEGIN:VEVENT',
    `SUMMARY:${escapeIcs(title)}`,
    `DTSTART:${icsDate(start, allDay)}`
  ];
  if (end) lines.push(`DTEND:${icsDate(end, allDay)}`);
  if (location) lines.push(`LOCATION:${escapeIcs(location)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
  lines.push('END:VEVENT');
  return lines.join('\n');
}

export function buildEmailPayload(input: unknown): string {
  const v = (input ?? {}) as Record<string, unknown>;
  const to = str(v.to, 96, 'Email address', true);
  const subject = str(v.subject, 120, 'Subject');
  const body = str(v.body, 400, 'Message');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new ValidationError('Invalid email address');

  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const qs = params.toString();
  return `mailto:${to}${qs ? `?${qs}` : ''}`;
}

export function buildSmsPayload(input: unknown): string {
  const v = (input ?? {}) as Record<string, unknown>;
  const phone = str(v.phone, 32, 'Phone number', true);
  const message = str(v.message, 300, 'Message');
  if (!/^[+\d][\d\s\-()]{2,}$/.test(phone)) throw new ValidationError('Invalid phone number');
  // SMSTO:<number>:<message> — the form virtually every phone camera app reads.
  return `SMSTO:${phone.replace(/[\s\-()]/g, '')}:${message}`;
}

export function buildGeoPayload(input: unknown): string {
  const v = (input ?? {}) as Record<string, unknown>;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new ValidationError('Invalid latitude');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new ValidationError('Invalid longitude');
  return `geo:${lat},${lng}`;
}

export function buildTextPayload(input: unknown): string {
  const v = (input ?? {}) as Record<string, unknown>;
  const text = str(v.text, MAX_PAYLOAD_LENGTH, 'Text', true);
  return text;
}

export function buildStaticPayload(kind: StaticKind, input: unknown): string {
  let payload: string;
  switch (kind) {
    case 'wifi':
      payload = buildWifiPayload(input);
      break;
    case 'vcard':
      payload = buildVcardPayload(input);
      break;
    case 'event':
      payload = buildEventPayload(input);
      break;
    case 'email':
      payload = buildEmailPayload(input);
      break;
    case 'sms':
      payload = buildSmsPayload(input);
      break;
    case 'geo':
      payload = buildGeoPayload(input);
      break;
    case 'text':
      payload = buildTextPayload(input);
      break;
  }
  if (payload.length > MAX_PAYLOAD_LENGTH) {
    throw new ValidationError(
      `Encoded content is too long for a scannable QR (${payload.length} characters; max ${MAX_PAYLOAD_LENGTH})`
    );
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Decoders — best-effort reverse of the builders above so the edit form can
// be pre-filled from the stored payload. Returns null when the payload can't
// be parsed back (e.g. hand-edited); the UI then asks for a re-create.

function unescapeWifi(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

function decodeWifi(payload: string): Record<string, unknown> | null {
  if (!payload.startsWith('WIFI:')) return null;
  const fields: Record<string, string> = {};
  // Split on unescaped semicolons.
  const parts = payload
    .slice(5)
    .split(/(?<!\\);/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    fields[part.slice(0, idx)] = unescapeWifi(part.slice(idx + 1));
  }
  if (!fields.S) return null;
  return {
    ssid: fields.S,
    password: fields.P || '',
    encryption: fields.T === 'WEP' ? 'WEP' : fields.T === 'nopass' ? 'nopass' : 'WPA',
    hidden: fields.H === 'true'
  };
}

function unescapeVcard(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\(.)/g, '$1');
}

function decodeVcard(payload: string): Record<string, unknown> | null {
  if (!payload.startsWith('BEGIN:VCARD')) return null;
  const map = new Map<string, string>();
  for (const line of payload.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    map.set(line.slice(0, idx).toUpperCase(), line.slice(idx + 1));
  }
  if (!map.has('FN')) return null;
  // We always emit N: — use it when present; otherwise split FN heuristically.
  let firstName = '';
  let lastName = unescapeVcard(map.get('FN') || '');
  const n = map.get('N');
  if (typeof n === 'string') {
    const parts = n.split(';').map(unescapeVcard);
    lastName = parts[0] || '';
    firstName = parts[1] || '';
  } else {
    const names = lastName.split(' ');
    if (names.length > 1) {
      lastName = names.pop() || '';
      firstName = names.join(' ');
    }
  }
  return {
    firstName,
    lastName,
    org: unescapeVcard(map.get('ORG') || ''),
    title: unescapeVcard(map.get('TITLE') || ''),
    phone: unescapeVcard(map.get('TEL;TYPE=CELL') || map.get('TEL') || ''),
    email: unescapeVcard(map.get('EMAIL;TYPE=INTERNET') || map.get('EMAIL') || ''),
    url: unescapeVcard(map.get('URL') || ''),
    address: unescapeVcard(map.get('ADR;TYPE=WORK') || '').replace(/^;;/, ''),
    note: unescapeVcard(map.get('NOTE') || '')
  };
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\(.)/g, '$1');
}

function decodeEvent(payload: string): Record<string, unknown> | null {
  if (!payload.startsWith('BEGIN:VEVENT')) return null;
  const map = new Map<string, string>();
  for (const line of payload.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    map.set(line.slice(0, idx).toUpperCase(), line.slice(idx + 1));
  }
  const start = map.get('DTSTART');
  if (!start) return null;
  return {
    title: unescapeIcs(map.get('SUMMARY') || ''),
    location: unescapeIcs(map.get('LOCATION') || ''),
    start: icsToLocalInput(start),
    end: map.get('DTEND') ? icsToLocalInput(map.get('DTEND')!) : '',
    allDay: !start.includes('T'),
    description: unescapeIcs(map.get('DESCRIPTION') || '')
  };
}

/** 20260501T130000 / 20260501 → datetime-local / date input value. */
function icsToLocalInput(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(value);
  if (!m) return '';
  return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

function decodeEmail(payload: string): Record<string, unknown> | null {
  if (!payload.startsWith('mailto:')) return null;
  try {
    const u = new URL(payload);
    return {
      to: u.pathname.replace(/^mailto:/i, '') || (payload.slice(7).split('?')[0] || ''),
      subject: u.searchParams.get('subject') || '',
      body: u.searchParams.get('body') || ''
    };
  } catch {
    return null;
  }
}

function decodeSms(payload: string): Record<string, unknown> | null {
  if (!payload.startsWith('SMSTO:')) return null;
  const rest = payload.slice(6);
  const idx = rest.indexOf(':');
  if (idx === -1) return { phone: rest, message: '' };
  return { phone: rest.slice(0, idx), message: rest.slice(idx + 1) };
}

function decodeGeo(payload: string): Record<string, unknown> | null {
  const m = /^geo:(-?[\d.]+),(-?[\d.]+)/.exec(payload);
  if (!m) return null;
  return { lat: m[1], lng: m[2] };
}

export function decodeStaticPayload(
  kind: StaticKind,
  payload: string
): Record<string, unknown> | null {
  switch (kind) {
    case 'wifi':
      return decodeWifi(payload);
    case 'vcard':
      return decodeVcard(payload);
    case 'event':
      return decodeEvent(payload);
    case 'email':
      return decodeEmail(payload);
    case 'sms':
      return decodeSms(payload);
    case 'geo':
      return decodeGeo(payload);
    case 'text':
      return { text: payload };
  }
}
