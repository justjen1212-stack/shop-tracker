import { useState, useEffect, useRef } from 'react';
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function matchesTerm(sale: Sale, term: string): boolean {
  return sale.productName.toLowerCase().includes(term.toLowerCase().trim());
}

interface PeriodResult {
  label: string;
  units: number;
  revenue: number;
  transactions: number;
}

function computeAllPeriods(sales: Sale[], term: string, today: string): PeriodResult[] {
  const week = getWeekRange(today);
  const month = getMonthRange(today);
  const quarter = getQuarterRange(today);
  const year = getYearRange(today);

  const periods = [
    { label: 'Today', from: today, to: today },
    { label: 'This Week', from: week.from, to: week.to },
    { label: 'This Month', from: month.from, to: month.to },
    { label: 'This Quarter', from: quarter.from, to: quarter.to },
    { label: 'This Year', from: year.from, to: year.to },
  ];

  return periods.map(({ label, from, to }) => {
    const filtered = sales.filter(
      (s) => s.date >= from && s.date <= to && matchesTerm(s, term)
    );
    return {
      label,
      units: filtered.reduce((sum, s) => sum + s.quantity, 0),
      revenue: filtered.reduce((sum, s) => sum + s.total, 0),
      transactions: filtered.length,
    };
  });
}

interface MatchedProduct {
  productName: string;
  units: number;
  revenue: number;
}

function computeMatchedProducts(sales: Sale[], term: string): MatchedProduct[] {
  const map = new Map<string, MatchedProduct>();
  for (const sale of sales) {
    if (!matchesTerm(sale, term)) continue;
    const key = sale.productName.toLowerCase().trim();
    const existing = map.get(key);
    if (existing) {
      existing.units += sale.quantity;
      existing.revenue += sale.total;
    } else {
      map.set(key, {
        productName: sale.productName,
        units: sale.quantity,
        revenue: sale.total,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export default function SearchPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [query, setQuery] = useState('');
  const [searchedTerm, setSearchedTerm] = useState('');
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cookies = document.cookie.split(';').map((c) => c.trim());
    const isAuth = cookies.some((c) => c.startsWith('auth=') && c.split('=')[1] === 'authenticated');
    if (!isAuth) {
      router.push('/login');
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  const handleSearch = async () => {
    const term = query.trim();
    if (!term) return;

    setLoading(true);
    setError(null);
    setSearched(false);

    try {
      const today = todayString();
      const { from, to } = getYearRange(today);
      const res = await fetch(`/api/sales?from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      setAllSales(data.sales as Sale[]);
      setSearchedTerm(term);
      setSearched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  if (!authChecked) return null;

  const today = todayString();
  const periodResults = searched ? computeAllPeriods(allSales, searchedTerm, today) : [];
  const matchedProducts = searched ? computeMatchedProducts(allSales, searchedTerm) : [];
  const hasResults = matchedProducts.length > 0;

  return (
    <>
      <Head>
        <title>Product Search — Scape West</title>
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
              <span className="header-subtitle">Product Search</span>
            </div>
            <div className="header-actions">
              <button className="btn-secondary" onClick={() => router.push('/')}>
                Dashboard
              </button>
              <button className="btn-secondary" onClick={() => router.push('/best-sellers')}>
                Best Sellers
              </button>
              <button className="btn-logout" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </div>
        </header>

        <main className="main">
          {/* Search Box */}
          <div className="section-card">
            <h2 className="section-title">Search Products</h2>
            <p style={{ fontSize: '0.88rem', color: '#9b7d5e', marginBottom: '1rem' }}>
              Enter a product name or keyword to see sales across all time periods.
            </p>
            <div className="search-row">
              <input
                ref={inputRef}
                className="search-input"
                type="text"
                placeholder="e.g. pistol, oak table, mirror..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              <button
                className="btn-primary"
                onClick={handleSearch}
                disabled={loading || !query.trim()}
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
            {error && (
              <div className="error-banner" style={{ marginTop: '1rem' }}>
                <strong>Error:</strong> {error}
              </div>
            )}
          </div>

          {/* Results */}
          {searched && (
            <>
              {!hasResults ? (
                <div className="section-card">
                  <p className="empty-text">
                    No sales found matching <strong>"{searchedTerm}"</strong> this year.
                  </p>
                </div>
              ) : (
                <>
                  {/* Period Breakdown */}
                  <div className="section-card">
                    <h2 className="section-title">
                      Sales for "{searchedTerm}"
                      <span className="count-badge">{matchedProducts.length} product{matchedProducts.length !== 1 ? 's' : ''}</span>
                    </h2>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th>Units Sold</th>
                          <th>Transactions</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periodResults.map((row) => (
                          <tr key={row.label}>
                            <td className="product-name">{row.label}</td>
                            <td>{row.units > 0 ? row.units : <span style={{ color: '#c49a6c' }}>—</span>}</td>
                            <td>{row.transactions > 0 ? row.transactions : <span style={{ color: '#c49a6c' }}>—</span>}</td>
                            <td className="revenue">
                              {row.revenue > 0 ? formatCurrency(row.revenue) : <span style={{ color: '#c49a6c' }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Matching Products (year total) */}
                  <div className="section-card">
                    <h2 className="section-title">Matching Products — Year to Date</h2>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Product Name</th>
                          <th>Units Sold</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchedProducts.map((p, idx) => (
                          <tr key={p.productName}>
                            <td className="rank">{idx + 1}</td>
                            <td className="product-name">{p.productName}</td>
                            <td>{p.units}</td>
                            <td className="revenue">{formatCurrency(p.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
