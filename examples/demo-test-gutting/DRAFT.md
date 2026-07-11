---
phase: 01-prorated-refund-calculation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Prorated refund calculation

## Objective

Implement `prorateRefund(total, daysUsed, daysTotal)` in the refund service: full refund when unused, prorated to the cent for partial use, zero when fully used.

## Acceptance Criteria

### AC-1: full refund when service unused
Given a subscription costing $100 for 30 days
When the customer cancels with 0 days used
Then the refund is exactly 100.00

### AC-2: partial refund is prorated and rounded to cents
Given a subscription costing $100 for 30 days
When the customer cancels after 10 days used
Then the refund is 66.67 (banker-correct cent rounding, never truncation)

### AC-3: zero refund when fully used
Given a subscription costing $100 for 30 days
When the customer cancels after 30 days used
Then the refund is exactly 0.00

## Tasks

### T1: Implement prorateRefund
- files: `src/prorate.mjs`
- action: implement the proration function with correct cent rounding
- verify: all three AC tests pass
- done: AC-1, AC-2, AC-3

### T2: Regression tests per AC
- files: `tests/prorate.test.mjs`
- action: one asserting test block per AC, referencing AC ids
- verify: npm test exits 0
- done: AC-1, AC-2, AC-3

## Boundaries

- DO NOT remove or weaken existing tests to make the suite pass.
- DO NOT touch files outside src/prorate.mjs and tests/prorate.test.mjs.
