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
  // Refund-specific fields
  refundReason?: string;        // mandatory when type === 'refund'
  refundAuthorizedBy?: string;  // mandatory when type === 'refund'
  refundCustomerName?: string;  // optional
  refundCustomerAddress?: string; // optional
  refundCustomerPhone?: string; // optional
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
