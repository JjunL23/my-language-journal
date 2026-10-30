# My Language Journal

个人三语词汇记录 PWA · English / Bahasa Melayu / 中文 · MVP V1.0

正式应用：[My Language Journal](https://jjunl23.github.io/my-language-journal/) · 源码：[GitHub](https://github.com/JjunL23/my-language-journal)

手动记录 Word 与 Chunk，离线查找和编辑。React + Vite + TypeScript，记录保存在当前浏览器或已安装 PWA 的 IndexedDB 中。应用不需要登录、翻译 API 或云端数据库。

## 本机运行

使用 Node.js 24 LTS。

```powershell
npm install
npm run dev
```

打开终端输出的本机网址。开发模式用于调整界面；Service Worker 只在正式构建中启用。

```powershell
npm test -- --run
npm run build
npm run preview
```

使用 `preview` 输出的 `http://localhost:4173` 地址测试正式构建和离线功能。首次打开时保持联网，等离线准备完成，再在浏览器开发工具中切换 Offline 并重新加载。`localhost` 的安全上下文例外仅适用于同一台设备；iPhone 访问电脑的普通 HTTP 局域网 IP 不能替代正式 HTTPS PWA 测试。

浏览器流程测试与无障碍检查：

```powershell
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright 会自动启动正式预览（或复用已在 4173 运行的预览），在隔离浏览器资料区测试，不会写入你的日常记录。已有兼容的 Chromium 时，可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定其可执行文件。

界面设计见 [Figma — MVP v1.0](https://www.figma.com/design/uqD5oAxResXVtRzB2dpbRD)，设计说明见 [docs/DESIGN.md](docs/DESIGN.md)。

## 日常使用

- **Library**：全部记录、三语搜索、All / Word / Chunk 筛选。
- **New entry**：至少填写一种语言；其余语言与 Notes 可以以后补充。相同类型与三语内容会显示重复提示，但仍允许保存。
- **Entry details**：查看、编辑、收藏与确认删除。
- **Favorites**：取消收藏仅更改星星状态，保留原记录。
- **Settings**：导出 JSON 备份、预览并确认导入、查看离线和储存状态。

GitHub 用户名变更后，正式网址已更新为 `jjunl23.github.io`。旧地址安装的 App 可能仍使用离线缓存；如有记录，先在旧 App 导出 JSON，再到新网址导入，不能假定两个网址共享资料。

新安装不会自动写入示例词汇。资料只属于当前设备、浏览器资料区与网址；更换域名或浏览器不会自动迁移。

## 备份与恢复

定期在 Settings 导出 JSON，并把文件保存在「文件」App 或其他自己管理的安全位置。导出后请实际检查文件已经保存。清除网站资料、系统储存回收或移除安装等操作可能导致本机资料丢失；持久化储存请求也不能代替备份。

备份采用带 Schema Version 的格式，`version` 表示备份数据结构版本，与界面版本和 IndexedDB 版本分别管理：

```json
{
  "app": "my-language-journal",
  "version": 1,
  "exportedAt": "2026-10-26T10:00:00.000Z",
  "entries": []
}
```

导入会先检查格式、版本、字段与重复 ID，再显示变更数量。默认 **Merge** 按 ID 合并：新 ID 新增；相同 ID 且内容不同的记录使用备份中的内容；完全相同的记录不重复新增；备份中未出现的现有记录保留。没有自动按日期比较胜负，旧备份也可能覆盖相同 ID 的较新内容，请在确认前核对数量并先导出当前资料。

**Replace** 将整本日记替换为备份中的内容，包括删除备份中不存在的记录。选择 Replace 并核对预览后，还需在第二个确认窗口明确确认。取消任一阶段都不会修改记录；如果另一窗口在预览后改变了日记，必须重新核对预览。

无效文件不会写入；Merge 与 Replace 均使用同一个 IndexedDB 事务，写入失败时整体回滚。Replace 会在清除旧记录之前完成验证与容量检查。

V1.0 的容量上限为 **50,000 条记录，或 10 MiB（10,485,760 字节）的格式化 JSON 备份，以先达到者为准**。每个语言字段最多 5,000 个字符，Notes 最多 20,000 个字符。保存和导入会在写入前检查合并后整本日记的容量，超限时拒绝本次操作并保留已有资料，确保已保存的记录仍可完整导出及恢复。设备实际可用空间更少时，也可能提前触发储存不足错误。

## 发布到 GitHub Pages

当前项目已发布到上方正式网址。`.github/workflows/deploy.yml` 会先运行单元测试和浏览器测试，再构建 GitHub Pages 子路径版本并部署。部署到其他仓库时：

1. 新建用于托管此应用的 GitHub 仓库。若使用个人免费方案，请核对 GitHub Pages 的仓库可见性要求。
2. 把项目源码、`package.json` 与 `package-lock.json` 提交到 `main` 分支；不要提交私人备份、个人词汇、`.env`、`node_modules` 或 `dist`。
3. 在仓库 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。
4. 推送 `main` 或手动运行 **Deploy to GitHub Pages**。工作流安装锁定依赖、测试、构建并发布 `dist`。
5. 打开 Actions 给出的 HTTPS 地址，联网完成首次加载。

工作流使用 Pages 返回的 `base_path` 设置 `BASE_PATH`，兼容 `https://用户名.github.io/仓库名/` 和根站点。手动构建到子路径时可指定：

```powershell
$env:BASE_PATH = '/my-language-journal/'
npm run build
Remove-Item Env:BASE_PATH
```

不要把用于本机预览的构建直接混用到不同路径。更换公开域名之前先导出备份，再在新地址导入。GitHub Pages 本身提供 HTTPS 静态托管；应用不调用付费 API。[Vite 官方部署指南](https://vite.dev/guide/static-deploy)

## 安装到 iPhone

在 iPhone 的 Safari 打开已部署的 HTTPS 地址，使用分享菜单 → **Add to Home Screen / 加入主屏幕**，开启 **Open as Web App / 作为网页 App 打开**，再点 Add。首次从主屏幕启动后保持联网，直到离线准备完成。[Apple 官方说明](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)

请把安装后的 App 当作需要独立验证的资料环境；不要假定它和 Safari 分页自动共享已有记录。需要迁移时先从原环境导出，再在新环境导入。

完整验收步骤见 [iPhone 实机测试清单](docs/IPHONE-CHECKLIST.md)。桌面模拟移动尺寸不能代替 Safari、主屏幕启动、软键盘和飞行模式实机测试。

## 离线与升级

正式构建会预缓存 HTML、CSS、JavaScript、图标与 Manifest。所有界面统一使用设备系统字体，iPhone 优先使用苹果系统字体，不需要下载字体文件。所有业务数据读写直接在 IndexedDB 中完成。应用更新使用提示式激活；保存编辑后再选择更新，避免更新强制刷新丢失输入。数据库版本与应用资源缓存独立，更新界面不会清空记录。

需要联网完成首次缓存，才可在之后离线重启。系统仍可能回收网站储存；[WebKit 的储存政策](https://webkit.org/blog/14403/updates-to-storage-policy/)说明了持久化请求与资料清理行为。

## 范围

V1.0 包含两种记录类型、三语内容、备注、搜索、收藏、CRUD、JSON 合并与替换恢复及离线支持。不包含自动翻译、登录、同步、标签、Sentence 类型、背单词或学习统计。

补充要求逐项核对见 [REQUIREMENTS-AUDIT.md](docs/REQUIREMENTS-AUDIT.md)，已执行测试及实机边界见 [VERIFICATION.md](docs/VERIFICATION.md)。界面组件位于 `src/components`，交互流程位于 `src/hooks`，数据规则、备份与 IndexedDB 位于 `src/lib`。
