import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';
import { Product } from '../../types/sale';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const snapshot = await adminDb
        .collection('shop_products')
        .orderBy('name')
        .get();

      const products: Product[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          pricePerUnit: data.pricePerUnit,
          category: data.category,
        };
      });

      return res.status(200).json({ products });
    } catch (error: any) {
      console.error('GET /api/products error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to fetch products' });
    }
  }

  if (req.method === 'POST') {
    const { name, pricePerUnit, category } = req.body as Product;

    if (!name || !pricePerUnit || !category) {
      return res.status(400).json({ error: 'Missing required fields: name, pricePerUnit, category' });
    }

    try {
      const docRef = await adminDb.collection('shop_products').add({
        name: String(name).trim(),
        pricePerUnit: Number(pricePerUnit),
        category: String(category),
      });

      return res.status(201).json({ id: docRef.id });
    } catch (error: any) {
      console.error('POST /api/products error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to add product' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing id query parameter' });
    }

    try {
      await adminDb.collection('shop_products').doc(id).delete();
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('DELETE /api/products error:', error);
      return res.status(500).json({ error: error.message ?? 'Failed to delete product' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
