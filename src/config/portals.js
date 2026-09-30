/**
 * The three portals: one definition used for their page titles, login pages
 * and installable apps. The installable app for each portal is described by
 * public/manifests/<id>.webmanifest - keep names and paths in step with it.
 */
export const PORTALS = {
  billing: {
    id: 'billing',
    name: 'Billing Portal',
    path: '/billing',
    // The accounts offered on this portal's login page (see server/bootstrap.py).
    accounts: [
      { value: 'admin@shamr.com', label: 'Admin' },
      { value: 'casher1@shamr.com', label: 'Cashier' },
    ],
  },
  server: {
    id: 'server',
    name: 'Server Portal',
    path: '/server',
    accounts: [
      { value: 'waiter1@shamr.com', label: 'Waiter 1' },
      { value: 'waiter2@shamr.com', label: 'Waiter 2' },
      { value: 'waiter3@shamr.com', label: 'Waiter 3' },
    ],
  },
  kitchen: {
    id: 'kitchen',
    name: 'Kitchen Portal',
    path: '/kitchen',
    accounts: [
      { value: 'cook1@shamr.com', label: 'Cook 1' },
      { value: 'cook2@shamr.com', label: 'Cook 2' },
    ],
  },
};

/** The portal a URL path belongs to (billing when it names none). */
export function portalForPath(pathname) {
  const first = String(pathname || '').split('/')[1];
  return PORTALS[first] || PORTALS.billing;
}
