import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reset-request', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#4a7c59', fontWeight: 600 }}>
        Reset link sent — check your email.
      </p>
    );
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {error && <p style={{ color: '#b91c1c', fontSize: '0.82rem', marginBottom: '0.5rem' }}>{error}</p>}
      <button
        type="button"
        onClick={handleRequest}
        disabled={loading}
        style={{
          background: 'none',
          border: 'none',
          color: '#7d4e2d',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 0,
        }}
      >
        {loading ? 'Sending...' : 'Forgot password?'}
      </button>
    </div>
  );
}

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push('/');
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login — Scape West</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#3d2b1f" />
      </Head>

      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <img src="/logo.png" alt="Scape West" className="login-logo" />
            <p className="login-subtitle">Sales Dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="login-error">{error}</div>
            )}

            <div className="login-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                placeholder="Enter username"
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <ForgotPassword />
          </form>
        </div>
      </div>
    </>
  );
}
