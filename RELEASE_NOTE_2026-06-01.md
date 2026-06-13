# Release Note - 2026-06-01

## Done
- Web chủ AI wallet, admin AI settings, quota UI, and support bot prompts are updated and live.
- `CAp_01` and `lop-06` are connected to the shared AI capacity flow and validated live.
- `CAp_01` landing page has been simplified and redeployed.
- Live QA for both apps passed:
  - Vietnamese text/font looks correct.
  - Main CTA buttons are in the right place.
  - No visible overflow/state regressions were found.

## Live URLs
- `https://hochungkhoi.site/`
- `https://app.hochungkhoi.site/cap-01/`
- `https://app.hochungkhoi.site/lop-06/`

## Notes
- Keep the AI capacity balance server-side only.
- UI should continue to show quota bars, not raw internal usage counters.
- If future changes touch deploy scripts, keep `server/data/` untouched on VPS.

## Next If Needed
- Only do follow-up fixes if new live regressions appear.
