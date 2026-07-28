import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { Sale } from '../../types/sale';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { date } = req.query;

    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'Missing date query parameter' });
    }

    try {
      const snapshot = await adminDb
        .collection('shop_sales')
        .where('date', '==', date)
        .get();

      const sales: Sale[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          productName: data.productName,
          quantity: data.quantity,
          pricePerUnit: data.pricePerUnit,
          total: data.total,
          paymentType: data.paymentType,
          staffName: data.staffName,
          timestamp: data.timestamp?.toDate?.()?.toISOString() ?? null,
          date: data.date,
          category: data.category ?? 'Other',
        };
      });

      return res.status(200).json({ sales });
    } catch (error: any) {
      console.error('GET /api/sales error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to fetch sales' });
    }
  }

  if (req.method === 'POST') {
    const body = req.body as Omit<Sale, 'id' | 'timestamp'>;

    const { productName, quantity, pricePerUnit, total, paymentType, staffName, date, category } = body;

    if (!productName || !quantity || !pricePerUnit || !total || !paymentType || !staffName || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const docRef = await adminDb.collection('shop_sales').add({
        productName,
        quantity: Number(quantity),
        pricePerUnit: Number(pricePerUnit),
        total: Number(total),
        paymentType,
        staffName,
        date,
        category: category ?? 'Other',
        timestamp: FieldValue.serverTimestamp(),
      });

      return res.status(201).json({ id: docRef.id });
    } catch (error: any) {
      console.error('POST /api/sales error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to add sale' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing id query parameter' });
    }

    try {
      await adminDb.collection('shop_sales').doc(id).delete();
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('DELETE /api/sales error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to delete sale' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
