import type { LoanReceivable } from "./app-store";
import type { Transaction } from "./mock-data";

/** Loan records stay stored in the profile, but have their own statement. */
export function selectTransactionLedgers(transactions: Transaction[], receivables: LoanReceivable[] = []) {
  const linkedIds = new Set(receivables.map((item) => item.transactionId).filter(Boolean));
  const loanIds = new Set(receivables.map((item) => item.loanId));
  const regularTransactions: Transaction[] = [];
  const loanTransactions: Transaction[] = [];
  for (const transaction of transactions) {
    const reference = transaction.note?.match(/(?:^|\n)Referência:\s*([^\r\n]+)/)?.[1].trim();
    const belongsToLoan = transaction.source === "loan" || transaction.operationType === "loan" || transaction.operationType === "card" ||
      linkedIds.has(transaction.id) || transaction.id.startsWith("loan-receivable-") || Boolean(reference && loanIds.has(reference));
    (belongsToLoan ? loanTransactions : regularTransactions).push(transaction);
  }
  return { regularTransactions, loanTransactions };
}
