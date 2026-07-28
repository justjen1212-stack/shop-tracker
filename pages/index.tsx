import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Sale, SaleFormData } from '../types/sale';

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
  totalRevenue: number;
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
    map.set(cat, (map.get(cat) ?? 0) + sale.total);
  }
  if (map.size === 0) return null;
  let best: BestCategory = { category: '', totalRevenue: 0 };
  map.forEach((totalRevenue, category) => {
    if (totalRevenue > best.totalRevenue) {
      best = { category, totalRevenue };
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
      setSales(data.sales);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) {
      fetchSales(selectedDate);
    }
  }, [selectedDate, fetchSales, authChecked]);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const openModal = () => {
    setFormData(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setFormError(null);
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

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to add sale');

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
      </Head>

      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-inner">
            <div className="header-title-block">
              <h1 className="header-title">Scape West</h1>
              <span className="header-subtitle">Sales Dashboard</span>
            </div>
            <div className="header-actions">
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
                    <div className="stat-sub">{formatCurrency(bestCategory.totalRevenue)}</div>
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
                              <button
                                className="btn-delete"
                                onClick={() => handleDelete(sale.id!)}
                                disabled={deletingId === sale.id}
                              >
                                {deletingId === sale.id ? '...' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

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
              <h2 id="modal-title" className="modal-title">Add Sale</h2>
              <button className="modal-close" onClick={closeModal} aria-label="Close">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="sale-form">
              {formError && (
                <div className="form-error">{formError}</div>
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
                  {submitting ? 'Saving...' : 'Add Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
