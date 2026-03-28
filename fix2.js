const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// There's a div missing a closing tag before </nav> or <nav>
code = code.replace(/<nav className="bottom-nav hidden-desktop">/, '</div></div><nav className="bottom-nav hidden-desktop">');

fs.writeFileSync('src/App.tsx', code);
console.log('Fixed div');