# QQ QR Login API reverse engineering and implementation

- [x] artifact: inventory Linux QQMusic 1.1.8 and identify the ASAR login page and native payloads.
- [x] analysis: verify whether the Linux package contains app-owned native login modules.
- [x] ghidra: attempt targeted analysis of the Linux Electron ELF with Ghidra 12.1.2.
- [x] api: return sanitized QQ authorization-hop diagnostics when the p_skey cookie is absent.
- [x] test: verify diagnostics omit callback query values and cookie values.
- [x] api: run the API test suite after the diagnostic change.
- [x] api: run TypeScript typecheck after the diagnostic change.
- [ ] analysis: capture a successful account-controlled QQ QR login and document callback fields without recording credential values.
- [ ] api: implement the QQMusic credential exchange from verified Linux runtime or native-protocol evidence.
- [ ] test: add a redacted successful-scan fixture for persistent QQMusic credentials.
