# P4 Excel 快捷启动器

策划常用 Excel 表格管理工具，支持 P4 Streams 分支切换，自动同步文件到最新版本后打开。

## 快速开始

```bash
# 安装依赖
npm install

# 启动应用
npm start
```

## 团队 Skill 同步

仓库内维护了 `excel-rule-json` Codex skill，位置在 `skills/excel-rule-json`。团队成员拉取最新工程后，在 PowerShell 中运行：

```powershell
.\scripts\install-excel-rule-json-skill.ps1
```

脚本会把仓库里的 skill 同步到本机 Codex skills 目录。默认目标目录为 `$env:CODEX_HOME\skills`，未设置 `CODEX_HOME` 时使用 `$HOME\.codex\skills`。如果本机已经有同名 skill，脚本会先创建时间戳备份再覆盖。同步后重启 Codex 才能加载最新 skill。

## 前置要求

- Node.js 18+
- P4 命令行工具（`p4`）已安装并添加到 PATH
- 已配置 P4 工作区（workspace）

## 使用说明

1. **首次启动**：点击右上角 ⚙ 按钮配置 P4 连接信息（Server、用户名、工作区、Depot 路径）。如果环境变量已配置可留空。
2. **选择 Stream**：在顶部下拉框选择目标 Stream，应用会自动切换工作区的 Stream 关联。
3. **创建分组**：点击左侧面板的 + 按钮创建文件分组（如"怪物配置"、"关卡配置"）。
4. **添加文件**：选中分组后点击「+ 添加文件」，输入相对于 Stream 根目录的文件路径，或浏览本地文件选择。
5. **同步并打开**：点击文件卡片上的「同步并打开」，工具会先执行 `p4 sync` 更新到最新版本，然后用默认程序打开。

## 配置文件

应用配置保存在 Electron 用户数据目录：
- Windows: `%APPDATA%/p4-excel-launcher/config.json`

配置结构示例：

```json
{
  "p4": {
    "port": "ssl:p4server:1666",
    "user": "your_username",
    "client": "your_workspace",
    "depot": "//YourDepot"
  },
  "currentStream": "//YourDepot/main",
  "groups": [
    {
      "name": "怪物配置",
      "files": [
        { "relativePath": "Design/Tables/Monster.xlsx", "alias": "怪物属性表" }
      ]
    }
  ]
}
```
