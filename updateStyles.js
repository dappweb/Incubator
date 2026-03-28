const fs = require('fs');

const appCss = `
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-color);
}

.header h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 800;
  background: var(--gradient-text);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.5px;
}

.header p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 15px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
}

.tabs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 4px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  width: max-content;
}

.tab-btn {
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.tab-active {
  background: var(--gradient-neon);
  color: #fff;
  box-shadow: 0 0 15px rgba(0, 242, 254, 0.3);
}

.card {
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: transform 0.3s ease;
}

.card:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.card h2 {
  margin: 0 0 20px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.card h2::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 18px;
  background: var(--brand-cyan);
  border-radius: 2px;
  box-shadow: 0 0 8px var(--brand-cyan);
}

.card h3 {
  margin: 20px 0 12px;
  font-size: 16px;
  color: var(--text-primary);
}

.primary-btn {
  border: none;
  border-radius: 8px;
  padding: 12px 20px;
  background: var(--gradient-neon);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 15px rgba(0, 242, 254, 0.2);
  display: inline-flex;
  justify-content: center;
  align-items: center;
  min-width: 120px;
}

.primary-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 242, 254, 0.4);
}

.primary-btn:active:not(:disabled) {
  transform: translateY(0);
}

.primary-btn:disabled {
  background: #2d3748;
  color: #64748b;
  box-shadow: none;
  cursor: not-allowed;
}

.actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}

.kv-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.kv-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.kv-row span {
  color: var(--text-secondary);
  font-size: 15px;
}

.kv-row strong {
  font-weight: 600;
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--text-secondary);
}

.field input,
.field select {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 14px;
  font-size: 15px;
  background: rgba(0, 0, 0, 0.3);
  color: var(--text-primary);
  transition: all 0.2s;
  outline: none;
}

.field input:focus,
.field select:focus {
  border-color: var(--brand-blue);
  box-shadow: 0 0 0 2px rgba(0, 242, 254, 0.2);
}

.hint {
  color: var(--text-secondary);
  font-size: 14px;
  margin-top: 8px;
}

.status {
  margin-top: 16px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(0, 242, 254, 0.1);
  border: 1px solid rgba(0, 242, 254, 0.2);
  color: var(--brand-cyan);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.table-wrap {
  overflow-x: auto;
  margin-top: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  padding: 14px 16px;
  font-size: 14px;
}

th {
  background: rgba(0, 0, 0, 0.4);
  color: var(--text-secondary);
  font-weight: 500;
  border-bottom: 1px solid var(--border-color);
}

td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

tr:last-child td {
  border-bottom: none;
}

tr:hover td {
  background: rgba(255, 255, 255, 0.02);
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--brand-cyan);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  transition: all 0.2s;
}

.link-btn:hover {
  background: rgba(0, 242, 254, 0.1);
}

.link-btn:disabled {
  color: var(--text-secondary);
  cursor: not-allowed;
  background: transparent;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.list-item {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  transition: border-color 0.2s;
}

.list-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.list-head strong {
  font-size: 16px;
  color: var(--text-primary);
}

.list-head span {
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
}

.list-item p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

/* Light Theme Variables */
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

[data-theme="light"] .bottom-nav {
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
}

[data-theme="light"] .icon-btn {
  background: #ffffff;
}

[data-theme="light"] .tab-active {
  color: #fff;
}

[data-theme="light"] .primary-btn {
  color: #fff;
}

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
  justify-content: space-around;
  align-items: center;
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
  z-index: 1000;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
  display: none;
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
  color: var(--brand-cyan);
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

@media (max-width: 720px) {
  .tabs.desktop-tabs { display: none !important; }
  body { padding-bottom: 80px; }
  .bottom-nav { display: flex !important; }
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

.icon-btn:hover {
  background: var(--border-color);
  transform: scale(1.05);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  width: 100%;
}
@media (max-width: 720px) {
  .dashboard-header { flex-direction: column; gap: 16px; }
  .theme-lang-controls { width: 100%; justify-content: space-between; }
}
`;

const indexCss = `
:root {
  font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  --bg-primary: #05070a;
  --bg-secondary: #0d1117;
  --card-bg: rgba(22, 27, 34, 0.6);
  --border-color: rgba(255, 255, 255, 0.08);
  
  --text-primary: #f8fafc;
  --text-secondary: #8b949e;
  
  --brand-cyan: #00f2fe;
  --brand-blue: #4facfe;
  --brand-purple: #a18cd1;
  
  --gradient-neon: linear-gradient(135deg, var(--brand-cyan) 0%, var(--brand-blue) 100%);
  --gradient-text: linear-gradient(to right, var(--brand-cyan), var(--brand-purple));
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  color: var(--text-primary);
  background-color: var(--bg-primary);
  background-image: 
    radial-gradient(circle at 10% 20%, rgba(0, 242, 254, 0.08) 0%, transparent 40%),
    radial-gradient(circle at 90% 80%, rgba(161, 140, 209, 0.08) 0%, transparent 40%);
  background-attachment: fixed;
  background-repeat: no-repeat;
  min-height: 100vh;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: var(--bg-primary); 
}
::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1); 
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.2); 
}
`;

fs.writeFileSync('src/App.css', appCss);
fs.writeFileSync('src/index.css', indexCss);
console.log('Done creating CSS files');
