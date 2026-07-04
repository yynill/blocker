// Run `node update-images.js` after adding/removing files in images/ —
// it rewrites the BLOCKED_IMAGES list in blocked-content.js to match the folder.
const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const imagesDir = path.join(__dirname, 'images');
const contentFile = path.join(__dirname, 'blocked-content.js');

const files = fs.readdirSync(imagesDir)
  .filter(f => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
  .sort();

const listLiteral = files.map(f => `  '${f.replace(/'/g, "\\'")}',`).join('\n');

const content = fs.readFileSync(contentFile, 'utf8');
const updated = content.replace(
  /const BLOCKED_IMAGES = \[[\s\S]*?\];/,
  `const BLOCKED_IMAGES = [\n${listLiteral}\n];`
);

fs.writeFileSync(contentFile, updated);
console.log(`Wrote ${files.length} image(s) to BLOCKED_IMAGES:`, files);
