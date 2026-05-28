'use strict';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCellValue(value) {
  if (value === undefined || value === null) return '';
  return value;
}

function isBlankValue(value) {
  return value === undefined || value === null || value === '';
}

function valuesEqual(left, right) {
  return String(normalizeCellValue(left)) === String(normalizeCellValue(right));
}

function evaluateCondition(condition, inputs) {
  if (!condition) return true;
  const actual = readInputValue(condition.input, { inputs });

  if (condition.op === 'equals') {
    return valuesEqual(actual, condition.value);
  }

  if (condition.op === 'in') {
    return Array.isArray(condition.values) && condition.values.some(value => valuesEqual(actual, value));
  }

  return false;
}

function readInputValue(key, context) {
  if (!key) return undefined;
  const parts = String(key).split('.').filter(Boolean);
  if (parts.length === 0) return undefined;

  let value;
  const variables = context && context.variables ? context.variables : {};
  if (Object.prototype.hasOwnProperty.call(variables, parts[0])) {
    value = variables[parts[0]];
    parts.shift();
  } else {
    value = context && context.inputs ? context.inputs[parts[0]] : undefined;
    parts.shift();
  }

  for (const part of parts) {
    if (value === undefined || value === null) return undefined;
    value = value[part];
  }
  return value;
}

function normalizeRunItems(runRequest) {
  if (runRequest && Array.isArray(runRequest.items)) {
    return runRequest.items.filter(item => isObject(item));
  }
  if (runRequest && isObject(runRequest.inputs)) return [runRequest.inputs];
  return [];
}

function allocateId(sequenceKey, counters, idStarts) {
  if (!sequenceKey) throw new Error('ID 字段缺少 sequence');
  if (!Object.prototype.hasOwnProperty.call(counters, sequenceKey)) {
    const start = Number(idStarts ? idStarts[sequenceKey] : undefined);
    if (!Number.isFinite(start)) {
      throw new Error(`缺少 ID 起始值: ${sequenceKey}`);
    }
    counters[sequenceKey] = start;
  }
  const next = counters[sequenceKey];
  counters[sequenceKey] += 1;
  return next;
}

function findMaxNumericValue(values) {
  let max = null;
  for (const value of values || []) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) continue;
    if (max === null || numberValue > max) max = numberValue;
  }
  return max;
}

function collectColumnValues(tableData, header) {
  const values = [];
  const columnValues = tableData && tableData.columnValues;
  if (columnValues && Array.isArray(columnValues[header])) {
    values.push(...columnValues[header]);
  }
  const existingRows = Array.isArray(tableData && tableData.existingRows) ? tableData.existingRows : [];
  for (const row of existingRows) {
    if (row.values && Object.prototype.hasOwnProperty.call(row.values, header)) {
      values.push(row.values[header]);
    }
  }
  return values;
}

function resolveValue(spec, context) {
  if (!isObject(spec) || !spec.type) return spec;

  if (spec.type === 'constant') return spec.value;
  if (spec.type === 'input') return readInputValue(spec.key, context);
  if (spec.type === 'inputOrId') {
    const inputValue = readInputValue(spec.key, context);
    if (!isBlankValue(inputValue)) return inputValue;
    return allocateId(spec.sequence, context.idCounters, context.idStarts);
  }
  if (spec.type === 'id') return allocateId(spec.sequence, context.idCounters, context.idStarts);
  if (spec.type === 'ref') {
    const row = context.generatedRows[spec.row];
    if (!row) throw new Error(`引用的行尚未生成: ${spec.row}`);
    if (!Object.prototype.hasOwnProperty.call(row, spec.field)) {
      throw new Error(`引用行 ${spec.row} 缺少字段 ${spec.field}`);
    }
    return row[spec.field];
  }
  if (spec.type === 'refJoin') {
    const rows = context.generatedRows[spec.row];
    if (!rows) return '';
    const rowList = Array.isArray(rows) ? rows : [rows];
    return rowList.map(row => {
      if (!Object.prototype.hasOwnProperty.call(row, spec.field)) {
        throw new Error(`引用行 ${spec.row} 缺少字段 ${spec.field}`);
      }
      return String(normalizeCellValue(row[spec.field]));
    }).join(spec.separator === undefined ? '' : String(spec.separator));
  }
  if (spec.type === 'join') {
    if (!Array.isArray(spec.items) || spec.items.length === 0) {
      throw new Error('join 缺少 items');
    }
    const values = [];
    for (let index = 0; index < spec.items.length; index += 1) {
      const item = spec.items[index];
      if (item && item.condition && !evaluateCondition(item.condition, context.inputs)) continue;
      try {
        const value = resolveValue(item, context);
        values.push(String(normalizeCellValue(value)));
      } catch (error) {
        throw new Error(`join 第 ${index + 1} 项失败: ${error.message}`);
      }
    }
    return values.join(spec.separator === undefined ? '' : String(spec.separator));
  }

  throw new Error(`不支持的字段值类型: ${spec.type}`);
}

