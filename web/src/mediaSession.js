const actionHandlers = {
  play: "play",
  pause: "pause",
  previoustrack: "previous",
  nexttrack: "next",
};

export function registerMediaSessionActions(mediaSession, actions) {
  if (!mediaSession?.setActionHandler) return () => {};

  const registered = [];
  for (const [action, callbackName] of Object.entries(actionHandlers)) {
    try {
      mediaSession.setActionHandler(action, actions[callbackName]);
      registered.push(action);
    } catch {
      // Browsers may expose MediaSession but not support every action.
    }
  }

  return () => {
    for (const action of registered) {
      try { mediaSession.setActionHandler(action, null); } catch {}
    }
  };
}
