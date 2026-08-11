import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { Sale } from '../../types/sale';

function toTitleCase(str: string): string {
  return str.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const { date, from, to } = req.query;

    // Date-range query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
    if (from && to && typeof from === 'string' && typeof to === 'string') {
      try {
        const snapshot = await adminDb
          .collection('shop_sales')
          .where('date', '>=', from)
          .where('date', '<=', to)
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
            type: data.type ?? 'sale',
            ...(data.refundReason ? { refundReason: data.refundReason } : {}),
            ...(data.refundAuthorizedBy ? { refundAuthorizedBy: data.refundAuthorizedBy } : {}),
            ...(data.refundCustomerName ? { refundCustomerName: data.refundCustomerName } : {}),
            ...(data.refundCustomerAddress ? { refundCustomerAddress: data.refundCustomerAddress } : {}),
            ...(data.refundCustomerPhone ? { refundCustomerPhone: data.refundCustomerPhone } : {}),
          };
        });

        return res.status(200).json({ sales });
      } catch (error: any) {
        console.error('GET /api/sales (range) error:', error);
        return res.status(500).json({ error: error.message ?? 'Failed to fetch sales' });
      }
    }

    // Single-day query: ?date=YYYY-MM-DD
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
          type: data.type ?? 'sale',
          ...(data.refundReason ? { refundReason: data.refundReason } : {}),
          ...(data.refundAuthorizedBy ? { refundAuthorizedBy: data.refundAuthorizedBy } : {}),
          ...(data.refundCustomerName ? { refundCustomerName: data.refundCustomerName } : {}),
          ...(data.refundCustomerAddress ? { refundCustomerAddress: data.refundCustomerAddress } : {}),
          ...(data.refundCustomerPhone ? { refundCustomerPhone: data.refundCustomerPhone } : {}),
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

    const { productName, quantity, pricePerUnit, total, paymentType, staffName, date, category, type,
      refundReason, refundAuthorizedBy, refundCustomerName, refundCustomerAddress, refundCustomerPhone } = body;

    if (!productName || !quantity || !pricePerUnit || !paymentType || !staffName || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (type === 'refund') {
      if (!refundReason?.trim() || !refundAuthorizedBy?.trim()) {
        return res.status(400).json({ error: 'Refund reason and authorized by are required' });
      }
    }

    try {
      const docRef = await adminDb.collection('shop_sales').add({
        productName: toTitleCase(productName),
        quantity: Number(quantity),
        pricePerUnit: Number(pricePerUnit),
        total: Number(total),
        paymentType,
        staffName,
        date,
        category: category ?? 'Other',
        type: type ?? 'sale',
        timestamp: FieldValue.serverTimestamp(),
        ...(refundReason ? { refundReason: refundReason.trim() } : {}),
        ...(refundAuthorizedBy ? { refundAuthorizedBy: refundAuthorizedBy.trim() } : {}),
        ...(refundCustomerName ? { refundCustomerName: refundCustomerName.trim() } : {}),
        ...(refundCustomerAddress ? { refundCustomerAddress: refundCustomerAddress.trim() } : {}),
        ...(refundCustomerPhone ? { refundCustomerPhone: refundCustomerPhone.trim() } : {}),
      });

      return res.status(201).json({ id: docRef.id });
    } catch (error: any) {
      console.error('POST /api/sales error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to add sale' });
    }
  }

  if (req.method === 'PUT') {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing id query parameter' });
    }

    const body = req.body as Omit<Sale, 'id' | 'timestamp'>;
    const { productName, quantity, pricePerUnit, total, paymentType, staffName, date, category, type,
      refundReason, refundAuthorizedBy, refundCustomerName, refundCustomerAddress, refundCustomerPhone } = body;

    if (!productName || !quantity || !pricePerUnit || !total || !paymentType || !staffName || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (type === 'refund') {
      if (!refundReason?.trim() || !refundAuthorizedBy?.trim()) {
        return res.status(400).json({ error: 'Refund reason and authorized by are required' });
      }
    }

    try {
      await adminDb.collection('shop_sales').doc(id).update({
        productName: toTitleCase(productName),
        quantity: Number(quantity),
        pricePerUnit: Number(pricePerUnit),
        total: Number(total),
        paymentType,
        staffName,
        date,
        category: category ?? 'Other',
        ...(type ? { type } : {}),
        ...(refundReason ? { refundReason: refundReason.trim() } : {}),
        ...(refundAuthorizedBy ? { refundAuthorizedBy: refundAuthorizedBy.trim() } : {}),
        ...(refundCustomerName !== undefined ? { refundCustomerName: refundCustomerName.trim() } : {}),
        ...(refundCustomerAddress !== undefined ? { refundCustomerAddress: refundCustomerAddress.trim() } : {}),
        ...(refundCustomerPhone !== undefined ? { refundCustomerPhone: refundCustomerPhone.trim() } : {}),
      });

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('PUT /api/sales error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to update sale' });
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
