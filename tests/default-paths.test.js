const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('UI default examples use the real demo table directory', () => {
  const appJs = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.doesNotMatch(appJs, /Design\/Tables\/Example\.xlsx/);
  assert.doesNotMatch(indexHtml, /Design\/Tables\/Monster\.xlsx/);
  assert.doesNotMatch(readme, /Design\/Tables\/Monster\.xlsx/);
  assert.match(appJs, /design\/demo_table\/npc\.xlsx/);
  assert.match(indexHtml, /design\/demo_table\/npc\.xlsx/);
  assert.match(readme, /design\/demo_table\/npc\.xlsx/);
});

test('visual add-row defaults do not map every input as an Excel field', () => {
  const appJs = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');

  assert.doesNotMatch(appJs, /input\.key && input\.key !== primaryKey/);
  assert.doesNotMatch(appJs, /map\(input => \[input\.key/);
});

test('run items render as vertical cards instead of a horizontal grid table', () => {
  const appJs = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');

  assert.match(appJs, /run-item-card/);
  assert.match(css, /\.run-item-card/);
  assert.doesNotMatch(css, /\.run-item-row\s*\{[^}]*display:\s*contents/);
});
