# Admin desk browser checks

Run the app locally on port 22599, then run this expression with the free Playwright CLI:

```
playwright-cli -s=udc-audit open http://127.0.0.1:22599
playwright-cli -s=udc-audit run-code --filename scripts/visual/admin-v2-15-tells.playwright.js
```

The fixture intercepts every `/api/` request and returns synthetic records. It never sends review requests or financial records to a server. It checks duplicate clicks/submits, cache reuse, menu state/Escape, empty-state guidance, enlarged text reflow, fixed light color scheme under dark preference, safe server-error text, reduced-height focused input visibility and cookie-choice reload persistence. It writes screenshots to `/downloads/` for visual inspection.

The keyboard check is desktop emulation, not a real iOS/Android keyboard test. This suite is not proof of live user workflows or server idempotency. Repeat against the production build using Vite preview to catch bundling errors.
