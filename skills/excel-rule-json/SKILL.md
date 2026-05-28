---
name: excel-rule-json
description: Use when the user describes Excel auto-config rules, row rules, table mappings, ID sequences, importable rule JSON, or asks to map fields against real .xlsx tables in the Excelmaker automatic table configuration system.
---

# Excel 规则 JSON

## 概览

把用户的自然语言规则转换为 Excelmaker 可导入的自动配表模板 JSON。核心原则：先索引和读取真实 `.xlsx`，再生成或修改模板；不能根据表名、字段名、经验或历史示例编造 `relativePath`、`sheetName`、`headerRow`、`primaryKey` 或 `fields`。

## 硬性约束

- 必须先定位真实 `.xlsx` 文件，再生成或修改 `tables[].relativePath`、`sheetName`、`headerRow`、`primaryKey`、`copyRow` 和 `fields`。
- 用户给出“修正模板”“按检索结果更改”“找 NPC 表”等需求时，必须以本次实际检索到的文件为准更新模板，不得沿用旧模板里的路径。
- 没有明确搜索边界时，先从当前工作区和 Excelmaker/P4 配置解析工作区；仍无法确定时再问用户 Excel 根目录。不要扫描整盘。
- `relativePath` 必须来自真实文件相对 P4 stream 或工作区根目录的路径。当前 Excelmaker 项目的默认表格根目录是 `design\demo_table`，不是 `Design\Tables`。
- 本项目常用默认路径必须优先按真实文件检索：
  - `design\demo_table\npc.xlsx`
  - `design\demo_table\npc_attr.xlsx`
  - `design\demo_table\skill_stone.xlsx`
- 对 `npcattr`、`npc attr`、`npc_attr` 这类用户说法，必须把它们当成检索词，优先搜索真实文件名、sheet 名和表头；不能直接写成 `Design/Tables/npcattr.xlsx`。
- `fields` 的 key 必须使用 Excel 表头里的真实字段名，保留原始大小写和拼写。
- 找不到文件、sheet、表头行、主键或目标字段时，停止生成可导入 JSON，列出已检查的位置和缺失项，让用户确认。
- 近似字段只能作为候选提示。例如用户说 `attr`，真实表头只有 `npc_attr_id` 时，必须说明候选并让用户确认，不能擅自替换。

## 真实表格索引流程

1. 确认搜索边界：
   - 用户明确给出目录时，用该目录递归建立 `.xlsx` 临时索引。
   - 用户只给表名或字段时，优先检查当前仓库、Excelmaker 配置和 P4 工作区配置。
   - Excelmaker 当前配置通常在 `%APPDATA%\p4-excel-launcher\config.json`，可从其中读取 `p4.client`、`currentStream` 和已收藏表路径作为线索。
   - 对 P4 工作区，可用 `p4 -ztag where "<depotPath 或 localPath>"` 验证 depot 路径和本地路径。
2. 建立临时索引，每条记录至少包含：
   - 绝对本地路径
   - 可用相对路径
   - 文件名和规范化文件名
   - workbook 的 sheet 名
   - 候选表头行和表头字段列表
3. 检索候选：
   - 文件名精确匹配优先，例如 `npc_attr.xlsx` 优先于 `npc_attribute.xlsx`。
   - 下划线、大小写、连字符和空格可做规范化匹配，例如 `skillstone` 可匹配 `skill_stone.xlsx`，但输出必须使用真实路径 `design\demo_table\skill_stone.xlsx`。
   - 用户给出多个词时，按真实索引结果筛选，不得为了凑需求生成不存在的路径。
4. 读取真实 Excel 结构：
   - 优先复用 Excelmaker 仓库的 `lib/excel-workbook-adapter.js` / `readXlsxTable`。
   - 或使用项目里的 `xlsx-populate` 读取 workbook、sheet、候选 `headerRow` 和表头。
   - 对 `design\demo_table` 常见表，通常 `sheetName` 是 `data`，字段名在第 2 行，`copyRow` 用第 3 行；但仍必须以实际读取结果为准。
5. 输出或修改模板前，记录实际检查过的文件路径、sheet、表头行和表头字段。

## 工作流程

1. 判断用户要完整导入文件还是 JSON 片段；未明确说“片段”时，默认生成完整导入文件。
2. 读取 `references/template-schema.md`，按 Excelmaker 当前字段结构生成 JSON。
3. 用“真实表格索引流程”定位每张目标表。
4. 从自然语言里抽取模板信息：
   - 模板名称和模板 ID
   - 输入字段：`key`、显示名、类型、下拉选项
   - ID 序列：序列 `key`、显示名
   - 目标表：真实 `relativePath`、真实 `sheetName`、真实 `headerRow`、真实 `primaryKey`、真实 `copyRow`
   - 行规则：条件和字段映射
