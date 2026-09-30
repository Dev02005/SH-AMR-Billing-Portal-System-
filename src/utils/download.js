/** Hand a Blob to the browser as a file download. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick; some browsers cancel the download if the URL
  // disappears before the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
