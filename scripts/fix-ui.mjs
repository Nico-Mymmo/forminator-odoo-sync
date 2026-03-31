import { readFileSync, writeFileSync } from 'fs';
const file = 'c:/Users/Nico Plinke/Documents/forminator-odoo-sync/src/modules/sales-insight-explorer/ui.js';
let content = readFileSync(file, 'utf8');

// Find the boundary markers
const FIRST_ISADMIN_CLOSE = "    ` : ''}\n\n\n      if (!list.length)";
const DOM_READY = "    document.addEventListener('DOMContentLoaded'";

const firstCloseIdx = content.indexOf(FIRST_ISADMIN_CLOSE);
const domIdx = content.indexOf(DOM_READY);

console.log('First isAdmin+blank+orphaned start at:', firstCloseIdx);
console.log('DOMContentLoaded at:', domIdx);

if (firstCloseIdx !== -1 && domIdx !== -1) {
  // The orphaned section goes from firstCloseIdx + length of "    ` : ''}\n" 
  // (after the new block's close) to just before DOMContentLoaded
  const newBlockCloseEnd = firstCloseIdx + "    ` : ''}".length;
  console.log('Chars to remove between newBlockClose and DOMReady:', domIdx - newBlockCloseEnd);
  console.log('Orphaned content (first 200 chars):', JSON.stringify(content.slice(newBlockCloseEnd, newBlockCloseEnd + 200)));
  console.log('Content just before DOMReady (last 100 chars):', JSON.stringify(content.slice(domIdx - 100, domIdx)));
} else {
  // Try alternative boundary
  const ISADMIN_CLOSE = "    ` : ''}";
  let idx = -1;
  let count = 0;
  while (true) {
    const next = content.indexOf(ISADMIN_CLOSE, idx + 1);
    if (next === -1) break;
    count++;
    console.log(`occ ${count} at ${next}: ...${JSON.stringify(content.slice(next-20, next+30))}...`);
    idx = next;
    if (count > 5) break;
  }
}
