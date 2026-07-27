---
'@manehorizons/cadence-core': patch
---

Fixed the built-in python coverage profile's opener regex to accept a
return-type annotation (e.g. `def test_foo(x: Path) -> None:`) between the
parameter list and the trailing colon. Previously any test function
annotated with a return type failed to match the opener at all, which
silently dropped the entire file's span table — `cadence verify coverage`
reported "no test block was recognized in this file" for real, passing,
assertion-bearing pytest suites whose team convention adds `-> None:` (or
any other return annotation) to every test function, indistinguishable from
"no tests exist." Files that happened not to use return-type annotations
were unaffected, which is what made the gap easy to miss. Also audited the
js/ts profile for an analogous blind spot on typed callback signatures —
none exists, since its opener matches on the `it(`/`test(` call token
itself, not the callback's own signature.