function validateTable(table, errors) {
  if (!table.relativePath || !/\.xlsx$/i.test(table.relativePath)) {
    errors.push(`表 ${table.key || table.sheetName || ''} 只支持 .xlsx 文件`);
  }
  if (!table.sheetName) errors.push(`表 ${table.key || table.relativePath || ''} 缺少 sheetName`);
  if (!table.primaryKey) errors.push(`表 ${table.key || table.relativePath || ''} 缺少 primaryKey`);
}

function findExistingRow(tableData, primaryKey, primaryValue) {
  const existingRows = Array.isArray(tableData.existingRows) ? tableData.existingRows : [];
  return existingRows.find(row => valuesEqual(row.values && row.values[primaryKey], primaryValue));
}

function buildChangeSet(beforeValues, afterValues) {
  const changes = {};
  for (const [header, after] of Object.entries(afterValues)) {
    const before = beforeValues ? beforeValues[header] : '';
    if (!valuesEqual(before, after)) {
      changes[header] = { before, after };
    }
  }
  return changes;
}

function collectInputKeysFromCondition(condition, keys) {
  if (condition && condition.input) keys.add(condition.input);
}

function collectInputKeysFromSpec(spec, keys) {
  if (!isObject(spec)) return;
  collectInputKeysFromCondition(spec.condition, keys);
  if (spec.type === 'input' && spec.key) keys.add(String(spec.key).split('.')[0]);
  if (spec.type === 'inputOrId' && spec.key) keys.add(String(spec.key).split('.')[0]);
  if (spec.type === 'join' && Array.isArray(spec.items)) {
    spec.items.forEach(item => collectInputKeysFromSpec(item, keys));
  }
}

function collectIdSequencesForField(spec) {
  if (!isObject(spec)) return [];
  if ((spec.type === 'id' || spec.type === 'inputOrId') && spec.sequence) return [spec.sequence];
  return [];
}

function summarizeHeaders(headers) {
  const list = Array.isArray(headers) ? headers : [];
  if (list.length === 0) return '(空)';
  const preview = list.slice(0, 24).join(', ');
  if (list.length <= 24) return preview;
  return `${preview}, ... 共 ${list.length} 个`;
}

function buildRowIterations(rowDef, inputs) {
  const forEach = rowDef && rowDef.forEach;
  if (!forEach || !forEach.input) return [{ variables: {} }];
  const list = readInputValue(forEach.input, { inputs });
  if (!Array.isArray(list)) return [];
  const alias = forEach.as || 'item';
  return list
    .filter(item => isObject(item))
    .map((item, index) => ({ variables: { [alias]: item }, arrayIndex: index }));
}

function rememberGeneratedRow(generatedRows, rowKey, values, isRepeated) {
  if (!isRepeated) {
    generatedRows[rowKey] = values;
    return;
  }
  if (!Array.isArray(generatedRows[rowKey])) generatedRows[rowKey] = [];
  generatedRows[rowKey].push(values);
}

