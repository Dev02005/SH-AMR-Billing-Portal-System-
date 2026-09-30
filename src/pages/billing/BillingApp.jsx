import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { fetchActiveTables, fetchCategories, fetchMenuItems } from '../../api';
import { getUser } from '../../api/session';
import { RESTAURANT } from '../../config/brand.js';
import RequireAuth from '../../components/auth/RequireAuth';
import SharedHeader from '../../components/layout/SharedHeader';
import SharedLogin from '../../components/auth/SharedLogin';
import { PORTALS } from '../../config/portals';
import { NotificationProvider } from '../../components/notifications/Notifications';
import {
  AddCategoryModal,
  AddMenuItemModal,
  DeleteCategoryModal,
  DeleteMenuModal,
  EditMenuModal,
} from '../../components/settings';
import usePolling from '../../hooks/usePolling';
import BillingDashboard from './BillingDashboard';

// Analytics pulls in Chart.js, which the till itself never needs. Loading it
// on demand keeps the billing screen's bundle small on the counter terminal.
const AnalyticsDashboard = lazy(() => import('./analytics/AnalyticsDashboard'));

const ROLES = ['admin', 'cashier'];
const LOGIN_PATH = `${PORTALS.billing.path}/login`;

const NO_MODAL = null;

function AnalyticsPortal() {
  const handleDownload = () => window.dispatchEvent(new Event('analytics:download'));

  return (
    <div className="page-shell analytics-portal">
      <SharedHeader
        titleText="Analytics Dashboard"
        showBackBtn
        backRoute="/billing"
        showSettingsBtn={false}
        showDownloadBtn
        onDownload={handleDownload}
        showHeaderInfo={false}
        loginPath={LOGIN_PATH}
      />
      <Suspense fallback={<p className="analytics-message">Loading analytics…</p>}>
        <AnalyticsDashboard />
      </Suspense>
    </div>
  );
}

function BillingPortal() {
  const user = useMemo(() => getUser() || {}, []);
  const isAdmin = user.role === 'admin';

  const [openModal, setOpenModal] = useState(NO_MODAL);

  // Tables the kitchen has served whose bill has not been printed yet: the
  // count badges the table-plan icon. Printing a bill closes the table, and
  // the dashboard says so at once instead of waiting for the next poll.
  const { data: floor, refresh: refreshFloor } = usePolling(fetchActiveTables, 10000);
  const awaitingBill = useMemo(() => new Set(
    (floor || []).filter((t) => t.kitchenStatus === 'served').map((t) => String(t.tableNumber)),
  ).size, [floor]);
  useEffect(() => {
    const onChange = () => refreshFloor({ silent: true });
    window.addEventListener('billing:tablesChanged', onChange);
    return () => window.removeEventListener('billing:tablesChanged', onChange);
  }, [refreshFloor]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  // The menu-management dialogs need the full catalogue to populate their
  // pickers; only an admin can open them, so only an admin pays for the fetch.
  const loadCatalogue = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [cats, menuItems] = await Promise.all([fetchCategories(), fetchMenuItems()]);
      setCategories(cats);
      setItems(menuItems);
    } catch {
      // The dashboard surfaces menu errors already; a failure here only means
      // the admin dialogs open with empty pickers.
    }
  }, [isAdmin]);

  useEffect(() => { loadCatalogue(); }, [loadCatalogue]);

  // Resolves once the dialogs' own lists are fresh, so a dialog that stays
  // open after a change shows the result straight away.
  const refreshAll = useCallback(async () => {
    // Tell every mounted dashboard to reload its menu.
    window.dispatchEvent(new Event('menu:refresh'));
    await loadCatalogue();
  }, [loadCatalogue]);

  const close = () => setOpenModal(NO_MODAL);
  const modalProps = { onClose: close, onRefresh: refreshAll };

  return (
    <div className="page-shell">
      <SharedHeader
        titleText={PORTALS.billing.name}
        showAnalyticsBtn={isAdmin}
        showTablesBtn
        onTables={() => window.dispatchEvent(new Event('billing:openTables'))}
        tablesBadge={awaitingBill}
        loginPath={LOGIN_PATH}
        onAddCategory={() => setOpenModal('addCategory')}
        onDeleteCategory={() => setOpenModal('deleteCategory')}
        onAddMenu={() => setOpenModal('addMenu')}
        onEditMenu={() => setOpenModal('editMenu')}
        onDeleteMenu={() => setOpenModal('deleteMenu')}
      />

      <BillingDashboard />

      <footer className="page-footer" role="contentinfo">
        <b>{RESTAURANT.credit}</b>
      </footer>

      {openModal === 'addCategory' && <AddCategoryModal {...modalProps} />}
      {openModal === 'deleteCategory' && <DeleteCategoryModal {...modalProps} categories={categories} items={items} />}
      {openModal === 'addMenu' && <AddMenuItemModal {...modalProps} categories={categories} />}
      {openModal === 'editMenu' && <EditMenuModal {...modalProps} categories={categories} items={items} />}
      {openModal === 'deleteMenu' && <DeleteMenuModal {...modalProps} items={items} />}
    </div>
  );
}

export default function BillingApp() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <RequireAuth roles={ROLES} loginPath={LOGIN_PATH}>
            <NotificationProvider listen>
              <BillingPortal />
            </NotificationProvider>
          </RequireAuth>
        }
      />
      <Route
        path="/analytics"
        element={
          <RequireAuth roles={['admin']} loginPath={LOGIN_PATH}>
            <NotificationProvider>
              <AnalyticsPortal />
            </NotificationProvider>
          </RequireAuth>
        }
      />
      <Route
        path="/login"
        element={
          <SharedLogin
            portal={PORTALS.billing}
            accounts={PORTALS.billing.accounts}
            targetRole={ROLES}
          />
        }
      />
      <Route path="*" element={<Navigate to="/billing" replace />} />
    </Routes>
  );
}
