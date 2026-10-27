// ปีใน UI เป็น พ.ศ. ทั้งระบบ (GLOSSARY) ส่วน API/ฐานข้อมูลเก็บ ค.ศ.
export const toBE = (ceYear: number) => ceYear + 543;

export interface TermRef { no: number; year_ce: number }

/** {no:1, year_ce:2027} -> "1/2570" */
export const termLabel = ({ no, year_ce }: TermRef) => `${no}/${toBE(year_ce)}`;

