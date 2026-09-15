type ResizePhase = 'start' | 'move' | 'end';

function sendResize(phase: ResizePhase, screenX: number, screenY: number): void {
  window.electronAPI?.resizeCurrentWindow?.({ phase, screenX, screenY });
}

export function startCurrentWindowResize(event: PointerEvent): void {
  if (event.button !== 0 || !window.electronAPI?.resizeCurrentWindow) return;
  event.preventDefault();
  event.stopPropagation();

  const handle = event.currentTarget as HTMLElement;
  let lastScreenX = event.screenX;
  let lastScreenY = event.screenY;
  let frame: number | null = null;
  let active = true;

  const flushMove = () => {
    frame = null;
    if (active) sendResize('move', lastScreenX, lastScreenY);
  };
  const handleMove = (moveEvent: PointerEvent) => {
    lastScreenX = moveEvent.screenX;
    lastScreenY = moveEvent.screenY;
    if (frame === null) frame = requestAnimationFrame(flushMove);
  };
  const stop = (endEvent?: PointerEvent) => {
    if (!active) return;
    active = false;
    if (endEvent) {
      lastScreenX = endEvent.screenX;
      lastScreenY = endEvent.screenY;
    }
    if (frame !== null) cancelAnimationFrame(frame);
    sendResize('end', lastScreenX, lastScreenY);
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleUp);
    window.removeEventListener('blur', handleBlur);
    try { handle.releasePointerCapture(event.pointerId); } catch {}
  };
  const handleUp = (endEvent: PointerEvent) => stop(endEvent);
  const handleBlur = () => stop();

  try { handle.setPointerCapture(event.pointerId); } catch {}
  sendResize('start', lastScreenX, lastScreenY);
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleUp);
  window.addEventListener('blur', handleBlur);
}
