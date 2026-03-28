const fs = require('fs');

const indexCss = fs.readFileSync('src/index.css', 'utf8');
const newIndexCss = indexCss + `

[data-theme="light"] {
  --bg-primary: #f1f5f9;
  --bg-secondary: #e2e8f0;
  --card-bg: rgba(255, 255, 255, 0.82);
  --border-color: rgba(0, 0, 0, 0.1);
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --brand-cyan: #0284c7;
  --brand-blue: #2563eb;
  --brand-purple: #7c3aed;
  --gradient-neon: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%);
  --gradient-text: linear-gradient(to right, #0284c7, #7c3aed);
}

[data-theme="light"] body {
  background-image: 
    radial-gradient(circle at 10% 20%, rgba(56, 189, 248, 0.15) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(124, 58, 237, 0.15) 0%, transparent 40%);
}
`;
if (!indexCss.includes('[data-theme="light"]')) {
  fs.writeFileSync('src/index.css', newIndexCss);
}

const appCss = fs.readFileSync('src/App.css', 'utf8');
const newAppCss = appCss + `
/* Bottom Navigation (Floating Menu) */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
  z-index: 1000;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
}

[data-theme="light"] .bottom-nav {
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
}

.nav-item.active {
  color: var(--text-primary);
}

.nav-icon {
  font-size: 20px;
  margin-bottom: 2px;
  filter: grayscale(100%) opacity(0.7);
  transition: all 0.2s ease;
}

.nav-item.active .nav-icon {
  filter: grayscale(0%) opacity(1);
  transform: scale(1.1);
}

body {
  padding-bottom: 80px;
}

@media (max-width: 720px) {
  .tabs { display: none !important; }
}
@media (min-width: 721px) {
  .bottom-nav { display: none !important; }
}

.theme-lang-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.icon-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 50%;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 16px;
}

[data-theme="light"] .icon-btn {
  background: #ffffff;
}

.icon-btn:hover {
  background: var(--border-color);
  transform: scale(1.05);
}

.top-header {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
`;
if (!appCss.includes('.bottom-nav')) {
  fs.writeFileSync('src/App.css', newAppCss);
}
console.log('Styles updated.');
