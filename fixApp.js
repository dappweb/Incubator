const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(appPath, 'utf-8');

// 1. Add Wagmi imports
const wagmiImports = `import { useAccount, useChainId } from "wagmi";
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useEthersProvider, useEthersSigner } from "./lib/ethersAdapter";`;

content = content.replace('import React, { useEffect, useMemo, useState } from "react";', `import React, { useEffect, useMemo, useState } from "react";\n${wagmiImports}`);

// 2. Remove wallet lib imports
content = content.replace(/import \{.*?checkConnection.*?\} from "\.\/lib\/wallet";/s, `import { isOnCncMainnet } from "./lib/wallet";`);

// 3. Replace state definitions
content = content.replace(/const \[address, setAddress\] = useState\(""\);\n\s*const \[chainId, setChainId\] = useState\(0\);\n\s*const \[provider, setProvider\] = useState<BrowserProvider \| null>\(null\);/, `const { address: wagmiAddress, isConnected } = useAccount();
  const address = wagmiAddress || "";
  const chainId = useChainId();
  const readProvider = useEthersProvider({ chainId });
  const signer = useEthersSigner({ chainId });
  const provider = (signer || readProvider) as any;`);

// 4. Comment out connect properties / listeners
content = content.replace(/const onConnect = async \(\) => {[\s\S]*?};/g, 'const onConnect = async () => {};');
content = content.replace(/const onDisconnect = async \(\) => {[\s\S]*?};/g, 'const onDisconnect = async () => {};');

// 5. Replace header connection button with ConnectButton
content = content.replace(/<button onClick=\{address \? onDisconnect : onConnect\}([\s\S]*?)<\/button>/, `<ConnectButton />`);

// 6. Fix `onDisconnect` usage
content = content.replace(/<div className="status-item">\n\s*<span>\{t\.walletStatus\}<\/span>\n\s*<div className="status-value".*?>\n\s*<span className=\{`status-dot \$\{address \? "status-online" : "status-offline"\}`\}><\/span>\n\s*\{address \? t\.connected : t\.notConnected\}\n\s*<\/div>\n\s*<\/div>\n\s*<div className="status-item">\n\s*<span>\{t\.address\}<\/span>\n\s*<div className="status-value".*?>\n\s*\{address \? <>\n\s*<span className="address-text">\{address.slice\(0, 6\)\}\.\.\.\{address.slice\(-4\)\}<\/span>.*?<\/button>\n\s*<\/> : t\.notConnected\}\n\s*<\/div>\n\s*<\/div>/s, 
`<div className="status-item">
            <span>{t.walletStatus}</span>
            <div className="status-value" aria-label={t.walletStatus}>
              <span className={\`status-dot \${isConnected ? "status-online" : "status-offline"}\`}></span>
              {isConnected ? t.connected : t.notConnected}
            </div>
          </div>
          <div className="status-item">
            <span>{t.address}</span>
            <div className="status-value" aria-label={t.address}>
              {isConnected && address ? (
                <>
                  <span className="address-text">{address.slice(0, 6)}...{address.slice(-4)}</span>
                  <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(address); setStatus(t.copied); setTimeout(() => setStatus(""), 2000); }} aria-label={t.copy}>📋</button>
                </>
              ) : t.notConnected}
            </div>
          </div>`);

// 7. Fix effects that relied on `checkConnection`
const checkConnEffect = `useEffect(() => {
    checkConnection().then((res) => {
      if (res) {
        setProvider(res.provider);
        setAddress(res.address);
        setChainId(res.chainId);
      }
    });

    const cleanup = listenToWalletEvents(
      (accounts) => {
        if (accounts.length > 0) setAddress(accounts[0]);
        else onDisconnect();
      },
      (newChainId) => setChainId(Number(newChainId))
    );
    return cleanup;
  }, []);`;
content = content.replace(checkConnEffect, `// Replaced with Wagmi hooks`);

// 8. Fix manual connect logic: we no longer need the first time connect guide 
content = content.replace(/const runFirstConnectGuide = async \(\) => \{[\s\S]*?setFirstConnectGuideRunning\(false\);\n  \};/, `const runFirstConnectGuide = async () => { setShowFirstConnectGuide(false); };`);

// Fix usage of provider inside `const guardedAction = async (action: () => Promise<void>) => {`:
// since provider gets updated by wagmi, we don't need to check provider nullity as much unless signer is missing.
content = content.replace(/if \(!provider\) \{\n\s*setStatus\(t.connectFirst\);\n\s*throw new Error\(t.connectFirst\);\n\s*\}/g, `if (!provider && !signer) {\n      setStatus(t.connectFirst);\n      throw new Error(t.connectFirst);\n    }`);


fs.writeFileSync(appPath, content, 'utf-8');
console.log('App.tsx transformed for RainbowKit!');