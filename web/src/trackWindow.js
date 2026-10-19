export function calculateTrackWindow(total, scrollTop, listTop, viewportHeight, rowHeight = 64, overscan = 8) {
  if (total <= 0) return { start: 0, end: 0, top: 0, bottom: 0 };
  const count = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const firstVisible = Math.max(0, Math.floor((scrollTop - listTop) / rowHeight));
  const start = Math.max(0, Math.min(total - count, firstVisible - overscan));
  const end = Math.min(total, start + count);
  return { start, end, top: start * rowHeight, bottom: (total - end) * rowHeight };
}

export function resetPlaylistScroll(scrollContainer) {
  if (scrollContainer) scrollContainer.scrollTop = 0;
}
