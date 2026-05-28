'use strict';

function normalizeCellValue(value) {
  if (value === undefined || value === null) return '';
  return value;
}

function valuesEqual(left, right) {
  return String(normalizeCellValue(left)) === String(normalizeCellValue(right));
}

function safeHeaders(tableData) {
  return Array.isArray(tableData && tableData.headers) ? tableData.headers : [];
}

function safeExistingRows(tableData) {
  return Array.isArray(tableData && tableData.existingRows) ? tableData.existingRows : [];
}

function findExistingRow(tableData, primaryKey, primaryValue) {
  return safeExistingRows(tableData).find(row => valuesEqual(row.values && row.values[primaryKey], primaryValue));
}

function normalizeQuickEditRequest(request) {
  const next = { ...(request || {}) };
  next.relativePath = String(next.relativePath || '').trim();
  next.sheetName = String(next.sheetName || '').trim();
  next.headerRow = Number(next.headerRow || 1);
  next.primaryKey = String(next.primaryKey || '').trim();
  next.primaryValue = normalizeCellValue(next.primaryValue);
  next.values = next.values && typeof next.values === 'object' && !Array.isArray(next.values)
    ? next.values
    : {};
  return next;
}

function validateQuickEditRequest(request, errors) {
  if (!request.relativePath || !/\.xlsx$/i.test(request.relativePath)) {
    errors.push('请选择 .xlsx 文件');
  }
  if (!request.sheetName) errors.push('缺少 sheetName');
  if (!Number.isFinite(request.headerRow) || request.headerRow < 1) {
    errors.push('表头行必须是大于 0 的数字');
  }
  if (!request.primaryKey) errors.push('缺少主键列名');
  if (request.primaryValue === '') errors.push('缺少主键值');
}

function validateHeaders(headers, request, errors) {
  if (!headers.includes(request.primaryKey)) {
    errors.push(`表头里找不到主键列: ${request.primaryKey}`);
  }

  const missingHeaders = Object.keys(request.values).filter(header => {
    return header !== request.primaryKey && !headers.includes(header);
  });
  if (missingHeaders.length > 0) {
    errors.push(`表头里找不到字段: ${missingHeaders.join(', ')}`);
  }
}

async function readQuickEditRow(options) {
  const {
    request: rawRequest,
    tableReader,
    resolveLocalPath,
  } = options || {};
  const request = normalizeQuickEditRequest(rawRequest);
  const errors = [];
  validateQuickEditRequest(request, errors);
  if (errors.length > 0) return { ok: false, errors, headers: [], row: null };

  const table = {
    relativePath: request.relativePath,
    sheetName: request.sheetName,
    headerRow: request.headerRow,
    primaryKey: request.primaryKey,
  };

  let localPath = request.relativePath;
  let tableData;
  try {
    localPath = resolveLocalPath ? await resolveLocalPath(request.relativePath, table) : request.relativePath;
    tableData = await tableReader(table, localPath);
  } catch (error) {
    return { ok: false, errors: [`读取表格失败: ${error.message}`], headers: [], row: null };
  }

  const headers = safeHeaders(tableData);
  validateHeaders(headers, request, errors);
  if (errors.length > 0) return { ok: false, errors, headers, row: null, localPath };

  const existing = findExistingRow(tableData, request.primaryKey, request.primaryValue);
  if (!existing) {
    return {
      ok: false,
      errors: [`找不到 ${request.primaryKey}=${request.primaryValue} 的已有行，快速修改不会新增行`],
      headers,
      row: null,
      localPath,
    };
  }

  return {
    ok: true,
    errors: [],
    headers,
    row: {
      rowNumber: existing.rowNumber,
      values: { ...(existing.values || {}) },
    },
    localPath,
  };
}

async function buildQuickEditPlan(options) {
  const rawRequest = options && options.request;
  const request = normalizeQuickEditRequest(rawRequest);
  const rowResult = await readQuickEditRow({ ...(options || {}), request });
  const warnings = [];
  if (!rowResult.ok) {
    return { ok: false, errors: rowResult.errors, warnings, changes: [], row: null };
  }

  const changedValues = {};
  const fieldChanges = {};
  for (const [header, after] of Object.entries(request.values || {})) {
    if (header === request.primaryKey) continue;
    const before = rowResult.row.values[header];
    if (valuesEqual(before, after)) continue;
    changedValues[header] = after;
    fieldChanges[header] = { before, after };
  }

  const changes = Object.keys(changedValues).length === 0
    ? []
    : [{
      itemIndex: 0,
      tableKey: request.relativePath,
      rowKey: 'quickEdit',
      relativePath: request.relativePath,
      localPath: rowResult.localPath,
      sheetName: request.sheetName,
      headerRow: request.headerRow,
      primaryKey: request.primaryKey,
      primaryValue: request.primaryValue,
      action: 'update',
      rowNumber: rowResult.row.rowNumber,
      values: changedValues,
      changes: fieldChanges,
    }];

  return {
    ok: true,
    errors: [],
    warnings,
    changes,
    row: rowResult.row,
    headers: rowResult.headers,
  };
}

module.exports = {
  buildQuickEditPlan,
  readQuickEditRow,
};
