# QQMusic Web Player: next pass

- [ ] investigation: resolve the QQRefreshToken and RefreshMusicKey call sites and request parameters in QQMusic_Protocol.dll.
- [ ] investigation: capture a credential-renewal request from a controlled Windows QQMusic runtime and document its request and response fields.
- [ ] api: implement QQMusic credential renewal only after the Windows or Linux artifact confirms a usable renewal contract.
- [x] web: automatically advance the playback queue when QQMusic rejects a track for rights or availability.
- [x] web: show each playlist track duration and mark tracks known to be unplayable with theme-aware styling.
- [x] test: verify rejected tracks are skipped while unrelated playback errors remain visible.
