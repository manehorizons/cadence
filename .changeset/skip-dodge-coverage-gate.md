---
'@manehorizons/cadence-core': patch
---

Fix `test-coverage` gate in `assertion` coverage mode wrongly treating an AC whose only linked test sits inside a `test.skip`/`.todo`/`.failing` block as fully covered, even when the block contains an intact assertion. Previously `cadence settle run --auto` would settle clean (exit 0) on a skipped test; the gate now refuses with a distinct message ("AC-N's only linked test is skipped") separate from the existing "no linked test" and "mentioned but not asserting" refusals, naming the fix (unskip the test or replace it with a running asserting block) rather than suggesting an unrelated `coverageMode` switch.

`findTestSpans` now flags `skip`/`todo`/`failing` openers as non-asserting spans (`only`/`concurrent` are unaffected, since those execute normally); `scanTestCoverage` propagates this through a new `skipped` flag on each test reference, and a new `skippedOnlyLinkedAcs` export is mutually exclusive with the existing `weaklyLinkedAcs` — an AC only lands in the new bucket when every one of its non-qualifying references is skip-caused. `mention`-mode coverage is unaffected.
