const test = require('node:test');
const assert = require('node:assert/strict');
const modulePath = require.resolve('../renderer/file-drag-sort.js');

function loadFileDragSort() {
  delete require.cache[modulePath];
  return require(modulePath);
}

test('moveArrayItem moves a middle file to the front without mutating input', () => {
  const {
    moveArrayItem,
  } = loadFileDragSort();

  const input = [
    { relativePath: 'design/demo_table/npc.xlsx' },
    { relativePath: 'design/demo_table/skill_stone.xlsx' },
    { relativePath: 'design/demo_table/skill_damage.xlsx' },
  ];

  const output = moveArrayItem(input, 1, 0);

  assert.deepEqual(output.map(item => item.relativePath), [
    'design/demo_table/skill_stone.xlsx',
    'design/demo_table/npc.xlsx',
    'design/demo_table/skill_damage.xlsx',
  ]);
  assert.deepEqual(input.map(item => item.relativePath), [
    'design/demo_table/npc.xlsx',
    'design/demo_table/skill_stone.xlsx',
    'design/demo_table/skill_damage.xlsx',
  ]);
});

test('moveArrayItem returns the original items when indices are invalid', () => {
  const {
    moveArrayItem,
  } = loadFileDragSort();

  const input = [
    { relativePath: 'a.xlsx' },
    { relativePath: 'b.xlsx' },
  ];

  const invalidFrom = moveArrayItem(input, -1, 1);
  const invalidTo = moveArrayItem(input, 0, 3);
  const sameIndex = moveArrayItem(input, 1, 1);

  assert.deepEqual(invalidFrom, input);
  assert.deepEqual(invalidTo, input);
  assert.deepEqual(sameIndex, input);
  assert.notStrictEqual(invalidFrom, input);
  assert.notStrictEqual(invalidTo, input);
  assert.notStrictEqual(sameIndex, input);
});

test('getDropPlacement returns before for the upper half of a card', () => {
  const {
    getDropPlacement,
  } = loadFileDragSort();

  assert.equal(getDropPlacement(110, 100, 40), 'before');
});

test('getDropPlacement returns after for the lower half of a card', () => {
  const {
    getDropPlacement,
  } = loadFileDragSort();

  assert.equal(getDropPlacement(135, 100, 40), 'after');
});

test('CommonJS import does not set globalThis.fileDragSort', () => {
  delete globalThis.fileDragSort;

  loadFileDragSort();

  assert.equal(globalThis.fileDragSort, undefined);
});

test('getDropPlacement returns after at the midpoint boundary', () => {
  const {
    getDropPlacement,
  } = loadFileDragSort();

  assert.equal(getDropPlacement(120, 100, 40), 'after');
});

test('moveArrayItem supports moving the first file to the end index', () => {
  const {
    moveArrayItem,
  } = loadFileDragSort();

  const input = [
    { relativePath: 'npc.xlsx' },
    { relativePath: 'skill_stone.xlsx' },
    { relativePath: 'skill_damage.xlsx' },
  ];

  const output = moveArrayItem(input, 0, 2);

  assert.deepEqual(output.map(item => item.relativePath), [
    'skill_stone.xlsx',
    'skill_damage.xlsx',
    'npc.xlsx',
  ]);
});

test('reorderFilesForDrop moves the first file after the last target card', () => {
  const {
    reorderFilesForDrop,
  } = loadFileDragSort();

  const input = [
    { relativePath: 'npc.xlsx' },
    { relativePath: 'skill_stone.xlsx' },
    { relativePath: 'skill_damage.xlsx' },
  ];

  const output = reorderFilesForDrop(input, 0, 2, 'after');

  assert.deepEqual(output.map(item => item.relativePath), [
    'skill_stone.xlsx',
    'skill_damage.xlsx',
    'npc.xlsx',
  ]);
});
