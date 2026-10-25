import type { InputHTMLAttributes } from 'react';
import { maskMoneyField } from '@/lib/financing-form';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onValueChange: (value: string) => void;
};
export function FinancingMoneyInput({ value, onValueChange, ...props }: Props) {
  return <input {...props} type="text" inputMode="numeric" placeholder="0,00" value={value}
    onChange={e => {
      // Reject excessively long values instead of truncating them into a different amount.
      if (e.target.value.replace(/\D/g, '').replace(/^0+/, '').length <= 12) onValueChange(maskMoneyField(e.target.value));
    }} />;
}
