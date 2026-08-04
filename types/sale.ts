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
  type?: 'sale' | 'refund';
}

export interface SaleFormData {
  productName: string;
  quantity: number;
  pricePerUnit: number;
  paymentType: 'cash' | 'card' | 'online';
  staffName: string;
  category: string;
}

export interface Product {
  id?: string;
  name: string;
  pricePerUnit: number;
  category: string;
}
