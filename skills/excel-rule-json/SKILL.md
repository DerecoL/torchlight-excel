---
name: excel-rule-json
description: Use when the user describes Excel auto-config rules, row rules, table mappings, ID sequences, importable rule JSON, or asks to map fields against real .xlsx tables in the Excelmaker automatic table configuration system.
---

# Excel 规则 JSON

## 概览

把用户的自然语言规则描述转换为 Excelmaker 可导入的自动配表模板 JSON。生成字段映射前必须读取真实 `.xlsx` 表和表头；不能根据字段名、表名或经验猜测目标表是否存在某个字段。

## 硬性约束

- 不要求用户把 Excel 工程放在固定目录；skill 可以从用户给出的目录、当前工作区、已知 P4 工作区或现有配置中建立 Excel 位置索引。
- 必须有明确搜索边界。没有目录、工作区或配置线索时，先问用户要 Excel 根目录；不要全盘扫描。
- 必须先定位真实 `.xlsx` 文件，再生成 `tables[].relativePath`、`sheetName`、`primaryKey` 和 `fields`。
- 用户说“NPC 表 attr 字段”这类需求时，必须到目录下的 NPC 表或含 NPC sheet 的工作簿中读取表头，确认是否真的存在 `attr` 或对应大小写/原始拼写字段。
- `fields` 的 key 必须使用 Excel 表头里的真实字段名，保留原始大小写和拼写。
- 找不到文件、sheet、表头行、主键或目标字段时，停止生成可导入 JSON，明确列出已检查的位置和缺失项，然后向用户要目录、表名、sheet 名或字段确认。
- 可以推断输入项、条件、ID 序列名和机器 key；不可以推断目标 Excel 表头是否存在。
- 近似字段只能作为候选提示，例如用户说 `attr`，真实表头有 `Attr`、`Attributes` 或 `attr_id`，必须说明候选并让用户确认，不能擅自替换。

## 工作流

1. 判断用户要的是完整导入文件还是片段；没有明确说“片段”时，默认生成完整导入文件。
2. 读取 `references/template-schema.md`，按 Excelmaker 当前字段结构生成 JSON。
3. 确认表目录来源：
   - 用户给出目录时，用该目录递归建立 `.xlsx` 索引。
   - 用户只给表名时，在当前工作区、用户指定项目目录、已知 P4 工作区或应用配置可解析出的工作区下查找同名 `.xlsx` 和含同名 sheet 的工作簿。
   - 每次任务可以临时建立索引；不要求存在持久索引文件。
   - 无法确定搜索根目录时先提问，不要继续猜，也不要扫描整个磁盘。
4. 读取真实 Excel 表结构：
   - 优先复用 Excelmaker 仓库的 `lib/excel-workbook-adapter.js` / `readXlsxTable`。
   - 或使用项目里的 `xlsx-populate`/合适的 Excel 解析库读取 workbook、sheet、`headerRow`。
   - 记录实际检查过的文件路径、sheet 名、表头行和表头列表。
5. 从自然语言里抽取模板信息：
   - 模板名称和模板 ID。
   - 输入字段：字段 key、显示名、类型、下拉选项。
   - ID 序列：序列 key、显示名。
   - 目标表：真实相对路径、真实 sheet 名、真实主键、复制行。
   - 行规则：条件和字段映射。
6. 输出前检查 JSON：
   - 必须是合法 JSON，无注释、无尾逗号、无 Markdown 引号混入。
   - 完整导入文件使用 `{ "version": 1, "exportedAt": "...", "templates": [...] }`。
   - `tables[].relativePath` 必须以 `.xlsx` 结尾，且对应真实文件。
   - 每个 `sheetName` 必须对应真实 sheet。
   - 每个 `primaryKey` 和 `fields` key 必须出现在真实表头里。
   - 每个表必须至少有一个 `rows[]`；每个行规则必须有 `key` 和非空 `fields`。
   - 每个被引用的 `input`、`id sequence`、`ref row` 必须存在。
7. 如果创建本地 `.json` 文件，交付时给出可点击链接和原始绝对路径；不要只给路径。

## 推断规则

- 中文显示名保留中文；机器字段 `key` 使用简短英文、小写驼峰或短横线，保持同一文件内一致。
- 用户说“下拉/类型/分类”时用 `select`；“数量/等级/价格/ID 起始值”优先用 `number`；“是否/开关”用 `boolean`；其他用 `text`。
- 用户说“生成新 ID / 自增 ID”时用 `{ "type": "id", "sequence": "..." }`。
- 用户说“填用户输入的值”时用 `{ "type": "input", "key": "..." }`。
- 用户说“固定写入”时用 `{ "type": "constant", "value": ... }`。
- 用户说“引用前面生成的主表 ID / 关联 ID”时用 `{ "type": "ref", "row": "...", "field": "..." }`。
- 条件“等于/是/当 X 为 Y”用 `equals`；“属于/任意一个/包含这些类型”用 `in`。

## 交付格式

用户要“直接导入”时，优先保存为 `.json` 文件并用下面格式交付：

```markdown
[file-name](/C:/absolute/path/file-name.json)
瀛樺偍璺緞锛欳:\absolute\path\file-name.json
```

如果只在聊天中给 JSON，使用 `json` 代码块；如果用户明确要裸 JSON，则只输出 JSON 内容。

## 常见错误

| 错误 | 修正 |
| --- | --- |
| 没查真实 Excel 就生成字段 | 先读取 `.xlsx` 表头，字段不存在就停止 |
| 把 `fields` 写成数组 | `fields` 必须是以 Excel 表头为 key 的对象 |
| 漏写主键字段映射 | 每个行规则的 `fields` 里必须生成 `primaryKey` 对应值 |
| 引用不存在的行规则 | 先定义被引用的行规则，并保证条件会先生成它 |
| 把完整文件写成单个 template 对象 | 导入文件优先用 `{ version, exportedAt, templates }` 包装 |
| 使用中文 key 做机器字段 | 中文放 `label`；`key` 用稳定英文标识 |
