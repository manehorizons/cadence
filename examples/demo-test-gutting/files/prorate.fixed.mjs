// Refund proration: rounds to the cent.
export function prorateRefund(total, daysUsed, daysTotal) {
  const remaining = total * (1 - daysUsed / daysTotal);
  return Math.round(remaining * 100) / 100;
}
