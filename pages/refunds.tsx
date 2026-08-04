import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Sale } from '../types/sale';

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
  return new Date(isoString).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const PAYMENT_LABELS: Record<string, string> = { cash: 'Cash', card: 'Card', online: 'Online' };
const CATEGORIES = ['Furniture', 'Mirrors', 'Lighting', 'Textiles', 'Accessories', 'Artwork', 'Gifts', 'Hats', 'Pistols', 'Other'];

interface ManualRefundForm {
  productName: string;
  date: string;
  pricePerUnit: number;
  quantity: number;
  paymentType: 'cash' | 'card' | 'online';
  category: string;
}

const emptyManualForm: ManualRefundForm = {
  productName: '',
  date: todayString(),
  pricePerUnit: 0,
  quantity: 1,
  paymentType: 'cash',
  category: 'Other',
};

export default function RefundsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<string>('');

  // --- Sales lookup (refund from existing sale) ---
  const [selectedDate, setSelectedDate] = useState<string>(todayString());
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  // Refund-from-sale modal
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundingSale, setRefundingSale] = useState<Sale | null>(null);
  const [refundQty, setRefundQty] = useState(1);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState(false);

  // --- Manual refund form ---
  const [manualForm, setManualForm] = useState<ManualRefundForm>(emptyManualForm);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState(false);

  // --- Refunds history list ---
  const [allRefunds, setAllRefunds] = useState<Sale[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [refundsError, setRefundsError] = useState<string | null>(null);

  // Edit refund modal
  const [editingRefund, setEditingRefund] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState<ManualRefundForm>(emptyManualForm);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const isAuth = cookies.some((c) => c.startsWith('auth=') && c.split('=')[1] === 'authenticated');
    if (!isAuth) {
      router.push('/login');
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  useEffect(() => {
    const saved = localStorage.getItem('active_staff');
    if (saved) setCurrentStaff(saved);
  }, []);

  // Fetch sales for the chosen date (to refund from)
  const fetchSales = useCallback(async (date: string) => {
    setSalesLoading(true);
    setSalesError(null);
    try {
      const res = await fetch(`/api/sales?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      const sorted = (data.sales as Sale[])
        .filter((s) => s.type !== 'refund')
        .sort((a, b) => {
          if (!a.timestamp) return -1;
          if (!b.timestamp) return 1;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });
      setSales(sorted);
    } catch (e: any) {
      setSalesError(e.message);
    } finally {
      setSalesLoading(false);
    }
  }, []);

  // Fetch all refunds for the current year
  const fetchAllRefunds = useCallback(async () => {
    setRefundsLoading(true);
    setRefundsError(null);
    try {
      const year = todayString().slice(0, 4);
      const res = await fetch(`/api/sales?from=${year}-01-01&to=${year}-12-31`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      const refunds = (data.sales as Sale[])
        .filter((s) => s.type === 'refund')
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          if (!a.timestamp) return 1;
          if (!b.timestamp) return -1;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
      setAllRefunds(refunds);
    } catch (e: any) {
      setRefundsError(e.message);
    } finally {
      setRefundsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) {
      fetchSales(selectedDate);
      fetchAllRefunds();
    }
  }, [authChecked, selectedDate, fetchSales, fetchAllRefunds]);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  // --- Refund from existing sale ---
  const openRefundModal = (sale: Sale) => {
    setRefundingSale(sale);
    setRefundQty(1);
    setRefundError(null);
    setRefundSuccess(false);
    setRefundModalOpen(true);
  };

  const closeRefundModal = () => {
    setRefundModalOpen(false);
    setRefundingSale(null);
    setRefundError(null);
    setRefundSuccess(false);
  };

  const handleRefundSubmit = async () => {
    if (!refundingSale) return;
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
        date: todayString(),
        category: refundingSale.category || 'Other',
        type: 'refund',
      };
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to process refund');
      setRefundSuccess(true);
      await fetchAllRefunds();
      setTimeout(() => closeRefundModal(), 1800);
    } catch (e: any) {
      setRefundError(e.message);
    } finally {
      setRefundSubmitting(false);
    }
  };

  // --- Manual refund form ---
  const handleManualChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setManualForm((prev) => ({
      ...prev,
      [name]: name === 'pricePerUnit' || name === 'quantity' ? Number(value) : value,
    }));
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    if (!manualForm.productName.trim()) { setManualError('Product name is required.'); return; }
    if (manualForm.pricePerUnit <= 0) { setManualError('Price must be greater than 0.'); return; }
    if (manualForm.quantity < 1) { setManualError('Quantity must be at least 1.'); return; }

    setManualSubmitting(true);
    try {
      const body = {
        productName: manualForm.productName.trim(),
        quantity: manualForm.quantity,
        pricePerUnit: manualForm.pricePerUnit,
        total: -(manualForm.quantity * manualForm.pricePerUnit),
        paymentType: manualForm.paymentType,
        staffName: currentStaff || 'Manual',
        date: manualForm.date,
        category: manualForm.category,
        type: 'refund',
      };
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save refund');
      setManualForm({ ...emptyManualForm, date: todayString() });
      setManualSuccess(true);
      setTimeout(() => setManualSuccess(false), 2500);
      await fetchAllRefunds();
    } catch (e: any) {
      setManualError(e.message);
    } finally {
      setManualSubmitting(false);
    }
  };

  // --- Edit refund ---
  const openEditModal = (refund: Sale) => {
    setEditingRefund(refund);
    setEditForm({
      productName: refund.productName,
      date: refund.date,
      pricePerUnit: refund.pricePerUnit,
      quantity: refund.quantity,
      paymentType: refund.paymentType,
      category: refund.category || 'Other',
    });
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditingRefund(null);
    setEditError(null);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: name === 'pricePerUnit' || name === 'quantity' ? Number(value) : value,
    }));
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRefund) return;
    setEditError(null);
    if (!editForm.productName.trim()) { setEditError('Product name is required.'); return; }
    if (editForm.pricePerUnit <= 0) { setEditError('Price must be greater than 0.'); return; }
    if (editForm.quantity < 1) { setEditError('Quantity must be at least 1.'); return; }

    setEditSubmitting(true);
    try {
      const body = {
        productName: editForm.productName.trim(),
        quantity: editForm.quantity,
        pricePerUnit: editForm.pricePerUnit,
        total: -(editForm.quantity * editForm.pricePerUnit),
        paymentType: editForm.paymentType,
        staffName: editingRefund.staffName,
        date: editForm.date,
        category: editForm.category,
        type: 'refund',
      };
      const res = await fetch(`/api/sales?id=${editingRefund.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update refund');
      closeEditModal();
      await fetchAllRefunds();
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const manualTotal = manualForm.quantity * manualForm.pricePerUnit;
  const editTotal = editForm.quantity * editForm.pricePerUnit;

  if (!authChecked) return null;

  return (
    <>
      <Head>
        <title>Refunds — Scape West</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3d2b1f" />
      </Head>

      <div className="app">
        <header className="header">
          <div className="header-inner">
            <div className="header-title-block">
              <img src="/logo.png" alt="Scape West" className="header-logo" />
              <span className="header-subtitle">Refunds</span>
            </div>
            <div className="header-actions">
              <button className="btn-secondary" onClick={() => router.push('/')}>Dashboard</button>
              <button className="btn-logout" onClick={handleLogout}>Log out</button>
            </div>
          </div>
        </header>

        <main className="main">

          {/* ── Refund from existing sale ── */}
          <div className="section-card">
            <h2 className="section-title">Refund from a Sale</h2>
            <p style={{ fontSize: '0.88rem', color: '#9b7d5e', marginBottom: '1rem' }}>
              Pick the date of the original sale, then click Refund on the item.
            </p>
            <div className="date-row">
              <label className="date-label" htmlFor="date-picker">Sales from:</label>
              <input
                id="date-picker"
                type="date"
                className="date-input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
          </div>

          {salesError && <div className="error-banner"><strong>Error:</strong> {salesError}</div>}

          {salesLoading ? (
            <div className="loading">Loading sales...</div>
          ) : (
            <div className="section-card">
              <h2 className="section-title">
                Sales on {selectedDate}
                {sales.length > 0 && <span className="count-badge">{sales.length}</span>}
              </h2>
              {sales.length === 0 ? (
                <p className="empty-text">No sales found for this date.</p>
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
                            <button className="btn-refund" onClick={() => openRefundModal(sale)}>
                              Refund
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Manual Refund Form ── */}
          <div className="section-card">
            <h2 className="section-title">Manual Refund</h2>
            <p style={{ fontSize: '0.88rem', color: '#9b7d5e', marginBottom: '1rem' }}>
              Enter the refund details manually — use this for items not in the sales list.
            </p>
            <form onSubmit={handleManualSubmit} className="sale-form">
              {manualSuccess && <div className="form-success">Refund recorded successfully!</div>}
              {manualError && <div className="form-error">{manualError}</div>}

              <div className="form-group">
                <label htmlFor="manual-productName">Product Name</label>
                <input
                  id="manual-productName"
                  name="productName"
                  type="text"
                  placeholder="e.g. Oak Side Table"
                  value={manualForm.productName}
                  onChange={handleManualChange}
                  autoComplete="off"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="manual-date">Refund Date</label>
                  <input
                    id="manual-date"
                    name="date"
                    type="date"
                    value={manualForm.date}
                    onChange={handleManualChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="manual-category">Category</label>
                  <select
                    id="manual-category"
                    name="category"
                    value={manualForm.category}
                    onChange={handleManualChange}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="manual-quantity">Quantity</label>
                  <input
                    id="manual-quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={manualForm.quantity}
                    onChange={handleManualChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="manual-pricePerUnit">Price per Unit (£)</label>
                  <input
                    id="manual-pricePerUnit"
                    name="pricePerUnit"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={manualForm.pricePerUnit === 0 ? '' : manualForm.pricePerUnit}
                    onChange={handleManualChange}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="manual-paymentType">Payment Type</label>
                <select
                  id="manual-paymentType"
                  name="paymentType"
                  value={manualForm.paymentType}
                  onChange={handleManualChange}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                </select>
              </div>

              {manualTotal > 0 && (
                <div className="refund-total-preview">
                  <span className="total-label">Refund Amount</span>
                  <span className="refund-total-amount">-{formatCurrency(manualTotal)}</span>
                </div>
              )}

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={manualSubmitting}>
                  {manualSubmitting ? 'Saving...' : 'Record Refund'}
                </button>
              </div>
            </form>
          </div>

          {/* ── Refunds History ── */}
          <div className="section-card">
            <h2 className="section-title">
              Refund History — {todayString().slice(0, 4)}
              {allRefunds.length > 0 && <span className="count-badge">{allRefunds.length}</span>}
            </h2>

            {refundsError && <div className="error-banner"><strong>Error:</strong> {refundsError}</div>}

            {refundsLoading ? (
              <p className="empty-text">Loading refunds...</p>
            ) : allRefunds.length === 0 ? (
              <p className="empty-text">No refunds recorded this year.</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Refund</th>
                      <th>Payment</th>
                      <th>Staff</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRefunds.map((refund) => (
                      <tr key={refund.id} className="tr--refund">
                        <td>{refund.date}</td>
                        <td className="time-cell">{formatTime(refund.timestamp)}</td>
                        <td className="product-name">{refund.productName}</td>
                        <td>{refund.category || 'Other'}</td>
                        <td>{refund.quantity}</td>
                        <td>{formatCurrency(refund.pricePerUnit)}</td>
                        <td className="total-negative">{formatCurrency(refund.total)}</td>
                        <td>
                          <span className={`payment-badge payment-badge--${refund.paymentType}`}>
                            {PAYMENT_LABELS[refund.paymentType]}
                          </span>
                        </td>
                        <td>{refund.staffName}</td>
                        <td>
                          <button className="btn-edit" onClick={() => openEditModal(refund)}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </main>
      </div>

      {/* Refund-from-sale Modal */}
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
              <button className="modal-close" onClick={closeRefundModal} aria-label="Close">✕</button>
            </div>
            <div className="sale-form">
              {refundSuccess && <div className="form-success">Refund processed successfully!</div>}
              {refundError && <div className="form-error">{refundError}</div>}
              <div className="refund-summary">
                <div className="refund-summary-row">
                  <span className="refund-summary-label">Product</span>
                  <span className="refund-summary-value">{refundingSale.productName}</span>
                </div>
                <div className="refund-summary-row">
                  <span className="refund-summary-label">Original Date</span>
                  <span className="refund-summary-value">{refundingSale.date}</span>
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
              <div className="refund-total-preview">
                <span className="total-label">Refund Amount</span>
                <span className="refund-total-amount">-{formatCurrency(refundQty * refundingSale.pricePerUnit)}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#9b7d5e', margin: '0 0 0.5rem' }}>
                Refund will be recorded on today's date.
              </p>
              <div className="form-actions">
                <button className="btn-secondary" onClick={closeRefundModal} disabled={refundSubmitting}>Cancel</button>
                <button
                  className="btn-delete"
                  style={{ padding: '0.55rem 1.2rem', fontSize: '0.9rem' }}
                  onClick={handleRefundSubmit}
                  disabled={refundSubmitting || refundQty < 1 || refundSuccess}
                >
                  {refundSubmitting ? 'Processing...' : 'Confirm Refund'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Refund Modal */}
      {editingRefund && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-refund-modal-title"
          >
            <div className="modal-header">
              <h2 id="edit-refund-modal-title" className="modal-title">Edit Refund</h2>
              <button className="modal-close" onClick={closeEditModal} aria-label="Close">✕</button>
            </div>
            <form onSubmit={handleEditSubmit} className="sale-form">
              {editError && <div className="form-error">{editError}</div>}

              <div className="form-group">
                <label htmlFor="edit-productName">Product Name</label>
                <input
                  id="edit-productName"
                  name="productName"
                  type="text"
                  value={editForm.productName}
                  onChange={handleEditChange}
                  autoComplete="off"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-date">Refund Date</label>
                  <input
                    id="edit-date"
                    name="date"
                    type="date"
                    value={editForm.date}
                    onChange={handleEditChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-category">Category</label>
                  <select
                    id="edit-category"
                    name="category"
                    value={editForm.category}
                    onChange={handleEditChange}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="edit-quantity">Quantity</label>
                  <input
                    id="edit-quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={editForm.quantity}
                    onChange={handleEditChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-pricePerUnit">Price per Unit (£)</label>
                  <input
                    id="edit-pricePerUnit"
                    name="pricePerUnit"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editForm.pricePerUnit === 0 ? '' : editForm.pricePerUnit}
                    onChange={handleEditChange}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="edit-paymentType">Payment Type</label>
                <select
                  id="edit-paymentType"
                  name="paymentType"
                  value={editForm.paymentType}
                  onChange={handleEditChange}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                </select>
              </div>

              {editTotal > 0 && (
                <div className="refund-total-preview">
                  <span className="total-label">Refund Amount</span>
                  <span className="refund-total-amount">-{formatCurrency(editTotal)}</span>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={closeEditModal} disabled={editSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={editSubmitting}>
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
