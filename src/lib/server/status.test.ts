import { describe, expect, it } from 'vitest';
import packageJson from '../../../package.json';
import { getOperationalStatus } from './status';

describe('operational status', () => {
  it('reports the package version', () => {
    expect(getOperationalStatus().version).toBe(packageJson.version);
  });
});
