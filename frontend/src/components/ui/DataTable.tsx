import { useMemo, useState, type ReactNode } from 'react';
import EmptyState from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** มี = คลิกหัวคอลัมน์เรียงได้ */
  sortValue?: (row: T) => string | number;
  align?: 'right';
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
  /** แถวที่มีปัญหา: ขอบซ้ายสี error + ไอคอน (ไม่ใช้สีอย่างเดียว) */
  rowProblem?: (row: T) => string | null;
  selectedKey?: string | null;
  onRowClick?: (row: T) => void;
}

export default function DataTable<T>({ columns, rows, rowKey, caption, empty, rowProblem, selectedKey, onRowClick }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!sort || !col?.sortValue) return rows;
    const f = col.sortValue;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th')) * sign;
    });
  }, [rows, columns, sort]);

  if (!rows.length) return <EmptyState>{empty ?? 'ไม่มีข้อมูล'}</EmptyState>;

  const toggle = (key: string) => setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));

  return (
    <div className="dt-wrap">
      <table className="dt">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" className={c.align === 'right' ? 'r' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}>
                  {c.sortValue ? (
                    <button type="button" className="th-btn" onClick={() => toggle(c.key)}>
                      {c.header}<span aria-hidden="true">{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const k = rowKey(row);
            const problem = rowProblem?.(row);
            return (
              <tr
                key={k}
                className={`${problem ? 'dt-problem' : ''}${k === selectedKey ? ' dt-selected' : ''}`}
                aria-selected={onRowClick ? k === selectedKey : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={c.align === 'right' ? 'r' : undefined}>
                    {i === 0 && problem && <span className="dt-flag" title={problem}><span aria-hidden="true">✕ </span><span className="sr-only">ปัญหา: {problem}</span></span>}
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
