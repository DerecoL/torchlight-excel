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
    const type = ['constant', 'input', 'id', 'ref'].includes(spec.type) ? spec.type : 'constant';
    if (type === 'input') return { type, key: spec.key || '' };
    if (type === 'id') return { type, sequence: spec.sequence || '' };
    if (type === 'ref') return { type, row: spec.row || '', field: spec.field || '' };
    return { type, value: spec.value === undefined ? '' : spec.value };
  }

  function normalizeFields(fields) {
    const output = {};
    Object.entries(fields || {}).forEach(([header, spec]) => {
      if (!header) return;
      output[header] = normalizeFieldSpec(spec);
    });
    return output;
  }

  function normalizeTemplate(template) {
    const next = template && typeof template === 'object' ? template : {};
    const inputs = arrayFrom(next.inputs).map(field => ({
      key: field.key || '',
      label: field.label || field.key || '',
      type: ['text', 'number', 'select', 'boolean'].includes(field.type) ? field.type : 'text',
      options: arrayFrom(field.options),
    }));
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
          const onlyPrimaryKey = fieldKeys.length === 1 && table.primaryKey && fieldKeys[0] === table.primaryKey;
          if ((fieldKeys.length === 0 || onlyPrimaryKey) && table.primaryKey) {
            fields[table.primaryKey] = defaultSequence
              ? { type: 'id', sequence: defaultSequence.key }
              : { type: 'constant', value: '' };
            for (const input of inputs) {
              if (input.key && !fields[input.key]) fields[input.key] = { type: 'input', key: input.key };
            }
          }
          return {
            key: row.key || '',
            condition: normalizeCondition(row.condition),
            fields,
          };
        }),
      })),
    };
  }

  function cloneTemplate(template) {
    return normalizeTemplate(JSON.parse(JSON.stringify(template || {})));
  }

  return {
    normalizeTemplate,
    cloneTemplate,
  };
});
