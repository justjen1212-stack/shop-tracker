# Shop Sales Tracker

A Next.js 14 sales tracker app for a shop, using Firebase Firestore.

## Tech Stack
- Next.js 14 (Pages Router) with TypeScript
- Firebase Firestore (client SDK for reads, Admin SDK for server-side writes)
- Clean CSS only (no UI libraries)

## Environment Variables

Create a `.env.local` file in the project root with the following variables:

```
# Server-only (Firebase Admin SDK)
# Paste the full JSON content of your Firebase service account key as a single-line string
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}

# Client-side Firebase config (safe to expose — NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Getting the service account key
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key" → Download the JSON file
3. Paste the entire JSON as a single line (no newlines) for `FIREBASE_SERVICE_ACCOUNT_KEY`

### Getting client config
1. Go to Firebase Console → Project Settings → General
2. Under "Your apps", find or add a Web App
3. Copy the firebaseConfig values

## Firestore Setup
- Collection: `shop_sales`
- No indexes needed for basic date queries
- Firestore rules: allow read/write for authenticated or open rules for development

## API Routes
- `GET /api/sales?date=YYYY-MM-DD` — fetch all sales for a given date
- `POST /api/sales` — add a new sale (body: Sale object)
- `DELETE /api/sales?id=<docId>` — delete a sale by Firestore document ID

## Running Locally
```bash
npm install
npm run dev
```

App runs at http://localhost:3000

## Data Model (Firestore: `shop_sales`)
```typescript
interface Sale {
  id?: string;           // Firestore document ID (added client-side)
  productName: string;
  quantity: number;
  pricePerUnit: number;
  total: number;         // quantity * pricePerUnit
  paymentType: 'cash' | 'card' | 'online';
  staffName: string;
  timestamp: Timestamp;  // Firestore server timestamp
  date: string;          // YYYY-MM-DD — used for date-based queries
}
```
