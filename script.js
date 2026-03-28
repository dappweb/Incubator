const fs = require('fs'); let code = fs.readFileSync('src/App.tsx', 'utf-8'); let lines = code.split('\n'); let otcIndex = lines.findIndex(l => l.includes('{activeTab === \
otc\ ?')); let swapIndex = lines.findIndex(l => l.includes('{activeTab === \swap\ ?')); let mineIndex = lines.findIndex(l => l.includes('{activeTab === \mine\ ?')); console.log({otcIndex, swapIndex, mineIndex});
