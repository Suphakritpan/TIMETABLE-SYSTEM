import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);
// mock หน่วงเวลา 100–700ms และชุดทดสอบรันขนานกัน: ให้รอนานกว่าค่าเริ่มต้น 1 วินาทีเพื่อไม่ให้เทสต์กะพริบ
configure({ asyncUtilTimeout: 5000 });
