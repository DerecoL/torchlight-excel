# Batch Auto Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自动配表运行页支持界面多行数据、JSON `items` 双向转换、自动 ID 顺延，以及批量多表关联。

**Architecture:** 保持模板结构不变，在 core 层把旧 `inputs` 规范化为 `items` 后逐 item 执行。ID 起始值优先使用用户输入，缺省时从已读取表数据的相关 ID 列推断最大数字 ID。Renderer 增加批量数据行表格，并用同一个运行参数结构在界面和 JSON 间转换。

**Tech Stack:** Electron renderer JavaScript, Node.js CommonJS, `xlsx-populate`, `node:test`。

---

## 文件结构

- 修改 `lib/auto-config-core.js`：新增运行参数规范化、自动 ID 推断、item 作用域 generatedRows、change.itemIndex。
- 修改 `lib/excel-workbook-adapter.js`：读取表时保留每列已有值，供 core 层扫描最大 ID。
- 修改 `tests/auto-config-core.test.js`：覆盖旧 inputs、多 items、自动 ID、批量 ref 隔离。
- 修改 `tests/excel-workbook-adapter.test.js`：覆盖读取表时返回列值。
- 修改 `renderer/index.html`：运行页新增数据行工具栏、数据行容器、界面转 JSON 按钮。
- 修改 `renderer/app.js`：实现数据行渲染、收集、JSON 载入、界面转 JSON、预览分组。
- 修改 `renderer/styles.css`：补充批量数据行表格样式。

当前目录不是 git 仓库，所有提交步骤跳过。

## Task 1: Core 支持批量 items 和 item 作用域引用

**Files:**
- Modify: `E:\AI-GPT\Excelmaker\lib\auto-config-core.js`
- Test: `E:\AI-GPT\Excelmaker\tests\auto-config-core.test.js`

- [ ] **Step 1: 写失败测试**

在 `tests/auto-config-core.test.js` 增加测试：

```js
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
  assert.equal(plan.changes.length, 4);
  assert.deepEqual(plan.changes.map(change => change.itemIndex), [0, 0, 1, 1]);
  assert.deepEqual(plan.changes.map(change => change.primaryValue), [1000, 1000, 1001, 1001]);
  assert.deepEqual(plan.generatedRowsByItem[0].monsterMain.ID, 1000);
  assert.deepEqual(plan.generatedRowsByItem[1].monsterMain.ID, 1001);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test tests/auto-config-core.test.js`

Expected: FAIL，原因是 `items`、`itemIndex` 或 `generatedRowsByItem` 尚未实现。

- [ ] **Step 3: 实现最小 core 变更**

在 `lib/auto-config-core.js` 中：

```js
function normalizeRunItems(runRequest) {
  if (Array.isArray(runRequest.items)) return runRequest.items;
  if (isObject(runRequest.inputs)) return [runRequest.inputs];
  return [];
}
```

把 `context.inputs` 改为每个 item 内部赋值。每个 item 执行所有 tables 和 rows，使用局部 `generatedRows`，并将结果保存到 `generatedRowsByItem[itemIndex]`。每条 change 增加 `itemIndex`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/auto-config-core.test.js`

Expected: PASS。

- [ ] **Step 5: 跳过提交**

当前目录不是 git 仓库，跳过 `git commit`。

## Task 2: Core 支持自动 ID 起始值推断

**Files:**
- Modify: `E:\AI-GPT\Excelmaker\lib\auto-config-core.js`
- Test: `E:\AI-GPT\Excelmaker\tests\auto-config-core.test.js`

- [ ] **Step 1: 写失败测试**

在 `tests/auto-config-core.test.js` 增加：

```js
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
  assert.deepEqual(plan.changes.map(change => change.primaryValue), [1009, 1009, 1010, 1010]);
});
```

再增加无法推断时报错：

```js
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
  assert.match(plan.errors.join('\n'), /缺少 ID 起始值|无法自动推断/);
});
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test tests/auto-config-core.test.js`

Expected: FAIL，原因是缺少自动 ID 推断。

- [ ] **Step 3: 实现 ID 推断**

在 core 层读取表数据后，扫描模板所有 `{ type: 'id' }` 字段，建立 `sequence -> [{ tableKey, header }]`。初始化 sequence 时：

```js
function findMaxNumericValue(values) {
  let max = null;
  for (const value of values || []) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) continue;
    if (max === null || numberValue > max) max = numberValue;
  }
  return max;
}
```

如果 `idStarts` 未提供，就从相关 `tableData.columnValues[header]` 计算最大值并使用 `max + 1`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/auto-config-core.test.js`

Expected: PASS。

- [ ] **Step 5: 跳过提交**

当前目录不是 git 仓库，跳过 `git commit`。

## Task 3: Excel 读取返回列值

**Files:**
- Modify: `E:\AI-GPT\Excelmaker\lib\excel-workbook-adapter.js`
- Test: `E:\AI-GPT\Excelmaker\tests\excel-workbook-adapter.test.js`

- [ ] **Step 1: 写失败测试**

在 `tests/excel-workbook-adapter.test.js` 中检查 `readXlsxTable` 返回：

```js
assert.deepEqual(table.columnValues.ID, [1001]);
assert.deepEqual(table.columnValues.Name, ['Slime']);
```

- [ ] **Step 2: 运行失败测试**

Run: `node --test tests/excel-workbook-adapter.test.js`

Expected: FAIL，原因是 `columnValues` 未返回。

- [ ] **Step 3: 实现列值收集**

在 `readXlsxTable` 中创建 `columnValues = {}`，遍历已有数据行时按 header 收集非空单元格值：

