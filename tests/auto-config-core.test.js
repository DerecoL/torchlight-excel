const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAutoConfigPlan,
  executeAutoConfigPlan,
} = require('../lib/auto-config-core.js');

function sampleTemplate() {
  return {
    id: 'monster-basic',
    name: '怪物基础配置',
    inputs: [
      { key: 'kind', label: '类型', type: 'select', options: ['monster', 'npc'] },
      { key: 'name', label: '名称', type: 'text' },
      { key: 'level', label: '等级', type: 'number' },
    ],
    idSequences: [{ key: 'monsterId', label: '怪物ID' }],
    tables: [
      {
        key: 'monster',
        relativePath: 'Design/Tables/Monster.xlsx',
        sheetName: 'Monster',
        headerRow: 1,
        primaryKey: 'ID',
        copyRow: 2,
        rows: [
          {
            key: 'monsterMain',
            condition: { input: 'kind', op: 'equals', value: 'monster' },
            fields: {
              ID: { type: 'id', sequence: 'monsterId' },
              Name: { type: 'input', key: 'name' },
              Level: { type: 'input', key: 'level' },
              Type: { type: 'constant', value: 'Enemy' },
            },
          },
        ],
      },
      {
        key: 'drop',
        relativePath: 'Design/Tables/Drop.xlsx',
        sheetName: 'Drop',
        headerRow: 1,
        primaryKey: 'MonsterID',
        rows: [
          {
            key: 'monsterDrop',
            condition: { input: 'kind', op: 'in', values: ['monster'] },
            fields: {
              MonsterID: { type: 'ref', row: 'monsterMain', field: 'ID' },
              DropGroup: { type: 'constant', value: 9001 },
            },
          },
        ],
      },
    ],
  };
}