5. 根据检索结果修改模板：
   - 旧模板路径不存在时，用本次索引命中的真实相对路径替换。
   - 旧 sheet 或表头行不匹配时，用真实 workbook 里的 sheet 和表头行替换。
   - 旧字段不存在时，不要强行保留；列出缺失字段和候选字段，等待用户确认映射。
6. 输出前检查 JSON：
   - 必须是合法 JSON，无注释、无尾逗号、无 Markdown 引号混入。
   - 完整导入文件使用 `{ "version": 1, "exportedAt": "...", "templates": [...] }`。
   - 每个 `tables[].relativePath` 必须以 `.xlsx` 结尾且对应真实文件。
   - 每个 `sheetName`、`headerRow`、`primaryKey` 和 `fields` key 必须来自真实工作簿。
   - 每个表至少有一个 `rows[]`；每个行规则必须有 `key` 和非空 `fields`。
   - 每个被引用的 `input`、`id sequence`、`ref row` 必须存在。
7. 如果创建本地 `.json` 文件，交付时给出点击链接和原始绝对路径；不要只给路径。

## 推断规则

- 中文显示名保留中文；机器字段 `key` 使用稳定英文、下划线或短横线，同一文件内保持一致。
- 用户说“下拉/类型/分类”时用 `select`；“数量/等级/价格/ID 起始值”优先用 `number`；“是否/开关”用 `boolean`；其他用 `text`。
- 用户说“生成新 ID / 自增 ID”时用 `{ "type": "id", "sequence": "..." }`。
- 用户说“填用户输入的值”时用 `{ "type": "input", "key": "..." }`。
- 用户说“某个 ID 可填可不填 / 空着就自动生成”时用 `{ "type": "inputOrId", "key": "...", "sequence": "..." }`；有输入值时使用输入值，输入为空时从真实表格对应列的最大数字 ID 继续自增。
- 用户说“固定写入”时用 `{ "type": "constant", "value": ... }`。
- 用户说“引用前面生成的主表 ID / 关联 ID”时用 `{ "type": "ref", "row": "...", "field": "..." }`。
- 用户说“把多个技能/多个 ID 写进同一个单元格，用 `|` 分隔”时用 `{ "type": "join", "separator": "|", "items": [...] }`，不要要求用户手填已经能从界面推导出的列表。
- `join.items[]` 可以使用 `constant`、`input`、`inputOrId`、`id`、`ref`，也可以带 `condition`；例如技能 2 只有 `has_skill_2` 为 true 时才加入拼接。若技能 ID 由 `skillstone` 行生成，`npc.skill` 应优先 `join` 这些 `skillstone` 行的 `ref`，不要直接拼接可能为空的输入框。
- 条件“等于/是/当 X 为 Y”用 `equals`；“属于/任意一个/包含这些类型”用 `in`。

## 交付格式

用户要“直接导入”时，优先保存为 `.json` 文件并用下面格式交付：

```markdown
[file-name](/C:/absolute/path/file-name.json)
存储路径：C:\absolute\path\file-name.json
```

如果只在聊天中给 JSON，使用 `json` 代码块；如果用户明确要裸 JSON，则只输出 JSON 内容。

## 常见错误

| 错误 | 修正 |
| --- | --- |
| 没查真实 Excel 就生成字段 | 先读取 `.xlsx` 表头，字段不存在就停止 |
| 把 `Design/Tables/npcattr.xlsx` 当默认路径 | 在真实索引里找 `design\demo_table\npc_attr.xlsx` 等实际文件 |
| 检索到 `skill_stone.xlsx` 却输出 `skillstone.xlsx` | 输出必须使用真实文件名和真实相对路径 |
| 让用户手动填写 `skill1|skill2|skill3` | 如果已有分开的技能输入和开关，用 `join` 自动拼接 |
| `skillstone.id` 为空时报缺少主键 | 用 `inputOrId`：空值从 `skill_stone.xlsx` 的真实 `id` 最大值继续生成，再用 `ref` 写入 `npc.skill` |
| 把 `fields` 写成数组 | `fields` 必须是以 Excel 表头为 key 的对象 |
| 漏写主键字段映射 | 每个行规则的 `fields` 里必须生成 `primaryKey` 对应值 |
| 引用不存在的行规则 | 先定义被引用的行规则，并保证条件会先生成它 |
| 把完整文件写成单个 template 对象 | 导入文件优先用 `{ version, exportedAt, templates }` 包装 |
| 使用中文 key 做机器字段 | 中文放 `label`，`key` 用稳定英文标识 |
