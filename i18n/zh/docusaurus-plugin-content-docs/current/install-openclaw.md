---
sidebar_position: 6
title: 安装 OpenClaw
---

# 安装 OpenClaw

OpenClaw 是一个 AI 驱动的基础设施运维代理。它监控系统健康、提出配置变更建议，并可以执行已批准的操作 — 所有操作都在策略定义的边界内进行。可以将其视为与您现有 NixOS 工具配合工作的 AI SRE 代理。

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw 代理                         │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ 监控     │  │   策略       │  │   操作            │ │
│  │ 引擎     │──│   引擎       │──│   执行器          │ │
│  │          │  │              │  │                   │ │
│  │ - 健康   │  │ - 允许/拒绝 │  │ - nix 配置生成   │ │
│  │ - 指标   │  │ - 升级       │  │ - safe-rebuild   │ │
│  │ - 日志   │  │ - 审计日志   │  │ - 服务管理       │ │
│  └──────────┘  └──────────────┘  └───────────────────┘ │
│       │                                    │            │
│       ▼                                    ▼            │
│  ┌──────────┐                    ┌───────────────────┐  │
│  │   LLM    │                    │   TOTP 门禁       │  │
│  │   后端   │                    │  (用于临界操作)   │  │
│  │ (API/    │                    └───────────────────┘  │
│  │  本地)   │                                           │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘
          │                                   │
          ▼                                   ▼
    ┌──────────┐                    ┌───────────────────┐
    │ 外部     │                    │   NixOS 系统      │
    │ LLM API  │                    │   (已管理)        │
    └──────────┘                    └───────────────────┘
```

## 组件

| 组件 | 角色 |
|---|---|
| **监控引擎** | 收集系统指标、解析日志、检测异常 |
| **策略引擎** | 定义 OpenClaw 可以和不能自主做什么 |
| **操作执行器** | 生成 Nix 配置、运行 safe-rebuild、管理服务 |
| **LLM 后端** | 推理引擎 — 可以是远程 API 或本地模型 |
| **审计日志** | 所有提案和操作的不可变记录 |

## 在 NixOS 上安装

### 添加 Flake 输入

```nix title="flake.nix"
{
  description = "自愈式 NixOS 服务器";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    openclaw = {
      url = "github:openclaw/openclaw";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, disko, openclaw, ... }: {
    nixosConfigurations.server = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        disko.nixosModules.disko
        openclaw.nixosModules.default
        ./disk-config.nix
        ./configuration.nix
        ./openclaw-config.nix
      ];
    };
  };
}
```

### OpenClaw NixOS 模块

```nix title="openclaw-config.nix"
{ config, pkgs, ... }:
{
  services.openclaw = {
    enable = true;

    # 作为专用系统用户运行（不是 root）
    user = "openclaw";
    group = "openclaw";

    settings = {
      # LLM 后端配置
      llm = {
        # 选项 1：远程 API
        provider = "anthropic";
        model = "claude-sonnet-4-20250514";
        # API 密钥从文件加载，永远不在 nix 配置中
        apiKeyFile = "/run/secrets/openclaw-api-key";

        # 选项 2：本地模型（取消注释以使用）
        # provider = "ollama";
        # model = "llama3:70b";
        # endpoint = "http://localhost:11434";
      };

      # 系统集成
      system = {
        # NixOS 配置路径
        nixosConfigPath = "/etc/nixos";

        # 使用我们的 safe-rebuild 包装器
        rebuildCommand = "safe-rebuild";

        # Snapper 集成
        snapperConfigs = [ "root" "home" "db" ];
      };

      # 监控目标
      monitoring = {
        enable = true;
        interval = "60s";

        checks = {
          diskUsage = { threshold = 85; };
          memoryUsage = { threshold = 90; };
          loadAverage = { threshold = 4.0; };
          failedUnits = { enable = true; };
          sshBruteForce = { enable = true; threshold = 10; };
          certificateExpiry = { enable = true; warnDays = 14; };
        };
      };

      # 日志和审计
      audit = {
        enable = true;
        logPath = "/var/log/openclaw/audit.jsonl";
        retentionDays = 90;
      };
    };
  };

  # 创建 openclaw 系统用户
  users.users.openclaw = {
    isSystemUser = true;
    group = "openclaw";
    home = "/var/lib/openclaw";
    description = "OpenClaw AI 基础设施运维代理";
  };

  users.groups.openclaw = {};

  # OpenClaw 需要有限的 sudo 访问（临界操作需要 TOTP）
  security.sudo.extraRules = [
    {
      users = [ "openclaw" ];
      commands = [
        # 只读操作 — 无需 TOTP
        { command = "/run/current-system/sw/bin/systemctl status *"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/journalctl *"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/btrfs subvolume list *"; options = [ "NOPASSWD" ]; }
        { command = "/run/current-system/sw/bin/snapper list *"; options = [ "NOPASSWD" ]; }

        # 临界操作 — 需要 TOTP（在第 6 章配置）
        { command = "/run/current-system/sw/bin/safe-rebuild *"; options = [ "PASSWD" ]; }
        { command = "/run/current-system/sw/bin/nixos-rebuild *"; options = [ "PASSWD" ]; }
        { command = "/run/current-system/sw/bin/systemctl restart *"; options = [ "PASSWD" ]; }
      ];
    }
  ];

  # 确保日志目录存在
  systemd.tmpfiles.rules = [
    "d /var/log/openclaw 0750 openclaw openclaw -"
  ];
}
```

### API 密钥管理

永远不要将 API 密钥放在 Nix 配置中。使用 secrets 管理器：

```bash
# 创建 secrets 目录（受限权限）
sudo mkdir -p /run/secrets
sudo chmod 700 /run/secrets

