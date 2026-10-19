# QQ QR login rewrite

- [x] test: preserve a non-empty p_skey when QQ follows it with an empty deletion cookie.
- [x] api: ignore empty cookie deletions when the same response also supplies a non-empty value.
- [x] test: assert QQ check_sig receives the reference flow's explicit parameters.
- [x] api: run QQ QR success through an explicit check_sig request before OAuth.
- [x] test: reject QR credentials when QQ Music user-profile validation fails.
- [x] api: validate user profile before persisting QR credentials.
- [x] test: report OAuth redirect metadata without exposing code or state values.
- [x] api: report OAuth redirect host/path/query keys and numeric error code safely.
- [x] api: run the full API test suite and typecheck after the login rewrite.
- [ ] analysis: retry one account-controlled QR login and capture only redacted result metadata.

# Playlist filter and table alignment

- [x] web: add an accessible clear-filter button beside the playlist search input.
- [x] web: clear an active playlist filter with Escape, including while the input is focused.
- [x] web: align duration and action headers with their row contents.
- [x] web: run the web build and focused tests.

# Discover search and playlist actions

- [x] research: inspect QQMusicapi search and this repository's protocol notes for playlist mutations.
- [x] provider: define typed contracts for search, playlist mutation, favorite state, and playlist creation.
- [x] provider: implement QQ Music search and playlist mutation APIs with focused tests.
- [x] api: expose authenticated endpoints for search, favorites, playlist creation, and adding tracks.
- [x] web: add a discover/search page with results and favorite indicators.
- [x] web: add an add-menu for favorites, queue, new playlist, and existing playlists.
- [x] web: disable playlist destinations that already contain the selected track.
- [x] web: add focused tests and run all workspace checks.
- [ ] analysis: verify QQ Music playlist mutations with an account-controlled test; an external implementation reports favorite-write rejection code 80105.

# Discover and playlist navigation fixes

- [x] test: cover root resolution to Favorites and keep Discover as the only content URL.
- [x] web: select Favorites when opening `/` and load the playlist matching the current in-memory selection.
- [x] test: cover leaving Discover when selecting a playlist and active sidebar state.
- [x] web: navigate back to the playlist view on user playlist selection without redirecting direct `/discover` visits.
- [x] test: verify the Discover add menu closes on outside interaction.
- [x] web: close the Discover add menu when clicking elsewhere or changing route.
- [x] web: run focused navigation tests, workspace tests, typecheck, and production build.

# Unified add-to-playlist actions

- [x] test: cover shared add-menu outside-click, duplicate, and destination behavior.
- [x] web: extract Discover's add-menu into a reusable track action component.
- [x] web: use the shared add-menu for playlist track rows as well as Discover results.
- [x] web: run focused tests, workspace tests, typecheck, and production build.

# Current-track dark hover state

- [x] test: assert current-track hover overrides the generic dark hover surface.
- [x] web: apply a theme-aware accent hover state to the current track in dark mode.
- [x] web: run focused theme tests, workspace tests, typecheck, and production build.

# Add-menu and playlist performance

- [x] test: verify read-only collected playlists are excluded from add destinations.
- [x] web: omit collected playlists from the shared add menu.
- [x] provider: reduce repeated and serial work when checking playlist membership.
- [x] test: verify membership lookup caching and concurrent playlist checks.
- [x] web: avoid mounting an add-menu component for every playlist row.
- [x] web: render long playlist views in manageable batches while keeping filtering across the full list.
- [x] web: run focused tests, workspace tests, typecheck, and production build.

# Persistent playlist membership cache

- [x] test: verify membership cache survives provider recreation and expires safely.
- [x] api: store membership cache in a private local data file separate from credentials.
- [ ] provider: persist membership results and invalidate entries after playlist writes.
- [ ] web: show cached membership state immediately while background refresh runs.
- [ ] api: run tests, typecheck, and build after persistent cache integration.

