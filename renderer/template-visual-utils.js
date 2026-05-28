(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.templateVisualUtils = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function arrayFrom(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  function numberOrDefault(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function normalizeCondition(condition) {
    if (!condition || !condition.input) return null;
    const op = condition.op === 'in' ? 'in' : 'equals';
    if (op === 'in') {
      return {
        input: String(condition.input),
        op,
        values: arrayFrom(condition.values),
      };
    }
    return {
      input: String(condition.input),
      op,
      value: condition.value === undefined ? '' : condition.value,
    };
  }

  function normalizeFieldSpec(spec) {
    if (!spec || typeof spec !== 'object') return { type: 'constant', value: spec };
    const type = ['constant', 'input', 'inputOrId', 'id', 'ref', 'refJoin', 'join'].includes(spec.type) ? spec.type : 'constant';
    if (type === 'input') return { type, key: spec.key || '' };
    if (type === 'inputOrId') return { type, key: spec.key || '', sequence: spec.sequence || '' };
    if (type === 'id') return { type, sequence: spec.sequence || '' };
    if (type === 'ref') return { type, row: spec.row || '', field: spec.field || '' };
    if (type === 'refJoin') {
      return {
        type,
        row: spec.row || '',
        field: spec.field || '',
        separator: spec.separator === undefined ? '' : String(spec.separator),
      };
    }
    if (type === 'join') {
      return {
        type,
        separator: spec.separator === undefined ? '' : String(spec.separator),
        items: arrayFrom(spec.items).map(item => {
          const normalized = normalizeFieldSpec(item);
          if (item && typeof item === 'object' && item.condition) {
            normalized.condition = normalizeCondition(item.condition);
          }
          return normalized;
        }),
      };
    }
    return { type, value: spec.value === undefined ? '' : spec.value };
  }

  function conditionToVisual(condition) {
    const normalized = normalizeCondition(condition);
    if (!normalized) {
      return {
        conditionInput: '',
        conditionOp: 'equals',
        conditionValue: '',
      };
    }
    return {
      conditionInput: normalized.input,
      conditionOp: normalized.op,
      conditionValue: normalized.op === 'in' ? normalized.values.join(',') : normalized.value,
    };
  }

  function valueFromVisual(value) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value === undefined ? '' : value;
  }

  function conditionFromVisual(visual) {
    const input = String(visual.conditionInput || '').trim();
    if (!input) return null;
    const op = visual.conditionOp === 'in' ? 'in' : 'equals';
    if (op === 'in') {
      return { input, op, values: arrayFrom(visual.conditionValue) };
    }
    return { input, op, value: valueFromVisual(visual.conditionValue) };
  }

  function fieldSpecToVisualSpec(spec) {
    const normalized = normalizeFieldSpec(spec);
    if (normalized.type === 'input') return { type: 'input', arg: normalized.key, arg2: '', constant: '' };
    if (normalized.type === 'inputOrId') return { type: 'inputOrId', arg: normalized.key, arg2: normalized.sequence, constant: JSON.stringify(normalized) };
    if (normalized.type === 'id') return { type: 'id', arg: normalized.sequence, arg2: '', constant: '' };
    if (normalized.type === 'ref') return { type: 'ref', arg: normalized.row, arg2: normalized.field, constant: '' };
    if (normalized.type === 'refJoin') return { type: 'refJoin', arg: normalized.row, arg2: normalized.field, constant: '', separator: normalized.separator };
    if (normalized.type === 'join') {
      return {
        type: 'join',
        arg: '',
        arg2: '',
        constant: '',
        separator: normalized.separator,
        items: normalized.items.map(item => ({
          ...fieldSpecToVisualSpec(item),
          ...conditionToVisual(item.condition),
        })),
      };
    }
    return { type: 'constant', arg: '', arg2: '', constant: normalized.value };
  }

  function visualSpecToFieldSpec(visual) {
    const type = ['constant', 'input', 'inputOrId', 'id', 'ref', 'refJoin', 'join'].includes(visual.type) ? visual.type : 'constant';
    if (type === 'input') return { type, key: String(visual.arg || '').trim() };
    if (type === 'inputOrId') return { type, key: String(visual.arg || '').trim(), sequence: String(visual.arg2 || '').trim() };
    if (type === 'id') return { type, sequence: String(visual.arg || '').trim() };
    if (type === 'ref') return { type, row: String(visual.arg || '').trim(), field: String(visual.arg2 || '').trim() };
    if (type === 'refJoin') {
      return {
        type,
        row: String(visual.arg || '').trim(),
        field: String(visual.arg2 || '').trim(),
        separator: visual.separator === undefined ? '' : String(visual.separator),
      };
    }
    if (type === 'join') {
      return {
        type,
        separator: visual.separator === undefined ? '' : String(visual.separator),
        items: arrayFrom(visual.items).map(item => {
          const spec = visualSpecToFieldSpec(item);
          const condition = conditionFromVisual(item);
          if (condition) spec.condition = condition;
          return spec;
        }),
      };
    }
    return { type: 'constant', value: visual.constant === undefined ? '' : visual.constant };
  }

  function groupRunInputFields(fields) {
    const inputFields = arrayFrom(fields);
    const skillFields = new Map();
    const used = new Set();

    inputFields.forEach(field => {
      if (!field || !field.key) return;
      const skillMatch = String(field.key).match(/^skill(\d+)_id$/i);
      if (skillMatch) {
        const index = Number(skillMatch[1]);
        if (!skillFields.has(index)) skillFields.set(index, { index, enabledField: null, valueField: null });
        skillFields.get(index).valueField = field;
        return;
      }
      const enabledMatch = String(field.key).match(/^has_skill_(\d+)$/i);
      if (enabledMatch) {
        const index = Number(enabledMatch[1]);
        if (!skillFields.has(index)) skillFields.set(index, { index, enabledField: null, valueField: null });
        skillFields.get(index).enabledField = field;
      }
    });

    const skillItems = [...skillFields.values()]
      .filter(item => item.valueField)
      .sort((left, right) => left.index - right.index);

    if (skillItems.length < 2) {
      return inputFields.map(field => (
        field && field.type === 'array'
          ? { type: 'arrayGroup', field }
          : { type: 'field', field }
      ));
    }

    skillItems.forEach(item => {
      used.add(item.valueField.key);
      if (item.enabledField) used.add(item.enabledField.key);
    });

    const output = [];
    let insertedSkillGroup = false;
    inputFields.forEach(field => {
      if (!field || !field.key) return;
      if (used.has(field.key)) {
        if (!insertedSkillGroup) {
          output.push({ type: 'skillGroup', title: '技能配置', items: skillItems });
          insertedSkillGroup = true;
        }
        return;
      }
      if (field.type === 'array') {
        output.push({ type: 'arrayGroup', field });
        return;
      }
      output.push({ type: 'field', field });
    });
    return output;
  }

  function normalizeInputField(field) {
    const type = ['text', 'number', 'select', 'boolean', 'array'].includes(field.type) ? field.type : 'text';
    const output = {
      key: field.key || '',
      label: field.label || field.key || '',
      type,
      options: arrayFrom(field.options),
    };
    const visibleWhen = normalizeCondition(field.visibleWhen);
    if (visibleWhen) output.visibleWhen = visibleWhen;
    if (type === 'array') {
      output.itemLabel = field.itemLabel || field.label || field.key || '项目';
      output.minItems = Number.isFinite(Number(field.minItems)) ? Math.max(0, Number(field.minItems)) : 0;
      output.fields = arrayFrom(field.fields).map(normalizeInputField).filter(child => child.type !== 'array');
    }
    return output;
  }

  function normalizeFields(fields) {
    const output = {};
    Object.entries(fields || {}).forEach(([header, spec]) => {
      if (!header) return;
      output[header] = normalizeFieldSpec(spec);
    });
    return output;
  }

  function normalizeForEach(forEach) {
    if (!forEach || !forEach.input) return null;
    return {
      input: String(forEach.input),
      as: forEach.as ? String(forEach.as) : 'item',
    };
  }

  function normalizeTemplate(template) {
    const next = template && typeof template === 'object' ? template : {};
    const inputs = arrayFrom(next.inputs).map(normalizeInputField);
    const idSequences = arrayFrom(next.idSequences).map(sequence => ({
      key: sequence.key || '',
      label: sequence.label || sequence.key || '',
    }));
    const defaultSequence = idSequences.find(sequence => sequence.key);
    return {
      id: next.id || '',
      name: next.name || '',
      inputs,
      idSequences,
      tables: arrayFrom(next.tables).map(table => ({
        key: table.key || '',
        relativePath: table.relativePath || '',
        sheetName: table.sheetName || '',
        headerRow: numberOrDefault(table.headerRow, 1),
        primaryKey: table.primaryKey || '',
        copyRow: table.copyRow === undefined || table.copyRow === '' ? undefined : numberOrDefault(table.copyRow, 2),
        rows: arrayFrom(table.rows).map(row => {
          const fields = normalizeFields(row.fields);
          const fieldKeys = Object.keys(fields);
          if (fieldKeys.length === 0 && table.primaryKey) {
            fields[table.primaryKey] = defaultSequence
              ? { type: 'id', sequence: defaultSequence.key }
              : { type: 'constant', value: '' };
          }
          return {
            key: row.key || '',
            condition: normalizeCondition(row.condition),
            forEach: normalizeForEach(row.forEach),
            fields,
          };
        }),
      })),
    };
  }

  function templateListFromImport(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.templates)) return data.templates;
    if (data.template && typeof data.template === 'object') return [data.template];
    if (
      Object.prototype.hasOwnProperty.call(data, 'id') ||
      Object.prototype.hasOwnProperty.call(data, 'name') ||
      Object.prototype.hasOwnProperty.call(data, 'inputs') ||
      Object.prototype.hasOwnProperty.call(data, 'idSequences') ||
      Object.prototype.hasOwnProperty.call(data, 'tables')
    ) {
      return [data];
    }
    return [];
  }

  function extractTemplateFromImport(data, preferredTemplateId = '') {
    const templates = templateListFromImport(data).filter(template => template && typeof template === 'object');
    if (templates.length === 0) {
      throw new Error('完整模板 JSON 中没有找到模板');
    }

    const preferredId = String(preferredTemplateId || '').trim();
    const selected = preferredId
      ? templates.find(template => template.id === preferredId)
      : templates[0];
    if (!selected) {
      throw new Error(`完整模板 JSON 中没有找到模板 ID: ${preferredId}`);
    }

    return normalizeTemplate(selected);
  }

  function cloneTemplate(template) {
    return normalizeTemplate(JSON.parse(JSON.stringify(template || {})));
  }

  return {
    normalizeTemplate,
    extractTemplateFromImport,
    cloneTemplate,
    fieldSpecToVisualSpec,
    visualSpecToFieldSpec,
    groupRunInputFields,
  };
});
