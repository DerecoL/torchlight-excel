const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildQuickEditPlan,
} = require('../lib/quick-edit-core.js');

function sampleTableData() {
  return {
    headers: ['id', 'name', 'level', 'note'],
    existingRows: [
      { rowNumber: 4, values: { id: 1001, name: 'Old Slime', level: 2, note: 'keep' } },
      { rowNumber: 5, values: { id: 1002, name: 'Old Bat', level: 3, note: 'keep' } },
    ],
    nextRowNumber: 6,
  };
}

test('buildQuickEditPlan updates only changed fields for an existing primary key', async () => {
  const plan = await buildQuickEditPlan({
    request: {
      relativePath: 'design/demo_table/npc.xlsx',
      sheetName: 'data',
      headerRow: 2,
      primaryKey: 'id',
      primaryValue: '1001',
      values: {
        name: 'Slime',
        level: 5,
        note: 'keep',
      },
    },
    tableReader: async () => sampleTableData(),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].action, 'update');
  assert.equal(plan.changes[0].rowNumber, 4);
  assert.deepEqual(plan.changes[0].values, { name: 'Slime', level: 5 });
  assert.deepEqual(plan.changes[0].changes, {
    name: { before: 'Old Slime', after: 'Slime' },
    level: { before: 2, after: 5 },
  });
});

test('buildQuickEditPlan rejects missing primary key instead of inserting', async () => {
  const plan = await buildQuickEditPlan({
    request: {
      relativePath: 'design/demo_table/npc.xlsx',
      sheetName: 'data',
      headerRow: 2,
      primaryKey: 'id',
      primaryValue: '9999',
      values: { name: 'Missing' },
    },
    tableReader: async () => sampleTableData(),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, false);
  assert.equal(plan.changes.length, 0);
  assert.match(plan.errors.join('\n'), /找不到.*9999|not found.*9999/i);
});

test('buildQuickEditPlan returns no changes when values are unchanged', async () => {
  const plan = await buildQuickEditPlan({
    request: {
      relativePath: 'design/demo_table/npc.xlsx',
      sheetName: 'data',
      headerRow: 2,
      primaryKey: 'id',
      primaryValue: 1001,
      values: {
        name: 'Old Slime',
        level: '2',
      },
    },
    tableReader: async () => sampleTableData(),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.changes.length, 0);
});
