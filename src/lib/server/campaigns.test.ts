import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { createCampaign, getCampaign, listCampaigns } from './campaigns';
import { createQRCode } from './qr';

describe('campaigns', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM scan_logs').run();
    db.prepare('DELETE FROM qr_codes').run();
    db.prepare('DELETE FROM campaigns').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM otp_codes').run();
    db.prepare('DELETE FROM api_keys').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM settings').run();
  });

  it('creates campaigns and returns aggregate QR counts', () => {
    const user = db.prepare('INSERT INTO users (email) VALUES (?)').run('campaign@test');
    const userId = Number(user.lastInsertRowid);
    const campaign = createCampaign(userId, 'Spring launch', 'Posters and flyers');
    createQRCode('https://example.com/a', userId, {}, undefined, undefined, undefined, campaign.id);
    createQRCode('https://example.com/b', userId, {}, undefined, undefined, undefined, campaign.id);

    const campaigns = listCampaigns(userId);

    expect(campaigns[0]).toMatchObject({
      id: campaign.id,
      name: 'Spring launch',
      qr_count: 2,
      total_scans: 0
    });
    expect(getCampaign(campaign.id, userId)?.description).toBe('Posters and flyers');
  });
});
