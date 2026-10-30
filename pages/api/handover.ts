import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { date, all } = req.query;

    // Return all notes for search
    if (all === 'true') {
      try {
        const snapshot = await adminDb
          .collection('handover_notes')
          .get();
        const notes = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            date: doc.id,
            text: data.text ?? '',
            updatedBy: data.updatedBy ?? '',
            updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
          };
        });
        return res.status(200).json({ notes });
      } catch (error: any) {
        return res.status(500).json({ error: error.message ?? 'Failed to fetch notes' });
      }
    }

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'Missing date' });
    }
    try {
      const doc = await adminDb.collection('handover_notes').doc(date).get();
      if (!doc.exists) {
        return res.status(200).json({ note: null });
      }
      const data = doc.data()!;
      return res.status(200).json({
        note: {
          text: data.text ?? '',
          updatedBy: data.updatedBy ?? '',
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message ?? 'Failed to fetch handover note' });
    }
  }

  if (req.method === 'POST') {
    const { date, text, updatedBy } = req.body;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'Missing date' });
    }
    try {
      await adminDb.collection('handover_notes').doc(date).set({
        text: text ?? '',
        updatedBy: updatedBy ?? '',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message ?? 'Failed to save handover note' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
