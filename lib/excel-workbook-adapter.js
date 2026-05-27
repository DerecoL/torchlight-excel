'use strict';

const fs = require('fs');
const path = require('path');
const XlsxPopulate = require('xlsx-populate');

function getSheet(workbook, sheetName) {
  const sheet = workbook.sheet(sheetName);
  if (!sheet) throw new Error(`找不到 Sheet: ${sheetName}`);
  return sheet;
}

function readUsedBounds(sheet) {
  const usedRange = sheet.usedRange();
  if (!usedRange) return { maxRow: 0, maxColumn: 0 };
  return {
    maxRow: usedRange.endCell().rowNumber(),
    maxColumn: usedRange.endCell().columnNumber(),
  };
}

function readHeaders(sheet, headerRow, maxColumn) {
  const headers = [];
  for (let column = 1; column <= maxColumn; column += 1) {
    const header = sheet.cell(headerRow, column).value();
    if (header === undefined || header === null || String(header).trim() === '') continue;
    headers.push(String(header).trim());
  }
  return headers;
}

function buildHeaderIndex(sheet, headerRow, maxColumn) {
  const index = new Map();
  for (let column = 1; column <= maxColumn; column += 1) {
    const header = sheet.cell(headerRow, column).value();
    if (header === undefined || header === null || String(header).trim() === '') continue;
    index.set(String(header).trim(), column);
  }
  return index;
}

async function readXlsxTable(localPath, table) {
  const workbook = await XlsxPopulate.fromFileAsync(localPath);
  const sheet = getSheet(workbook, table.sheetName);
  const headerRow = Number(table.headerRow || 1);
  const bounds = readUsedBounds(sheet);
  const maxColumn = Math.max(bounds.maxColumn, 1);
  const headers = readHeaders(sheet, headerRow, maxColumn);
  const headerIndex = buildHeaderIndex(sheet, headerRow, maxColumn);
  const primaryColumn = headerIndex.get(table.primaryKey);
  const existingRows = [];
  const columnValues = Object.fromEntries(headers.map(header => [header, []]));

  if (!primaryColumn) {
    return {
      headers,
      existingRows,
      columnValues,
      nextRowNumber: Math.max(bounds.maxRow + 1, headerRow + 1),
    };
  }

  for (let row = headerRow + 1; row <= bounds.maxRow; row += 1) {
    const primaryValue = sheet.cell(row, primaryColumn).value();
    if (primaryValue === undefined || primaryValue === null || primaryValue === '') continue;

    const values = {};
    for (const [header, column] of headerIndex.entries()) {
      const cellValue = sheet.cell(row, column).value();
      values[header] = cellValue;
      if (cellValue !== undefined && cellValue !== null && cellValue !== '') {
        columnValues[header].push(cellValue);
      }
    }
    existingRows.push({ rowNumber: row, values });
  }

  return {
    headers,
    existingRows,
    columnValues,
    nextRowNumber: Math.max(bounds.maxRow + 1, headerRow + 1),
  };
}

function copyCellBestEffort(sourceCell, targetCell) {
  try {
    const formula = sourceCell.formula();
    if (formula) {
      targetCell.formula(formula);
    } else {
      targetCell.value(sourceCell.value());
    }
  } catch (_) {
    try {
      targetCell.value(sourceCell.value());
    } catch (__) {
      // Value copy is best effort for unusual cell payloads.
    }
  }

  try {
    const style = sourceCell.style();
    if (style) targetCell.style(style);
  } catch (_) {
    // xlsx-populate preserves untouched workbook XML; style copy is best effort.
  }

  try {
    const dataValidation = sourceCell.dataValidation && sourceCell.dataValidation();
    if (dataValidation && targetCell.dataValidation) targetCell.dataValidation(dataValidation);
  } catch (_) {
    // Data validation support varies by workbook feature.
  }
}

function copyRowBestEffort(sheet, sourceRow, targetRow, maxColumn) {
  if (!sourceRow || sourceRow === targetRow) return;
  for (let column = 1; column <= maxColumn; column += 1) {
    copyCellBestEffort(sheet.cell(sourceRow, column), sheet.cell(targetRow, column));
  }
}

async function writeXlsxChanges(localPath, changes) {
  const workbook = await XlsxPopulate.fromFileAsync(localPath);
  const changesBySheet = new Map();

  for (const change of changes || []) {
    if (!changesBySheet.has(change.sheetName)) changesBySheet.set(change.sheetName, []);
    changesBySheet.get(change.sheetName).push(change);
  }

  for (const [sheetName, sheetChanges] of changesBySheet.entries()) {
    const sheet = getSheet(workbook, sheetName);
    const headerRow = Number(sheetChanges[0].headerRow || 1);
    const bounds = readUsedBounds(sheet);
    const maxColumn = Math.max(bounds.maxColumn, 1);
    const headerIndex = buildHeaderIndex(sheet, headerRow, maxColumn);

    for (const change of sheetChanges) {
      const rowNumber = Number(change.rowNumber);
      if (change.action === 'insert') {
        const sourceRow = Number(change.copyRow || rowNumber - 1);
        copyRowBestEffort(sheet, sourceRow, rowNumber, maxColumn);
      }

      for (const [header, value] of Object.entries(change.values || {})) {
        const column = headerIndex.get(header);
        if (!column) throw new Error(`表 ${sheetName} 缺少表头: ${header}`);
        sheet.cell(rowNumber, column).value(value);
      }
    }
  }

  await workbook.toFileAsync(localPath);
}

async function createWorkbookBackup(localPath) {
  const parsed = path.parse(localPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(parsed.dir, `${parsed.name}.backup-${timestamp}${parsed.ext}`);
  await fs.promises.copyFile(localPath, backupPath);
  return backupPath;
}

module.exports = {
  readXlsxTable,
  writeXlsxChanges,
  createWorkbookBackup,
};
