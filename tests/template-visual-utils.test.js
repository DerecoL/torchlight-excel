const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = require.resolve('../renderer/template-visual-utils.js');

function loadUtils() {
  delete require.cache[modulePath];
  return require(modulePath);
}

test('normalizeTemplate keeps JSON-authored template data round-trippable', () => {
  const { normalizeTemplate } = loadUtils();

  const input = {
    id: 'monster-basic',
    name: '怪物基础配置',
    inputs: [
      { key: 'kind', label: '类型', type: 'select', options: 'monster,boss' },
      { key: 'level', label: '等级', type: 'number' },
    ],
    idSequences: [{ key: 'monsterId', label: '怪物ID' }],
    tables: [
      {
        key: 'monster',
        relativePath: 'Design/Tables/Monster.xlsx',
        sheetName: 'Monster',
        headerRow: '1',
        primaryKey: 'ID',
        copyRow: '2',
        rows: [
          {
            key: 'mainRow',
            condition: { input: 'kind', op: 'in', values: 'monster,boss' },
            fields: {
              ID: { type: 'id', sequence: 'monsterId' },
              Name: { type: 'input', key: 'kind' },
            },
          },
        ],
      },
    ],
  };

  const output = normalizeTemplate(input);

  assert.deepEqual(output.inputs[0].options, ['monster', 'boss']);
  assert.equal(output.tables[0].headerRow, 1);
  assert.equal(output.tables[0].copyRow, 2);
  assert.deepEqual(output.tables[0].rows[0].condition.values, ['monster', 'boss']);
  assert.deepEqual(output.tables[0].rows[0].fields.ID, { type: 'id', sequence: 'monsterId' });
});

test('normalizeTemplate supplies valid empty arrays for visual-created templates', () => {
  const { normalizeTemplate } = loadUtils();

  const output = normalizeTemplate({ id: 'empty', name: '空模板' });

  assert.deepEqual(output.inputs, []);
  assert.deepEqual(output.idSequences, []);
  assert.deepEqual(output.tables, []);
});

test('CommonJS import does not set globalThis.templateVisualUtils', () => {
  delete globalThis.templateVisualUtils;
  loadUtils();
  assert.equal(globalThis.templateVisualUtils, undefined);
});

test('normalizeTemplate repairs empty row rules with the primary key id sequence', () => {
  const { normalizeTemplate } = loadUtils();

  const output = normalizeTemplate({
    id: 'npc',
    name: 'NPC',
    idSequences: [{ key: 'mainId', label: 'npc表ID' }],
    tables: [
      {
        key: 'npc',
        relativePath: 'design/demo_table/npc.xlsx',
        sheetName: 'Sheet1',
        headerRow: 2,
        primaryKey: 'id',
        rows: [{ key: 'npc', fields: {} }],
      },
    ],
  });

  assert.deepEqual(output.tables[0].rows[0].fields, {
    id: { type: 'id', sequence: 'mainId' },
  });
});

test('normalizeTemplate maps same-key inputs when repairing an empty row rule', () => {
  const { normalizeTemplate } = loadUtils();

  const output = normalizeTemplate({
    id: 'npc',
    name: 'NPC',
    inputs: [
      { key: 'name', label: '名称', type: 'text' },
      { key: 'resource_id', label: '资源id', type: 'number' },
    ],
    idSequences: [{ key: 'mainId', label: 'npc表ID' }],
    tables: [
      {
        key: 'npc',
        relativePath: 'design/demo_table/npc.xlsx',
        sheetName: 'data',
        headerRow: 2,
        primaryKey: 'id',
        rows: [{ key: 'npc', fields: {} }],
      },
    ],
  });

  assert.deepEqual(output.tables[0].rows[0].fields, {
    id: { type: 'id', sequence: 'mainId' },
    name: { type: 'input', key: 'name' },
    resource_id: { type: 'input', key: 'resource_id' },
  });
});

test('normalizeTemplate maps same-key inputs when a row only has the primary key', () => {
  const { normalizeTemplate } = loadUtils();

  const output = normalizeTemplate({
    id: 'npc',
    name: 'NPC',
    inputs: [
      { key: 'name', label: '名称', type: 'text' },
      { key: 'note', label: '备注', type: 'text' },
    ],
    idSequences: [{ key: 'mainId', label: 'npc表ID' }],
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
              id: { type: 'id', sequence: 'mainId' },
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(output.tables[0].rows[0].fields, {
    id: { type: 'id', sequence: 'mainId' },
    name: { type: 'input', key: 'name' },
    note: { type: 'input', key: 'note' },
  });
});

test('extractTemplateFromImport reads the first template from a full export document', () => {
  const { extractTemplateFromImport } = loadUtils();

  const output = extractTemplateFromImport({
    version: 1,
    exportedAt: '2026-05-27T00:00:00.000Z',
    templates: [
      {
        id: 'monster-basic',
        name: '怪物基础配置',
        inputs: [{ key: 'kind', label: '类型', type: 'select', options: 'monster,boss' }],
        idSequences: [{ key: 'monsterId', label: '怪物ID' }],
        tables: [],
      },
    ],
  });

  assert.equal(output.id, 'monster-basic');
  assert.equal(output.name, '怪物基础配置');
  assert.deepEqual(output.inputs[0].options, ['monster', 'boss']);
});

test('extractTemplateFromImport selects a matching template id from a full export document', () => {
  const { extractTemplateFromImport } = loadUtils();

  const output = extractTemplateFromImport({
    version: 1,
    templates: [
      { id: 'monster-basic', name: '怪物基础配置', inputs: [], idSequences: [], tables: [] },
      { id: 'npc-basic', name: 'NPC 基础配置', inputs: [{ key: 'name', label: '名称' }], tables: [] },
    ],
  }, 'npc-basic');

  assert.equal(output.id, 'npc-basic');
  assert.equal(output.name, 'NPC 基础配置');
  assert.deepEqual(output.inputs, [{ key: 'name', label: '名称', type: 'text', options: [] }]);
});

test('extractTemplateFromImport accepts a single template object', () => {
  const { extractTemplateFromImport } = loadUtils();

  const output = extractTemplateFromImport({
    id: 'single-template',
    name: '单模板',
    inputs: [],
    idSequences: [],
    tables: [],
  });

  assert.equal(output.id, 'single-template');
  assert.equal(output.name, '单模板');
});

test('extractTemplateFromImport rejects documents without templates', () => {
  const { extractTemplateFromImport } = loadUtils();

  assert.throws(
    () => extractTemplateFromImport({ version: 1, templates: [] }),
    /没有找到模板/
  );
});
