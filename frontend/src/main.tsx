import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import './styles/select.css';
import App from './App';
import { hydrate } from './api/persist';
import { applyStoredAppearance } from './components/layout/AppearanceMenu';

applyStoredAppearance();

// ดึงสถานะจาก Supabase ก่อน render เพื่อให้ needsSetup()/ล็อกอินเห็นข้อมูลล่าสุด
void hydrate().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
