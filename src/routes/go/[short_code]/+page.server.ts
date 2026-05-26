import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getQRCode, incrementScanCount, verifyQRPassword } from '$lib/server/qr';
import { db } from '$lib/db';
import { createHash } from 'crypto';
import { detectCountry, detectDeviceClass } from '$lib/server/scan-meta';

export const load: PageServerLoad = async ({ params, request, url }) => {
  const qr = getQRCode(params.short_code);
  
  if (!qr) {
    throw error(404, 'QR code not found');
  }
  
  if (!qr.is_active) {
    throw error(403, 'This QR code is no longer active');
  }
  
  if (qr.expires_at && new Date(qr.expires_at) < new Date()) {
    throw error(410, 'This QR code has expired');
  }
  
  // Handle password protection
  const password = url.searchParams.get('password');
  if (qr.password_hash && !verifyQRPassword(qr.password_hash, password)) {
    return {
      requiresPassword: true,
      invalidPassword: password !== null,
      shortCode: params.short_code
    };
  }
  
  // Log scan. Country comes from an upstream-proxy header (Cloudflare, Vercel,
  // Fly, etc.) before the raw IP is hashed; device class is derived from the UA
  // string before it is hashed. Raw identifiers never reach storage.
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const ipHash = createHash('sha256').update(ip).digest('hex');
  const userAgent = request.headers.get('user-agent') || '';
  const userAgentHash = createHash('sha256').update(userAgent).digest('hex');
  const country = detectCountry(request.headers);
  const deviceClass = detectDeviceClass(userAgent);

  db.prepare(`
    INSERT INTO scan_logs (qr_code_id, ip_hash, user_agent_hash, country, device_class)
    VALUES (?, ?, ?, ?, ?)
  `).run(qr.id, ipHash, userAgentHash, country, deviceClass);

  incrementScanCount(params.short_code);
  
  throw redirect(302, qr.target_url);
};
