// ตัวหน่วงเวลาของ mock ทุกตัว (จำลองเครือข่าย) ใช้ที่เดียว
export const delay = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms));
