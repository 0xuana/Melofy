import { loadInstalledSession } from "@qqmusic-web/installed-profile-adapter";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

import { createRequestHandler } from "./app.js";
import { QQQrLoginService } from "./qq-qr-login.js";
import { SessionManager } from "./session-manager.js";
import { SessionStore } from "./session-store.js";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const configRoot = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
const profilePath = process.env.QQMUSIC_PROFILE_PATH ?? join(configRoot, "qqmusic");
const dataRoot = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
const sessionPath = process.env.QQMUSIC_SESSION_PATH ?? join(dataRoot, "qqmusic-web", "session.json");
const sessions = new SessionManager(new SessionStore(sessionPath), loadInstalledSession(profilePath));

createServer(createRequestHandler(() => sessions.provider(), profilePath, { qrLogin: new QQQrLoginService(), sessions }))
  .listen(port, "127.0.0.1", () => console.log(`QQMusic API: http://127.0.0.1:${port}`));
