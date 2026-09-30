import { useEffect, useState } from 'react';
import { installAvailable, installPortal, onInstallChange } from '../../utils/install';
import { DownloadIcon } from '../ui/icons';

const MESSAGES = {
  installed: (portal) => `${portal.name} installed. Open it from the home screen, desktop or Start menu.`,
  shortcut: (portal) => `A shortcut to the ${portal.name} was downloaded. Double-click it to open this portal.`,
  android: (portal) => `To add the ${portal.name} to this phone: tap the ⋮ menu at the top right, then "Add to Home screen".`,
  ios: (portal) => `To add the ${portal.name} to this device: tap the Share button, then "Add to Home Screen".`,
};

/**
 * Installs the portal this page belongs to as its own app (see
 * utils/install.js). Hidden once that portal is installed on this device.
 * `onResult(message)` reports what happened, for the page to show.
 */
export default function InstallAppButton({ portal, onResult }) {
  const [, rerender] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);

  if (!installAvailable(portal)) return null;

  const install = async () => {
    setBusy(true);
    try {
      const result = await installPortal(portal);
      if (MESSAGES[result]) onResult?.(MESSAGES[result](portal));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="install-app-btn"
      onClick={install}
      disabled={busy}
      title={`Install the ${portal.name} as an app on this device`}
    >
      <DownloadIcon />
      <span className="install-app-label-full">Install app</span>
      <span className="install-app-label-short">Install</span>
    </button>
  );
}