async function buildAutoConfigPlan(options) {
  const {
    template,
    runRequest,
    tableReader,
    resolveLocalPath,
  } = options || {};

  const errors = [];
  const warnings = [];
  const changes = [];
  let generatedRows = {};
  const generatedRowsByItem = [];
  const idCounters = {};
  const idStarts = { ...(runRequest && runRequest.idStarts ? runRequest.idStarts : {}) };
  const mappedInputKeys = new Set();

  if (!template || !runRequest) {
    return { ok: false, errors: ['缺少模板或执行参数'], warnings, changes, generatedRows, generatedRowsByItem };
  }
  if (template.id && runRequest.templateId && template.id !== runRequest.templateId) {
    errors.push(`执行参数模板 ID 不匹配: ${runRequest.templateId}`);
  }

  const runItems = normalizeRunItems(runRequest);
  for (let itemIndex = 0; itemIndex < runItems.length; itemIndex += 1) {
    generatedRowsByItem[itemIndex] = {};
  }

  const tableDataCache = new Map();
  const tables = Array.isArray(template.tables) ? template.tables : [];
  const tableEntries = [];

  for (const table of tables) {
    validateTable(table, errors);
    if (errors.length > 0) continue;

    let tableData = tableDataCache.get(table.key);
    if (!tableData) {
      try {
        const localPath = resolveLocalPath ? await resolveLocalPath(table.relativePath, table) : table.relativePath;
        tableData = {
          localPath,
          ...(await tableReader(table, localPath)),
        };
        tableDataCache.set(table.key, tableData);
      } catch (error) {
        errors.push(`读取表失败 ${table.relativePath}: ${error.message}`);
        continue;
      }
    }

    const headers = Array.isArray(tableData.headers) ? tableData.headers : [];
    const tableRows = Array.isArray(table.rows) ? table.rows : [];
    if (tableRows.length === 0) {
      warnings.push(`配置表 ${table.key || table.relativePath} 没有配置行规则，不会生成任何变更`);
    }
    tableEntries.push({ table, tableData, headers, tableRows });
  }

  const inferredIdMaxes = new Map();
  for (const { tableData, tableRows } of tableEntries) {
    for (const rowDef of tableRows) {
      for (const [header, spec] of Object.entries(rowDef.fields || {})) {
        for (const sequence of collectIdSequencesForField(spec)) {
          if (Object.prototype.hasOwnProperty.call(idStarts, sequence)) continue;
          const max = findMaxNumericValue(collectColumnValues(tableData, header));
          if (max === null) continue;
          const current = inferredIdMaxes.get(sequence);
          if (current === undefined || max > current) inferredIdMaxes.set(sequence, max);
        }
      }
    }
  }
  for (const [sequence, max] of inferredIdMaxes.entries()) {
    idStarts[sequence] = max + 1;
  }

  for (const { table, tableData, headers, tableRows } of tableEntries) {

    for (const rowDef of tableRows) {
      if (Object.keys(rowDef.fields || {}).length === 0) {
        errors.push(`配置表 ${table.key || table.relativePath} 的行规则 ${rowDef.key || '(未命名)'} 缺少字段映射，请至少添加主键列 ${table.primaryKey}`);
        continue;
      }

      const missingHeaders = Object.keys(rowDef.fields || {}).filter(header => !headers.includes(header));
      if (missingHeaders.length > 0) {
        errors.push(`表 ${table.relativePath} / ${table.sheetName} 第 ${table.headerRow || 1} 行，行规则 ${rowDef.key || '(未命名)'} 缺少字段表头: ${missingHeaders.join(', ')}。可用表头: ${summarizeHeaders(headers)}`);
      }

      for (let itemIndex = 0; itemIndex < runItems.length; itemIndex += 1) {
        const inputs = runItems[itemIndex];
        if (!evaluateCondition(rowDef.condition, inputs)) continue;
        collectInputKeysFromCondition(rowDef.condition, mappedInputKeys);
        if (rowDef.forEach && rowDef.forEach.input) mappedInputKeys.add(rowDef.forEach.input);
        Object.values(rowDef.fields || {}).forEach(spec => collectInputKeysFromSpec(spec, mappedInputKeys));

        const iterations = buildRowIterations(rowDef, inputs);
        for (const iteration of iterations) {
          const context = {
            inputs,
            idStarts,
            idCounters,
            generatedRows: generatedRowsByItem[itemIndex],
            variables: iteration.variables,
          };

          let values;
          try {
            values = {};
            for (const [header, spec] of Object.entries(rowDef.fields || {})) {
              values[header] = resolveValue(spec, context);
            }
          } catch (error) {
            errors.push(`生成行 ${rowDef.key || ''} 失败: ${error.message}`);
            continue;
          }

          const primaryValue = values[table.primaryKey];
          if (primaryValue === undefined || primaryValue === null || primaryValue === '') {
            errors.push(`行 ${rowDef.key || ''} 缺少主键值: ${table.primaryKey}`);
            continue;
          }

          const existing = findExistingRow(tableData, table.primaryKey, primaryValue);
          const rowNumber = existing
            ? existing.rowNumber
            : Number(tableData.nextRowNumber || (headers.length > 0 ? 2 : 1));
          if (!existing) tableData.nextRowNumber = rowNumber + 1;

          rememberGeneratedRow(generatedRowsByItem[itemIndex], rowDef.key, values, Boolean(rowDef.forEach));

          changes.push({
            itemIndex,
            tableKey: table.key,
            rowKey: rowDef.key,
            relativePath: table.relativePath,
            localPath: tableData.localPath,
            sheetName: table.sheetName,
            headerRow: table.headerRow || 1,
            primaryKey: table.primaryKey,
            primaryValue,
            copyRow: table.copyRow,
            action: existing ? 'update' : 'insert',
            rowNumber,
            values,
            changes: buildChangeSet(existing && existing.values, values),
          });
        }
      }
    }
  }

  generatedRows = generatedRowsByItem[0] || {};
  changes.sort((left, right) => {
    const leftItem = Number.isInteger(left.itemIndex) ? left.itemIndex : 0;
    const rightItem = Number.isInteger(right.itemIndex) ? right.itemIndex : 0;
    if (leftItem !== rightItem) return leftItem - rightItem;
    return left.rowNumber - right.rowNumber;
  });

  const providedInputKeys = [...new Set(runItems.flatMap(item => Object.keys(item || {})))].filter(key => {
    return runItems.some(item => {
      const value = item && item[key];
      return value !== undefined && value !== null && value !== '';
    });
  });
  const unmappedInputKeys = providedInputKeys.filter(key => !mappedInputKeys.has(key));
  if (unmappedInputKeys.length > 0 && changes.length > 0) {
    warnings.push(`输入字段未映射到任何 Excel 列: ${unmappedInputKeys.join(', ')}。这些值不会写入表格。`);
  }

  return {
    ok: errors.length === 0,
    templateId: template.id,
    templateName: template.name,
    errors,
    warnings,
    changes,
    generatedRows,
    generatedRowsByItem,
  };
}

