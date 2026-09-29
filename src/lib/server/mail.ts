import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';
import { getSetting } from './settings';

/**
 * Mail provider resolution, in priority order:
 *   1. Resend API   — set RESEND_API_KEY.
 *   2. SMTP         — set SMTP_HOST (+ user/pass/port).
 *   3. Console      — fallback for dev / single-admin installs. The OTP code
 *                     is logged to stdout so you can finish your own login
 *                     without configuring mail at all.
 *
 * Whichever provider is active, the `from` address comes from MAIL_FROM
 * (preferred) or SMTP_FROM (legacy).
 */

type Provider = 'resend' | 'smtp' | 'console';

function pickProvider(): Provider {
  if (env.RESEND_API_KEY) return 'resend';
  if (env.SMTP_HOST) return 'smtp';
  return 'console';
}

function fromAddress(): string {
  return env.MAIL_FROM || env.SMTP_FROM || 'noreply@openqr.local';
}

const smtpTransporter =
  pickProvider() === 'smtp'
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: parseInt(env.SMTP_PORT || '587'),
        secure: env.SMTP_PORT === '465',
        auth:
          env.SMTP_USER || env.SMTP_PASS
            ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
            : undefined
      })
    : null;

async function sendViaResend(to: string, subject: string, text: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: fromAddress(), to, subject, text, html })
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; name?: string };
      if (body?.message) detail = body.message;
    } catch {/* keep status-only detail */}
    throw new Error(`Resend rejected the request: ${detail}`);
  }
}

async function deliver(to: string, subject: string, text: string, html: string): Promise<void> {
  switch (pickProvider()) {
    case 'resend':
      await sendViaResend(to, subject, text, html);
      return;
    case 'smtp':
      await smtpTransporter!.sendMail({ from: fromAddress(), to, subject, text, html });
      return;
    case 'console':
      // Logs the body too — for OTP this is what finishes a dev login without
      // configured mail; the README documents this flow.
      console.log(`[DEV MODE] email to ${to} — ${subject}\n${text}`);
      return;
  }
}

export async function sendOTP(email: string, code: string): Promise<void> {
  const brandName = getSetting('BRAND_NAME', 'Open-QR');
  const subject = `Your ${brandName} login code`;
  const text = `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`;
  const html = `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`;
  await deliver(email, subject, text, html);
}

export interface DigestEmailData {
  totalScans: number;
  topCodes: { shortCode: string; targetUrl: string; count: number }[];
}

export async function sendDigest(email: string, data: DigestEmailData): Promise<void> {
  const brandName = getSetting('BRAND_NAME', 'Open-QR');
  const subject = `Your weekly ${brandName} scan report — ${data.totalScans} scans`;

  const lines = [
    `Your QR codes were scanned ${data.totalScans} time${data.totalScans === 1 ? '' : 's'} in the last 7 days.`,
    '',
    ...data.topCodes.map((c) => `  /go/${c.shortCode} — ${c.count} scans — ${c.targetUrl}`),
    '',
    'Manage your codes in the dashboard.'
  ];

  const listItems = data.topCodes
    .map(
      (c) =>
        `<li><a href="/dashboard/qr/${c.shortCode}/stats">/go/${c.shortCode}</a> — ${c.count} scans<br><span style="color:#666">${c.targetUrl}</span></li>`
    )
    .join('');
  const html = `<p>Your QR codes were scanned <strong>${data.totalScans}</strong> time${data.totalScans === 1 ? '' : 's'} in the last 7 days.</p><ul>${listItems}</ul><p>Manage your codes in the dashboard.</p>`;

  await deliver(email, subject, lines.join('\n'), html);
}
