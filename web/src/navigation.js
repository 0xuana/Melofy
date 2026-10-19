const routes = new Set(["/", "/discover", "/login", "/profile"]);

export function normalizePath(pathname) {
  return routes.has(pathname) ? pathname : "/";
}

export function resolvePath(pathname, authenticated) {
  const path = normalizePath(pathname);
  if (!authenticated) return path === "/login" ? path : "/login";
  return path === "/login" ? "/" : path;
}

export function shouldShowPlaylistNavigation(routePath) {
  return routePath !== "/discover" && routePath !== "/login" && routePath !== "/profile";
}

export function isPlaylistActive(routePath, selectedPlaylist, playlist) {
  return shouldShowPlaylistNavigation(routePath)
    && selectedPlaylist?.id === playlist.id
    && selectedPlaylist?.kind === playlist.kind;
}

export function defaultPlaylist(playlists) {
  return playlists.find((playlist) => playlist.kind === "liked") || playlists[0] || null;
}

export function playlistSelectionPath(routePath) {
  return routePath === "/discover" ? "/" : routePath;
}
