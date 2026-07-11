// Run `node update-images.js` after adding/removing files in images/ —
// it rewrites the "images" list in content.json to match the folder.
const fs = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const imagesDir = path.join(__dirname, 'images');
const contentFile = path.join(__dirname, 'content.json');

const files = fs.readdirSync(imagesDir)
  .filter(f => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
  .sort();

const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
content.images = files;

fs.writeFileSync(contentFile, JSON.stringify(content, null, 2) + '\n');
console.log(`Wrote ${files.length} image(s) to content.json:`, files);