# 写入 API 密钥
echo "sk-ant-..." | sudo tee /run/secrets/openclaw-api-key > /dev/null
sudo chmod 600 /run/secrets/openclaw-api-key
sudo chown openclaw:openclaw /run/secrets/openclaw-api-key
```

:::tip 生产 Secrets 管理
对于生产环境，使用 [agenix](https://github.com/ryantm/agenix) 或 [sops-nix](https://github.com/Mic92/sops-nix) 通过加密声明式管理 secrets：

```nix
# 使用 agenix：
age.secrets.openclaw-api-key = {
  file = ../secrets/openclaw-api-key.age;
  owner = "openclaw";
  group = "openclaw";
};
```
:::

## 验证

使用 OpenClaw 配置重建后：

```bash
# 检查服务状态
sudo systemctl status openclaw

# 查看最近日志
sudo journalctl -u openclaw -f

# 检查 OpenClaw 是否可以与其 LLM 后端通信
sudo -u openclaw openclaw health-check

# 查看审计日志
sudo cat /var/log/openclaw/audit.jsonl | jq .
```

预期的健康输出：

```
● openclaw.service - OpenClaw AI Infrastructure Operator
     Loaded: loaded (/etc/systemd/system/openclaw.service; enabled)
     Active: active (running) since Mon 2024-01-15 10:00:00 UTC
   Main PID: 1234 (openclaw)
      Tasks: 8 (limit: 4915)
     Memory: 128.0M
     CGroup: /system.slice/openclaw.service
             └─1234 /nix/store/...-openclaw/bin/openclaw --config /etc/openclaw/config.toml

Jan 15 10:00:01 nixos-server openclaw[1234]: Monitor engine started (interval: 60s)
Jan 15 10:00:01 nixos-server openclaw[1234]: Policy engine loaded (12 rules)
Jan 15 10:00:01 nixos-server openclaw[1234]: LLM backend connected (anthropic/claude-sonnet-4-20250514)
Jan 15 10:00:01 nixos-server openclaw[1234]: Audit logging to /var/log/openclaw/audit.jsonl
```

## 安全注意事项

1. **专用用户** — OpenClaw 以 `openclaw` 而非 root 运行。它只能通过 sudo 提升权限。
2. **TOTP 门禁 sudo** — 临界操作（重建、重启）需要 TOTP 身份验证（在[第 6 章](./totp-sudo-protection)中配置）。
3. **只读默认** — 监控命令无需密码运行。只有写操作需要身份验证。
4. **审计追踪** — 每个操作都记录到仅追加的 JSONL 文件中，包含时间戳、操作类型和结果。
5. **策略边界** — 策略引擎阻止 OpenClaw 在规则之外行动，即使 LLM 建议它这样做。

:::danger 永远不要给 OpenClaw root 访问权限
OpenClaw 不应以 root 运行或拥有不受限制的 sudo。整个安全模型取决于 TOTP 门禁立于 OpenClaw 和破坏性操作之间。如果 OpenClaw 有 root，门禁就毫无意义。
:::

## 下一步

OpenClaw 已安装并运行。接下来，我们将配置 [AI 管理的基础设施工作流](./ai-managed-infra) — 定义 OpenClaw 可以自主做什么 vs 什么需要人类批准。
