const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XlsxPopulate = require('xlsx-populate');

const {
  readXlsxTable,
  writeXlsxChanges,
  createWorkbookBackup,
} = require('../lib/excel-workbook-adapter.js');

async function createSampleWorkbook(filePath) {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const sheet = workbook.sheet(0).name('Monster');
  sheet.cell('A1').value('ID');
  sheet.cell('B1').value('Name');
  sheet.cell('C1').value('Level');
  sheet.cell('D1').value('Power');
  sheet.cell('E1').value('DefaultTag');
  sheet.cell('A2').value(1000);
  sheet.cell('B2').value('Old Slime');
  sheet.cell('C2').value(2);
  sheet.cell('D2').formula('C2*10');
  sheet.cell('E2').value('CopiedDefault');
  await workbook.toFileAsync(filePath);
}

test('readXlsxTable reads headers, existing keyed rows, and next row number', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-config-'));
  const filePath = path.join(dir, 'Monster.xlsx');
  await createSampleWorkbook(filePath);

  const table = await readXlsxTable(filePath, {
    sheetName: 'Monster',
    headerRow: 1,
    primaryKey: 'ID',
  });

  assert.deepEqual(table.headers, ['ID', 'Name', 'Level', 'Power', 'DefaultTag']);
  assert.equal(table.existingRows.length, 1);
  assert.equal(table.existingRows[0].rowNumber, 2);
  assert.deepEqual(table.existingRows[0].values, {
    ID: 1000,
    Name: 'Old Slime',
    Level: 2,
    Power: undefined,
    DefaultTag: 'CopiedDefault',
  });
  assert.deepEqual(table.columnValues.ID, [1000]);
  assert.deepEqual(table.columnValues.Name, ['Old Slime']);
  assert.deepEqual(table.columnValues.Level, [2]);
  assert.deepEqual(table.columnValues.Power, []);
  assert.equal(table.nextRowNumber, 3);
});

test('writeXlsxChanges updates existing rows and inserts new rows by header name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-config-'));
  const filePath = path.join(dir, 'Monster.xlsx');
  await createSampleWorkbook(filePath);

  const backupPath = await createWorkbookBackup(filePath);
  await writeXlsxChanges(filePath, [
    {
      sheetName: 'Monster',
      headerRow: 1,
      rowNumber: 2,
      action: 'update',
      values: { ID: 1000, Name: 'Slime', Level: 5 },
    },
    {
      sheetName: 'Monster',
      headerRow: 1,
      rowNumber: 3,
      action: 'insert',
      copyRow: 2,
      values: { ID: 1001, Name: 'Big Slime', Level: 6 },
    },
  ]);

  const workbook = await XlsxPopulate.fromFileAsync(filePath);
  const sheet = workbook.sheet('Monster');

  assert.equal(fs.existsSync(backupPath), true);
  assert.equal(sheet.cell('B2').value(), 'Slime');
  assert.equal(sheet.cell('C2').value(), 5);
  assert.equal(sheet.cell('A3').value(), 1001);
  assert.equal(sheet.cell('B3').value(), 'Big Slime');
  assert.equal(sheet.cell('C3').value(), 6);
  assert.equal(sheet.cell('D3').formula(), 'C2*10');
  assert.equal(sheet.cell('E3').value(), 'CopiedDefault');
});
