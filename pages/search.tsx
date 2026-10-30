import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Sale } from '../types/sale';

interface HandoverNote {
  date: string;
  text: string;
  updatedBy: string;
  updatedAt: string | null;
}

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function matchesTerm(sale: Sale, term: string): boolean {
  return sale.productName.toLowerCase().includes(term.toLowerCase().trim());
}

interface PeriodResult {
  label: string;
  units: number;
  revenue: number;
  transactions: number;
  sales: Sale[];
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
    const filtered = sales
      .filter((s) => s.date >= from && s.date <= to && matchesTerm(s, term))
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      label,
      units: filtered.reduce((sum, s) => sum + s.quantity, 0),
      revenue: filtered.reduce((sum, s) => sum + s.total, 0),
      transactions: filtered.length,
      sales: filtered,
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

  // Handover search
  const [handoverQuery, setHandoverQuery] = useState('');
  const [handoverResults, setHandoverResults] = useState<HandoverNote[]>([]);
  const [handoverSearched, setHandoverSearched] = useState(false);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [handoverSearchedTerm, setHandoverSearchedTerm] = useState('');
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);

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

  const handleHandoverSearch = async () => {
    const term = handoverQuery.trim();
    if (!term) return;
    setHandoverLoading(true);
    setHandoverError(null);
    setHandoverSearched(false);
    try {
      const res = await fetch('/api/handover?all=true');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch');
      const matches = (data.notes as HandoverNote[])
        .filter((n) => n.text.toLowerCase().includes(term.toLowerCase()))
        .sort((a, b) => b.date.localeCompare(a.date));
      setHandoverResults(matches);
      setHandoverSearchedTerm(term);
      setHandoverSearched(true);
    } catch (e: any) {
      setHandoverError(e.message);
    } finally {
      setHandoverLoading(false);
    }
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
                    <p style={{ fontSize: '0.82rem', color: '#9b7d5e', marginBottom: '1rem' }}>
                      Click a period to see individual sale dates.
                    </p>
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
                        {periodResults.map((row) => {
                          const isOpen = expandedPeriod === row.label;
                          const hasData = row.transactions > 0;
                          return (
                            <>
                              <tr
                                key={row.label}
                                onClick={() => hasData && setExpandedPeriod(isOpen ? null : row.label)}
                                style={{ cursor: hasData ? 'pointer' : 'default', background: isOpen ? '#fdf3e7' : undefined }}
                              >
                                <td className="product-name" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  {hasData && (
                                    <span style={{
                                      fontSize: '0.65rem',
                                      color: '#9b7d5e',
                                      display: 'inline-block',
                                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                                      transition: 'transform 0.15s',
                                    }}>▶</span>
                                  )}
                                  {row.label}
                                </td>
                                <td>{row.units > 0 ? row.units : <span style={{ color: '#c49a6c' }}>—</span>}</td>
                                <td>{row.transactions > 0 ? row.transactions : <span style={{ color: '#c49a6c' }}>—</span>}</td>
                                <td className="revenue">
                                  {row.revenue > 0 ? formatCurrency(row.revenue) : <span style={{ color: '#c49a6c' }}>—</span>}
                                </td>
                              </tr>
                              {isOpen && (
                                <tr key={`${row.label}-expanded`}>
                                  <td colSpan={4} style={{ padding: '0.75rem 1rem 1rem', background: '#fdf8f2', borderTop: '1px solid #ede0cc' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                                      <thead>
                                        <tr style={{ borderBottom: '1px solid #e5d5be' }}>
                                          <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: '#7a6555', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
                                          <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: '#7a6555', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Product</th>
                                          <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: '#7a6555', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Qty</th>
                                          <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: '#7a6555', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Price</th>
                                          <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: '#7a6555', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Staff</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.sales.map((sale) => (
                                          <tr key={sale.id} style={{ borderBottom: '1px solid #f0e6d6' }}>
                                            <td style={{ padding: '0.4rem 0.5rem', color: '#3d2b1f', whiteSpace: 'nowrap' }}>
                                              {formatDate(sale.date)}
                                              {sale.timestamp && (
                                                <span style={{ color: '#b8956a', marginLeft: '0.4rem', fontSize: '0.78rem' }}>
                                                  {formatTime(sale.timestamp)}
                                                </span>
                                              )}
                                            </td>
                                            <td style={{ padding: '0.4rem 0.5rem', color: '#3d2b1f' }}>{sale.productName}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', color: '#3d2b1f' }}>{sale.quantity}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', color: '#3d2b1f', fontWeight: 600 }}>{formatCurrency(sale.total)}</td>
                                            <td style={{ padding: '0.4rem 0.5rem', color: '#9b7d5e' }}>{sale.staffName || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
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
          {/* Handover Notes Search */}
          <div className="section-card" style={{ marginTop: '1.5rem' }}>
            <h2 className="section-title">Search Handover Notes</h2>
            <p style={{ fontSize: '0.88rem', color: '#9b7d5e', marginBottom: '1rem' }}>
              Search through all saved handover notes by keyword.
            </p>
            <div className="search-row">
              <input
                className="search-input"
                type="text"
                placeholder="e.g. delivery, hold, float, Mrs Taylor..."
                value={handoverQuery}
                onChange={(e) => setHandoverQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleHandoverSearch(); }}
              />
              <button
                className="btn-primary"
                onClick={handleHandoverSearch}
                disabled={handoverLoading || !handoverQuery.trim()}
              >
                {handoverLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
            {handoverError && (
              <div className="error-banner" style={{ marginTop: '1rem' }}>
                <strong>Error:</strong> {handoverError}
              </div>
            )}
          </div>

          {handoverSearched && (
            <div className="section-card">
              <h2 className="section-title">
                Handover notes matching "{handoverSearchedTerm}"
                <span className="count-badge">{handoverResults.length}</span>
              </h2>
              {handoverResults.length === 0 ? (
                <p className="empty-text">No handover notes found matching that keyword.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {handoverResults.map((note) => (
                    <div key={note.date} className="handover-prev">
                      <div className="handover-prev-label">
                        {note.date}{note.updatedBy ? ` — left by ${note.updatedBy}` : ''}
                      </div>
                      <div className="handover-prev-text">
                        {note.text.split(new RegExp(`(${handoverSearchedTerm})`, 'gi')).map((part, i) =>
                          part.toLowerCase() === handoverSearchedTerm.toLowerCase()
                            ? <mark key={i} style={{ background: '#fde68a', borderRadius: '3px', padding: '0 2px' }}>{part}</mark>
                            : part
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
