# ghworker

把它设成浏览器的搜索引擎后，地址栏里可以直接这样跳 GitHub：

| 输入 | 跳到 |
| --- | --- |
| `org/repo` | `github.com/org/repo`（org 也可以用别名，比如 `a/repo`） |
| `org/repo/pulls`（任意子路径） | `github.com/org/repo/pulls` |
| `org/repo#123` | `github.com/org/repo/issues/123`（如果是 PR，GitHub 会自动转过去） |
| `repo#123` | `github.com/<DEFAULT_ORG>/repo/issues/123` |
| 其他 | `FALLBACK` 搜索 |

`org/repo` 只认 `ORGS` 里列出的 org，所以 `and/or`、`24/7` 这类正常搜索不会被误跳。

用 TypeScript 写成 Cloudflare Worker，没有运行时依赖。

## 配置

配置不进 git：本地写在 `.dev.vars`（已 gitignore），线上存成 Worker secrets。

```sh
cp .dev.vars.example .dev.vars   # 然后编辑
pnpm secrets                     # 把 .dev.vars 上传为线上 secrets，改配置后重新跑一次即可，不用重新部署
```

- `DEFAULT_ORG`：必填，`repo#123` 默认用的 org
- `ORGS`：其他会被识别的 org，逗号分隔；写成 `alias=org` 时，`alias/repo` 也能用
- `FALLBACK`：其他输入的去处，`{q}` 会被替换成编码后的查询，默认是 Google

## 开发

```sh
pnpm install
pnpm test                                    # 测试解析规则
pnpm typecheck
pnpm dev                                     # 本地跑（读 .dev.vars），然后访问 http://localhost:8787/?q=widgets%23123
pnpm run deploy                              # 部署（首次需要先 pnpm exec wrangler login）
```

## 浏览器接入

### macOS Chrome

1. 设置 → 搜索引擎 → 管理搜索引擎和网站搜索 → 网站搜索旁边点“添加”，网址填 `https://<worker 地址>/?q=%s`，然后在它的菜单里选“设为默认”。这一步让 `repo#123` 这类输入生效。
2. 装上 `extension/` 里的扩展：打开 `chrome://extensions` → 右上角打开“开发者模式” → “加载已解压的扩展程序” → 选 `extension` 目录。

第 2 步是必须的：Chrome 会把 `t/repo` 这种“一个词 + 斜杠”的输入当成内网网址（`http://t/repo`）直接打开，而不是去搜索。扩展只在这种主机名解析失败时，才把整串输入转给 Worker，所以真正存在的内网或 tailnet 主机不受影响。用自己部署的 Worker 时，记得改 `extension/background.js` 里的 `ENDPOINT`。

### iOS Safari

Safari 不能自定义默认搜索引擎，需要装一个能把搜索请求重定向到自定义 URL 的 Safari 扩展（App Store 搜 “Customize Search Engine” 这类）。

**要避免重定向死循环。** 如果扩展拦截的是 Google 搜索，而 `FALLBACK` 也是 Google，没匹配上的搜索会一直来回跳。可以二选一：

- Safari 默认引擎设成一个平时不用的（比如 Ecosia、Bing），让扩展只拦截它；`FALLBACK` 保持 Google。
- 或者 Safari 保持 Google，把 `FALLBACK` 改成别的引擎，比如 `https://duckduckgo.com/?q={q}`。
