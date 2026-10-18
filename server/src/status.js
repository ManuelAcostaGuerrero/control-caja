export function statusOf(m){
  if (m.kind === 'INCOME') return 'COMPLETE';
  const rendered = Number(m.settled_amount)+Number(m.returned_amount);
  if (rendered > m.amount) return 'DIFFERENCE';
  if (Number(m.pending_invoice_count) > 0) return 'PENDING_INVOICE';
  if (rendered === m.amount) return 'COMPLETE';
  if (Number(m.settled_amount) > 0 && m.expected_expense_amount != null && Number(m.settled_amount) >= Number(m.expected_expense_amount)) return 'RETURN_PENDING';
  if (Number(m.settled_amount) > 0) return 'PENDING_BALANCE';
  return 'PENDING_SETTLEMENT';
}