function groupChangesByFile(changes) {
  const grouped = new Map();
  for (const change of changes || []) {
    const key = change.localPath || change.relativePath;
    if (!grouped.has(key)) {
      grouped.set(key, {
        localPath: change.localPath,
        relativePath: change.relativePath,
        changes: [],
      });
    }
    grouped.get(key).changes.push(change);
  }
  return [...grouped.values()];
}

async function executeAutoConfigPlan(options) {
  const {
    plan,
    p4,
    workbookWriter,
    backupFile,
  } = options || {};

  if (!plan || !plan.ok) {
    return { ok: false, error: '预览计划存在错误，不能执行' };
  }
  if (!Array.isArray(plan.changes) || plan.changes.length === 0) {
    return { ok: false, error: '没有可写入的变更，请先检查模板行规则、条件和输入值' };
  }

  const backups = [];
  const writtenFiles = [];

  for (const fileGroup of groupChangesByFile(plan.changes)) {
    if (p4 && p4.sync) await p4.sync(fileGroup.relativePath);
    if (p4 && p4.edit) await p4.edit(fileGroup.relativePath);
    if (backupFile) {
      const backupPath = await backupFile(fileGroup.localPath);
      backups.push({ localPath: fileGroup.localPath, backupPath });
    }
    await workbookWriter(fileGroup.localPath, fileGroup.changes);
    writtenFiles.push(fileGroup.localPath);
  }

  return { ok: true, backups, writtenFiles, changeCount: (plan.changes || []).length };
}

module.exports = {
  buildAutoConfigPlan,
  executeAutoConfigPlan,
  evaluateCondition,
  resolveValue,
};
