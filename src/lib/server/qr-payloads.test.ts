import { describe, it, expect } from 'vitest';
import {
  buildStaticPayload,
  buildWifiPayload,
  buildVcardPayload,
  buildEventPayload,
  buildEmailPayload,
  buildSmsPayload,
  buildGeoPayload,
  decodeStaticPayload,
  isStaticKind
} from './qr-payloads';

describe('qr-payloads', () => {
  it('isStaticKind accepts known kinds only', () => {
    expect(isStaticKind('wifi')).toBe(true);
    expect(isStaticKind('url')).toBe(false);
    expect(isStaticKind(undefined)).toBe(false);
  });

  describe('wifi', () => {
    it('builds a WPA payload with escaping', () => {
      const payload = buildWifiPayload({ ssid: 'Home;Net', password: 'pa"ss', encryption: 'WPA' });
      expect(payload).toBe('WIFI:T:WPA;S:Home\\;Net;P:pa\\"ss;;');
    });

    it('omits the password for open networks and honors hidden', () => {
      const payload = buildWifiPayload({ ssid: 'Cafe', password: '', encryption: 'nopass', hidden: true });
      expect(payload).toBe('WIFI:T:nopass;S:Cafe;H:true;;');
    });

    it('requires a password for WPA', () => {
      expect(() => buildWifiPayload({ ssid: 'x', password: '', encryption: 'WPA' })).toThrow(/Password/);
    });

    it('requires an SSID', () => {
      expect(() => buildWifiPayload({ ssid: '  ', encryption: 'WPA', password: 'x' })).toThrow(/SSID/);
    });

    it('round-trips through the decoder', () => {
      const input = { ssid: 'N etwork', password: 'p;w', encryption: 'WEP', hidden: false };
      const decoded = decodeStaticPayload('wifi', buildWifiPayload(input));
      expect(decoded).toMatchObject({ ssid: 'N etwork', password: 'p;w', encryption: 'WEP', hidden: false });
    });
  });

  describe('vcard', () => {
    it('builds a vCard with name and contact fields', () => {
      const payload = buildVcardPayload({ firstName: 'Ada', lastName: 'Lovelace', phone: '+47 900 00 000', email: 'ada@example.com' });
      expect(payload).toContain('BEGIN:VCARD');
      expect(payload).toContain('FN:Ada Lovelace');
      expect(payload).toContain('TEL;TYPE=CELL:+47 900 00 000');
      expect(payload).toContain('EMAIL;TYPE=INTERNET:ada@example.com');
      expect(payload).toContain('END:VCARD');
    });

    it('requires a contact field beyond the name', () => {
      expect(() => buildVcardPayload({ firstName: 'No', lastName: 'Contact' })).toThrow(/contact field/);
    });

    it('requires a name', () => {
      expect(() => buildVcardPayload({ email: 'x@example.com' })).toThrow(/name/i);
    });

    it('round-trips through the decoder', () => {
      const input = { firstName: 'Grace', lastName: 'Hopper', org: 'Navy', phone: '+123', email: 'g@x.com', url: 'https://x.com' };
      const decoded = decodeStaticPayload('vcard', buildVcardPayload(input));
      expect(decoded).toMatchObject(input);
    });
  });

  describe('event', () => {
    it('builds a VEVENT from datetime-local values', () => {
      const payload = buildEventPayload({ title: 'Launch', start: '2026-10-01T18:00', end: '2026-10-01T20:00' });
      expect(payload).toContain('SUMMARY:Launch');
      expect(payload).toContain('DTSTART:20261001T180000');
      expect(payload).toContain('DTEND:20261001T200000');
    });

    it('builds all-day events from plain dates', () => {
      const payload = buildEventPayload({ title: 'Conf', start: '2026-10-01', end: '2026-10-03', allDay: true });
      expect(payload).toContain('DTSTART:20261001');
      expect(payload).toContain('DTEND:20261003');
    });

    it('requires a title and valid start', () => {
      expect(() => buildEventPayload({ title: '', start: '2026-10-01' })).toThrow(/title/i);
      expect(() => buildEventPayload({ title: 'X', start: 'garbage' })).toThrow(/date/i);
    });

    it('round-trips through the decoder', () => {
      const input = { title: 'Festival', location: 'Park', start: '2026-10-01T12:00', end: '', allDay: false, description: 'Fun' };
      const decoded = decodeStaticPayload('event', buildEventPayload(input));
      expect(decoded).toMatchObject(input);
    });
  });

  describe('email', () => {
    it('builds a mailto with encoded subject and body', () => {
      const payload = buildEmailPayload({ to: 'hi@example.com', subject: 'Hello there', body: 'Line one' });
      expect(payload).toMatch(/^mailto:hi@example\.com\?/);
      const params = new URLSearchParams(payload.split('?')[1]);
      expect(params.get('subject')).toBe('Hello there');
      expect(params.get('body')).toBe('Line one');
    });

    it('rejects invalid addresses', () => {
      expect(() => buildEmailPayload({ to: 'not-an-email' })).toThrow(/email/i);
    });

    it('round-trips through the decoder', () => {
      const input = { to: 'a@b.co', subject: 'S', body: 'B' };
      const decoded = decodeStaticPayload('email', buildEmailPayload(input));
      expect(decoded).toMatchObject(input);
    });
  });

  describe('sms', () => {
    it('builds SMSTO with normalized number', () => {
      const payload = buildSmsPayload({ phone: '+47 900 00 000', message: 'Hi' });
      expect(payload).toBe('SMSTO:+4790000000:Hi');
    });

    it('rejects junk phone numbers', () => {
      expect(() => buildSmsPayload({ phone: 'abcdef' })).toThrow(/phone/i);
    });

    it('round-trips through the decoder', () => {
      const decoded = decodeStaticPayload('sms', buildSmsPayload({ phone: '+4790000000', message: 'Yo' }));
      expect(decoded).toMatchObject({ phone: '+4790000000', message: 'Yo' });
    });
  });

  describe('geo', () => {
    it('builds a geo URI', () => {
      expect(buildGeoPayload({ lat: 59.91, lng: 10.75 })).toBe('geo:59.91,10.75');
    });

    it('rejects out-of-range coordinates', () => {
      expect(() => buildGeoPayload({ lat: 200, lng: 0 })).toThrow(/latitude/i);
      expect(() => buildGeoPayload({ lat: 0, lng: -999 })).toThrow(/longitude/i);
    });

    it('round-trips through the decoder', () => {
      const decoded = decodeStaticPayload('geo', buildGeoPayload({ lat: -33.86, lng: 151.2 }));
      expect(decoded).toMatchObject({ lat: '-33.86', lng: '151.2' });
    });
  });

  it('caps payload length (field cap and composed cap)', () => {
    // Text fields are capped at the source…
    expect(() => buildStaticPayload('text', { text: 'a'.repeat(1201) })).toThrow(/1200/);
    // …and composed payloads re-check the encoded total.
    const longVcard = buildVcardPayload({
      firstName: 'A'.repeat(60),
      lastName: 'B'.repeat(60),
      phone: '+123456789',
      note: 'x'.repeat(200),
      address: 'y'.repeat(200),
      org: 'z'.repeat(80)
    });
    expect(longVcard.length).toBeLessThanOrEqual(1200);
  });

  it('text round-trips as-is', () => {
    expect(decodeStaticPayload('text', buildStaticPayload('text', { text: 'hello world' }))).toEqual({ text: 'hello world' });
  });
});
