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

export default function RefundsPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(todayString());
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStaff, setCurrentStaff] = useState<string>('');

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundingSale, setRefundingSale] = useState<Sale | null>(null);
  const [refundQty, setRefundQty] = useState(1);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState(false);

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

  const fetchSales = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
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
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) fetchSales(selectedDate);
  }, [authChecked, selectedDate, fetchSales]);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

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
      setTimeout(() => closeRefundModal(), 1800);
    } catch (e: any) {
      setRefundError(e.message);
    } finally {
      setRefundSubmitting(false);
    }
  };

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
              <button className="btn-secondary" onClick={() => router.push('/')}>
                Dashboard
              </button>
              <button className="btn-logout" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="main">
          <div className="section-card">
            <h2 className="section-title">Process a Refund</h2>
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

          {error && (
            <div className="error-banner"><strong>Error:</strong> {error}</div>
          )}

          {loading ? (
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
        </main>
      </div>

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
              <button className="modal-close" onClick={closeRefundModal} aria-label="Close">✕</button>
            </div>

            <div className="sale-form">
              {refundSuccess && (
                <div className="form-success">Refund processed successfully!</div>
              )}
              {refundError && (
                <div className="form-error">{refundError}</div>
              )}

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
                <span className="refund-total-amount">
                  -{formatCurrency(refundQty * refundingSale.pricePerUnit)}
                </span>
              </div>

              <p style={{ fontSize: '0.8rem', color: '#9b7d5e', margin: '0 0 0.5rem' }}>
                Refund will be recorded on today's date.
              </p>

              <div className="form-actions">
                <button className="btn-secondary" onClick={closeRefundModal} disabled={refundSubmitting}>
                  Cancel
                </button>
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
    </>
  );
}
