const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// There's a loose </div> before <nav> that we need to remove completely
code = code.replace(/<\/div>\s*<nav className="bottom-nav hidden-desktop">/g, '<nav className="bottom-nav hidden-desktop">');

fs.writeFileSync('src/App.tsx', code);
console.log('App wrapper fixed!');