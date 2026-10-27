import type { ReactNode } from 'react';
import Button from './Button';
import Dialog from './Dialog';

interface Props {
  open: boolean;
  title: string;
  /** บอกผลกระทบเป็นข้อความ เช่น "จะทำให้ขั้น 5–9 ของปี 2 ล้าสมัย" */
  children: ReactNode;
  /** กริยาเฉพาะ ไม่ใช่ "ตกลง" */
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ open, title, children, confirmLabel, destructive, onConfirm, onCancel }: Props) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>ยกเลิก</Button>
          <Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
