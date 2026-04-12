#!/usr/bin/env node

import fs from "node:fs";

function cleanText(value) {
  return String(value ?? "").trim();
}

function readPayload(argv) {
  const fileIndex = argv.indexOf("--from-file");
  if (fileIndex >= 0 && argv[fileIndex + 1]) {
    return JSON.parse(fs.readFileSync(argv[fileIndex + 1], "utf8"));
  }
  const stdin = fs.readFileSync(0, "utf8").trim();
  if (!stdin) {
    throw new Error("No install context JSON provided.");
  }
  return JSON.parse(stdin);
}

function requiredForRoute(route) {
  if (route === "openclaw_create_new" || route === "openclaw_existing") {
    return ["install_id", "main_agent"];
  }
  if (route === "claude_existing") {
    return ["install_id"];
  }
  return ["install_id"];
}

function buildSteps(route) {
  if (route === "openclaw_create_new" || route === "openclaw_existing") {
    return [
      "准备安装上下文",
      "必要时创建远端 API agent",
      "写入并校验 OpenClaw 配置",
      "发送安装状态卡",
      "创建测试群并保存准确 session_id",
      "向当前私聊发送测试群会话卡片",
      "在测试群做身份验收并修到正确"
    ];
  }
  if (route === "claude_existing") {
    return [
      "准备 Claude 安装上下文",
      "安装目标技能或包",
      "必要时同步 OpenClaw 配置",
      "发送状态卡并决定是否群测"
    ];
  }
  return ["识别路由并补齐上下文"];
}

try {
  const payload = readPayload(process.argv.slice(2));
  const install = payload.install && typeof payload.install === "object" ? payload.install : {};
  const route = cleanText(install.route || payload.route || payload.install_route);
  const required = requiredForRoute(route);
  const missing = required.filter((key) => !cleanText(payload[key] ?? install[key]));
  const result = {
    ok: true,
    route,
    missing,
    is_ready: missing.length === 0 && Boolean(route),
    steps: buildSteps(route),
  };
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
}
