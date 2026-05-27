# 自动配表批量数据与自动 ID 设计

## 背景

当前自动配表一次运行只收集一组 `inputs`，因此一次只能配置一行业务数据。ID 生成已经支持模板字段 `{ "type": "id", "sequence": "..." }`，但运行时必须手动填写 `idStarts`。多表关联已经支持 `{ "type": "ref", "row": "...", "field": "..." }`，但现有生成上下文是单行作用域，不适合批量多行。

本设计目标是在保留现有单行流程兼容性的前提下，增加“界面多行填写”和“JSON 批量参数”双向转换，并让 ID 默认可按目标表最大 ID 自动顺延。

## 用户目标

用户在自动配表运行页可以：

1. 通过界面点 `+` 新增多行业务数据，一次预览和写入多条配置。
2. 不填写新增 ID 时，工具自动从目标 Excel 表已有最大数字 ID 往下顺延。
3. 同时配置多张表时，子表新增行可以引用同一业务行里主表刚生成的 ID。
4. 通过“载入 JSON”把批量参数转成界面多行。
5. 通过“界面转 JSON”把当前界面内容转成可手工编辑、保存或复用的 JSON。

## 运行参数格式

继续兼容旧格式：

```json
{
  "templateId": "monster-basic",
  "inputs": {
    "name": "Slime",
    "level": 3
  },
  "idStarts": {
    "monsterId": 1000
  }
}
```

新增批量格式：

```json
{
  "templateId": "monster-basic",
  "items": [
    { "name": "Slime", "level": 3 },
    { "name": "Goblin", "level": 5 }
  ],
  "idStarts": {}
}
```

规范化规则：

- 如果传入 `items` 且为数组，按 `items` 批量执行。
- 如果没有 `items`，但有旧格式 `inputs`，内部转换为单元素 `items`。
- 如果 `items` 为空数组，预览返回无变更提示，不写入文件。
- “界面转 JSON”统一输出新格式 `items`，减少两套 UI 状态。

## 界面设计

运行页保留模板选择、ID 起始值区域、JSON 区域和预览区域。

新增“数据行”区域：

- 每个模板 input 对应一列。
- 点 `+` 新增一行。
- 每行提供删除按钮。
- 字段控件沿用单行输入规则：`text` 用文本框，`number` 用数字框，`boolean` 用勾选框，`select` 用下拉框。
- 切换模板时，数据行根据新模板重建；默认生成一行空数据。

JSON 双向转换：

- “载入 JSON”解析 JSON 后：
  - 有 `items` 时渲染为多行。
  - 只有 `inputs` 时渲染为一行。
  - `idStarts` 回填到 ID 起始值区域。
- 新增“界面转 JSON”按钮：
  - 从多行界面收集 `items`。
  - 从 ID 起始值区域收集非空 `idStarts`。
  - 写入 JSON 文本框，供用户继续手填。

## 自动 ID 规则

ID 生成仍由模板字段声明：

```json
{
  "ID": { "type": "id", "sequence": "monsterId" }
}
```

分配顺序：

1. 如果运行参数 `idStarts[sequence]` 有数字值，从该值开始。
2. 如果未填写，则扫描本次模板中使用该 sequence 的目标表字段。
3. 从相关 Excel 表已有数据中取最大数字 ID。
4. 从 `最大 ID + 1` 开始分配。
5. 同一次预览内，每次使用同一 sequence 都递增 1。

数字解析规则：

- 只统计可转成有限数字的单元格值。
- 空值、文本、公式错误值不参与最大 ID 计算。
- 如果相关列没有任何数字 ID，且用户也没有填写起始值，则报错，提示该 sequence 无法自动推断起始 ID。

## 多表关联规则

模板仍使用现有 `ref` 字段类型：

```json
{
  "MonsterID": { "type": "ref", "row": "monsterMain", "field": "ID" }
}
```

批量执行时，每个 item 有独立的生成上下文：

- 第 1 个 item 生成的 `monsterMain.ID` 只供第 1 个 item 的子表行引用。
- 第 2 个 item 生成的 `monsterMain.ID` 只供第 2 个 item 的子表行引用。
- 不同 item 之间不共享 `generatedRows`，避免子表引用串行。

返回结果中保留全局 `changes` 列表，同时每条 change 增加 `itemIndex`，用于预览分组展示。

## 核心数据流

1. Renderer 收集运行参数：
   - 从多行界面生成 `items`。
   - 从 ID 起始值区域生成 `idStarts`。
2. Main 进程根据 `templateId` 找到模板。
3. Core 层规范化运行参数：
   - `inputs` 转成单元素 `items`。
   - 初始化 ID 计数器。
4. Core 层先读取所有相关表数据：
   - 表头。
   - 已有行。
   - 下一可插入行号。
   - 相关 ID 列最大数字值。
5. Core 层按 item 顺序执行模板表和行规则：
   - 解析条件。
   - 生成字段值。
   - 写入当前 item 的 generatedRows。
   - 判断新增或更新。
   - 追加 change。
6. 预览展示全部 change。
7. 执行写入时仍按文件分组 checkout、备份和写入。

## 错误与提示

需要明确提示以下情况：

- JSON 既没有 `items` 也没有 `inputs`。
- 某个 item 的必填主键最终为空。
- 某个 ID sequence 未填写起始值，且无法从表格中推断最大 ID。
- `ref` 引用的行在当前 item 内没有生成。
- 批量数据中某行条件不命中，导致没有生成任何变更。
- 输入字段没有映射到任何 Excel 列时，沿用现有 warning。

## 兼容性

- 旧模板不需要迁移。
- 旧执行 JSON 继续可用。
- 现有 `{ "type": "id" }` 和 `{ "type": "ref" }` 语义保持不变。
- `executeAutoConfigPlan` 的文件分组、P4 sync/edit、备份、写入流程保持不变。

## 测试计划

核心测试：

1. 旧 `inputs` 单行格式仍生成与原来一致的 plan。
2. 新 `items` 多行格式能生成多条主表新增记录。
3. 未填写 `idStarts` 时，从已有 Excel 行中读取最大 ID 并从 `max + 1` 分配。
4. 同一个 sequence 在多行中连续递增。
5. 多表 `ref` 在批量场景中按 item 隔离，不串到其他 item。
6. 无法推断自动 ID 起始值时返回明确错误。
7. JSON 载入界面支持旧 `inputs` 和新 `items`。
8. 界面转 JSON 输出稳定的 `items` 格式。

界面验证：

1. 新增、删除数据行不会破坏字段类型。
2. 切换模板后字段列正确刷新。
3. 预览输出按 item 分组，能看清每一行业务数据对应的变更。

## 非目标

本次不实现从 Excel 文件直接批量导入 `items`。

本次不改变模板定义结构，不新增模板字段类型。

本次不处理跨运行批次的 ID 锁定或并发冲突；预览和执行之间如果别人改表，仍以执行时重新生成的 plan 为准。
