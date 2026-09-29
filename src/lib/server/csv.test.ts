import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('toCsv', () => {
  it('serializes plain rows unchanged', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2\r\n');
  });

  it('quotes and escapes fields containing separators or quotes', () => {
    expect(toCsv([['with,comma', 'with "quote"', 'line\nbreak', null]])).toBe(
      '"with,comma","with ""quote""","line\nbreak",\r\n'
    );
  });

  it('round-trips through parseCsv', () => {
    const rows = [['short_code', 'x, y'], ['abc', 'He said "hi"']];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('neutralizes spreadsheet formula injection without touching typed numbers', () => {
    expect(toCsv([['=WEBSERVICE("http://evil")']])).toContain("'=WEBSERVICE");
    expect(toCsv([['@SUM(A1)', 'cmd']])).toBe("'@SUM(A1),cmd\r\n");
    // Typed numbers keep their sign; only string cells get the apostrophe.
    expect(toCsv([[-2, 42]])).toBe('-2,42\r\n');
  });
});
