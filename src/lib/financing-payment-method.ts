import type { Transaction } from './mock-data';

export const FINANCING_PAYMENT_METHODS = [
  {value:'pix',label:'Pix'},
  {value:'boleto',label:'Boleto'},
  {value:'transferencia',label:'Transferência'},
  {value:'debito_automatico',label:'Débito automático'},
  {value:'dinheiro',label:'Dinheiro'},
  {value:'debito',label:'Cartão de débito'},
  {value:'credito',label:'Cartão de crédito'},
  {value:'saldo',label:'Saldo em conta'},
  {value:'outro',label:'Outro'},
] as const;
export type FinancingPaymentMethod = typeof FINANCING_PAYMENT_METHODS[number]['value'];
export function sanitizeFinancingPaymentMethod(value: unknown): FinancingPaymentMethod | undefined {
  return FINANCING_PAYMENT_METHODS.find(m=>m.value===value)?.value;
}
export function financingPaymentMethodLabel(value?: string): string {
  return FINANCING_PAYMENT_METHODS.find(m=>m.value===value)?.label ?? 'Não informada';
}
/** Informational method only: never creates a card purchase or links a bank account. */
export function financingPaymentTransactionFields(method?: FinancingPaymentMethod): Pick<Transaction,'paymentMethod'|'cardMode'> {
  if (method==='credito'||method==='debito') return {paymentMethod:'cartao',cardMode:method};
  return {paymentMethod:method};
}
