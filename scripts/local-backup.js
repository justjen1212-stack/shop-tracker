/**
 * local-backup.js
 * Runs every Monday at 11am via Windows Task Scheduler.
 * Queries Firestore directly and saves JSON + CSV backups to
 * C:\Users\Adaya\Documents\ShopTrackerBackups\
 *
 * To run manually: node C:\Users\Adaya\shop-tracker\scripts\local-backup.js
 */

const path = require('path');
const fs = require('fs');

// ── 1. Load .env.local from the project root ────────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^'([\s\S]*)'$/, '$1').replace(/^"([\s\S]*)"$/, '$1');
      env[key] = val;
    });
}

const serviceAccountJson = env['FIREBASE_SERVICE_ACCOUNT_KEY'];
if (!serviceAccountJson) {
  console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_KEY not found in .env.local');
  process.exit(1);
}

// ── 2. Initialise Firebase Admin ────────────────────────────────────────────
const admin = require(path.join(__dirname, '..', 'node_modules', 'firebase-admin'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
  });
}

const db = admin.firestore();

// ── 3. Helpers ───────────────────────────────────────────────────────────────
function toCSV(records) {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const rows = records.map((r) =>
    headers.map((h) => {
      const val = r[h] ?? '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

// ── 4. Run backup ────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('Starting local backup...');

    const snapshot = await db.collection('shop_sales').orderBy('date', 'asc').get();

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

    const outDir = path.join('C:\\Users\\Adaya\\Documents', 'ShopTrackerBackups');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const jsonFile = path.join(outDir, `shop-sales-backup-${label}.json`);
    const csvFile  = path.join(outDir, `shop-sales-backup-${label}.csv`);

    fs.writeFileSync(jsonFile, JSON.stringify(sales, null, 2), 'utf8');
    fs.writeFileSync(csvFile, toCSV(sales), 'utf8');

    console.log(`Backup saved:`);
    console.log(`  JSON: ${jsonFile}`);
    console.log(`  CSV:  ${csvFile}`);
    console.log(`  Records: ${sales.length}`);
    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err.message);
    process.exit(1);
  }
})();