test('buildAutoConfigPlan allocates manual start IDs and resolves row references', async () => {
  const plan = await buildAutoConfigPlan({
    template: sampleTemplate(),
    runRequest: {
      templateId: 'monster-basic',
      inputs: { kind: 'monster', name: 'Slime', level: 3 },
      idStarts: { monsterId: 1000 },
    },
    tableReader: async (table) => ({
      headers: table.key === 'monster' ? ['ID', 'Name', 'Level', 'Type'] : ['MonsterID', 'DropGroup'],
      existingRows: [],
      nextRowNumber: 2,
    }),
    resolveLocalPath: async (relativePath) => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.changes.length, 2);
  assert.deepEqual(plan.generatedRows.monsterMain, {
    ID: 1000,
    Name: 'Slime',
    Level: 3,
    Type: 'Enemy',
  });
  assert.deepEqual(plan.generatedRows.monsterDrop, {
    MonsterID: 1000,
    DropGroup: 9001,
  });
});

test('buildAutoConfigPlan supports batch items with scoped row references', async () => {
  const plan = await buildAutoConfigPlan({
    template: sampleTemplate(),
    runRequest: {
      templateId: 'monster-basic',
      items: [
        { kind: 'monster', name: 'Slime', level: 3 },
        { kind: 'monster', name: 'Goblin', level: 5 },
      ],
      idStarts: { monsterId: 1000 },
    },
    tableReader: async (table) => ({
      headers: table.key === 'monster' ? ['ID', 'Name', 'Level', 'Type'] : ['MonsterID', 'DropGroup'],
      existingRows: [],
      nextRowNumber: 2,
      columnValues: {},
    }),
    resolveLocalPath: async (relativePath) => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.changes.length, 4);
  assert.deepEqual(plan.changes.map(change => change.itemIndex), [0, 0, 1, 1]);
  assert.deepEqual(plan.changes.map(change => change.primaryValue), [1000, 1000, 1001, 1001]);
  assert.deepEqual(plan.generatedRowsByItem[0].monsterMain, {
    ID: 1000,
    Name: 'Slime',
    Level: 3,
    Type: 'Enemy',
  });
  assert.deepEqual(plan.generatedRowsByItem[0].monsterDrop, {
    MonsterID: 1000,
    DropGroup: 9001,
  });
  assert.deepEqual(plan.generatedRowsByItem[1].monsterMain, {
    ID: 1001,
    Name: 'Goblin',
    Level: 5,
    Type: 'Enemy',
  });
  assert.deepEqual(plan.generatedRowsByItem[1].monsterDrop, {
    MonsterID: 1001,
    DropGroup: 9001,
  });
});

test('buildAutoConfigPlan infers missing ID starts from max existing numeric IDs', async () => {
  const plan = await buildAutoConfigPlan({
    template: sampleTemplate(),
    runRequest: {
      templateId: 'monster-basic',
      items: [
        { kind: 'monster', name: 'Slime', level: 3 },
        { kind: 'monster', name: 'Goblin', level: 5 },
      ],
      idStarts: {},
    },
    tableReader: async (table) => ({
      headers: table.key === 'monster' ? ['ID', 'Name', 'Level', 'Type'] : ['MonsterID', 'DropGroup'],
      existingRows: table.key === 'monster'
        ? [
          { rowNumber: 2, values: { ID: 1008, Name: 'Old', Level: 1, Type: 'Enemy' } },
          { rowNumber: 3, values: { ID: 'note', Name: 'Ignored', Level: 1, Type: 'Enemy' } },
        ]
        : [],
      nextRowNumber: table.key === 'monster' ? 4 : 2,
      columnValues: table.key === 'monster' ? { ID: [1008, 'note'] } : {},
    }),
    resolveLocalPath: async (relativePath) => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.errors.length, 0);
  assert.deepEqual(plan.changes.map(change => change.primaryValue), [1009, 1009, 1010, 1010]);
});

test('buildAutoConfigPlan reports missing ID start when it cannot infer one', async () => {
  const plan = await buildAutoConfigPlan({
    template: sampleTemplate(),
    runRequest: {
      templateId: 'monster-basic',
      items: [{ kind: 'monster', name: 'Slime', level: 3 }],
      idStarts: {},
    },
    tableReader: async (table) => ({
      headers: table.key === 'monster' ? ['ID', 'Name', 'Level', 'Type'] : ['MonsterID', 'DropGroup'],
      existingRows: [],
      nextRowNumber: 2,
      columnValues: {},
    }),
    resolveLocalPath: async (relativePath) => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, false);
  assert.match(plan.errors.join('\n'), /无法自动推断 ID 起始值|缺少 ID 起始值/);
});

test('buildAutoConfigPlan skips rows whose conditions do not match', async () => {
  const plan = await buildAutoConfigPlan({
    template: sampleTemplate(),
    runRequest: {
      templateId: 'monster-basic',
      inputs: { kind: 'npc', name: 'Shop Keeper', level: 1 },
      idStarts: { monsterId: 1000 },
    },
    tableReader: async () => ({
      headers: ['ID', 'Name', 'Level', 'Type', 'MonsterID', 'DropGroup'],
      existingRows: [],
      nextRowNumber: 2,
    }),
    resolveLocalPath: async (relativePath) => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.changes.length, 0);
  assert.deepEqual(plan.generatedRows, {});
});

test('buildAutoConfigPlan marks existing primary keys as updates and new keys as inserts', async () => {
  const plan = await buildAutoConfigPlan({
    template: sampleTemplate(),
    runRequest: {
      templateId: 'monster-basic',
      inputs: { kind: 'monster', name: 'Slime', level: 5 },
      idStarts: { monsterId: 1000 },
    },
    tableReader: async (table) => ({
      headers: table.key === 'monster' ? ['ID', 'Name', 'Level', 'Type'] : ['MonsterID', 'DropGroup'],
      existingRows: table.key === 'monster'
        ? [{ rowNumber: 8, values: { ID: 1000, Name: 'Old Slime', Level: 2, Type: 'Enemy' } }]
        : [],
      nextRowNumber: table.key === 'monster' ? 9 : 2,
    }),
    resolveLocalPath: async (relativePath) => `C:/ws/${relativePath}`,
  });

  const monsterChange = plan.changes.find(change => change.rowKey === 'monsterMain');
  const dropChange = plan.changes.find(change => change.rowKey === 'monsterDrop');

  assert.equal(monsterChange.action, 'update');
  assert.equal(monsterChange.rowNumber, 8);
  assert.deepEqual(monsterChange.changes.Name, { before: 'Old Slime', after: 'Slime' });
  assert.deepEqual(monsterChange.changes.Level, { before: 2, after: 5 });
  assert.equal(dropChange.action, 'insert');
  assert.equal(dropChange.rowNumber, 2);
});

test('executeAutoConfigPlan syncs and checks out files before writing backups and changes', async () => {
  const calls = [];
  const plan = {
    ok: true,
    changes: [
      { relativePath: 'Design/Tables/Monster.xlsx', localPath: 'C:/ws/Monster.xlsx', sheetName: 'Monster' },
      { relativePath: 'Design/Tables/Monster.xlsx', localPath: 'C:/ws/Monster.xlsx', sheetName: 'Monster' },
      { relativePath: 'Design/Tables/Drop.xlsx', localPath: 'C:/ws/Drop.xlsx', sheetName: 'Drop' },
    ],
  };

  const result = await executeAutoConfigPlan({
    plan,
    p4: {
      sync: async (relativePath) => calls.push(`sync:${relativePath}`),
      edit: async (relativePath) => calls.push(`edit:${relativePath}`),
    },
    workbookWriter: async (localPath, changes) => {
      calls.push(`write:${localPath}:${changes.length}`);
    },
    backupFile: async (localPath) => {
      calls.push(`backup:${localPath}`);
      return `${localPath}.bak`;
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    'sync:Design/Tables/Monster.xlsx',
    'edit:Design/Tables/Monster.xlsx',
    'backup:C:/ws/Monster.xlsx',
    'write:C:/ws/Monster.xlsx:2',
    'sync:Design/Tables/Drop.xlsx',
    'edit:Design/Tables/Drop.xlsx',
    'backup:C:/ws/Drop.xlsx',
    'write:C:/ws/Drop.xlsx:1',
  ]);
});

test('buildAutoConfigPlan warns when a table has no row rules', async () => {
  const plan = await buildAutoConfigPlan({
    template: {
      id: 'npc',
      name: 'NPC配置',
      inputs: [],
      idSequences: [],
      tables: [
        {
          key: 'npc',
          relativePath: 'design/demo_table/npc.xlsx',
          sheetName: 'Sheet1',
          headerRow: 2,
          primaryKey: 'id',
          rows: [],
        },
      ],
    },
    runRequest: { templateId: 'npc', inputs: {}, idStarts: {} },
    tableReader: async () => ({ headers: ['id', 'name'], existingRows: [], nextRowNumber: 3 }),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.changes.length, 0);
  assert.match(plan.warnings.join('\n'), /没有配置行规则/);
});

test('executeAutoConfigPlan refuses to write an empty change plan', async () => {
  let wrote = false;

  const result = await executeAutoConfigPlan({
    plan: { ok: true, changes: [] },
    p4: {
      sync: async () => { throw new Error('must not sync'); },
      edit: async () => { throw new Error('must not edit'); },
    },
    workbookWriter: async () => { wrote = true; },
    backupFile: async () => 'backup.xlsx',
  });

  assert.equal(result.ok, false);
  assert.equal(wrote, false);
  assert.match(result.error, /没有可写入的变更/);
});

test('buildAutoConfigPlan reports empty row rules before primary key errors', async () => {
  const plan = await buildAutoConfigPlan({
    template: {
      id: 'npc',
      name: 'NPC配置',
      inputs: [],
      idSequences: [{ key: 'npcId', label: 'NPC ID' }],
      tables: [
        {
          key: 'npc',
          relativePath: 'design/demo_table/npc.xlsx',
          sheetName: 'Sheet1',
          headerRow: 2,
          primaryKey: 'id',
          rows: [{ key: '', condition: null, fields: {} }],
        },
      ],
    },
    runRequest: { templateId: 'npc', inputs: {}, idStarts: { npcId: 1001 } },
    tableReader: async () => ({ headers: ['id', 'name'], existingRows: [], nextRowNumber: 3 }),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, false);
  assert.match(plan.errors.join('\n'), /缺少字段映射/);
  assert.doesNotMatch(plan.errors.join('\n'), /缺少主键值/);
});

test('buildAutoConfigPlan warns when provided inputs are not mapped to any fields', async () => {
  const plan = await buildAutoConfigPlan({
    template: {
      id: 'npc',
      name: 'NPC配置',
      inputs: [
        { key: 'name', label: '名称', type: 'text' },
        { key: 'resource_id', label: '资源id', type: 'number' },
      ],
      idSequences: [{ key: 'npcId', label: 'NPC ID' }],
      tables: [
        {
          key: 'npc',
          relativePath: 'design/demo_table/npc.xlsx',
          sheetName: 'data',
          headerRow: 2,
          primaryKey: 'id',
          rows: [
            {
              key: 'npc',
              fields: {
                id: { type: 'id', sequence: 'npcId' },
              },
            },
          ],
        },
      ],
    },
    runRequest: {
      templateId: 'npc',
      inputs: { name: '复制民', resource_id: 123 },
      idStarts: { npcId: 1001001 },
    },
    tableReader: async () => ({ headers: ['id', 'name', 'resource_id'], existingRows: [], nextRowNumber: 3 }),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.match(plan.warnings.join('\n'), /输入字段未映射到任何 Excel 列: name, resource_id/);
});
