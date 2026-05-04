# NPM publish auth under Hermes HOME redirection

## 现象

在 Hermes profile 内执行下面动作时：

- `npm whoami`
- `npm login`
- `bash ./publish.sh --publish`
- `bash ./scripts/publish_npm.sh --publish`

可能出现：

- `npm ERR! code ENEEDAUTH`
- `need auth This command requires you to be logged in`
- 发布脚本报 `npm auth missing for https://registry.npmjs.org/`
- 当前会话下 `~/.npmrc` 不存在

## 根因

Hermes profile 会把 `HOME` 重定向到类似：

- `~/.hermes/profiles/<profile>/home/`

此时 npm 读取的是这个隔离 HOME 下的：

- `~/.npmrc`
- `~/.npm/`

而不是真实用户 HOME 里的 npm 登录态。因此即使宿主机器已经登录过 npm，当前 Hermes 会话里也会表现成“未登录”。

## 判读顺序

1. 先跑 `--preview` / 预检
2. 如果测试、打包、tarball 校验都通过，而 `--publish` 才失败
3. 再检查 `npm whoami`
4. 再检查当前 `HOME` 指向的 `~/.npmrc` 是否存在

如果只有 auth 失败，优先判定为 `HOME` / npm 凭证可见性问题，不要误判为代码或发布脚本问题。

## 恢复方式

对当前这台机器，显式使用真实 HOME：

```bash
HOME=/Users/gcf npm whoami
HOME=/Users/gcf npm login
HOME=/Users/gcf bash ./scripts/publish_npm.sh --publish --version <x.y.z> --confirm-package @dhf-hermes/grix@<x.y.z> --confirm-tarball dhf-hermes-grix-<x.y.z>.tgz
```

如果真实 HOME 下仍未登录，再补：

- `npm login`
- 或在真实 `~/.npmrc` 写入 publish-capable token

## 本次会话的有效判据

已验证过的信号：

- `git push` 成功
- `publish_npm.sh --preview --version 0.4.3` 成功
- 全量测试通过
- `npm publish` 阶段报 auth missing
- 当前 profile 视角下 `~/.npmrc` 缺失

这类组合足以说明：

- 发布前置质量门已通过
- 阻塞点是 npm auth，不是构建/测试/pack
