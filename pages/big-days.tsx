import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Sale } from '../types/sale';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface DayStat {
  date: string;
  revenue: number;
  sales: number;
  staff: string[];
  cashTotal: number;
  cardTotal: number;
}

export default function BigDaysPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [threshold] = useState(1000);
  const [days, setDays] = useState<DayStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const isAuth = cookies.some((c) => c.startsWith('auth=') && c.split('=')[1] === 'authenticated');
    if (!isAuth) router.push('/login');
    else setAuthChecked(true);
  }, [router]);

  const fetchData = useCallback(async (year: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales?from=${year}-01-01&to=${year}-12-31`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');

      const sales = (data.sales as Sale[]).filter((s) => s.type !== 'refund');

      // Group by date
      const map = new Map<string, DayStat>();
      for (const sale of sales) {
        const existing = map.get(sale.date) ?? {
          date: sale.date,
          revenue: 0,
          sales: 0,
          staff: [],
          cashTotal: 0,
          cardTotal: 0,
        };
        existing.revenue += sale.total;
        existing.sales += 1;
        if (sale.staffName && !existing.staff.includes(sale.staffName)) {
          existing.staff.push(sale.staffName);
        }
        if (sale.paymentType === 'cash') existing.cashTotal += sale.total;
        if (sale.paymentType === 'card') existing.cardTotal += sale.total;
        map.set(sale.date, existing);
      }

      const result = Array.from(map.values())
        .filter((d) => d.revenue >= threshold)
        .sort((a, b) => b.revenue - a.revenue);

      setDays(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    if (authChecked) fetchData(selectedYear);
  }, [authChecked, selectedYear, fetchData]);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  if (!authChecked) return null;

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const bestDay = days[0];
  const totalAbove = days.reduce((sum, d) => sum + d.revenue, 0);

  return (
    <>
      <Head>
        <title>Big Days — Scape West</title>
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
              <span className="header-subtitle">Big Days</span>
            </div>
            <div className="header-actions">
              <button className="btn-secondary" onClick={() => router.push('/')}>Dashboard</button>
              <button className="btn-secondary" onClick={() => router.push('/best-sellers')}>Best Sellers</button>
              <button className="btn-secondary" onClick={() => router.push('/hours')}>Peak Hours</button>
              <button className="btn-secondary" onClick={() => router.push('/search')}>Search</button>
              <button className="btn-logout" onClick={handleLogout}>Log out</button>
            </div>
          </div>
        </header>

        <main className="main">
          {/* Controls */}
          <div className="section-card">
            <h2 className="section-title">Days Over £1,000</h2>
            <p style={{ fontSize: '0.88rem', color: '#9b7d5e', marginBottom: '1.25rem' }}>
              Every day that hit £1,000+ in revenue, ranked highest to lowest.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4a2e1a' }}>Year</label>
                <select
                  className="date-input"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error && <div className="error-banner"><strong>Error:</strong> {error}</div>}

          {loading ? (
            <div className="loading">Loading...</div>
          ) : days.length === 0 ? (
            <div className="section-card">
              <p className="empty-text">No days over £1,000 found for {selectedYear}.</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card stat-card--blue">
                  <div className="stat-label">Days Over £1,000</div>
                  <div className="stat-value">{days.length}</div>
                  <div className="stat-sub">in {selectedYear}</div>
                </div>
                <div className="stat-card stat-card--green">
                  <div className="stat-label">Best Day</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{bestDay ? formatCurrency(bestDay.revenue) : '—'}</div>
                  {bestDay && <div className="stat-sub">{formatDate(bestDay.date)}</div>}
                </div>
                <div className="stat-card stat-card--purple">
                  <div className="stat-label">Combined Revenue</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{formatCurrency(totalAbove)}</div>
                  <div className="stat-sub">across all £1k+ days</div>
                </div>
              </div>

              {/* Days list */}
              <div className="section-card">
                <h2 className="section-title">
                  All £1,000+ Days
                  <span className="count-badge">{days.length} days</span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {days.map((day, idx) => (
                    <div
                      key={day.date}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem 1.25rem',
                        borderRadius: '12px',
                        background: idx === 0 ? 'linear-gradient(135deg, #fef3e2 0%, #fde8c8 100%)' : '#fdf8f2',
                        border: `1.5px solid ${idx === 0 ? '#c9a96e' : '#e5d5be'}`,
                        flexWrap: 'wrap',
                      }}
                    >
                      {/* Rank */}
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                        background: idx === 0 ? '#7d4e2d' : idx === 1 ? '#b8845a' : idx === 2 ? '#c9a96e' : '#e5d5be',
                        color: idx < 3 ? '#fff' : '#7a6555',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.78rem', fontWeight: 800,
                      }}>
                        {idx + 1}
                      </div>

                      {/* Date + staff */}
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2c1a0e' }}>
                          {formatDate(day.date)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#9b7d5e', marginTop: '0.2rem' }}>
                          {day.staff.length > 0
                            ? `Staff: ${day.staff.join(', ')}`
                            : 'No staff recorded'}
                        </div>
                      </div>

                      {/* Revenue */}
                      <div style={{ textAlign: 'right', minWidth: '120px' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2c1a0e', letterSpacing: '-0.02em' }}>
                          {formatCurrency(day.revenue)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9b7d5e' }}>
                          {day.sales} sale{day.sales !== 1 ? 's' : ''}
                        </div>
                      </div>

                      {/* Payment split */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {day.cashTotal > 0 && (
                          <span className="payment-badge payment-badge--cash">
                            Cash {formatCurrency(day.cashTotal)}
                          </span>
                        )}
                        {day.cardTotal > 0 && (
                          <span className="payment-badge payment-badge--card">
                            Card {formatCurrency(day.cardTotal)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* By month breakdown */}
              <div className="section-card">
                <h2 className="section-title">By Month</h2>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>£1k+ Days</th>
                        <th>Best Day Revenue</th>
                        <th>Top Staff on Best Day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MONTH_NAMES.map((name, mi) => {
                        const monthDays = days.filter((d) => Number(d.date.slice(5, 7)) === mi + 1);
                        if (monthDays.length === 0) return null;
                        const best = monthDays[0];
                        return (
                          <tr key={name}>
                            <td className="product-name">{name}</td>
                            <td>
                              <span className="count-badge">{monthDays.length}</span>
                            </td>
                            <td className="revenue">{formatCurrency(best.revenue)}</td>
                            <td style={{ color: '#9b7d5e', fontSize: '0.85rem' }}>
                              {best.staff.join(', ') || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
