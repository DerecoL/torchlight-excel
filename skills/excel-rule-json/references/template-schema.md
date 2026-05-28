# Excelmaker 自动配表模板 JSON 结构

## 真实表头验证约束

生成或修改 `tables[].rows[].fields` 之前，必须读取实际 `.xlsx` 文件的真实表头。用户描述只能用于定位候选表和候选字段，不能作为字段存在的证据。

## Excel 位置索引策略

不要要求 Excel 工程位于固定目录，也不要编造路径。生成规则时可以从以下来源建立临时索引：

1. 用户明确给出的 Excel 根目录。
2. 当前工作区下的 `.xlsx` 文件。
3. Excelmaker / P4 配置能解析出的本地工作区目录。
4. 用户历史上下文中明确指定过的项目目录。

Excelmaker 当前常见默认表格根目录是 `design\demo_table`。如果用户没有提供其他目录，且当前配置能解析到工作区根目录，应优先在此目录下检索真实文件，例如：

- `design\demo_table\npc.xlsx`
- `design\demo_table\npc_attr.xlsx`
- `design\demo_table\skill_stone.xlsx`

索引内容至少包含：绝对文件路径、可用相对路径、workbook 文件名、sheet 名、候选表头行和表头列列表。

必须验证：

- `relativePath` 指向真实存在的 `.xlsx` 文件。
- `sheetName` 是该工作簿中真实存在的 sheet。
- `headerRow` 是真实字段名所在行；不确定时读取候选行并向用户确认。
- `primaryKey` 是真实表头。
- `fields` 的每个 key 都是真实表头，且保留表头原始拼写。
- `copyRow` 应指向可复制样式的数据行，而不是字段名行；在 `design\demo_table` 的常见 `data` sheet 中通常为第 3 行。

无法验证时不要输出可导入 JSON。应输出缺失信息，例如：“已检查 `F:\...\design\demo_table\npc_attr.xlsx` 的 `data` sheet，第 2 行表头为 `id, name, hp, ...`，未找到 `attr` 字段。”

## 完整导入文件

```json
{
  "version": 1,
  "exportedAt": "2026-05-27T00:00:00.000Z",
  "templates": [
    {
      "id": "monster-basic",
      "name": "怪物基础配置",
      "inputs": [],
      "idSequences": [],
      "tables": []
    }
  ]
}
```

导入逻辑也接受数组、`{ "template": {...} }` 或 `{ "templates": [...] }`，但完整交付优先使用上面的包装格式。

## Template

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 模板唯一 ID；重复导入会覆盖同 ID 模板 |
| `name` | string | 是 | 模板显示名 |
| `inputs` | array | 是 | 执行模板时让用户填写的字段 |
| `idSequences` | array | 是 | 自动递增 ID 的序列定义 |
| `tables` | array | 是 | 目标 Excel 表和行规则 |

## inputs[]

```json
{ "key": "kind", "label": "类型", "type": "select", "options": ["monster", "npc"] }
```

`type` 只能是 `text`、`number`、`select`、`boolean`。只有 `select` 必须提供 `options`；其他类型可给空数组。

## idSequences[]

```json
{ "key": "npcId", "label": "npc.id" }
```

行规则里的 `{ "type": "id", "sequence": "npcId" }` 会使用这里定义的序列。

## tables[]

