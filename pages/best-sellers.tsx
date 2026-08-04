import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Sale } from '../types/sale';

function todayString(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function getWeekRange(date: string): { from: string; to: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d); mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { from: fmt(mon), to: fmt(sun) };
}

function getMonthRange(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

function getQuarterRange(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const q = Math.floor((m - 1) / 3);
  const fromMonth = String(q * 3 + 1).padStart(2, '0');
  const toMonth = String(q * 3 + 3).padStart(2, '0');
  const lastDay = new Date(y, q * 3 + 3, 0).getDate();
  return { from: `${y}-${fromMonth}-01`, to: `${y}-${toMonth}-${lastDay}` };
}

function getYearRange(date: string): { from: string; to: string } {
  const y = date.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function formatDateRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  return `${f.toLocaleDateString('en-GB', opts)} – ${t.toLocaleDateString('en-GB', opts)}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

interface BestSeller {
  productName: string;
  totalRevenue: number;
  unitsSold: number;
}

function normalizeProductKey(name: string): string {
  let n = name.trim().toLowerCase();
  if (n.length > 3 && n.endsWith('s') && !n.endsWith('ss')) {
    n = n.slice(0, -1);
  }
  return n;
}

function toTitleCase(str: string): string {
  return str.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeTop10(sales: Sale[]): { byQty: BestSeller[]; byValue: BestSeller[] } {
  const map = new Map<string, BestSeller>();
  for (const sale of sales) {
    const key = normalizeProductKey(sale.productName);
    const existing = map.get(key);
    if (existing) {
      existing.totalRevenue += sale.total;
      existing.unitsSold += sale.quantity;
    } else {
      map.set(key, { productName: toTitleCase(sale.productName), totalRevenue: sale.total, unitsSold: sale.quantity });
    }
  }
  const all = Array.from(map.values());
  return {
    byQty: [...all].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10),
    byValue: [...all].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 10),
  };
}

type PeriodTab = 'week' | 'month' | 'quarter' | 'year';

export default function BestSellers() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [selectedDate] = useState<string>(todayString());
  const [periodTab, setPeriodTab] = useState<PeriodTab>('week');
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const isAuth = cookies.some((c) => c.startsWith('auth=') && c.split('=')[1] === 'authenticated');
    if (!isAuth) {
      router.push('/login');
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  const fetchSalesForPeriod = useCallback(async (tab: PeriodTab, date: string) => {
    setLoading(true);
    setSales([]);
    try {
      let range: { from: string; to: string };
      if (tab === 'week') range = getWeekRange(date);
      else if (tab === 'month') range = getMonthRange(date);
      else if (tab === 'quarter') range = getQuarterRange(date);
      else range = getYearRange(date);

      const res = await fetch(`/api/sales?from=${range.from}&to=${range.to}`);
      const data = await res.json();
      if (res.ok) setSales(data.sales as Sale[]);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) {
      fetchSalesForPeriod(periodTab, selectedDate);
    }
  }, [authChecked, periodTab, selectedDate, fetchSalesForPeriod]);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  const getActiveRange = () => {
    if (periodTab === 'week') return getWeekRange(selectedDate);
    if (periodTab === 'month') return getMonthRange(selectedDate);
    if (periodTab === 'quarter') return getQuarterRange(selectedDate);
    return getYearRange(selectedDate);
  };

  if (!authChecked) return null;

  const { byQty, byValue } = computeTop10(sales);
  const range = getActiveRange();

  return (
    <>
      <Head>
        <title>Best Sellers — Scape West</title>
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
              <span className="header-subtitle">Best Sellers</span>
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
            <h2 className="section-title">Best Sellers</h2>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              {(['week', 'month', 'quarter', 'year'] as PeriodTab[]).map((tab) => (
                <button
                  key={tab}
                  className={periodTab === tab ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setPeriodTab(tab)}
                >
                  {tab === 'week' ? 'This Week' : tab === 'month' ? 'This Month' : tab === 'quarter' ? 'This Quarter' : 'This Year'}
                </button>
              ))}
            </div>

            <p style={{ fontSize: '0.82rem', color: '#9b7d5e', marginBottom: '1.25rem' }}>
              {formatDateRange(range.from, range.to)}
            </p>

            {loading ? (
              <p className="empty-text">Loading...</p>
            ) : sales.length === 0 ? (
              <p className="empty-text">No sales in this period.</p>
            ) : (
              <div className="two-col">
                <div>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3d2b1f', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Top 10 by Units Sold
                  </h3>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Product</th>
                        <th>Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byQty.map((item, idx) => (
                        <tr key={item.productName}>
                          <td className="rank">{idx + 1}</td>
                          <td className="product-name">{item.productName}</td>
                          <td>{item.unitsSold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3d2b1f', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Top 10 by Value
                  </h3>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Product</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byValue.map((item, idx) => (
                        <tr key={item.productName}>
                          <td className="rank">{idx + 1}</td>
                          <td className="product-name">{item.productName}</td>
                          <td className="revenue">{formatCurrency(item.totalRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
