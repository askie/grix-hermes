# Host live bridge 已存在，但 grix-egg 仍需收口的审查结论

适用场景：继续推进 `grix-egg create_new` 宿主优先改造、或有人声称“还缺 host bridge”时。

## 已确认事实

1. hermes-agent 侧并非没有 bridge
   - `tools/grix_invoke_tool.py`：统一 `grix_invoke` 工具
   - `gateway/platforms/grix.py::agent_invoke(...)`：adapter 已可通过 live GRIX transport 执行 backend action
   - send/edit/delete/typing 也都已走同一 live adapter

2. 因此当前主问题不再是“先补一个全新的 host bridge”
   - 更常见的是 `grix-egg/bootstrap.ts` 仍残留旧的 `ws/http` 分类和 HTTP fallback 心智模型
   - 以及测试还在验证“unsupported cmd for hermes + access token => 自动 HTTP fallback”这类旧行为

## 当前代码审查抓到的关键不一致

### 1) state path 语义不一致

常见模式：

- `stepDetect()` 在发现宿主可复用凭证时写：
  - `steps.detect.result.path = "host"`
  - `transport = "host_grix_session"`
- 但 `stepCreateWs()` 结束后仍写：
  - `steps.create.result.path = "ws"`

结果：checkpoint/state file 同一次安装里出现 detect=host、create=ws 的混写。

修复原则：
- 如果主路径语义已经切到宿主 live bridge，就统一写 `host`
- 不要让 create 步骤继续回写旧标签 `ws`

### 2) 测试与策略文案未收口

如果代码/技能已经宣称：
- `create_new` 应优先复用宿主 live bridge
- 不再把 `access_token` 当主路径前提

但测试仍保留：
- `unsupported cmd for hermes` 时，只要给 `--access-token` 就自动切 HTTP create-and-bind

则说明：
- 设计口径、实现、测试三者还没对齐
- 下一步应优先删改旧 fallback 测试，并补 host path / state 语义测试

## 推荐下一步

1. 先补/改测试，明确新的 contract：
   - `create_new` 主路径 = host
   - `existing` = 显式凭证绑定
   - 不再把 access token fallback 当默认验收路径
2. 再收口 `bootstrap.ts`：
   - detect/create 都统一使用 host path 语义
3. 如果仍出现 `unsupported cmd for hermes`
   - 先判断是运行时 capability 真的不支持
   - 不要回退到“那就默认要求 access token”这条旧思路

## 何时仍需要重新判断“桥是否存在”

只有在下面情况，才重新怀疑 hermes-agent 侧 bridge 还不够：

- `grix_invoke` / `adapter.agent_invoke` 自身不存在或无法调用
- live adapter 无法执行 `agent_api_create` 这类 admin action
- 需要从外部脚本进程复用宿主能力，但现有执行模型根本到不了宿主 adapter

否则，优先把问题归类为：`grix-egg` 侧状态语义与测试收口未完成，而不是“底层完全没桥”。
