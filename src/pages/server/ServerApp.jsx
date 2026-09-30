import { Navigate, Route, Routes } from 'react-router-dom';
import { NotificationProvider } from '../../components/notifications/Notifications';
import RequireAuth from '../../components/auth/RequireAuth';
import SharedHeader from '../../components/layout/SharedHeader';
import SharedLogin from '../../components/auth/SharedLogin';
import { PORTALS } from '../../config/portals';
import { RESTAURANT } from '../../config/brand.js';
import ServerDashboard from './ServerDashboard';

const ROLES = ['waiter', 'admin'];
const LOGIN_PATH = `${PORTALS.server.path}/login`;

function ServerPortal() {
  return (
    <div className="page-shell">
      <SharedHeader
        titleText={PORTALS.server.name}
        showHeaderInfo={false}
        loginPath={LOGIN_PATH}
        showTablesBtn
        onTables={() => window.dispatchEvent(new Event('server:openTables'))}
        allowFullScreen
      />
      <ServerDashboard />
      <footer className="page-footer" role="contentinfo">
        <b>{RESTAURANT.credit}</b>
      </footer>
    </div>
  );
}

export default function ServerApp() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth roles={ROLES} loginPath={LOGIN_PATH}>
            <NotificationProvider listen>
              <ServerPortal />
            </NotificationProvider>
          </RequireAuth>
        }
      />
      <Route
        path="/login"
        element={
          <SharedLogin
            portal={PORTALS.server}
            accounts={PORTALS.server.accounts}
            targetRole={ROLES}
          />
        }
      />
      <Route path="*" element={<Navigate to="/server" replace />} />
    </Routes>
  );
}
