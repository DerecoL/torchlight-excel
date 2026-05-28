const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = require.resolve('../renderer/quick-edit-json.js');

function loadQuickEditJson() {
  delete require.cache[modulePath];
  return require(modulePath);
}

test('normalizeQuickEditJsonRequest accepts importable quick edit JSON', () => {
  const { normalizeQuickEditJsonRequest } = loadQuickEditJson();

  const request = normalizeQuickEditJsonRequest({
    relativePath: ' design/demo_table/npc.xlsx ',
    sheetName: ' data ',
    headerRow: '2',
    primaryKey: ' id ',
    primaryValue: 1001,
    values: {
      name: 'Slime',
      level: 5,
    },
  });

  assert.deepEqual(request, {
    relativePath: 'design/demo_table/npc.xlsx',
    sheetName: 'data',
    headerRow: 2,
    primaryKey: 'id',
    primaryValue: 1001,
    values: {
      name: 'Slime',
      level: 5,
    },
  });
});

test('normalizeQuickEditJsonRequest rejects missing values object', () => {
  const { normalizeQuickEditJsonRequest } = loadQuickEditJson();

  assert.throws(
    () => normalizeQuickEditJsonRequest({
      relativePath: 'design/demo_table/npc.xlsx',
      sheetName: 'data',
      headerRow: 2,
      primaryKey: 'id',
      primaryValue: 1001,
    }),
    /values/
  );
});

test('CommonJS import does not set globalThis.quickEditJson', () => {
  delete globalThis.quickEditJson;
  loadQuickEditJson();
  assert.equal(globalThis.quickEditJson, undefined);
});
