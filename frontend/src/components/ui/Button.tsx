import type { ButtonHTMLAttributes } from 'react';
import Spinner from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; loading?: boolean }

// 1 หน้า/1 Toolbar มี primary ได้ 1 ปุ่ม. ปุ่ม disabled เพราะเงื่อนไขของระบบควรส่ง title บอกเหตุผล
// loading = กำลังทำงาน: แสดงวงหมุน ปิดการกดซ้ำ
export default function Button({ variant = 'secondary', type = 'button', className, loading, disabled, children, ...props }: Props) {
  return (
    <button type={type} className={`btn btn-${variant}${className ? ` ${className}` : ''}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner label="" />}{children}
    </button>
  );
}
