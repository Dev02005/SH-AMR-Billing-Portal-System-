import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout as logoutRequest } from '../../api';
import { clearSession, getUser } from '../../api/session';
import { RESTAURANT } from '../../config/brand.js';
import { usePageTitle } from '../../hooks/usePageTitle';
import SettingsDropdown from './SettingsDropdown';
import { AnalyticsIcon, BackIcon, DownloadIcon, RefreshIcon, TablesIcon } from '../ui/icons';

export default function SharedHeader({
  titleText,
  showAnalyticsBtn = false,
  showBackBtn = false,
  showTablesBtn = false,
  onTables,
  tablesBadge = 0,
  backRoute = '/billing',
  loginPath = '/billing/login',
  showSettingsBtn = true,
  showDownloadBtn = false,
  onDownload,
  showHeaderInfo = true,
  onAddCategory,
  onDeleteCategory,
  onAddMenu,
  onEditMenu,
  onDeleteMenu,
  onRefresh,
  refreshing = false,
}) {
  const navigate = useNavigate();
  const user = useMemo(() => getUser(), []);
  usePageTitle(titleText);

  const handleLogout = useCallback(async () => {
    // Tell the server for the audit log, but never let a failed call trap the
    // user in a session they asked to end.
    try {
      await logoutRequest();
    } catch {
      /* ignore */
    } finally {
      clearSession();
      navigate(loginPath, { replace: true });
    }
  }, [loginPath, navigate]);


  return (
    <header className="header" role="banner">
      <div className="header-top-row">
        <div className={`header-icons ${onRefresh ? 'has-refresh' : ''}`}>
          {showSettingsBtn && (
            <SettingsDropdown
              user={user}
              onLogout={handleLogout}
              onAddCategory={onAddCategory}
              onDeleteCategory={onDeleteCategory}
              onAddMenu={onAddMenu}
              onEditMenu={onEditMenu}
              onDeleteMenu={onDeleteMenu}
            />
          )}
          {onRefresh && (
            <button
              type="button"
              className={`icon-btn refresh-btn ${refreshing ? 'is-refreshing' : ''}`}
              onClick={onRefresh}
              disabled={refreshing}
              title="Refresh now"
              aria-label="Refresh now"
            >
              <RefreshIcon />
            </button>
          )}
        </div>

        <div className="billing-portal-heading">
          <h1>
            <span className="brand-s">S</span>
            <span className="brand-amp">&amp;</span>
            <span className="brand-h">H</span>
            {' '}ARABIAN{' '}MANDI RESTAURANT
          </h1>
          <h3>{RESTAURANT.tagline}</h3>
          {titleText && <div className="header-portal-subtitle">{titleText}</div>}
        </div>

        <div className="header-actions">
          {showTablesBtn && onTables && (
            <button
              type="button"
              className="icon-btn"
              onClick={onTables}
              title={tablesBadge > 0
                ? `Table plan — ${tablesBadge} served ${tablesBadge === 1 ? 'table' : 'tables'} waiting for the bill`
                : 'Table plan — table status'}
              aria-label={tablesBadge > 0 ? `Tables, ${tablesBadge} waiting for the bill` : 'Tables'}
            >
              <TablesIcon />
              {tablesBadge > 0 && <span className="icon-badge" aria-hidden="true">{tablesBadge}</span>}
            </button>
          )}

          {showAnalyticsBtn && (
            <button type="button" className="icon-btn" onClick={() => navigate('/billing/analytics')} title="Analytics" aria-label="Analytics">
              <AnalyticsIcon />
            </button>
          )}

          {showDownloadBtn && onDownload && (
            <button type="button" className="icon-btn" onClick={onDownload} title="Download report" aria-label="Download report">
              <DownloadIcon />
            </button>
          )}

          {showBackBtn && (
            <button type="button" className="icon-btn" onClick={() => navigate(backRoute)} title="Back" aria-label="Back">
              <BackIcon />
            </button>
          )}
        </div>
      </div>

      {showHeaderInfo && (
        <div className="header-info">
          <div className="location">
            <strong>Location:&nbsp;</strong>
            <span>
              {RESTAURANT.location}
            </span>
          </div>
          <div className="owner">
            <div className="owner-row">
              <strong>Owner:</strong>
              <span>{RESTAURANT.owner} ({RESTAURANT.phones.join(', ')})</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
