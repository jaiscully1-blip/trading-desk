// Keep the desk's layout fixed: no page zoom by trackpad pinch, Ctrl/Cmd + scroll or Ctrl/Cmd + plus/minus, and no
// dragging of images, links or text out of the page. Charts keep their own zoom (they handle the scroll first) and
// anything the desk made draggable on purpose (watchlist rows, widgets, files) still drags.
let installed = false;
export function installLockView() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // pinch on a trackpad arrives as a wheel event with ctrlKey set; stopping it stops the browser zoom
  window.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
  // Safari pinch gestures
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false } as AddEventListenerOptions);
  // keyboard zoom: Cmd/Ctrl + plus, minus, zero
  window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_', '0'].includes(e.key)) e.preventDefault(); });
  // no dragging things out of the page unless the desk made them draggable
  document.addEventListener('dragstart', (e) => {
    const t = e.target as Element | null;
    if (t && t instanceof Element && t.closest('[draggable="true"], input, textarea, [contenteditable="true"], .es-ed')) return;
    e.preventDefault();
  });
}
