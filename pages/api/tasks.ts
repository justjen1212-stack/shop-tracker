import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // GET — fetch all tasks
  if (req.method === 'GET') {
    try {
      const snapshot = await adminDb.collection('shop_tasks').get();
      const tasks = snapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          text: d.text ?? '',
          completed: d.completed ?? false,
          createdBy: d.createdBy ?? '',
          completedBy: d.completedBy ?? '',
          createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
          completedAt: d.completedAt?.toDate?.()?.toISOString() ?? null,
        };
      });
      // Sort: incomplete first, then by createdAt ascending
      tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
      });
      return res.status(200).json({ tasks });
    } catch (error: any) {
      return res.status(500).json({ error: error.message ?? 'Failed to fetch tasks' });
    }
  }

  // POST — add a new task
  if (req.method === 'POST') {
    const { text, createdBy } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ error: 'Task text is required' });
    }
    try {
      const docRef = await adminDb.collection('shop_tasks').add({
        text: text.trim(),
        completed: false,
        createdBy: createdBy ?? '',
        completedBy: '',
        createdAt: FieldValue.serverTimestamp(),
        completedAt: null,
      });
      return res.status(201).json({ id: docRef.id });
    } catch (error: any) {
      return res.status(500).json({ error: error.message ?? 'Failed to add task' });
    }
  }

  // PUT — toggle complete/incomplete
  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing id' });
    }
    const { completed, completedBy } = req.body;
    try {
      await adminDb.collection('shop_tasks').doc(id).update({
        completed: !!completed,
        completedBy: completed ? (completedBy ?? '') : '',
        completedAt: completed ? FieldValue.serverTimestamp() : null,
      });
      return res.status(200).json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message ?? 'Failed to update task' });
    }
  }

  // DELETE — remove a task
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing id' });
    }
    try {
      await adminDb.collection('shop_tasks').doc(id).delete();
      return res.status(200).json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message ?? 'Failed to delete task' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
