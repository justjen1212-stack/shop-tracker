import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Sale, SaleFormData, Product } from '../types/sale';

// Groups "hat", "Hat", "hats", "Hats" under the same key for stats/best sellers
function normalizeProductKey(name: string): string {
  let n = name.trim().toLowerCase();
  // Remove trailing 's' for plurals — skip words ending in 'ss' (e.g. "glass", "dress")
  if (n.length > 3 && n.endsWith('s') && !n.endsWith('ss')) {
    n = n.slice(0, -1);
  }
  return n;
}

function toTitleCase(str: string): string {
  return str.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}


function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const CATEGORIES = ['Gifts', 'Furniture', 'Mirrors', 'Lighting', 'Textiles', 'Accessories', 'Artwork', 'Hats', 'Pistols', 'Other'];

interface Stats {
  totalRevenue: number;
  numberOfSales: number;
  averageSale: number;
  cashTotal: number;
  cardTotal: number;
  onlineTotal: number;
}

interface BestSeller {
  productName: string;
  totalRevenue: number;
  unitsSold: number;
}

interface StaffLeader {
  staffName: string;
  totalRevenue: number;
  salesCount: number;
}

interface BestCategory {
  category: string;
  unitsSold: number;
  revenue: number;
}

function computeStats(sales: Sale[]): Stats {
  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const numberOfSales = sales.length;
  const averageSale = numberOfSales > 0 ? totalRevenue / numberOfSales : 0;
  const cashTotal = sales.filter((s) => s.paymentType === 'cash').reduce((sum, s) => sum + s.total, 0);
  const cardTotal = sales.filter((s) => s.paymentType === 'card').reduce((sum, s) => sum + s.total, 0);
  const onlineTotal = sales.filter((s) => s.paymentType === 'online').reduce((sum, s) => sum + s.total, 0);
  return { totalRevenue, numberOfSales, averageSale, cashTotal, cardTotal, onlineTotal };
}

