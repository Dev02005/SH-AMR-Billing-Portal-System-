import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { signedInPortal } from './api/session';
import BillingApp from './pages/billing/BillingApp';
import KitchenApp from './pages/kitchen/KitchenApp';
import ServerApp from './pages/server/ServerApp';

/** "/" opens the portal this device is signed in to, or the billing login. */
function Landing() {
  const portal = signedInPortal();
  return <Navigate to={portal ? portal.path : '/billing/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/billing/*" element={<BillingApp />} />
        <Route path="/kitchen/*" element={<KitchenApp />} />
        <Route path="/server/*" element={<ServerApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