```json
{
  "key": "npc",
  "relativePath": "design/demo_table/npc.xlsx",
  "sheetName": "data",
  "headerRow": 2,
  "primaryKey": "id",
  "copyRow": 3,
  "rows": []
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `key` | string | 建议 | 表标识；用于调试和变更记录 |
| `relativePath` | string | 是 | 相对 P4 stream 或工作区根目录的 `.xlsx` 路径，必须来自真实文件 |
| `sheetName` | string | 是 | 工作表名，必须来自真实 workbook |
| `headerRow` | number | 建议 | 表头所在行，默认 1；必须验证 |
| `primaryKey` | string | 是 | 用来插入或更新的 Excel 表头，必须真实存在 |
| `copyRow` | number | 可选 | 插入新行时复制格式的源行；应为数据行，不能是字段名行 |
| `rows` | array | 是 | 行规则列表 |

## rows[]

```json
{
  "key": "npcMain",
  "condition": { "input": "kind", "op": "equals", "value": "monster" },
  "fields": {
    "id": { "type": "id", "sequence": "npcId" },
    "name": { "type": "input", "key": "name" },
    "skill": { "type": "input", "key": "skill_ids_pipe" }
  }
}
```

`condition` 可为 `null`，表示总是生成。支持两种条件：

```json
{ "input": "kind", "op": "equals", "value": "monster" }
```

```json
{ "input": "kind", "op": "in", "values": ["monster", "boss"] }
```

## fields

`fields` 是对象，key 必须是目标 Excel 的真实表头，value 是字段值规则。

| 类型 | 示例 | 说明 |
| --- | --- | --- |
| `constant` | `{ "type": "constant", "value": "Enemy" }` | 固定值 |
| `input` | `{ "type": "input", "key": "name" }` | 使用用户输入 |
| `id` | `{ "type": "id", "sequence": "npcId" }` | 从 ID 序列分配自增 ID |
| `inputOrId` | `{ "type": "inputOrId", "key": "skill1_id", "sequence": "skillstoneId" }` | 用户填了就使用输入值；输入为空时从真实表格该字段最大数字 ID 后继续自增 |
| `ref` | `{ "type": "ref", "row": "npcAttrMain", "field": "id" }` | 引用同一次执行中已生成行的字段 |
| `join` | `{ "type": "join", "separator": "|", "items": [{ "type": "input", "key": "skill1_id" }] }` | 按顺序拼接多个字段值；每个 item 可带 `condition` |

`join` 示例：把已勾选的技能输入拼到 `npc.skill`：

```json
{
  "type": "join",
  "separator": "|",
  "items": [
    { "type": "input", "key": "skill1_id" },
    { "type": "input", "key": "skill2_id", "condition": { "input": "has_skill_2", "op": "equals", "value": true } },
    { "type": "input", "key": "skill3_id", "condition": { "input": "has_skill_3", "op": "equals", "value": true } }
  ]
}
```

当技能行本身会生成 `skillstone.id` 时，`npc.skill` 应拼接这些已生成行的引用，而不是直接拼接输入框。这样 `skillstone.id` 留空时也能把自动生成的 ID 写入 NPC：

```json
{
  "type": "join",
  "separator": "|",
  "items": [
    { "type": "ref", "row": "skillstone1", "field": "id" },
    { "type": "ref", "row": "skillstone2", "field": "id", "condition": { "input": "has_skill_2", "op": "equals", "value": true } }
  ]
}
```

## 最小可用示例

此示例使用当前项目真实默认路径格式。实际输出前仍必须读取对应 `.xlsx` 并验证 sheet、表头行和字段。

```json
{
  "version": 1,
  "exportedAt": "2026-05-27T00:00:00.000Z",
  "templates": [
    {
      "id": "monster-basic",
      "name": "怪物基础配置",
      "inputs": [
        { "key": "name", "label": "名称", "type": "text", "options": [] },
        { "key": "skill_ids_pipe", "label": "技能列表", "type": "text", "options": [] }
      ],
      "idSequences": [
        { "key": "npcId", "label": "npc.id" }
      ],
      "tables": [
        {
          "key": "npc",
          "relativePath": "design/demo_table/npc.xlsx",
          "sheetName": "data",
          "headerRow": 2,
          "primaryKey": "id",
          "copyRow": 3,
          "rows": [
            {
              "key": "npcMain",
              "condition": null,
              "fields": {
                "id": { "type": "id", "sequence": "npcId" },
                "name": { "type": "input", "key": "name" },
                "skill": { "type": "input", "key": "skill_ids_pipe" }
              }
            }
          ]
        }
      ]
    }
  ]
}
```
