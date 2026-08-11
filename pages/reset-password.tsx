import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function ResetPassword() {
  const router = useRouter();
  const { token } = router.query;

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch('/api/reset-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset password');
      setStatus('success');
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <>
      <Head>
        <title>Reset Password — Scape West</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/logo.png" />
        <meta name="theme-color" content="#3d2b1f" />
      </Head>

      <div className="login-page">
        <div className="login-card">
          <div className="login-header">
            <img src="/logo.png" alt="Scape West" className="login-logo" />
            <p className="login-subtitle">Reset Password</p>
          </div>

          <div className="login-form">
            {status === 'success' ? (
              <>
                <div className="form-success" style={{ textAlign: 'center' }}>
                  Password updated successfully!
                </div>
                <button className="login-btn" onClick={() => router.push('/login')}>
                  Back to Login
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {error && <div className="login-error">{error}</div>}

                <div className="login-field">
                  <label htmlFor="new-password">New Password</label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="login-field">
                  <label htmlFor="confirm-password">Confirm Password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="login-btn"
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? 'Saving...' : 'Set New Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
