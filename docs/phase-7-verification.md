# Phase 7 verification — private controlled login profiles

Implemented `lib/auth-profiles.cjs`. Profiles bind to an exact target origin and at most five explicit additional login origins. Creating/capturing a profile accepts no passwords, OTPs, or cookie fields. Capture opens headed Chromium; authentication state is saved only after the explicit completion action. Navigation redirects outside configured origins are blocked. Captures expire after at most five minutes.

Private storage uses `.test-buddy-auth` with directory mode 0700 and state/metadata mode 0600. Public metadata never includes cookies, token values, or storage-state paths. Unknown, wrong-origin, empty, and expired-cookie profiles reject before test execution. Profiles can be reopened after restart or deleted, and active capture browsers can be closed.

`node --test test/auth-profiles.test.cjs`: four deterministic tests passed, including explicit completion, state permissions, origin mismatch, restart, deletion, expired cookie state, and credential-field rejection. Browser lifecycle in these tests is injected and simulated.

Live `test/auth-live.test.cjs` used only an owned local QA sign-in fixture. Headed Chromium captured a local fixture cookie after the completion action, a fresh independent context authenticated against the protected fixture, and origin isolation/restart/deletion checks passed. No personal credentials or real account sessions were handled. A witnessed completion-status bug returned `capturing` after capture; it was fixed by returning metadata after browser closure, and the live check then passed.

Expiry checking inspects stored cookie timestamps. Session cookies (`expires: -1`), localStorage-based sessions, and server-side revocation cannot be proven valid offline. Authentication failure against the real target remains an actual run failure; recapture may be necessary. Screenshots/traces from authenticated runs may contain account data and remain local; auth state is never an exported artifact.

A deferred-launch regression reproduced deletion while browser startup was pending. Capture reservations are now identity-checked after every async step; deleted/canceled profiles cannot resurrect a browser capture. The regression passed and the real headed fixture passed again.
