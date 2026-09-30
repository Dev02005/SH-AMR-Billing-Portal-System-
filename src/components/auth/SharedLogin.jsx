import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../../api';
import { errorMessage } from '../../api/client';
import { clearSession, saveSession } from '../../api/session';
import { RESTAURANT } from '../../config/brand.js';
import { usePageTitle } from '../../hooks/usePageTitle';
import InstallAppButton from '../layout/InstallAppButton';
import Tagline from '../layout/Tagline';
import './SharedLogin.css';

export default function SharedLogin({ portal, accounts, targetRole, helperText }) {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  usePageTitle(`${portal.name} login`);

  useEffect(() => {
    // Arriving at a login screen means whatever session existed is finished.
    clearSession();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setError('Select an account and enter the password.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const data = await login(email, password);

      if (!targetRole.includes(data.user.role)) {
        setError(`This portal is for ${targetRole.join(' or ')} accounts, not ${data.user.role}.`);
        return;
      }

      saveSession(data.token, data.user);
      setSuccess('Signed in — opening the portal…');
      navigate(portal.path, { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in'));
    } finally {
      setLoading(false);
    }
  };

  const selectedLabel = accounts.find((a) => a.value === email)?.label;

  return (
    <div className="page-shell">
      <header className="header">
        <div className="header-container">
          <div className="header-brand-info">
            <h1>
              <span className="login-brand-line">
                <span className="brand-s">S</span>
                <span className="brand-amp">&amp;</span>
                <span className="brand-h">H</span>{' '}ARABIAN{' '}MANDI
              </span>{' '}
              RESTAURANT
            </h1>
            <Tagline />
            <div className="header-portal-subtitle">{portal.name}</div>
          </div>
          <div className="install-app">
            <InstallAppButton portal={portal} onResult={(message) => { setError(''); setSuccess(message); }} />
          </div>
        </div>
      </header>

      <main className="login-container">
        <div className="login-box">
          <div className="login-header">
            <h2 className="login-title">Login</h2>
          </div>

          {error && <div className="error-message show" role="alert">{error}</div>}
          {success && <div className="success-message show" role="status">{success}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label id="account-label">Account</label>
              <div
                className="custom-dropdown"
                role="button"
                tabIndex={0}
                aria-labelledby="account-label"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((open) => !open)}
                onKeyDown={(e) => e.key === 'Enter' && setDropdownOpen((open) => !open)}
              >
                <div className={`dropdown-selected ${email ? '' : 'placeholder'}`}>
                  {selectedLabel || 'Select account'}
                  <span className="dropdown-arrow">▼</span>
                </div>

                {dropdownOpen && (
                  <div className="dropdown-options">
                    {accounts.map((account) => (
                      <div
                        key={account.value}
                        className="dropdown-option"
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEmail(account.value);
                          setError('');
                          setDropdownOpen(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.stopPropagation();
                          setEmail(account.value);
                          setDropdownOpen(false);
                        }}
                      >
                        {account.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Password</label>
              <div className="password-field">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Login'}
              {loading && <span className="loading-spinner show" />}
            </button>
          </form>

          {helperText && <div className="helper-text">{helperText}</div>}
        </div>
      </main>

      <footer className="login-footer">
        <b>{RESTAURANT.credit}</b>
      </footer>
    </div>
  );
}
