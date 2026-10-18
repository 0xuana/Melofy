# QQ QR login next pass

- [x] api: split combined Set-Cookie headers without splitting Expires dates.
- [x] test: verify p_skey extraction from combined Set-Cookie headers.
- [x] test: verify empty p_skey is reported without exposing cookie contents.
- [x] api: run the API test suite after the cookie parsing change.
- [x] api: run TypeScript typecheck after the cookie parsing change.
- [ ] analysis: retry one account-controlled QR login and capture only redacted authorization-hop metadata.
