import { LiveQQMusicProvider } from "@qqmusic-web/provider";
import type { QQMusicCredentials, QQMusicProvider } from "@qqmusic-web/provider";

import { SessionStore } from "./session-store.js";
import type { PersistentQQMusicCredentials } from "./session-store.js";

export class SessionManager {
  readonly #store: SessionStore;
  #provider: QQMusicProvider | null = null;

  constructor(store: SessionStore, importedSession: QQMusicCredentials | null = null) {
    this.#store = store;
    const credentials = store.load() ?? importedSession;
    if (credentials) {
      if (!store.load()) store.save(credentials);
      this.#provider = new LiveQQMusicProvider(credentials);
    }
  }

  provider(): QQMusicProvider | null {
    return this.#provider;
  }

  setCredentials(credentials: PersistentQQMusicCredentials): void {
    this.#store.save(credentials);
    this.#provider = new LiveQQMusicProvider(credentials);
  }

  clear(): void {
    this.#store.clear();
    this.#provider = null;
  }
}
