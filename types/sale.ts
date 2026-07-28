export interface Sale {
  id?: string;
  productName: string;
  quantity: number;
  pricePerUnit: number;
  total: number;
  paymentType: 'cash' | 'card' | 'online';
  staffName: string;
  timestamp: any; // Firestore Timestamp
  date: string; // YYYY-MM-DD
  category: string;
}

export interface SaleFormData {
  productName: string;
  quantity: number;
  pricePerUnit: number;
  paymentType: 'cash' | 'card' | 'online';
  staffName: string;
  category: string;
}
