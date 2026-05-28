(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.quickEditJson = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function requiredString(value, fieldName) {
    const text = String(value === undefined || value === null ? '' : value).trim();
    if (!text) throw new Error(`quick edit JSON missing ${fieldName}`);
    return text;
  }

  function positiveNumber(value, fieldName) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 1) {
      throw new Error(`quick edit JSON has invalid ${fieldName}`);
    }
    return number;
  }

  function normalizeQuickEditJsonRequest(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('quick edit JSON must be an object');
    }
    if (!data.values || typeof data.values !== 'object' || Array.isArray(data.values)) {
      throw new Error('quick edit JSON missing values object');
    }

    return {
      relativePath: requiredString(data.relativePath, 'relativePath'),
      sheetName: requiredString(data.sheetName, 'sheetName'),
      headerRow: positiveNumber(data.headerRow || 1, 'headerRow'),
      primaryKey: requiredString(data.primaryKey, 'primaryKey'),
      primaryValue: data.primaryValue === undefined || data.primaryValue === null ? '' : data.primaryValue,
      values: { ...data.values },
    };
  }

  return {
    normalizeQuickEditJsonRequest,
  };
});
