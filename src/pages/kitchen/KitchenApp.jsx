import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { NotificationProvider } from '../../components/notifications/Notifications';
import RequireAuth from '../../components/auth/RequireAuth';
import SharedHeader from '../../components/layout/SharedHeader';
import SharedLogin from '../../components/auth/SharedLogin';
import { PORTALS } from '../../config/portals';
import { RESTAURANT } from '../../config/brand.js';
import KitchenDashboard from './KitchenDashboard';

const ROLES = ['cook', 'admin'];
const LOGIN_PATH = `${PORTALS.kitchen.path}/login`;

function KitchenPortal() {
  // The header's refresh button asks the board to reload now; the board says
  // when it is done, so the icon spins for as long as the request runs.
  const [refreshing, setRefreshing] = useState(false);
  const refreshBoard = useCallback(() => {
    setRefreshing(true);
    window.dispatchEvent(new Event('kitchen:refresh'));
  }, []);
  useEffect(() => {
    const done = () => setRefreshing(false);
    window.addEventListener('kitchen:refreshed', done);
    return () => window.removeEventListener('kitchen:refreshed', done);
  }, []);

  return (
    <div className="page-shell">
      <SharedHeader
        titleText={PORTALS.kitchen.name}
        showHeaderInfo={false}
        loginPath={LOGIN_PATH}
        onRefresh={refreshBoard}
        refreshing={refreshing}
      />
      <KitchenDashboard />
      <footer className="page-footer" role="contentinfo">
        <b>{RESTAURANT.credit}</b>
      </footer>
    </div>
  );
}

export default function KitchenApp() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth roles={ROLES} loginPath={LOGIN_PATH}>
            <NotificationProvider>
              <KitchenPortal />
            </NotificationProvider>
          </RequireAuth>
        }
      />
      <Route
        path="/login"
        element={
          <SharedLogin
            portal={PORTALS.kitchen}
            accounts={PORTALS.kitchen.accounts}
            targetRole={ROLES}
          />
        }
      />
      <Route path="*" element={<Navigate to="/kitchen" replace />} />
    </Routes>
  );
}
