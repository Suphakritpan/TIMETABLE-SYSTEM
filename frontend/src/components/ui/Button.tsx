import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant }

// 1 หน้า/1 Toolbar มี primary ได้ 1 ปุ่ม. ปุ่ม disabled เพราะเงื่อนไขของระบบควรส่ง title บอกเหตุผล
export default function Button({ variant = 'secondary', type = 'button', className, ...props }: Props) {
  return <button type={type} className={`btn btn-${variant}${className ? ` ${className}` : ''}`} {...props} />;
}
