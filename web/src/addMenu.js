export function shouldCloseAddMenu(target) {
  return !target?.closest?.(".track-add-control");
}

export function calculateAddMenuPosition(trigger, menu, viewport, safeTop, safeBottom, gap = 8) {
  const width = Math.max(0, Math.min(258, menu.width, viewport.width - 16, trigger.left - gap - 8));
  const left = Math.max(8, trigger.left - width - gap);
  const topLimit = Math.min(safeTop, safeBottom - 80);
  const heightLimit = Math.max(80, safeBottom - topLimit);
  const height = Math.min(menu.height, 440, viewport.height * 0.7, heightLimit);
  const top = Math.max(topLimit, Math.min(trigger.top + (trigger.height - height) / 2, safeBottom - height));
  return { left, top, width, maxHeight: height };
}

export function isPlaylistDestinationUnavailable(playlist, memberships, membershipLoading, adding) {
  return playlist.kind === "collected" || memberships.has(playlist.id) || membershipLoading || adding;
}

export function addablePlaylists(playlists) {
  return playlists.filter((playlist) => playlist.kind !== "collected");
}
