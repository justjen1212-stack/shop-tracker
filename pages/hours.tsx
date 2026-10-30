import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Sale } from '../types/sale';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function formatHour(hour: number): string {
  const ampm = hour < 12 ? 'am' : 'pm';
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:00${ampm}`;
}

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface HourStat {
  hour: number;
  revenue: number;
  sales: number;
}

export default function HoursPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const [hourStats, setHourStats] = useState<HourStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [batchCount, setBatchCount] = useState(0);
  const [excludeBatches, setExcludeBatches] = useState(true);

  useEffect(() => {
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const isAuth = cookies.some((c) => c.startsWith('auth=') && c.split('=')[1] === 'authenticated');
    if (!isAuth) router.push('/login');
    else setAuthChecked(true);
  }, [router]);

  const fetchData = useCallback(async (year: number, month: number, exclude: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = getMonthRange(year, month);
      const res = await fetch(`/api/sales?from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');

      const sales = (data.sales as Sale[])
        .filter((s) => s.type !== 'refund' && s.timestamp)
        .sort((a, b) => new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime());

      // Detect end-of-day batch entries: 10+ sales after 5pm within a 5-minute window
      const BATCH_WINDOW_MS = 5 * 60 * 1000;
      const BATCH_MIN = 10;
      const AFTER_HOUR = 17; // 5pm
      const batchIds = new Set<string>();

      for (let i = 0; i < sales.length; i++) {
        const startTime = new Date(sales[i].timestamp!);
        if (startTime.getHours() < AFTER_HOUR) continue;

        const group: string[] = [sales[i].id!];
        for (let j = i + 1; j < sales.length; j++) {
          const diff = new Date(sales[j].timestamp!).getTime() - startTime.getTime();
          if (diff <= BATCH_WINDOW_MS) group.push(sales[j].id!);
          else break;
        }
        if (group.length >= BATCH_MIN) {
          group.forEach((id) => batchIds.add(id));
        }
      }

      setBatchCount(batchIds.size);

      const filtered = exclude ? sales.filter((s) => !batchIds.has(s.id!)) : sales;

      // Build hour buckets 0–23
      const buckets: Record<number, HourStat> = {};
      for (let h = 0; h < 24; h++) {
        buckets[h] = { hour: h, revenue: 0, sales: 0 };
      }

      for (const sale of filtered) {
        const hour = new Date(sale.timestamp!).getHours();
        buckets[hour].revenue += sale.total;
        buckets[hour].sales += 1;
      }

      setHourStats(Object.values(buckets));
      setTotalRevenue(filtered.reduce((sum, s) => sum + s.total, 0));
      setTotalSales(filtered.length);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) fetchData(selectedYear, selectedMonth, excludeBatches);
  }, [authChecked, selectedYear, selectedMonth, excludeBatches, fetchData]);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  if (!authChecked) return null;

  // Only show hours that have at least 1 sale OR are typical trading hours (8–20)
  const tradingStats = hourStats.filter((h) => h.sales > 0 || (h.hour >= 8 && h.hour <= 20));
  const maxRevenue = Math.max(...hourStats.map((h) => h.revenue), 1);
  const sorted = [...hourStats].filter((h) => h.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  const top3 = new Set(sorted.slice(0, 3).map((h) => h.hour));

  // Available years (current year and 2 back)
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <>
      <Head>
        <title>Peak Hours — Scape West</title>
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
              <span className="header-subtitle">Peak Hours</span>
            </div>
            <div className="header-actions">
              <button className="btn-secondary" onClick={() => router.push('/')}>Dashboard</button>
              <button className="btn-secondary" onClick={() => router.push('/best-sellers')}>Best Sellers</button>
              <button className="btn-secondary" onClick={() => router.push('/search')}>Search</button>
              <button className="btn-logout" onClick={handleLogout}>Log out</button>
            </div>
          </div>
        </header>

        <main className="main">
          {/* Month Picker */}
          <div className="section-card">
            <h2 className="section-title">Most Profitable Hours</h2>
            <p style={{ fontSize: '0.88rem', color: '#9b7d5e', marginBottom: '1.25rem' }}>
              See which hours of the day generate the most revenue for a given month.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4a2e1a' }}>Month</label>
                <select
                  className="date-input"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4a2e1a' }}>Year</label>
                <select
                  className="date-input"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Batch toggle */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem', paddingTop: '1.2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                  <div
                    onClick={() => setExcludeBatches(!excludeBatches)}
                    style={{
                      width: '38px', height: '22px', borderRadius: '999px',
                      background: excludeBatches ? '#7d4e2d' : '#d4b896',
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '3px',
                      left: excludeBatches ? '19px' : '3px',
                      width: '16px', height: '16px', borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#4a2e1a' }}>
                    Exclude batch entries
                  </span>
                </label>
                {batchCount > 0 && (
                  <span style={{
                    fontSize: '0.72rem', background: '#fef3e2', color: '#92400e',
                    border: '1px solid #fde68a', borderRadius: '999px',
                    padding: '0.15rem 0.6rem', fontWeight: 600,
                  }}>
                    {batchCount} detected
                  </span>
                )}
              </div>
            </div>
            {batchCount > 0 && excludeBatches && (
              <p style={{ marginTop: '0.9rem', fontSize: '0.82rem', color: '#92400e', background: '#fef9e7', borderRadius: '8px', padding: '0.6rem 0.9rem', border: '1px solid #fde68a' }}>
                {batchCount} sales after 5pm entered within a 5-minute window (10+) have been excluded — these were likely entered as a batch at end of shift and would skew the hourly data.
              </p>
            )}
          </div>

          {error && (
            <div className="error-banner"><strong>Error:</strong> {error}</div>
          )}

          {loading ? (
            <div className="loading">Loading peak hours data...</div>
          ) : totalSales === 0 ? (
            <div className="section-card">
              <p className="empty-text">No sales recorded for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.</p>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card stat-card--blue">
                  <div className="stat-label">Total Revenue</div>
                  <div className="stat-value">{formatCurrency(totalRevenue)}</div>
                  <div className="stat-sub">{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</div>
                </div>
                <div className="stat-card stat-card--green">
                  <div className="stat-label">Total Sales</div>
                  <div className="stat-value">{totalSales}</div>
                  <div className="stat-sub">transactions this month</div>
                </div>
                <div className="stat-card stat-card--purple">
                  <div className="stat-label">Peak Hour</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {sorted[0] ? formatHour(sorted[0].hour) : '—'}
                  </div>
                  {sorted[0] && (
                    <div className="stat-sub">{formatCurrency(sorted[0].revenue)} · {sorted[0].sales} sales</div>
                  )}
                </div>
              </div>

              {/* Bar Chart */}
              <div className="section-card">
                <h2 className="section-title">Revenue by Hour — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {tradingStats.map((stat) => {
                    const pct = maxRevenue > 0 ? (stat.revenue / maxRevenue) * 100 : 0;
                    const isTop = top3.has(stat.hour);
                    const rank = sorted.findIndex((s) => s.hour === stat.hour) + 1;
                    return (
                      <div key={stat.hour} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {/* Hour label */}
                        <div style={{
                          width: '60px',
                          minWidth: '60px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: isTop ? '#3d2b1f' : '#9b7d5e',
                          textAlign: 'right',
                        }}>
                          {formatHour(stat.hour)}
                        </div>

                        {/* Bar */}
                        <div style={{ flex: 1, background: '#f0e6d6', borderRadius: '6px', height: '28px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`,
                            height: '100%',
                            borderRadius: '6px',
                            background: isTop
                              ? 'linear-gradient(90deg, #7d4e2d 0%, #b8845a 100%)'
                              : 'linear-gradient(90deg, #c9a96e 0%, #d4b896 100%)',
                            transition: 'width 0.4s ease',
                            minWidth: pct > 0 ? '4px' : '0',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '0.5rem',
                          }}>
                            {pct > 18 && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                                {formatCurrency(stat.revenue)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats + rank badge */}
                        <div style={{ width: '140px', minWidth: '140px', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          {stat.revenue > 0 && pct <= 18 && (
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#3d2b1f' }}>
                              {formatCurrency(stat.revenue)}
                            </span>
                          )}
                          {stat.sales > 0 && (
                            <span style={{ fontSize: '0.72rem', color: '#9b7d5e' }}>
                              {stat.sales} sale{stat.sales !== 1 ? 's' : ''}
                            </span>
                          )}
                          {isTop && (
                            <span style={{
                              background: rank === 1 ? '#7d4e2d' : rank === 2 ? '#b8845a' : '#c9a96e',
                              color: '#fff',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '999px',
                              whiteSpace: 'nowrap',
                            }}>
                              #{rank}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #ede0cc', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'linear-gradient(90deg, #7d4e2d, #b8845a)' }} />
                    <span style={{ fontSize: '0.78rem', color: '#7a6555', fontWeight: 500 }}>Top 3 hours</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: 'linear-gradient(90deg, #c9a96e, #d4b896)' }} />
                    <span style={{ fontSize: '0.78rem', color: '#7a6555', fontWeight: 500 }}>Other hours</span>
                  </div>
                </div>
              </div>

              {/* Rankings table */}
              <div className="section-card">
                <h2 className="section-title">
                  Hour Rankings
                  <span className="count-badge">{sorted.length} active hours</span>
                </h2>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Hour</th>
                        <th>Revenue</th>
                        <th>Sales</th>
                        <th>Avg per Sale</th>
                        <th>% of Day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((stat, idx) => (
                        <tr key={stat.hour}>
                          <td className="rank">{idx + 1}</td>
                          <td className="product-name">{formatHour(stat.hour)}</td>
                          <td className="revenue">{formatCurrency(stat.revenue)}</td>
                          <td>{stat.sales}</td>
                          <td>{formatCurrency(stat.revenue / stat.sales)}</td>
                          <td style={{ color: '#9b7d5e' }}>{((stat.revenue / totalRevenue) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
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
