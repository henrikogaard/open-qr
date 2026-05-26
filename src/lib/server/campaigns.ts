import { db } from '$lib/db';

export interface Campaign {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  created_at: string;
  qr_count?: number;
  total_scans?: number;
}

export function createCampaign(userId: number, name: string, description = ''): Campaign {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Campaign name is required');
  if (cleanName.length > 80) throw new Error('Campaign name must be 80 characters or fewer');

  const result = db
    .prepare('INSERT INTO campaigns (user_id, name, description) VALUES (?, ?, ?)')
    .run(userId, cleanName, description.trim() || null);

  return getCampaign(Number(result.lastInsertRowid), userId)!;
}

export function listCampaigns(userId: number): Campaign[] {
  return db
    .prepare(
      `SELECT c.*,
        COUNT(q.id) AS qr_count,
        COALESCE(SUM(q.scan_count), 0) AS total_scans
       FROM campaigns c
       LEFT JOIN qr_codes q ON q.campaign_id = c.id
       WHERE c.user_id = ?
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    )
    .all(userId) as Campaign[];
}

export function getCampaign(id: number, userId: number): Campaign | null {
  return (
    (db.prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?').get(id, userId) as Campaign | undefined) ||
    null
  );
}

export function deleteCampaign(id: number, userId: number): void {
  const campaign = getCampaign(id, userId);
  if (!campaign) return;
  db.prepare('UPDATE qr_codes SET campaign_id = NULL WHERE campaign_id = ?').run(id);
  db.prepare('DELETE FROM campaigns WHERE id = ? AND user_id = ?').run(id, userId);
}
