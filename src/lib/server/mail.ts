import nodemailer from 'nodemailer';
import { env } from '$env/dynamic/private';

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: parseInt(env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    })
  : null;

export async function sendOTP(email: string, code: string): Promise<void> {
  const brandName = env.BRAND_NAME || 'Open-QR';
  
  if (!transporter) {
    console.log(`[DEV MODE] OTP for ${email}: ${code}`);
    return;
  }
  
  await transporter.sendMail({
    from: env.SMTP_FROM || 'noreply@openqr.local',
    to: email,
    subject: `Your ${brandName} login code`,
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`
  });
}
