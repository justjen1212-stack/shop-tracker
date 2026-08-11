import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await adminDb.collection('admin_config').doc('reset_token').set({
      token,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    const resetUrl = `${APP_URL}/reset-password?token=${token}`;

    await resend.emails.send({
      from: 'Scape West <onboarding@resend.dev>',
      to: ADMIN_EMAIL,
      subject: 'Password Reset — Scape West',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #3d2b1f;">Reset your password</h2>
          <p style="color: #5a4a3a;">Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#7d4e2d;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
            Reset Password
          </a>
          <p style="color:#9b7d5e;font-size:0.85rem;">If you didn't request this, ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e8e0d8;margin:24px 0"/>
          <p style="color:#9b7d5e;font-size:0.78rem;">Scape West Sales Dashboard</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('reset-request error:', err);
    return res.status(500).json({ error: 'Failed to send reset email' });
  }
}
