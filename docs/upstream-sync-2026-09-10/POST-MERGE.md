# 上线后收尾与新开发入口

2026-09-12，用户反馈已自行部署、运行正常，并已手工调整旧价格；随后明确授权先清理本地环境，再提交并推送至 `MAakber/new-api` 的 `main`。本页记录这次收尾，新的功能开发从 `D:/10178/Projects/new-api` 的当前 `main` 开始。

## 保存与清理

- 清理前提交：`5538152143b3f2968b020c2bc82e1301665e2b12`。完整 Git 历史与全部引用已写入 `pre-cleanup.bundle`，通过 `git bundle verify`，并核对包含该 main 提交。
- 归档目录：`D:/10178/Projects/new-api-upstream-sync-backup-2026-09-10/cleanup-20260911T173416Z/`。归档保留在本机，不提交安装包、日志、数据库或私有配置到仓库。
- 保留基线分支 `codex/upstream-sync-base-2026-09-10`、原始独立备份和本目录全部合并验收记录。
- 五个旧部署工作树和独立集成工作树均已从 Git 移除；提交已全部包含在 main。`codex/upstream-sync-2026-09-10` 与 `feature/relay-user-agent-blacklist` 两个已合入的本地分支已删除，历史仍在 main 和 bundle 中。
- 本地工作树登记文件已同步清理。另移除了一个不含文件的旧工作树空壳目录。
- 本地验收程序 `B18-local-acceptance/new-api.exe` 已停止，原监听端口为 43118；其 SQLite 数据库、WAL 和验收文件保留在独立备份目录中。

归档中的每个文件均按路径、大小和 SHA256 校验；清理回执为 `cleanup-result.json`，各 ZIP 旁有对应的 `*.manifest.json`。

| 归档 | 文件数 | 内容 |
| --- | ---: | --- |
| `output.zip` | 27 | 原未跟踪的截图与上游评估输出 |
| `browser-evidence.zip` | 136 | 浏览器截图、日志等证据；旧 WorkBuddy 安装包直接清理 |
| `local-debug-logs.zip` | 21966 | 历史本地调试记录与工具临时数据 |
| `old-deployment-artifacts.zip` | 9 | 旧部署程序、上传副本等构建文件 |
| `integration-evidence-and-builds.zip` | 565 | 560 个台账 previous 副本、集成程序及桌面发布文件 |

`D:/10178/Projects/new-api-upstream-sync` 只剩被 Windows 占用的空文件夹：Git 登记和全部内容已经移除，普通删除仍被拒绝。没有为释放此目录终止其他工具或用户程序；占用解除后可删除空目录，不影响主工作区开发。

## 开发环境与打包规则

- `.gitignore` 增加根目录 `output/`、Playwright CLI 产物及上传暂存文件规则。
- `.dockerignore` 排除本地工作树、浏览器与调试数据、依赖/构建目录、数据库、上传副本和私有环境文件；保留 `.env.example` 与原有许可证资源规则。
- 使用独立备份中已有的 Bun 1.4.0 执行 `bun install --frozen-lockfile`，补齐主工作区依赖；锁文件未改变。没有更新全局 Bun。
- 主工作区 `web/dist` 已重新构建，替换 9 月 9 日的旧页面；后端构建使用该前端产物。验证程序保存在归档的 `verification/`，未放回源码目录。

## 本次检查

| 检查 | 结果 |
| --- | --- |
| 完整 Git bundle 与五份文件归档 | 校验通过 |
| `bun 1.4.0 install --frozen-lockfile` | 通过，锁文件不变，前端直接依赖齐全 |
| `bun 1.4.0 run build:check` | 类型检查和生产构建通过 |
| `GOWORK=off go build -o <archive>/verification/new-api-main.exe .` | Go 1.25.5 / Windows amd64 构建通过 |

命令、时间、退出码和完整输出在归档的 `verification/` 中。Rsbuild 仍提示 `routes/__tests__/setup-status.test.tsx` 不是路由，该文件没有被加入路由树，构建成功。本次不重复运行未变化的全量业务测试，不把构建结果当作新增数据库或真实供应商验收。

## 历史计划的使用边界

`state.json` 保留 `code_complete` 和原外部验收缺口，用户上线反馈没有被写成未执行测试的通过证明。`integration.archived` 表示旧工作树已经收尾；只读检查工具改为读取当前主工作区，最终验收规则保持原样。

新开发按新的需求从当前 main 创建对应的开发分支，不自动续跑旧 B18.2，也不重新整合已有的 153 个上游提交。只有明确要求补做旧计划验收时，才使用 RESUME.md 与原始检查点。
