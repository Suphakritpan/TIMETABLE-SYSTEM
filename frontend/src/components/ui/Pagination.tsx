import Button from './Button';

export default function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="เปลี่ยนหน้า">
      <Button disabled={page <= 1} onClick={() => onChange(page - 1)}>ก่อนหน้า</Button>
      <span aria-live="polite">หน้า {page} / {pages}</span>
      <Button disabled={page >= pages} onClick={() => onChange(page + 1)}>ถัดไป</Button>
    </nav>
  );
}
