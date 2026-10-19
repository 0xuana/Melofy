import { LiveQQMusicProvider } from "@qqmusic-web/provider";
import type { QQMusicCredentials, QQMusicProvider } from "@qqmusic-web/provider";

import { SessionStore } from "./session-store.js";
import type { PersistentQQMusicCredentials } from "./session-store.js";

export class SessionManager {
  readonly #store: SessionStore;
  readonly #validate: (provider: QQMusicProvider) => Promise<void>;
  #provider: QQMusicProvider | null = null;

  constructor(store: SessionStore, importedSession: QQMusicCredentials | null = null, validate?: (provider: QQMusicProvider) => Promise<void>) {
    this.#store = store;
    this.#validate = validate ?? (async (provider) => { await provider.getAccountProfile(); });
    const credentials = store.load() ?? importedSession;
    if (credentials) {
      if (!store.load()) store.save(credentials);
      this.#provider = new LiveQQMusicProvider(credentials);
    }
  }

  provider(): QQMusicProvider | null {
    return this.#provider;
  }

  async setCredentials(credentials: PersistentQQMusicCredentials): Promise<void> {
    const provider = new LiveQQMusicProvider(credentials);
    await this.#validate(provider);
    this.#store.save(credentials);
    this.#provider = provider;
  }

  clear(): void {
    this.#store.clear();
    this.#provider = null;
  }
}