```js
if (!columnValues[header]) columnValues[header] = [];
if (cellValue !== undefined && cellValue !== null && cellValue !== '') {
  columnValues[header].push(cellValue);
}
```

返回对象包含 `columnValues`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/excel-workbook-adapter.test.js`

Expected: PASS。

- [ ] **Step 5: 跳过提交**

当前目录不是 git 仓库，跳过 `git commit`。

## Task 4: Renderer 增加批量数据行 UI 和 JSON 双向转换

**Files:**
- Modify: `E:\AI-GPT\Excelmaker\renderer\index.html`
- Modify: `E:\AI-GPT\Excelmaker\renderer\app.js`
- Modify: `E:\AI-GPT\Excelmaker\renderer\styles.css`

- [ ] **Step 1: 修改 HTML**

在运行面板 inputs 区域附近增加：

```html
<div class="auto-section">
  <div class="section-title-row">
    <h3>数据行</h3>
    <button class="btn small" id="btnAddRunItem">+ 新增行</button>
  </div>
  <div class="run-items-table" id="runItemsTable"></div>
</div>
```

在 JSON 操作区增加：

```html
<button class="btn small" id="btnDumpRunJson">界面转 JSON</button>
```

- [ ] **Step 2: 修改 app.js DOM 引用和状态**

增加：

```js
const $runItemsTable = document.getElementById('runItemsTable');
const $btnAddRunItem = document.getElementById('btnAddRunItem');
const $btnDumpRunJson = document.getElementById('btnDumpRunJson');
let runItems = [{}];
```

- [ ] **Step 3: 实现数据行渲染与收集**

新增函数：

```js
function renderRunItems(prefillItems) {
  const template = autoTemplates.find(t => t.id === $runTemplateSelect.value) || selectedAutoTemplate();
  const inputs = template && Array.isArray(template.inputs) ? template.inputs : [];
  runItems = Array.isArray(prefillItems) && prefillItems.length > 0 ? prefillItems : [{}];
  $runItemsTable.innerHTML = '';
  // 生成 header、每行字段控件和删除按钮。
}

function collectRunItemsFromDom() {
  return [...$runItemsTable.querySelectorAll('.run-item-row')].map(row => {
    const item = {};
    row.querySelectorAll('[data-run-item-key]').forEach(input => {
      const key = input.dataset.runItemKey;
      if (input.type === 'checkbox') item[key] = input.checked;
      else if (input.type === 'number') item[key] = input.value === '' ? '' : Number(input.value);
      else item[key] = input.value;
    });
    return item;
  });
}
```

- [ ] **Step 4: 更新 collectRunRequest 和 JSON 载入**

`collectRunRequest()` 改为返回：

```js
return { templateId, items: collectRunItemsFromDom(), idStarts };
```

`btnLoadRunJson` 解析后：

```js
const items = Array.isArray(data.items) ? data.items : (data.inputs ? [data.inputs] : [{}]);
renderRunFields({ idStarts: data.idStarts || {} });
renderRunItems(items);
```

新增“界面转 JSON”：

```js
$btnDumpRunJson.addEventListener('click', () => {
  $runJsonText.value = formatJson(collectRunRequest());
  $runJsonStatus.value = '已从界面生成 JSON';
});
```

- [ ] **Step 5: 修改样式**

增加 `.run-items-table`、`.run-item-row`、`.run-item-header`、`.run-item-remove` 的紧凑表格样式，保持现有暗色面板风格。

- [ ] **Step 6: 手工启动验证**

Run: `npm start`

Expected: 应用启动，自动配表运行页可新增/删除数据行，JSON 可载入多行并可从界面生成 JSON。

- [ ] **Step 7: 跳过提交**

当前目录不是 git 仓库，跳过 `git commit`。

## Task 5: 预览输出按 item 分组

**Files:**
- Modify: `E:\AI-GPT\Excelmaker\renderer\app.js`

- [ ] **Step 1: 修改 summarizePlan**

将 `plan.changes` 按 `itemIndex` 分组，输出：

```js
lines.push(`第 ${itemIndex + 1} 行:`);
```

没有 `itemIndex` 的旧 change 按第 1 行显示。

- [ ] **Step 2: 手工预览验证**

Run: `npm start`

Expected: 多行预览显示“第 1 行”“第 2 行”，每组下面展示对应 Excel 变更。

- [ ] **Step 3: 跳过提交**

当前目录不是 git 仓库，跳过 `git commit`。

## Task 6: 全量验证

**Files:**
- Verify all modified files.

- [ ] **Step 1: 运行全部自动化测试**

Run: `npm test`

Expected: 所有 `node:test` 测试 PASS。

- [ ] **Step 2: 检查语法**

Run: `node --check lib/auto-config-core.js`

Expected: no output, exit code 0。

Run: `node --check lib/excel-workbook-adapter.js`

Expected: no output, exit code 0。

- [ ] **Step 3: 启动应用**

Run: `npm start`

Expected: Electron 应用可启动，无 renderer 初始化报错。

- [ ] **Step 4: 记录未完成项**

如果 Electron 无法在当前环境完整交互，记录自动化测试结果和无法手工验证的原因。

---

## 自检

- 规格覆盖：多行界面、JSON `items`、旧 `inputs` 兼容、自动 ID、多表 ref 隔离、预览分组、测试计划均有任务覆盖。
- 占位扫描：无 `TODO`、`TBD`、`待定`。
- 类型一致性：运行参数统一为 `{ templateId, items, idStarts }`，旧 `{ inputs }` 只在 core 和 JSON 载入时兼容转换。
