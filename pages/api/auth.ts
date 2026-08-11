import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { username, password } = req.body as { username: string; password: string };

    const validUsername = process.env.ADMIN_USERNAME;

    // Check Firestore for an updated password; fall back to env var
    let validPassword = process.env.ADMIN_PASSWORD;
    try {
      const doc = await adminDb.collection('admin_config').doc('auth').get();
      if (doc.exists && doc.data()?.password) {
        validPassword = doc.data()!.password;
      }
    } catch {
      // Firestore unavailable — fall back to env var
    }

    if (username === validUsername && password === validPassword) {
      const maxAge = 60 * 60 * 24 * 7; // 7 days in seconds
      res.setHeader(
        'Set-Cookie',
        `auth=authenticated; Path=/; Max-Age=${maxAge}; SameSite=Lax`
      );
      return res.status(200).json({ success: true });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (req.method === 'DELETE') {
    res.setHeader(
      'Set-Cookie',
      'auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax'
    );
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
