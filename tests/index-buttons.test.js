const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function getButtonText(html, id) {
  const match = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>([^<]*)</button>`));
  assert.ok(match, `Expected #${id} to exist`);
  return match[1];
}

test('auto template import and export buttons match favorites group arrows', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');

  assert.equal(getButtonText(html, 'btnImportTemplate'), getButtonText(html, 'btnImportGroups'));
  assert.equal(getButtonText(html, 'btnExportTemplate'), getButtonText(html, 'btnExportGroups'));
});
