const fs = require('fs');
const code = fs.readFileSync('src/app/caja/CajaView.tsx', 'utf8');

const lines = code.split('\n');
let d = 0;
for(let i = 200; i < lines.length; i++) {
  const line = lines[i];
  const o = (line.match(/<(?!\/|!)[A-Za-z]/g) || []).length;
  const c = (line.match(/<\//g) || []).length;
  const s = (line.match(/\/>/g) || []).length;
  d += o - c - s;
}
console.log("FINAL DEPTH:", d);
