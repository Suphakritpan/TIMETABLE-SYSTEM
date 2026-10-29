// วงกลมอักษรย่อ (อาศัยชื่อข้างเคียงบอกตัวตน จึงซ่อนจากโปรแกรมอ่านจอ)
export default function Avatar({ name, src }: { name: string; src?: string }) {
  if (src) return <img className="avatar" src={src} alt="" />;
  const first = [...name.trim()].find((c) => /\p{L}/u.test(c)) ?? '?';
  return <span className="avatar" aria-hidden="true">{first.toUpperCase()}</span>;
}
