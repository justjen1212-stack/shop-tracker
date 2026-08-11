import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, newPassword } = req.body as { token: string; newPassword: string };

  if (!token || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Token and a password of at least 8 characters are required' });
  }

  try {
    const doc = await adminDb.collection('admin_config').doc('reset_token').get();
    if (!doc.exists) return res.status(400).json({ error: 'Invalid or expired reset link' });

    const data = doc.data()!;
    const expiresAt: Date = data.expiresAt.toDate();

    if (data.token !== token || new Date() > expiresAt) {
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    // Save new password and delete the token
    await Promise.all([
      adminDb.collection('admin_config').doc('auth').set({ password: newPassword }),
      adminDb.collection('admin_config').doc('reset_token').delete(),
    ]);

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('reset-confirm error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
