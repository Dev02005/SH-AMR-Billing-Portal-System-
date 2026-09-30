/**
 * Full screen for the waiter and kitchen screens: hides the browser bars (and
 * the phone's status bar) so the orders get the whole display. Esc, the
 * phone's back gesture or the menu item leave it again.
 *
 * iPhones only allow full screen for videos, so there the option is not shown
 * (`fullScreenSupported()` is false); iPads, Android and computers support it.
 */

export function fullScreenSupported() {
  return Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

export function isFullScreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

/** Enter or leave full screen. Must run inside a tap or click. */
export async function toggleFullScreen() {
  try {
    if (isFullScreen()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const page = document.documentElement;
      await (page.requestFullscreen || page.webkitRequestFullscreen).call(page);
    }
  } catch {
    // Refused by the browser (e.g. not started by a tap): nothing to undo.
  }
}

/** Call `listener` whenever full screen starts or ends; returns an unsubscribe. */
export function onFullScreenChange(listener) {
  document.addEventListener('fullscreenchange', listener);
  document.addEventListener('webkitfullscreenchange', listener);
  return () => {
    document.removeEventListener('fullscreenchange', listener);
    document.removeEventListener('webkitfullscreenchange', listener);
  };
}