# Playlist switch scroll reset

- [x] test: verify playlist window starts at row one after switching from a scrolled list.
- [x] web: reset the shared scroll container and virtual window when selecting a playlist.
- [x] web: ignore stale playlist responses when a newer selection has already started.
- [x] web: run focused tests, workspace tests, typecheck, and production build.

# Playlist track cache and refresh indicator

- [x] test: verify playlist cache reuses entries within its TTL and refreshes expired entries.
- [x] web: cache loaded playlist tracks in memory with a five-minute TTL.
- [x] web: keep cached rows visible while an expired playlist refreshes in the background.
- [x] web: show refresh progress in a fixed status position instead of an inline loading row.
- [x] web: update or invalidate cached playlist contents after adding a track.
- [x] web: run focused tests, workspace tests, typecheck, and production build.

# Playlist add mutation reliability

- [x] test: reject mutation responses that do not contain an explicit QQ Music success marker.
- [x] provider: validate QQ Music playlist-write response codes without treating missing codes as success.
- [x] web: explicitly mark all non-submit add-menu actions as buttons so clicks cannot submit an ancestor form.
- [x] web: keep the add menu open after a write and show confirmed per-playlist success state.
- [x] api: add a mutation regression test that distinguishes explicit QQ rejection from success.
- [x] web: run focused tests, workspace tests, typecheck, and production build.
- [ ] analysis: verify live QQ playlist write by re-reading a dedicated test playlist.

# Add-menu placement and playback skip regression

- [x] test: verify add-menu placement stays fully inside the viewport to the left of its trigger.
- [x] web: position the add menu to the left of its trigger and constrain its height to the available viewport.
- [x] web: elevate the active track row so later rows cannot paint over its add menu.
- [x] test: ignore stale ended events after a newer playback source is selected.
- [x] web: guard automatic queue advancement against stale audio ended events.
- [x] web: refresh the player surface after returning to a visible browser window.
- [x] web: run focused tests, workspace tests, typecheck, and production build.

# Dark-mode decorative glow

- [x] test: assert the dark hero's circular glow uses the selected theme accent instead of white.
- [x] web: recolor the decorative hero circle in dark mode with a restrained theme-aware accent.
- [x] web: run focused theme tests, workspace tests, typecheck, and production build.

# Theme-aware playlist cover shadow

- [x] test: verify playlist cover shadows use the selected accent in light and dark themes.
- [x] web: make the playlist cover shadow theme-aware and visible on dark surfaces.
- [x] web: run focused theme tests, workspace tests, typecheck, and production build.

# QQ playlist write request compatibility

- [x] test: assert add-track requests use QQ's playlist-write module envelope and documented parameters.
- [x] provider: send playlist-write requests using the module key and supported parameters.
- [x] provider: verify created-playlist additions with the same playlist read contract used by the UI.
- [x] api: return a useful write failure to the add menu without navigating or reloading.
- [x] web: run focused provider/API tests, full workspace tests, typecheck, and production build.

# Add-menu failure feedback and overflow

- [x] test: ensure the add menu only scrolls vertically and keeps write failures visible.
- [x] web: pin add failures to the top of the menu and show an in-progress label while writing.
- [x] web: prevent menu rows and labels from introducing horizontal overflow.
- [x] web: run focused tests and production build.

# Shuffle selection queue behavior

- [x] test: reproduce selecting another playlist track while shuffle is active.
- [x] queue: preserve shuffle mode and rebuild a random continuation after manual track selection.
- [x] test: ensure shuffle next does not follow the playlist's stored order.
- [x] web: run queue tests, full workspace tests, typecheck, and production build.

# Queue panel outside-click dismissal

- [x] test: distinguish clicks inside the queue panel or queue toggle from outside clicks.
- [x] web: close the queue panel on outside pointer interaction without breaking its toggle.
- [x] web: run focused tests, workspace tests, typecheck, and production build.
