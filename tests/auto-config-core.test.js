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

test('buildAutoConfigPlan reports missing headers with row and available header context', async () => {
  const plan = await buildAutoConfigPlan({
    template: {
      id: 'npc',
      name: 'NPC配置',
      inputs: [{ key: 'skill_ids_pipe', label: '技能列表', type: 'text' }],
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
              key: 'npcMain',
              fields: {
                id: { type: 'id', sequence: 'npcId' },
                skill_ids_pipe: { type: 'input', key: 'skill_ids_pipe' },
              },
            },
          ],
        },
      ],
    },
    runRequest: {
      templateId: 'npc',
      inputs: { skill_ids_pipe: '1000000' },
      idStarts: { npcId: 10000001 },
    },
    tableReader: async () => ({
      headers: ['id', 'name', 'skill', 'npc_attr_id'],
      existingRows: [],
      nextRowNumber: 3,
      columnValues: {},
    }),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, false);
  assert.match(plan.errors.join('\n'), /行规则 npcMain/);
  assert.match(plan.errors.join('\n'), /缺少字段表头: skill_ids_pipe/);
  assert.match(plan.errors.join('\n'), /可用表头: id, name, skill, npc_attr_id/);
});

test('buildAutoConfigPlan joins enabled skill inputs into npc skill field', async () => {
  const plan = await buildAutoConfigPlan({
    template: {
      id: 'npc-skill-join',
      name: 'NPC技能拼接',
      inputs: [
        { key: 'skill1_id', label: '技能1', type: 'number' },
        { key: 'has_skill_2', label: '是否技能2', type: 'boolean' },
        { key: 'skill2_id', label: '技能2', type: 'number' },
        { key: 'has_skill_3', label: '是否技能3', type: 'boolean' },
        { key: 'skill3_id', label: '技能3', type: 'number' },
        { key: 'has_skill_4', label: '是否技能4', type: 'boolean' },
        { key: 'skill4_id', label: '技能4', type: 'number' },
        { key: 'has_skill_5', label: '是否技能5', type: 'boolean' },
        { key: 'skill5_id', label: '技能5', type: 'number' },
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
              key: 'npcMain',
              fields: {
                id: { type: 'id', sequence: 'npcId' },
                skill: {
                  type: 'join',
                  separator: '|',
                  items: [
                    { type: 'input', key: 'skill1_id' },
                    { type: 'input', key: 'skill2_id', condition: { input: 'has_skill_2', op: 'equals', value: true } },
                    { type: 'input', key: 'skill3_id', condition: { input: 'has_skill_3', op: 'equals', value: true } },
                    { type: 'input', key: 'skill4_id', condition: { input: 'has_skill_4', op: 'equals', value: true } },
                    { type: 'input', key: 'skill5_id', condition: { input: 'has_skill_5', op: 'equals', value: true } },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    runRequest: {
      templateId: 'npc-skill-join',
      inputs: {
        skill1_id: 1000000,
        has_skill_2: true,
        skill2_id: 1000001,
        has_skill_3: true,
        skill3_id: 1000002,
        has_skill_4: true,
        skill4_id: 1000003,
        has_skill_5: false,
        skill5_id: '',
      },
      idStarts: { npcId: 10000001 },
    },
    tableReader: async () => ({
      headers: ['id', 'skill'],
      existingRows: [],
      nextRowNumber: 3,
      columnValues: {},
    }),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.changes[0].values.skill, '1000000|1000001|1000002|1000003');
});

test('buildAutoConfigPlan auto-generates blank skillstone ids and writes them into npc skill', async () => {
  const plan = await buildAutoConfigPlan({
    template: {
      id: 'npc-skill-auto-ids',
      name: 'NPC skill auto ids',
      inputs: [
        { key: 'skill1_id', label: 'skill 1', type: 'number' },
        { key: 'has_skill_2', label: 'has skill 2', type: 'boolean' },
        { key: 'skill2_id', label: 'skill 2', type: 'number' },
        { key: 'has_skill_3', label: 'has skill 3', type: 'boolean' },
        { key: 'skill3_id', label: 'skill 3', type: 'number' },
      ],
      idSequences: [
        { key: 'npcId', label: 'npc.id' },
        { key: 'skillstoneId', label: 'skill_stone.id' },
      ],
      tables: [
        {
          key: 'skillstone',
          relativePath: 'design/demo_table/skill_stone.xlsx',
          sheetName: 'data',
          headerRow: 2,
          primaryKey: 'id',
          rows: [
            {
              key: 'skillstone1',
              fields: {
                id: { type: 'inputOrId', key: 'skill1_id', sequence: 'skillstoneId' },
              },
            },
            {
              key: 'skillstone2',
              condition: { input: 'has_skill_2', op: 'equals', value: true },
              fields: {
                id: { type: 'inputOrId', key: 'skill2_id', sequence: 'skillstoneId' },
              },
            },
            {
              key: 'skillstone3',
              condition: { input: 'has_skill_3', op: 'equals', value: true },
              fields: {
                id: { type: 'inputOrId', key: 'skill3_id', sequence: 'skillstoneId' },
              },
            },
          ],
        },
        {
          key: 'npc',
          relativePath: 'design/demo_table/npc.xlsx',
          sheetName: 'data',
          headerRow: 2,
          primaryKey: 'id',
          rows: [
            {
              key: 'npcMain',
              fields: {
                id: { type: 'id', sequence: 'npcId' },
                skill: {
                  type: 'join',
                  separator: '|',
                  items: [
                    { type: 'ref', row: 'skillstone1', field: 'id' },
                    { type: 'ref', row: 'skillstone2', field: 'id', condition: { input: 'has_skill_2', op: 'equals', value: true } },
                    { type: 'ref', row: 'skillstone3', field: 'id', condition: { input: 'has_skill_3', op: 'equals', value: true } },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
    runRequest: {
      templateId: 'npc-skill-auto-ids',
      inputs: {
        skill1_id: '',
        has_skill_2: true,
        skill2_id: '',
        has_skill_3: false,
        skill3_id: '',
      },
      idStarts: { npcId: 10000001 },
    },
    tableReader: async (table) => ({
      headers: table.key === 'skillstone' ? ['id'] : ['id', 'skill'],
      existingRows: table.key === 'skillstone'
        ? [
          { rowNumber: 2, values: { id: 2000 } },
          { rowNumber: 3, values: { id: 'ignored' } },
        ]
        : [],
      nextRowNumber: table.key === 'skillstone' ? 4 : 3,
      columnValues: table.key === 'skillstone' ? { id: [2000, 'ignored'] } : {},
    }),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.changes.find(change => change.rowKey === 'skillstone1').values.id, 2001);
  assert.equal(plan.changes.find(change => change.rowKey === 'skillstone2').values.id, 2002);
  assert.equal(plan.changes.find(change => change.rowKey === 'npcMain').values.skill, '2001|2002');
});

test('buildAutoConfigPlan generates repeated rows from array input and joins generated ids', async () => {
  const plan = await buildAutoConfigPlan({
    template: {
      id: 'npc-skill-array',
      name: 'NPC skill array',
      inputs: [
        {
          key: 'skills',
          label: '技能配置',
          type: 'array',
          fields: [
            { key: 'skill_stone_id', label: '技能石 ID', type: 'number' },
            { key: 'skill_stone_type', label: '技能石类型', type: 'number' },
            { key: 'skill_id', label: '技能行为 ID', type: 'number' },
          ],
        },
      ],
      idSequences: [
        { key: 'npcId', label: 'npc.id' },
        { key: 'skillStoneId', label: 'skill_stone.id' },
      ],
      tables: [
        {
          key: 'skill_stone',
          relativePath: 'design/demo_table/skill_stone.xlsx',
          sheetName: 'data',
          headerRow: 2,
          primaryKey: 'id',
          rows: [
            {
              key: 'skillStone',
              forEach: { input: 'skills', as: 'skill' },
              fields: {
                id: { type: 'inputOrId', key: 'skill.skill_stone_id', sequence: 'skillStoneId' },
                type: { type: 'input', key: 'skill.skill_stone_type' },
                skill_id: { type: 'input', key: 'skill.skill_id' },
              },
            },
          ],
        },
        {
          key: 'npc',
          relativePath: 'design/demo_table/npc.xlsx',
          sheetName: 'data',
          headerRow: 2,
          primaryKey: 'id',
          rows: [
            {
              key: 'npcMain',
              fields: {
                id: { type: 'id', sequence: 'npcId' },
                skill: { type: 'refJoin', row: 'skillStone', field: 'id', separator: '|' },
              },
            },
          ],
        },
      ],
    },
    runRequest: {
      templateId: 'npc-skill-array',
      inputs: {
        skills: [
          { skill_stone_id: '', skill_stone_type: 1, skill_id: 3001 },
          { skill_stone_id: 2100, skill_stone_type: 2, skill_id: 3002 },
        ],
      },
      idStarts: { npcId: 10000001 },
    },
    tableReader: async (table) => ({
      headers: table.key === 'skill_stone' ? ['id', 'type', 'skill_id'] : ['id', 'skill'],
      existingRows: table.key === 'skill_stone'
        ? [{ rowNumber: 2, values: { id: 2000, type: 1, skill_id: 1000 } }]
        : [],
      nextRowNumber: table.key === 'skill_stone' ? 3 : 3,
      columnValues: table.key === 'skill_stone' ? { id: [2000] } : {},
    }),
    resolveLocalPath: async relativePath => `C:/ws/${relativePath}`,
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.changes.filter(change => change.rowKey === 'skillStone').length, 2);
  assert.deepEqual(plan.generatedRows.skillStone.map(row => row.id), [2001, 2100]);
  assert.equal(plan.changes.find(change => change.rowKey === 'npcMain').values.skill, '2001|2100');
});
