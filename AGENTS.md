# Repository Guidelines

## Project Structure

This repository is an npm workspace for a local QQ Music web player. `web/` contains the Vue 3 and Vite client; its views, reusable player components, Pinia stores, styles, and JavaScript tests are under `web/src/`. `api/` contains the local TypeScript API and its tests under `api/src/`. Shared QQ Music behavior is in `packages/qqmusic-provider/`; access to an installed QQ Music profile is isolated in `packages/installed-profile-adapter/`. `scripts/` holds local development helpers; `refer/`, when present, contains upstream reference projects and is not application source.

## Build, Test, and Development

Use Node.js 24 (the repository pins 24.20.0) and npm 12. From the repository root:

- `npm ci` installs the locked workspace dependencies.
- `npm run dev` starts the local API and web development server.
- `npm test` runs tests in all workspaces.
- `npm run typecheck` checks TypeScript workspaces.
- `npm run build` builds workspaces that define a build script; the web client can also be built with `npm run build --workspace @qqmusic-web/web`.

For separate debugging, run `npm run dev --workspace @qqmusic-web/api` and `npm run dev --workspace @qqmusic-web/web` in separate terminals.

## Style and Testing

Follow nearby code: use two-space indentation, semicolons in TypeScript and JavaScript, and descriptive camelCase names for values and functions. Vue components use PascalCase filenames; tests use the adjacent `*.test.ts` or `*.test.js` naming pattern. Add focused Node test-runner cases alongside the code they cover. Keep provider protocol details in the provider package and keep browser code independent of long-lived QQ credentials.

## Commits and Pull Requests

Use short, imperative Conventional Commit subjects such as `feat(web): add queue controls` or `fix(provider): handle expired credentials`. Use `feat`, `fix`, `docs`, `test`, or `chore` scopes that identify the affected area. Pull requests should explain the user-visible change, list verification commands and results, link related issues when available, and include screenshots for UI changes. Call out configuration or session-storage changes explicitly; never attach session files, tokens, or signed stream URLs.

## Local Configuration and Security

The API persists QQ login credentials locally, normally under the user's XDG data directory. Treat session files as secrets: do not commit, print, or share them. Keep generated output such as `web/dist/` and installed dependencies out of source changes.
