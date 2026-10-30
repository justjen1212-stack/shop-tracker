import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../lib/firebaseAdmin';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function toCSV(records: Record<string, any>[]): string {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const rows = records.map((r) =>
    headers.map((h) => {
      const val = r[h] ?? '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str}"`
        : str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Allow Vercel Cron (GET) or manual trigger (POST)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Protect against unauthorised triggers
  // Accept either the backup secret OR an active auth session cookie
  const secret = req.headers['x-backup-secret'] ?? req.query.secret;
  const authCookie = req.cookies?.auth;
  const isAuthenticated = authCookie === 'authenticated';
  if (secret !== process.env.BACKUP_SECRET && !isAuthenticated) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  try {
    const snapshot = await adminDb
      .collection('shop_sales')
      .orderBy('date', 'asc')
      .get();

    const sales = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        date: d.date ?? '',
        productName: d.productName ?? '',
        category: d.category ?? '',
        quantity: d.quantity ?? 0,
        pricePerUnit: d.pricePerUnit ?? 0,
        total: d.total ?? 0,
        paymentType: d.paymentType ?? '',
        staffName: d.staffName ?? '',
        type: d.type ?? 'sale',
        refundReason: d.refundReason ?? '',
        refundAuthorizedBy: d.refundAuthorizedBy ?? '',
        refundCustomerName: d.refundCustomerName ?? '',
        refundCustomerAddress: d.refundCustomerAddress ?? '',
        refundCustomerPhone: d.refundCustomerPhone ?? '',
        timestamp: d.timestamp?.toDate?.()?.toISOString() ?? '',
      };
    });

    const now = new Date();
    const label = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const jsonContent = JSON.stringify(sales, null, 2);
    const csvContent = toCSV(sales);

    const toEmail = process.env.BACKUP_EMAIL ?? 'justjen1212@gmail.com';

    await resend.emails.send({
      from: 'Scape West <onboarding@resend.dev>',
      to: toEmail,
      subject: `Weekly Shop Sales Backup — ${label} (${sales.length} records)`,
      html: `
        <p>Your weekly sales backup is attached.</p>
        <ul>
          <li><strong>Date:</strong> ${now.toDateString()}</li>
          <li><strong>Total records:</strong> ${sales.length}</li>
        </ul>
        <p>Two files are attached: a JSON file (full data) and a CSV file (easy to open in Excel/Sheets).</p>
        <p style="color:#888;font-size:12px;">This backup was generated automatically every Monday at 11am by your Shop Tracker.</p>
      `,
      attachments: [
        {
          filename: `shop-sales-backup-${label}.json`,
          content: Buffer.from(jsonContent).toString('base64'),
        },
        {
          filename: `shop-sales-backup-${label}.csv`,
          content: Buffer.from(csvContent).toString('base64'),
        },
      ],
    });

    return res.status(200).json({
      success: true,
      records: sales.length,
      sentTo: toEmail,
      label,
    });
  } catch (error: any) {
    console.error('Backup error:', error);
    return res.status(500).json({ error: error.message ?? 'Backup failed' });
  }
}
