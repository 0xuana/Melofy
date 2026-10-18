# QQMusic Web Player: next pass

- [ ] investigation: resolve the QQRefreshToken and RefreshMusicKey call sites and request parameters in QQMusic_Protocol.dll.
- [ ] investigation: capture a credential-renewal request from a controlled Windows QQMusic runtime and document its request and response fields.
- [ ] api: implement QQMusic credential renewal only after the Windows or Linux artifact confirms a usable renewal contract.
- [ ] api: integrate QR login from refer/qq-music-api when that project provides a QQ authorization and session contract.
- [x] provider: persist the QQ authorization `p_skey` and send it with authenticated profile requests.
- [x] api: expose the authenticated QQ account profile and classify profile code 1000 as a rejected session.
- [x] web: add standalone `/login` and `/profile` routes and navigate only after profile/library validation succeeds.
- [x] test: cover persisted QQ profile credentials and login/profile route transitions.
