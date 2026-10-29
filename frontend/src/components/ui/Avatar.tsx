// วงกลมอักษรย่อ (อาศัยชื่อข้างเคียงบอกตัวตน จึงซ่อนจากโปรแกรมอ่านจอ)
export default function Avatar({ name }: { name: string }) {
  const first = [...name.trim()].find((c) => /\p{L}/u.test(c)) ?? '?';
  return <span className="avatar" aria-hidden="true">{first.toUpperCase()}</span>;
}