function computeBestSellers(sales: Sale[]): BestSeller[] {
  const map = new Map<string, BestSeller>();
  for (const sale of sales) {
    const key = normalizeProductKey(sale.productName);
    const existing = map.get(key);
    if (existing) {
      existing.totalRevenue += sale.total;
      existing.unitsSold += sale.quantity;
    } else {
      map.set(key, {
        productName: toTitleCase(sale.productName),
        totalRevenue: sale.total,
        unitsSold: sale.quantity,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function computeStaffLeaderboard(sales: Sale[]): StaffLeader[] {
  const map = new Map<string, StaffLeader>();
  for (const sale of sales) {
    const existing = map.get(sale.staffName);
    if (existing) {
      existing.totalRevenue += sale.total;
      existing.salesCount += 1;
    } else {
      map.set(sale.staffName, {
        staffName: sale.staffName,
        totalRevenue: sale.total,
        salesCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function computeBestCategory(sales: Sale[]): BestCategory | null {
  const map = new Map<string, { unitsSold: number; revenue: number }>();
  for (const sale of sales) {
    const cat = sale.category || 'Other';
    const existing = map.get(cat) ?? { unitsSold: 0, revenue: 0 };
    map.set(cat, { unitsSold: existing.unitsSold + sale.quantity, revenue: existing.revenue + sale.total });
  }
  if (map.size === 0) return null;

  // Normalise both metrics 0-1 then average for a balanced score
  const allUnits = Array.from(map.values()).map((v) => v.unitsSold);
  const allRevenue = Array.from(map.values()).map((v) => v.revenue);
  const maxUnits = Math.max(...allUnits);
  const maxRevenue = Math.max(...allRevenue);

  let best: BestCategory = { category: '', unitsSold: 0, revenue: 0 };
  let bestScore = -1;
  map.forEach(({ unitsSold, revenue }, category) => {
    const score = (unitsSold / (maxUnits || 1)) * 0.5 + (revenue / (maxRevenue || 1)) * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = { category, unitsSold, revenue };
    }
  });
  return best;
}


const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  online: 'Online',
};

const emptyForm: SaleFormData = {
  productName: '',
  quantity: 1,
  pricePerUnit: 0,
  paymentType: 'card',
  staffName: '',
  category: 'Gifts',
};

export default function Home() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(todayString());
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [formData, setFormData] = useState<SaleFormData>(emptyForm);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formSuccess, setFormSuccess] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundingSale, setRefundingSale] = useState<Sale | null>(null);
  const [refundQty, setRefundQty] = useState(1);
  const [refundReason, setRefundReason] = useState('');
  const [refundAuthorizedBy, setRefundAuthorizedBy] = useState('');
  const [refundCustomerName, setRefundCustomerName] = useState('');
  const [refundCustomerAddress, setRefundCustomerAddress] = useState('');
  const [refundCustomerPhone, setRefundCustomerPhone] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const [dashTab, setDashTab] = useState<'today' | 'totals'>('today');

  // Period totals
  const [periodTotals, setPeriodTotals] = useState<{
    week: number; weekCash: number; weekCard: number;
    month: number; monthCash: number; monthCard: number;
    quarter: number; quarterCash: number; quarterCard: number;
    year: number; yearCash: number; yearCard: number;
    weekLabel: string; monthLabel: string; quarterLabel: string; yearLabel: string;
  } | null>(null);

  // Persistent staff name (stored in localStorage, survives page refresh)
  const [currentStaff, setCurrentStaff] = useState<string>('');
  const [editingStaff, setEditingStaff] = useState<boolean>(false);
  const [staffInput, setStaffInput] = useState<string>('');

  const [products, setProducts] = useState<Product[]>([]);
  const [productsModalOpen, setProductsModalOpen] = useState<boolean>(false);
  const [productForm, setProductForm] = useState<{ name: string; pricePerUnit: number; category: string }>({
    name: '',
    pricePerUnit: 0,
    category: 'Furniture',
  });
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [productSubmitting, setProductSubmitting] = useState<boolean>(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Cashout state
  const [cashout, setCashout] = useState<{
    openingFloat: number;
    cardSales: number;
    cashSales: number;
    closingFloat: number;
    cashToBank: number;
    actualCashCounted: number;
    tally: number;
    notes: string;
    saved: boolean;
  }>({
    openingFloat: 0,
    cardSales: 0,
    cashSales: 0,
    closingFloat: 0,
    cashToBank: 0,
    actualCashCounted: 0,
    tally: 0,
    notes: '',
    saved: false,
  });
  const [cashoutLoading, setCashoutLoading] = useState(false);
  const [cashoutSaving, setCashoutSaving] = useState(false);
  const [cashoutSaved, setCashoutSaved] = useState(false);


  // Auth check on page load
  useEffect(() => {
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const isAuth = cookies.some((c) => c.startsWith('auth=') && c.split('=')[1] === 'authenticated');
    if (!isAuth) {
      router.push('/login');
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  // Load staff name from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('active_staff');
    if (saved) setCurrentStaff(saved);
  }, []);

  const fetchSales = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      setSales((data.sales as Sale[]).sort((a, b) => {
        if (!a.timestamp) return -1;
        if (!b.timestamp) return 1;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (res.ok) setProducts(data.products);
    } catch {
      // non-critical, ignore
    }
  }, []);


  useEffect(() => {
    if (authChecked) {
      fetchSales(selectedDate);
      fetchProducts();
    }
  }, [selectedDate, fetchSales, fetchProducts, authChecked]);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  const handleSetStaff = () => {
    const name = staffInput.trim();
    localStorage.setItem('active_staff', name);
    setCurrentStaff(name);
    setEditingStaff(false);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const openModal = () => {
    setFormData(emptyForm);
    setEditingSale(null);
    setFormError(null);
    setFormSuccess(false);
    setModalOpen(true);
  };

  const openEditModal = (sale: Sale) => {
    setEditingSale(sale);
    setFormData({
      productName: sale.productName,
      quantity: sale.quantity,
      pricePerUnit: sale.pricePerUnit,
      paymentType: sale.paymentType,
      staffName: sale.staffName,
      category: sale.category || 'Other',
    });
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormError(null);
    setFormSuccess(false);
    setEditingSale(null);
  };

  const openProductsModal = () => {
    setProductForm({ name: '', pricePerUnit: 0, category: 'Furniture' });
    setProductFormError(null);
    setProductsModalOpen(true);
  };

  const closeProductsModal = () => {
    setProductsModalOpen(false);
    setProductFormError(null);
  };

  const handleProductFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setProductForm((prev) => ({
      ...prev,
      [name]: name === 'pricePerUnit' ? Number(value) : value,
    }));
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductFormError(null);
    if (!productForm.name.trim()) {
      setProductFormError('Product name is required.');
      return;
    }
    if (productForm.pricePerUnit <= 0) {
      setProductFormError('Price must be greater than 0.');
      return;
    }
    setProductSubmitting(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productForm.name.trim(),
          pricePerUnit: productForm.pricePerUnit,
          category: productForm.category,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add product');
      setProductForm({ name: '', pricePerUnit: 0, category: 'Furniture' });
      await fetchProducts();
    } catch (e: any) {
      setProductFormError(e.message);
    } finally {
      setProductSubmitting(false);
    }
  };

  const handleStartEdit = (product: Product) => {
    setEditingProduct({ ...product });
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditingProduct((prev) => prev ? {
      ...prev,
      [name]: name === 'pricePerUnit' ? Number(value) : value,
    } : null);
  };

  const handleSaveEdit = async () => {
    if (!editingProduct?.id) return;
    try {
      const res = await fetch(`/api/products?id=${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingProduct.name.trim(),
          pricePerUnit: editingProduct.pricePerUnit,
          category: editingProduct.category,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update product');
      setEditingProduct(null);
      await fetchProducts();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Delete this product from the catalogue?')) return;
    setDeletingProductId(id);
    try {
      const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete');
      await fetchProducts();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleQuickSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const productId = e.target.value;
    if (!productId) return;
    const product = products.find((p) => p.id === productId);
    if (product) {
      setFormData((prev) => ({
        ...prev,
        productName: product.name,
        pricePerUnit: product.pricePerUnit,
        category: product.category,
      }));
    }
  };

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'quantity' || name === 'pricePerUnit' ? Number(value) : value,
    }));
  };

  const calculatedTotal = formData.quantity * formData.pricePerUnit;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.productName.trim()) {
      setFormError('Product name is required.');
      return;
    }
    if (formData.quantity < 1) {
      setFormError('Quantity must be at least 1.');
      return;
    }
    if (formData.pricePerUnit <= 0) {
      setFormError('Price per unit must be greater than 0.');
      return;
    }
    if (!currentStaff.trim()) {
      setFormError('Please set the staff name at the top of the page before adding a sale.');
      return;
    }

    setSubmitting(true);
    try {
      const staffName = editingSale ? editingSale.staffName : currentStaff.trim();
      const body: Omit<Sale, 'id' | 'timestamp'> = {
        productName: formData.productName.trim(),
        quantity: formData.quantity,
        pricePerUnit: formData.pricePerUnit,
        total: calculatedTotal,
        paymentType: formData.paymentType,
        staffName,
        date: selectedDate,
        category: formData.category,
      };

      const url = editingSale ? `/api/sales?id=${editingSale.id}` : '/api/sales';
      const method = editingSale ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? (editingSale ? 'Failed to update sale' : 'Failed to add sale'));

      await fetchSales(selectedDate);

      if (editingSale) {
        closeModal();
      } else {
        // Keep modal open for next sale — reset form and show success flash
        setFormData(emptyForm);
        setFormError(null);
        setFormSuccess(true);
        setTimeout(() => setFormSuccess(false), 2500);
      }
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this sale?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/sales?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete');
      await fetchSales(selectedDate);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const openRefundModal = (sale: Sale) => {
    setRefundingSale(sale);
    setRefundQty(1);
    setRefundReason('');
    setRefundAuthorizedBy('');
    setRefundCustomerName('');
    setRefundCustomerAddress('');
    setRefundCustomerPhone('');
    setRefundError(null);
    setRefundModalOpen(true);
  };

  const closeRefundModal = () => {
    setRefundModalOpen(false);
    setRefundingSale(null);
    setRefundError(null);
  };

  const handleRefundSubmit = async () => {
    if (!refundingSale) return;
    if (!refundReason.trim() || !refundAuthorizedBy.trim()) {
      setRefundError('Reason for refund and authorized by are required.');
      return;
    }
    setRefundError(null);
    setRefundSubmitting(true);
    try {
      const body = {
        productName: refundingSale.productName,
        quantity: refundQty,
        pricePerUnit: refundingSale.pricePerUnit,
        total: -(refundQty * refundingSale.pricePerUnit),
        paymentType: refundingSale.paymentType,
        staffName: currentStaff || refundingSale.staffName,
        date: selectedDate,
        category: refundingSale.category || 'Other',
        type: 'refund',
        refundReason: refundReason.trim(),
        refundAuthorizedBy: refundAuthorizedBy.trim(),
        ...(refundCustomerName.trim() ? { refundCustomerName: refundCustomerName.trim() } : {}),
        ...(refundCustomerAddress.trim() ? { refundCustomerAddress: refundCustomerAddress.trim() } : {}),
        ...(refundCustomerPhone.trim() ? { refundCustomerPhone: refundCustomerPhone.trim() } : {}),
      };
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to process refund');
      await fetchSales(selectedDate);
      closeRefundModal();
    } catch (e: any) {
      setRefundError(e.message);
    } finally {
      setRefundSubmitting(false);
    }
  };

  const fetchCashout = useCallback(async (date: string, currentStats: Stats) => {
    setCashoutLoading(true);
    try {
      const res = await fetch(`/api/cashout?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch cashout');

      if (data.cashout) {
        setCashout({
          openingFloat: data.cashout.openingFloat ?? 0,
          cardSales: data.cashout.cardSales ?? 0,
          cashSales: data.cashout.cashSales ?? 0,
          closingFloat: data.cashout.closingFloat ?? 0,
          cashToBank: data.cashout.cashToBank ?? 0,
          actualCashCounted: data.cashout.actualCashCounted ?? 0,
          tally: data.cashout.tally ?? 0,
          notes: data.cashout.notes ?? '',
          saved: true,
        });
        setCashoutSaved(true);
      } else {
        const openingFloat = data.previousClosingFloat ?? 0;
        const cardSales = currentStats.cardTotal;
        const cashSales = currentStats.cashTotal;
        const closingFloat = 0;
        const actualCashCounted = 0;
        const cashToBank = openingFloat + cashSales - closingFloat;
        const tally = actualCashCounted - (openingFloat + cashSales);
        setCashout({
          openingFloat,
          cardSales,
          cashSales,
          closingFloat,
          cashToBank,
          actualCashCounted,
          tally,
          notes: '',
          saved: false,
        });
        setCashoutSaved(false);
      }
    } catch {
      // non-critical, silently ignore
    } finally {
      setCashoutLoading(false);
    }
  }, []);

  const handleCashoutChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setCashout((prev) => {
      const updated = { ...prev, [name]: name === 'notes' ? value : Number(value) };
      const cashToBank = updated.openingFloat + updated.cashSales - updated.closingFloat;
      const tally = updated.actualCashCounted - (updated.openingFloat + updated.cashSales);
      return { ...updated, cashToBank, tally };
    });
  };

  const handleSaveCashout = async () => {
    setCashoutSaving(true);
    try {
      const res = await fetch('/api/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          openingFloat: cashout.openingFloat,
          cardSales: cashout.cardSales,
          cashSales: cashout.cashSales,
          closingFloat: cashout.closingFloat,
          cashToBank: cashout.cashToBank,
          actualCashCounted: cashout.actualCashCounted,
          tally: cashout.tally,
          notes: cashout.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save cashout');
      setCashoutSaved(true);
      setCashout((prev) => ({ ...prev, saved: true }));
    } catch (e: any) {
      alert('Failed to save cashout: ' + e.message);
    } finally {
      setCashoutSaving(false);
    }
  };

  useEffect(() => {
    if (authChecked) {
      const currentStats = computeStats(sales);
      fetchCashout(selectedDate, currentStats);
    }
  }, [authChecked, selectedDate, sales, fetchCashout]);

  // Fetch period totals once on mount
  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      // Week: Monday–Sunday
      const dow = now.getDay(); // 0=Sun
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(now); monday.setDate(now.getDate() + diffToMon);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);

      // Month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Quarter
      const q = Math.floor(now.getMonth() / 3);
      const qStart = new Date(now.getFullYear(), q * 3, 1);
      const qEnd = new Date(now.getFullYear(), q * 3 + 3, 0);

      // Year
      const yearStart = `${now.getFullYear()}-01-01`;
      const yearEnd = `${now.getFullYear()}-12-31`;

      const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const weekLabel = `${fmt(monday)} – ${fmt(sunday)}`;
      const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
      const quarterLabel = `Q${q + 1} ${now.getFullYear()}`;
      const yearLabel = `${now.getFullYear()}`;

      try {
        const [wRes, mRes, qRes, yRes] = await Promise.all([
          fetch(`/api/sales?from=${fmt(monday)}&to=${fmt(sunday)}`),
          fetch(`/api/sales?from=${fmt(monthStart)}&to=${fmt(monthEnd)}`),
          fetch(`/api/sales?from=${fmt(qStart)}&to=${fmt(qEnd)}`),
          fetch(`/api/sales?from=${yearStart}&to=${yearEnd}`),
        ]);
        const [wData, mData, qData, yData] = await Promise.all([wRes.json(), mRes.json(), qRes.json(), yRes.json()]);
        const breakdown = (data: any) => {
          const s = ((data.sales ?? []) as Sale[]).filter((s) => s.type !== 'refund');
          return {
            total: s.reduce((sum, x) => sum + x.total, 0),
            cash: s.filter((x) => x.paymentType === 'cash').reduce((sum, x) => sum + x.total, 0),
            card: s.filter((x) => x.paymentType === 'card').reduce((sum, x) => sum + x.total, 0),
          };
        };
        const [w, m, q, y] = [breakdown(wData), breakdown(mData), breakdown(qData), breakdown(yData)];
        setPeriodTotals({
          week: w.total, weekCash: w.cash, weekCard: w.card, weekLabel,
          month: m.total, monthCash: m.cash, monthCard: m.card, monthLabel,
          quarter: q.total, quarterCash: q.cash, quarterCard: q.card, quarterLabel,
          year: y.total, yearCash: y.cash, yearCard: y.card, yearLabel,
        });
      } catch {
        // non-critical
      }
    })();
  }, [authChecked]);

  const stats = computeStats(sales);
  const bestSellers = computeBestSellers(sales);
  const staffLeaderboard = computeStaffLeaderboard(sales);
  const bestCategory = computeBestCategory(sales);

  if (!authChecked) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Scape West — Sales Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3d2b1f" />
      </Head>

      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-inner">
            <div className="header-title-block">
              <img src="/logo.png" alt="Scape West" className="header-logo" />
              <span className="header-subtitle">Sales Dashboard</span>
            </div>
            <div className="header-actions">
              <button className="btn-secondary" onClick={openProductsModal}>
                Manage Products
              </button>
              <button className="btn-secondary" onClick={() => router.push('/best-sellers')}>
                Best Sellers
              </button>
              <button className="btn-secondary" onClick={() => router.push('/search')}>
                Search
              </button>
              <button className="btn-secondary" onClick={() => router.push('/refunds')}>
                Refunds
              </button>
              <button className="btn-primary" onClick={openModal}>
                + Add Sale
              </button>
              <button className="btn-logout" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="main">
          {/* Date Picker */}
          <div className="date-row">
            <label className="date-label" htmlFor="date-picker">
              Viewing sales for:
            </label>
            <input
              id="date-picker"
              type="date"
              className="date-input"
              value={selectedDate}
              onChange={handleDateChange}
            />
            {selectedDate === todayString() && (
              <span className="badge-today">Today</span>
            )}
          </div>

          {/* Staff on Duty */}
          <div className="staff-row">
            {editingStaff ? (
              <div className="staff-edit">
                <span className="staff-label">Staff on duty:</span>
                <input
                  className="staff-input"
                  value={staffInput}
                  onChange={(e) => setStaffInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && staffInput.trim()) handleSetStaff(); }}
                  placeholder="Enter name..."
                  autoFocus
                />
                <button className="btn-primary" onClick={handleSetStaff} disabled={!staffInput.trim()}>
                  Set
                </button>
                {currentStaff && (
                  <button className="btn-secondary" onClick={() => setEditingStaff(false)}>
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div className="staff-display">
                <span className="staff-label">Staff on duty:</span>
                {currentStaff ? (
                  <>
                    <span className="staff-name">{currentStaff}</span>
                    <button
                      className="staff-change-btn"
                      onClick={() => { setStaffInput(currentStaff); setEditingStaff(true); }}
                    >
                      Change
                    </button>
                  </>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={() => { setStaffInput(''); setEditingStaff(true); }}
                  >
                    Set staff name
                  </button>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="error-banner">
              <strong>Error:</strong> {error}
            </div>
          )}

          {loading ? (
            <div className="loading">Loading sales...</div>
          ) : (
            <>
              {/* Tab bar */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <button
                  className={dashTab === 'today' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setDashTab('today')}
                >
                  Today
                </button>
                <button
                  className={dashTab === 'totals' ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setDashTab('totals')}
                >
                  Period Totals
                </button>
              </div>

              {dashTab === 'totals' && (
                <>
                  {periodTotals ? (
                    <div className="section-card">
                      <h2 className="section-title">Period Totals</h2>
                      <div className="stats-grid">
                        <div className="stat-card stat-card--blue">
                          <div className="stat-label">This Week (Mon–Sun)</div>
                          <div className="stat-value">{formatCurrency(periodTotals.week)}</div>
                          <div className="stat-sub">{periodTotals.weekLabel}</div>
                          <div className="stat-sub">Cash: {formatCurrency(periodTotals.weekCash)} · Card: {formatCurrency(periodTotals.weekCard)}</div>
                        </div>
                        <div className="stat-card stat-card--green">
                          <div className="stat-label">This Month</div>
                          <div className="stat-value">{formatCurrency(periodTotals.month)}</div>
                          <div className="stat-sub">{periodTotals.monthLabel}</div>
                          <div className="stat-sub">Cash: {formatCurrency(periodTotals.monthCash)} · Card: {formatCurrency(periodTotals.monthCard)}</div>
                        </div>
                        <div className="stat-card stat-card--purple">
                          <div className="stat-label">This Quarter</div>
                          <div className="stat-value">{formatCurrency(periodTotals.quarter)}</div>
                          <div className="stat-sub">{periodTotals.quarterLabel}</div>
                          <div className="stat-sub">Cash: {formatCurrency(periodTotals.quarterCash)} · Card: {formatCurrency(periodTotals.quarterCard)}</div>
                        </div>
                        <div className="stat-card stat-card--amber">
                          <div className="stat-label">This Year</div>
                          <div className="stat-value">{formatCurrency(periodTotals.year)}</div>
                          <div className="stat-sub">{periodTotals.yearLabel}</div>
                          <div className="stat-sub">Cash: {formatCurrency(periodTotals.yearCash)} · Card: {formatCurrency(periodTotals.yearCard)}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="empty-text">Loading period totals...</p>
                  )}
                </>
              )}

              {dashTab === 'today' && <>
              {/* Stats Cards */}
              <div className="stats-grid">
                <div className="stat-card stat-card--blue">
                  <div className="stat-label">Total Revenue</div>
                  <div className="stat-value">{formatCurrency(stats.totalRevenue)}</div>
                </div>
                <div className="stat-card stat-card--green">
                  <div className="stat-label">Number of Sales</div>
                  <div className="stat-value">{stats.numberOfSales}</div>
                </div>
                <div className="stat-card stat-card--purple">
                  <div className="stat-label">Average Sale</div>
                  <div className="stat-value">{formatCurrency(stats.averageSale)}</div>
                </div>
                <div className="stat-card stat-card--amber">
                  <div className="stat-label">Best Selling Category</div>
                  <div className="stat-value" style={{ fontSize: bestCategory ? '1.35rem' : '1.85rem' }}>
                    {bestCategory ? bestCategory.category : '—'}
                  </div>
                  {bestCategory && (
                    <div className="stat-sub">{bestCategory.unitsSold} units · {formatCurrency(bestCategory.revenue)}</div>
                  )}
                </div>
              </div>

              {/* Payment Breakdown */}
              <div className="section-card">
                <h2 className="section-title">Payment Breakdown</h2>
                <div className="payment-grid">
                  <div className="payment-item">
                    <span className="payment-icon payment-icon--cash">💵</span>
                    <div>
                      <div className="payment-label">Cash</div>
                      <div className="payment-value">{formatCurrency(stats.cashTotal)}</div>
                    </div>
                  </div>
                  <div className="payment-item">
                    <span className="payment-icon payment-icon--card">💳</span>
                    <div>
                      <div className="payment-label">Card</div>
                      <div className="payment-value">{formatCurrency(stats.cardTotal)}</div>
                    </div>
                  </div>
                  <div className="payment-item">
                    <span className="payment-icon payment-icon--online">🌐</span>
                    <div>
                      <div className="payment-label">Online</div>
                      <div className="payment-value">{formatCurrency(stats.onlineTotal)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="two-col">
                {/* Best Sellers */}
                <div className="section-card">
                  <h2 className="section-title">Best Sellers</h2>
                  {bestSellers.length === 0 ? (
                    <p className="empty-text">No sales yet for this date.</p>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Product</th>
                          <th>Units</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bestSellers.map((item, idx) => (
                          <tr key={item.productName}>
                            <td className="rank">{idx + 1}</td>
                            <td className="product-name">{item.productName}</td>
                            <td>{item.unitsSold}</td>
                            <td className="revenue">{formatCurrency(item.totalRevenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Staff Leaderboard */}
                <div className="section-card">
                  <h2 className="section-title">Staff Leaderboard</h2>
                  {staffLeaderboard.length === 0 ? (
                    <p className="empty-text">No sales yet for this date.</p>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Staff</th>
                          <th>Sales</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffLeaderboard.map((item, idx) => (
                          <tr key={item.staffName}>
                            <td className="rank">{idx + 1}</td>
                            <td className="product-name">{item.staffName}</td>
                            <td>{item.salesCount}</td>
                            <td className="revenue">{formatCurrency(item.totalRevenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Recent Sales */}
              <div className="section-card">
                <h2 className="section-title">
                  Recent Sales
                  {sales.length > 0 && (
                    <span className="count-badge">{sales.length}</span>
                  )}
                </h2>
                {sales.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-text">No sales recorded for this date.</p>
                    <button className="btn-primary" onClick={openModal}>
                      Add your first sale
                    </button>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Product</th>
                          <th>Category</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>Total</th>
                          <th>Payment</th>
                          <th>Staff</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((sale) => (
                          <tr key={sale.id} className={sale.type === 'refund' ? 'tr--refund' : ''}>
                            <td className="time-cell">{formatTime(sale.timestamp)}</td>
                            <td className="product-name">
                              {sale.productName}
                              {sale.type === 'refund' && (
                                <span className="refund-badge">Refund</span>
                              )}
                            </td>
                            <td>{sale.category || 'Other'}</td>
                            <td>{sale.quantity}</td>
                            <td>{formatCurrency(sale.pricePerUnit)}</td>
                            <td className={sale.type === 'refund' ? 'total-negative' : 'revenue'}>
                              {formatCurrency(sale.total)}
                            </td>
                            <td>
                              <span className={`payment-badge payment-badge--${sale.paymentType}`}>
                                {PAYMENT_LABELS[sale.paymentType]}
                              </span>
                            </td>
                            <td>{sale.staffName}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                {sale.type !== 'refund' && (
                                  <>
                                    <button
                                      className="btn-edit"
                                      onClick={() => openEditModal(sale)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="btn-refund"
                                      onClick={() => openRefundModal(sale)}
                                    >
                                      Refund
                                    </button>
                                  </>
                                )}
                                <button
                                  className="btn-delete"
                                  onClick={() => handleDelete(sale.id!)}
                                  disabled={deletingId === sale.id}
                                >
                                  {deletingId === sale.id ? '...' : 'Delete'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Daily Cashout */}
              <div className="section-card">
                <h2 className="section-title">
                  Daily Cashout
                  {cashoutSaved && (
                    <span className="cashout-saved-badge">Saved</span>
                  )}
                </h2>

                {cashoutLoading ? (
                  <p className="empty-text">Loading cashout...</p>
                ) : (
                  <>
                    <div className="cashout-grid">
                      <div className="form-group">
                        <label htmlFor="cashout-openingFloat">Opening Float (£)</label>
                        <input
                          id="cashout-openingFloat"
                          name="openingFloat"
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashout.openingFloat}
                          onChange={handleCashoutChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="cashout-cardSales">Card Sales (£)</label>
                        <input
                          id="cashout-cardSales"
                          name="cardSales"
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashout.cardSales}
                          onChange={handleCashoutChange}
                        />
                      </div>
                    </div>

                    <div className="cashout-grid">
                      <div className="form-group">
                        <label htmlFor="cashout-cashSales">Cash Sales (£)</label>
                        <input
                          id="cashout-cashSales"
                          name="cashSales"
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashout.cashSales}
                          onChange={handleCashoutChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="cashout-closingFloat">Closing Float (£)</label>
                        <input
                          id="cashout-closingFloat"
                          name="closingFloat"
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashout.closingFloat}
                          onChange={handleCashoutChange}
                        />
                      </div>
                    </div>

                    <div className="cashout-calc">
                      <span className="cashout-calc-label">Cash to Bank</span>
                      <span className="cashout-calc-value">{formatCurrency(cashout.cashToBank)}</span>
                    </div>

                    <div className="cashout-grid">
                      <div className="form-group">
                        <label htmlFor="cashout-actualCashCounted">Actual Cash Counted (£)</label>
                        <input
                          id="cashout-actualCashCounted"
                          name="actualCashCounted"
                          type="number"
                          min="0"
                          step="0.01"
                          value={cashout.actualCashCounted}
                          onChange={handleCashoutChange}
                        />
                      </div>
                      <div className="cashout-tally-box">
                        <div className="cashout-tally-label">Tally</div>
                        {cashout.tally === 0 ? (
                          <div className="cashout-tally--balanced">&#10003; Balanced</div>
                        ) : (
                          <div className="cashout-tally--off">
                            &#10007; {formatCurrency(Math.abs(cashout.tally))} {cashout.tally > 0 ? 'over' : 'short'}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '0.25rem' }}>
                      <label htmlFor="cashout-notes">Notes (optional)</label>
                      <textarea
                        id="cashout-notes"
                        name="notes"
                        className="cashout-notes"
                        placeholder="Any notes for this cashout..."
                        value={cashout.notes}
                        onChange={handleCashoutChange}
                      />
                    </div>

                    <button
                      className="btn-primary"
                      style={{ width: '100%', marginTop: '1rem' }}
                      onClick={handleSaveCashout}
                      disabled={cashoutSaving}
                    >
                      {cashoutSaving ? 'Saving...' : cashoutSaved ? 'Update Cashout' : 'Save Cashout'}
                    </button>
                  </>
                )}
              </div>

              </>}
            </>
          )}
        </main>
      </div>

      {/* Products Modal */}
      {productsModalOpen && (
        <div className="modal-overlay" onClick={closeProductsModal}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="products-modal-title"
            style={{ maxWidth: '560px' }}
          >
            <div className="modal-header">
              <h2 id="products-modal-title" className="modal-title">Product Catalogue</h2>
              <button className="modal-close" onClick={closeProductsModal} aria-label="Close">
                ✕
              </button>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 180px)', padding: '1.25rem 1.5rem' }}>
            {/* Existing products list */}
            <div style={{ marginBottom: '1.5rem' }}>
              {products.length === 0 ? (
                <p className="empty-text">No products in catalogue yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Category</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const isEditing = editingProduct?.id === product.id;
                      const ep = editingProduct!;
                      return isEditing ? (
                        <tr key={product.id}>
                          <td>
                            <input
                              name="name"
                              value={ep.name}
                              onChange={handleEditChange}
                              style={{ width: '100%', padding: '4px 6px', fontSize: '0.85rem' }}
                            />
                          </td>
                          <td>
                            <input
                              name="pricePerUnit"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={ep.pricePerUnit}
                              onChange={handleEditChange}
                              style={{ width: '80px', padding: '4px 6px', fontSize: '0.85rem' }}
                            />
                          </td>
                          <td>
                            <select
                              name="category"
                              value={ep.category}
                              onChange={handleEditChange}
                              style={{ padding: '4px 6px', fontSize: '0.85rem' }}
                            >
                              {CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn-primary" onClick={handleSaveEdit} style={{ marginRight: '4px', padding: '4px 10px', fontSize: '0.8rem' }}>Save</button>
                            <button className="btn-secondary" onClick={() => setEditingProduct(null)} style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Cancel</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={product.id}>
                          <td className="product-name">{product.name}</td>
                          <td>{formatCurrency(product.pricePerUnit)}</td>
                          <td>{product.category}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className="btn-secondary"
                              onClick={() => handleStartEdit(product)}
                              style={{ marginRight: '4px', padding: '4px 10px', fontSize: '0.8rem' }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-delete"
                              onClick={() => handleDeleteProduct(product.id!)}
                              disabled={deletingProductId === product.id}
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            >
                              {deletingProductId === product.id ? '...' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add new product form */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', color: 'var(--text-primary)' }}>Add New Product</h3>
              <form onSubmit={handleAddProduct} className="sale-form">
                {productFormError && (
                  <div className="form-error">{productFormError}</div>
                )}
                <div className="form-group">
                  <label htmlFor="productCatName">Name</label>
                  <input
                    id="productCatName"
                    name="name"
                    type="text"
                    placeholder="e.g. Oak Side Table"
                    value={productForm.name}
                    onChange={handleProductFormChange}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="productCatPrice">Price per Unit (£)</label>
                    <input
                      id="productCatPrice"
                      name="pricePerUnit"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={productForm.pricePerUnit === 0 ? '' : productForm.pricePerUnit}
                      onChange={handleProductFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="productCatCategory">Category</label>
                    <select
                      id="productCatCategory"
                      name="category"
                      value={productForm.category}
                      onChange={handleProductFormChange}
                      required
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeProductsModal}
                    disabled={productSubmitting}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={productSubmitting}
                  >
                    {productSubmitting ? 'Adding...' : 'Add Product'}
                  </button>
                </div>
              </form>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundModalOpen && refundingSale && (
        <div className="modal-overlay" onClick={closeRefundModal}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="refund-modal-title"
          >
            <div className="modal-header">
              <h2 id="refund-modal-title" className="modal-title">Process Refund</h2>
              <button className="modal-close" onClick={closeRefundModal} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="sale-form">
              {refundError && (
                <div className="form-error">{refundError}</div>
              )}

              <div className="refund-summary">
                <div className="refund-summary-row">
                  <span className="refund-summary-label">Product</span>
                  <span className="refund-summary-value">{refundingSale.productName}</span>
                </div>
                <div className="refund-summary-row">
                  <span className="refund-summary-label">Unit Price</span>
                  <span className="refund-summary-value">{formatCurrency(refundingSale.pricePerUnit)}</span>
                </div>
                <div className="refund-summary-row">
                  <span className="refund-summary-label">Payment</span>
                  <span className="refund-summary-value">{PAYMENT_LABELS[refundingSale.paymentType]}</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="refund-qty">Quantity to Refund</label>
                <input
                  id="refund-qty"
                  type="number"
                  min="1"
                  max={refundingSale.quantity}
                  step="1"
                  value={refundQty}
                  onChange={(e) => setRefundQty(Math.min(Number(e.target.value), refundingSale!.quantity))}
                />
                <span style={{ fontSize: '0.78rem', color: '#9b7d5e' }}>
                  Max: {refundingSale.quantity} (original qty)
                </span>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Reason for Refund <span style={{ color: '#c0392b' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Damaged item, wrong size..."
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Authorized By <span style={{ color: '#c0392b' }}>*</span></label>
                  <input
                    type="text"
                    placeholder="Manager name or ID"
                    value={refundAuthorizedBy}
                    onChange={(e) => setRefundAuthorizedBy(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#9b7d5e', margin: '-0.25rem 0 0.5rem' }}>
                Customer details (optional)
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Customer Name</label>
                  <input
                    type="text"
                    placeholder="Full name"
                    value={refundCustomerName}
                    onChange={(e) => setRefundCustomerName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. 07700 900000"
                    value={refundCustomerPhone}
                    onChange={(e) => setRefundCustomerPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  placeholder="Street, city, postcode"
                  value={refundCustomerAddress}
                  onChange={(e) => setRefundCustomerAddress(e.target.value)}
                />
              </div>

              <div className="refund-total-preview">
                <span className="total-label">Refund Amount</span>
                <span className="refund-total-amount">
                  -{formatCurrency(refundQty * refundingSale.pricePerUnit)}
                </span>
              </div>

              <div className="form-actions">
                <button className="btn-secondary" onClick={closeRefundModal} disabled={refundSubmitting}>
                  Cancel
                </button>
                <button
                  className="btn-delete"
                  style={{ padding: '0.55rem 1.2rem', fontSize: '0.9rem' }}
                  onClick={handleRefundSubmit}
                  disabled={refundSubmitting || refundQty < 1}
                >
                  {refundSubmitting ? 'Processing...' : 'Confirm Refund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Sale Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-header">
              <h2 id="modal-title" className="modal-title">{editingSale ? 'Edit Sale' : 'Add Sale'}</h2>
              <button className="modal-close" onClick={closeModal} aria-label="Close">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="sale-form">
              {formSuccess && (
                <div className="form-success">Sale added! Add another below.</div>
              )}
              {formError && (
                <div className="form-error">{formError}</div>
              )}

              {products.length > 0 && (
                <div className="form-group">
                  <label htmlFor="quickSelect">Select a product (optional)</label>
                  <select
                    id="quickSelect"
                    onChange={handleQuickSelect}
                    defaultValue=""
                  >
                    <option value="">— choose from catalogue —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatCurrency(p.pricePerUnit)} ({p.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="productName">Product Name</label>
                <input
                  id="productName"
                  name="productName"
                  type="text"
                  placeholder="e.g. Oak Side Table"
                  value={formData.productName}
                  onChange={handleFormChange}
                  autoComplete="off"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="category">Category</label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleFormChange}
                  required
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="quantity">Quantity</label>
                  <input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.quantity}
                    onChange={handleFormChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="pricePerUnit">Price per Unit (£)</label>
                  <input
                    id="pricePerUnit"
                    name="pricePerUnit"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.pricePerUnit === 0 ? '' : formData.pricePerUnit}
                    onChange={handleFormChange}
                    required
                  />
                </div>
              </div>

              {/* Auto-calculated total */}
              <div className="total-preview">
                <span className="total-label">Total:</span>
                <span className="total-amount">{formatCurrency(calculatedTotal)}</span>
              </div>

              <div className="form-group">
                <label htmlFor="paymentType">Payment Type</label>
                <select
                  id="paymentType"
                  name="paymentType"
                  value={formData.paymentType}
                  onChange={handleFormChange}
                  required
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                </select>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || calculatedTotal <= 0}
                >
                  {submitting ? 'Saving...' : editingSale ? 'Save Changes' : 'Add Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
