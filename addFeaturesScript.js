const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Add theme and lang state
const stateInjection = `  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [lang, setLang] = useState<"zh" | "en">("zh");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === "dark" ? "light" : "dark");
  const toggleLang = () => setLang(prev => prev === "zh" ? "en" : "zh");

  const t = {
    // Header
    title: lang === "zh" ? "Incubator DApp" : "Incubator DApp",
    subtitle: lang === "zh" ? "业务核心链上执行，Appwrite 仅公告。" : "On-chain core logic, Appwrite for announcements.",
    connect: lang === "zh" ? "连接钱包" : "Connect Wallet",
    refresh: lang === "zh" ? "刷新链上数据" : "Refresh Data",
    
    // Tabs
    tab_overview: lang === "zh" ? "首页" : "Home",
    tab_machine: lang === "zh" ? "矿机" : "Miner",
    tab_node: lang === "zh" ? "节点" : "Node",
    tab_otc: lang === "zh" ? "OTC" : "OTC",
    tab_swap: lang === "zh" ? "Swap" : "Swap",
    tab_mine: lang === "zh" ? "我的" : "Profile",
  };
`;
appContent = appContent.replace(/  const \[activeTab, setActiveTab\] = useState<TabKey>\("overview"\);/, stateInjection);

// 2. Replace Header JSX
const headerRegex = /<header className="header">([\s\S]*?)<\/header>/;
const newHeader = `<header className="header">
        <div className="dashboard-header">
          <div>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div className="theme-lang-controls">
            <button className="icon-btn" onClick={toggleTheme} title="Toggle Theme">
              {theme === "dark" ? "🌙" : "☀️"}
            </button>
            <button className="icon-btn" onClick={toggleLang} title="Toggle Language">
              {lang === "zh" ? "中" : "EN"}
            </button>
            <button onClick={onConnect} className="primary-btn" disabled={loading}>{address ? t.refresh : t.connect}</button>
          </div>
        </div>
      </header>`;
appContent = appContent.replace(headerRegex, newHeader);

// 3. Update tabs rendering to use dictionary
appContent = appContent.replace(
  /{TABS\.map\(\(tab\) => <button key=\{tab\.key\}.*?<\/button>\)}/,
  `{TABS.map((tab) => <button key={tab.key} className={tab.key === activeTab ? "tab-btn tab-active" : "tab-btn"} onClick={() => setActiveTab(tab.key)}>{t[("tab_" + tab.key) as keyof typeof t] || tab.label}</button>)}`
);

// 4. Update the bottom nav
const bottomNavHtml = `
      {/* Bottom Floating Navigation */}
      <nav className="bottom-nav">
        {TABS.map((tab) => (
          <button key={"bot-" + tab.key} className={\`nav-item \${tab.key === activeTab ? "active" : ""}\`} onClick={() => setActiveTab(tab.key)}>
            <div className="nav-icon">
              {tab.key === "overview" && "🏠"}
              {tab.key === "machine" && "💻"}
              {tab.key === "node" && "🌐"}
              {tab.key === "otc" && "🤝"}
              {tab.key === "swap" && "🔄"}
              {tab.key === "mine" && "🧑"}
            </div>
            <span>{t[("tab_" + tab.key) as keyof typeof t] || tab.label}</span>
          </button>
        ))}
      </nav>
    </main>`;

appContent = appContent.replace(/<\/main>/, bottomNavHtml);

// 5. Update tabs className to differentiate from mobile
appContent = appContent.replace(/<section className="tabs">/, `<section className="tabs desktop-tabs">`);

fs.writeFileSync('src/App.tsx', appContent);
console.log('App.tsx features injected successfully!');
