const routes = new Set(["/", "/login", "/profile"]);

export function normalizePath(pathname) {
  return routes.has(pathname) ? pathname : "/";
}

export function resolvePath(pathname, authenticated) {
  const path = normalizePath(pathname);
  if (!authenticated) return path === "/login" ? path : "/login";
  return path === "/login" ? "/" : path;
}
