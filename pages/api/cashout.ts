import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

function yesterdayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'Missing date query parameter' });
    }

    try {
      // Fetch today's cashout doc
      const docSnap = await adminDb.collection('cashouts').doc(date).get();
      const cashout = docSnap.exists ? { ...docSnap.data(), date } : null;

      // Fetch yesterday's cashout to get previousClosingFloat
      const yesterday = yesterdayOf(date);
      const prevSnap = await adminDb.collection('cashouts').doc(yesterday).get();
      const previousClosingFloat: number = prevSnap.exists
        ? (prevSnap.data()?.closingFloat ?? 0)
        : 0;

      return res.status(200).json({ cashout, previousClosingFloat });
    } catch (error: any) {
      console.error('GET /api/cashout error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to fetch cashout' });
    }
  }

  if (req.method === 'POST') {
    const {
      date,
      openingFloat,
      cardSales,
      cashSales,
      closingFloat,
      cashToBank,
      actualCashCounted,
      tally,
      notes,
    } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'Missing date field' });
    }

    try {
      await adminDb.collection('cashouts').doc(date).set({
        date,
        openingFloat: Number(openingFloat ?? 0),
        cardSales: Number(cardSales ?? 0),
        cashSales: Number(cashSales ?? 0),
        closingFloat: Number(closingFloat ?? 0),
        cashToBank: Number(cashToBank ?? 0),
        actualCashCounted: Number(actualCashCounted ?? 0),
        tally: Number(tally ?? 0),
        notes: notes ?? '',
        savedAt: FieldValue.serverTimestamp(),
      });

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('POST /api/cashout error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to save cashout' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
