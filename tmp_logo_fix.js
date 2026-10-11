// Historical one-off CSS migration script; it is not used by the running app.
const fs = require('fs');
const filePath = 'C:/Users/venuh/SketchSensAI/public/style.css';
let css = fs.readFileSync(filePath, 'utf8');
const pattern = /\.cover-visual\{display:flex;align-items:center;justify-content:center;position:relative;min-height:280px\}\.shape-scene\{position:relative;width:min\(380px,48vw\);height:min\(380px,48vw\);display:grid;place-items:center;perspective:1200px\}\.orb\{position:absolute;border-radius:50%;filter:blur\(4px\)\}.*?@keyframes spin\{.*?\}/s;
const replacement = '.cover-visual{display:flex;align-items:center;justify-content:center;position:relative;min-height:280px}.shape-scene{position:relative;width:min(380px,48vw);height:min(380px,48vw);display:grid;place-items:center}.cover-logo{width:min(320px,42vw);height:auto;filter:drop-shadow(0 16px 30px rgba(0,0,0,.25));opacity:.96}';
const next = css.replace(pattern, replacement);
if (next === css) throw new Error('pattern not replaced');
fs.writeFileSync(filePath, next, 'utf8');
console.log('updated css');
