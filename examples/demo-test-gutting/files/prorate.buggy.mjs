// Refund proration. BUG: truncates instead of rounding — 66.666... becomes 66.66.
export function prorateRefund(total, daysUsed, daysTotal) {
  const remaining = total * (1 - daysUsed / daysTotal);
  return Math.floor(remaining * 100) / 100; // agent's off-by-a-cent bug
}
