# 自动配表多 ref join 字段设计

## 背景

当前自动配表字段值规则支持 `constant`、`input`、`id`、`ref` 四类。`ref` 只能引用同一次执行中已生成行的单个字段，例如：

```json
{ "type": "ref", "row": "monsterMain", "field": "ID" }
```

这能覆盖“子表引用主表 ID”的场景，但不能表达“把多个已生成 ID 拼成 `id1|id2|id3` 写入一个 Excel 单元格”。如果把数组语义塞进现有 `ref`，会让 `ref` 同时代表单值引用和聚合表达式，后续扩展常量、输入值混合拼接也会变得不清晰。

## 目标

1. 新增一种字段值规则，支持把多个值按分隔符拼接成一个字符串。
2. 拼接项优先支持已有字段值规则，尤其是多个 `ref`。
3. 任一拼接项求值失败时，整行生成失败。
4. 错误信息必须说明失败字段、join 第几项、引用的 row 和 field 等具体原因。
5. 保持现有 `ref` 单值语义不变，已有模板无需迁移。

## 推荐格式

新增字段值类型 `join`：

```json
{
  "type": "join",
  "separator": "|",
  "items": [
    { "type": "ref", "row": "skill1", "field": "ID" },
    { "type": "ref", "row": "skill2", "field": "ID" },
    { "type": "ref", "row": "skill3", "field": "ID" }
  ]
}
```

`separator` 是拼接分隔符，未填写时建议默认使用空字符串。`items` 是按顺序求值的字段值规则数组。第一版应允许 `constant`、`input`、`id`、`ref`，并通过递归求值自然支持后续扩展。

## 被拒绝的替代方案

### 让 `ref.row` 支持数组

示例：

```json
{ "type": "ref", "row": ["skill1", "skill2"], "field": "ID", "separator": "|" }
```

这个方案表面更短，但会改变 `ref` 的心智模型。`ref` 不再只是“引用一个字段”，而是隐含“引用多个字段并聚合”。当未来需要 `input|ref|constant` 混合拼接时，还会继续给 `ref` 增加更多非引用职责。

### 新增 `refs` 类型

示例：

```json
{ "type": "refs", "rows": ["skill1", "skill2"], "field": "ID", "separator": "|" }
```

这个方案比数组 `ref` 清晰，但仍然只覆盖“多个 ref 同字段拼接”。它不能自然表达常量、输入值和不同字段混合拼接，通用性不如 `join`。

## 求值流程

1. `resolveValue()` 遇到 `join` 时校验 `items` 是非空数组。
2. 按数组顺序逐项调用现有字段值求值逻辑。
3. 将每个结果规范化为字符串。
4. 使用 `separator` 拼接结果并返回。
5. 如果任一项失败，抛出带上下文的错误，不继续生成该行。

`join` 本身不跳过空值。某一项成功求值为空字符串时，空字符串参与拼接；某一项引用不存在时必须报错。

## 错误语义

行生成阶段应把字段名传入求值上下文，确保错误可定位。

缺失引用行时，错误示例：

```text
生成行 monsterSkillGroup 失败: 字段 SkillIDs 的 join 第 2 项引用失败: 引用的行尚未生成: skill2
```

引用行存在但字段不存在时，错误示例：

```text
生成行 monsterSkillGroup 失败: 字段 SkillIDs 的 join 第 2 项引用失败: 引用行 skill2 缺少字段 ID
```

`items` 缺失或为空时，错误示例：

```text
生成行 monsterSkillGroup 失败: 字段 SkillIDs 的 join 缺少 items
```

## 引擎改动

- `lib/auto-config-core.js`
  - 为 `resolveValue()` 增加 `join` 分支。
  - `ref` 分支在 row 存在但 field 不存在时显式报错。
  - 字段循环调用 `resolveValue()` 时传入当前 header，便于错误信息带字段名。
- `tests/auto-config-core.test.js`
  - 覆盖多个 ref 成功拼接。
  - 覆盖 join 中缺失 row 报错。
  - 覆盖 join 中缺失 field 报错。
  - 覆盖 join 保持顺序和分隔符。

## Schema 与规则说明

- `skills/excel-rule-json/references/template-schema.md` 增加 `join` 类型说明和示例。
- `skills/excel-rule-json/SKILL.md` 的推断规则增加：当用户要求“多个 ref 拼成 `id1|id2|id3`”时使用 `join`，不要改写成数组 `ref`。
- JSON 生成检查增加：`join.items[]` 中引用的 `input`、`id sequence`、`ref row` 必须存在。

## UI 策略

第一版可以只保证 JSON 编辑、导入、预览、执行链路支持 `join`。可视化编辑器可以先把未知或复杂字段保留在 JSON 中，不强制做完整控件。

如果本次要同步支持可视化编辑器，则需要在字段类型下拉框中新增 `join`，并提供 `separator` 与多项列表编辑。这个 UI 范围较大，建议作为第二步实现，避免影响核心规则落地。

## 非目标

- 不改变现有 `ref` 规则格式。
- 不支持缺失 ref 时跳过该项。
- 不支持从 Excel 既有行反查多个 ID 后 join；本设计只处理同一次执行中生成的行引用。
- 不新增条件表达式或脚本表达式。

## 验收标准

1. 多个已生成行的 ID 可以按 `|` 拼入同一个目标字段。
2. 任一 ref 行未生成时，预览失败并指出 join 第几项失败。
3. ref 行存在但目标字段不存在时，预览失败并指出缺失字段。
4. 现有 `constant`、`input`、`id`、`ref` 测试保持通过。
5. 旧模板无需修改即可继续导入和执行。
