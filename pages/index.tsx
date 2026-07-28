import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Sale, SaleFormData, Product } from '../types/sale';

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

const CATEGORIES = ['Furniture', 'Mirrors', 'Lighting', 'Textiles', 'Accessories', 'Artwork', 'Gifts', 'Hats', 'Other'];

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
    const existing = map.get(sale.productName);
    if (existing) {
      existing.totalRevenue += sale.total;
      existing.unitsSold += sale.quantity;
    } else {
      map.set(sale.productName, {
        productName: sale.productName,
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
  const map = new Map<string, number>();
  for (const sale of sales) {
    const cat = sale.category || 'Other';
    map.set(cat, (map.get(cat) ?? 0) + sale.quantity);
  }
  if (map.size === 0) return null;
  let best: BestCategory = { category: '', unitsSold: 0 };
  map.forEach((unitsSold, category) => {
    if (unitsSold > best.unitsSold) {
      best = { category, unitsSold };
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
  paymentType: 'cash',
  staffName: '',
  category: 'Furniture',
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

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const openModal = () => {
    setFormData(emptyForm);
    setEditingSale(null);
    setFormError(null);
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
    if (!formData.staffName.trim()) {
      setFormError('Staff name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const body: Omit<Sale, 'id' | 'timestamp'> = {
        productName: formData.productName.trim(),
        quantity: formData.quantity,
        pricePerUnit: formData.pricePerUnit,
        total: calculatedTotal,
        paymentType: formData.paymentType,
        staffName: formData.staffName.trim(),
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

      closeModal();
      await fetchSales(selectedDate);
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

          {error && (
            <div className="error-banner">
              <strong>Error:</strong> {error}
            </div>
          )}

          {loading ? (
            <div className="loading">Loading sales...</div>
          ) : (
            <>
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
                    <div className="stat-sub">{bestCategory.unitsSold} units sold</div>
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
                          <tr key={sale.id}>
                            <td className="time-cell">{formatTime(sale.timestamp)}</td>
                            <td className="product-name">{sale.productName}</td>
                            <td>{sale.category || 'Other'}</td>
                            <td>{sale.quantity}</td>
                            <td>{formatCurrency(sale.pricePerUnit)}</td>
                            <td className="revenue">{formatCurrency(sale.total)}</td>
                            <td>
                              <span className={`payment-badge payment-badge--${sale.paymentType}`}>
                                {PAYMENT_LABELS[sale.paymentType]}
                              </span>
                            </td>
                            <td>{sale.staffName}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button
                                  className="btn-edit"
                                  onClick={() => openEditModal(sale)}
                                >
                                  Edit
                                </button>
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
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td className="product-name">{product.name}</td>
                        <td>{formatCurrency(product.pricePerUnit)}</td>
                        <td>{product.category}</td>
                        <td>
                          <button
                            className="btn-delete"
                            onClick={() => handleDeleteProduct(product.id!)}
                            disabled={deletingProductId === product.id}
                          >
                            {deletingProductId === product.id ? '...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
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

              <div className="form-group">
                <label htmlFor="staffName">Staff Name</label>
                <input
                  id="staffName"
                  name="staffName"
                  type="text"
                  placeholder="e.g. Alice"
                  value={formData.staffName}
                  onChange={handleFormChange}
                  autoComplete="off"
                  required
                />
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
