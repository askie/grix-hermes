---
name: openclaw-memory-setup
description: 配置 OpenClaw memory provider、Ollama embedding 模型、校验并重建索引时使用。适用于新机器初始化、已有配置调整、provider 切换和资源受限主机的 memory 健康检查。通过本技能自带脚本和 `openclaw` 官方 CLI 完成。
---

# OpenClaw Memory Setup

## 进入方式

如果用户已经给了明确 provider / model / endpoint / api key，就直接改配置。

如果机器情况还不清楚，先体检，再挑候选模型，再做实测。

## 可用脚本

```bash
python3 scripts/survey_host_readiness.py --json
python3 scripts/bench_ollama_embeddings.py --json --model nomic-embed-text
python3 scripts/set_openclaw_memory_model.py --preview ...
python3 scripts/set_openclaw_memory_model.py ...
```

## 主线

1. 需要时先跑 `survey_host_readiness.py`
2. 如需本地模型比较，再跑 `bench_ollama_embeddings.py`
3. 用 `set_openclaw_memory_model.py` 预览或写入配置
4. 写完后必须执行：
   - `openclaw --profile <profile> config validate`
   - `openclaw --profile <profile> gateway restart`
   - `openclaw --profile <profile> memory index --force`
   - `openclaw --profile <profile> memory status`
   - `openclaw --profile <profile> status`

## 结果判断

- 只改了配置但没重建索引，不算完成
- `memory status` 和 `status` 都正常，才算完成
