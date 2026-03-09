---
sidebar_position: 8
title: TOTP Sudo 保护
---

# TOTP Sudo 保护

本章配置 sudo 的 TOTP（基于时间的一次性密码）身份验证，确保像 `nixos-rebuild switch` 这样的临界操作需要身份验证器应用的 6 位数字代码 — 即使攻击者获得了 shell 访问权限。

## 为什么 Sudo 需要 TOTP

```
没有 TOTP：
  攻击者获得 SSH ──> sudo nixos-rebuild ──> 系统被攻陷

有 TOTP：
  攻击者获得 SSH ──> sudo nixos-rebuild ──> TOTP 提示
                                                      │
                                           攻击者没有
                                           TOTP 密钥
                                                      │
                                                   阻止 ✓
```

TOTP 密钥存储在您的手机（或硬件令牌）上，而不是服务器上。即使服务器被攻陷，攻击者也无法生成有效的代码。

## 组件

| 组件 | 角色 |
|---|---|
| `pam_oath` | 验证 TOTP 代码的 PAM 模块 |
| `oath-toolkit` | 用于生成密钥和测试代码的 CLI 工具 |
| `oathtool` | 命令行 TOTP 代码生成器（用于测试）|
| 身份验证器应用 | Google Authenticator、Authy 或任何 TOTP 应用 |

## PAM 身份验证流程

```
sudo nixos-rebuild switch
          │
          ▼
 ┌─────────────────────┐
 │    PAM 栈           │
 │                      │
 │  ┌────────────────┐  │
 │  │   pam_unix     │  │──> 密码检查（或 SSH 密钥）
 │  └────────┬───────┘  │
 │           │ 通过      │
 │  ┌────────▼───────┐  │
 │  │   pam_oath     │  │──> TOTP 检查（6 位数字代码）
 │  └────────┬───────┘  │
 │           │ 通过      │
 │  ┌────────▼───────┐  │
 │  │   pam_env      │  │──> 环境设置
 │  └────────────────┘  │
 │                      │
 └──────────┬───────────┘
            │ 全部通过
            ▼
     命令执行
```

## NixOS 配置

### 安装和配置 pam_oath

```nix title="modules/totp-sudo.nix"
{ config, pkgs, lib, ... }:
{
  # 安装 oath-toolkit
  environment.systemPackages = with pkgs; [
    oath-toolkit   # oathtool CLI
    libpam_oath    # PAM 模块（由 oath-toolkit 提供）
    qrencode       # 生成二维码用于注册设备
  ];

  # 配置 PAM 使 sudo 需要 TOTP
  security.pam.services.sudo = {
    text = lib.mkForce ''
      # 账户管理
      account required pam_unix.so

      # 身份验证：密码 + TOTP
      auth required pam_unix.so
      auth required ${pkgs.oath-toolkit}/lib/security/pam_oath.so usersfile=/etc/users.oath window=3 digits=6

      # 会话
      session required pam_unix.so
      session required pam_env.so
    '';
  };

  # 确保 TOTP 用户文件存在且权限正确
  systemd.tmpfiles.rules = [
    "f /etc/users.oath 0600 root root -"
  ];
}
```

:::warning window=3
`window=3` 参数允许最多 3 个时间步（90 秒）_old 或新的代码。这考虑了服务器和身份验证器应用之间的时钟漂移。不要设置太高 — 它会削弱安全性。
:::

### TOTP 密钥注册

为每个需要 sudo 访问的用户生成 TOTP 密钥：

```bash
# 生成随机密钥（base32 编码）
head -c 20 /dev/urandom | base32 | tr -d '=' | head -c 32
# 示例输出：JBSWY3DPEHPK3PXP4ZTLMRQK6BZDG5A

# 存储它。格式：HOTP/T TYPE USER - SECRET
# 对于 TOTP，6 位数字，30 秒周期：
echo "HOTP/T30/6 admin - JBSWY3DPEHPK3PXP4ZTLMRQK6BZDG5A" | sudo tee -a /etc/users.oath
echo "HOTP/T30/6 openclaw - KFWU4SDPN7PAQ3RPXVTZMRWK8CZDH7B" | sudo tee -a /etc/users.oath

# 设置受限权限
sudo chmod 600 /etc/users.oath
sudo chown root:root /etc/users.oath
```

### 生成身份验证器应用的二维码

```bash
# 为 admin 用户生成二维码
qrencode -t ansiutf8 \
  "otpauth://totp/nixos-server:admin?secret=JBSWY3DPEHPK3PXP4ZTLMRQK6BZDG5A&issuer=nixos-server&digits=6&period=30"
```

这会在终端中显示二维码。使用您的身份验证器应用（Google Authenticator、Authy、1Password 等）扫描它。

### 测试 TOTP 身份验证

```bash
# 使用 oathtool 生成测试代码
oathtool --totp --base32 JBSWY3DPEHPK3PXP4ZTLMRQK6BZDG5A
# 输出：123456

# 测试 sudo — 它应该要求密码 + TOTP
sudo echo "TOTP works!"
# 密码：（您的密码）
# 一次性密码 (OATH):（身份验证器中的 6 位数字代码）
```

## 用户文件格式

`/etc/users.oath` 文件格式：

```
# TYPE         USER    PIN  SECRET
HOTP/T30/6     admin   -    JBSWY3DPEHPK3PXP4ZTLMRQK6BZDG5A
HOTP/T30/6     openclaw -   KFWU4SDPN7PAQ3RPXVTZMRWK8CZDH7B
```

| 字段 | 含义 |
|---|---|
| `HOTP/T30/6` | TOTP 模式，30 秒周期，6 位数字 |
| `admin` | Unix 用户名 |
| `-` | 无额外 PIN（只需 TOTP 代码）|
| `JBSWY3...` | Base32 编码的密钥 |

## OpenClaw TOTP 集成

为了让 OpenClaw 为门禁操作验证 TOTP，它需要一种机制来向人类运维人员请求代码。这通常通过通知渠道完成：

```nix title="modules/openclaw-totp-bridge.nix"
{ config, pkgs, ... }:
let
  totpBridge = pkgs.writeShellScriptBin "openclaw-totp-bridge" ''
    set -euo pipefail

    ACTION="$1"
    PROPOSAL_ID="$2"

    echo "=== TOTP Authorization Required ==="
    echo "Action:   $ACTION"
    echo "Proposal: $PROPOSAL_ID"
    echo ""

    # 发送通知给运维人员（通过 webhook、邮件等）
    ${pkgs.curl}/bin/curl -s -X POST \
      "''${OPENCLAW_NOTIFY_URL}" \
      -H "Content-Type: application/json" \
      -d "{
        \"text\": \"🔐 TOTP required for: $ACTION\nProposal: $PROPOSAL_ID\nReply with 6-digit code to approve.\"
      }" || true

    # 等待运维人员提供 TOTP 代码
    # 这从 OpenClaw 的批准渠道读取
    echo "Waiting for TOTP code from operator..."
    read -r -t 300 TOTP_CODE < /var/lib/openclaw/totp-response-pipe

    if [ -z "$TOTP_CODE" ]; then
      echo "Timeout: no TOTP code received within 5 minutes"
      exit 1
    fi

    # 验证 TOTP 代码
    EXPECTED=$(${pkgs.oath-toolkit}/bin/oathtool --totp --base32 \
      "$(grep openclaw /etc/users.oath | awk '{print $4}')")

    if [ "$TOTP_CODE" = "$EXPECTED" ]; then
      echo "TOTP validated successfully"
      exit 0
    else
      echo "Invalid TOTP code"
      exit 1
    fi
  '';
in
{
  environment.systemPackages = [ totpBridge ];

  services.openclaw.settings.authentication = {
    totpBridgeCommand = "${totpBridge}/bin/openclaw-totp-bridge";
    approvalTimeout = "5m";
  };
}
```

## 选择性 TOTP 强制

您可能只想对特定命令使用 TOTP，而不是所有 sudo 操作。使用 PAM 条件：

```nix title="替代方案：仅对特定命令使用 TOTP"
{ config, pkgs, lib, ... }:
let
  # 在运行命令前强制 TOTP 的包装器
  totpGuard = pkgs.writeShellScriptBin "totp-guard" ''
    set -euo pipefail

    COMMAND="$*"

    echo "This operation requires TOTP authentication."
    echo "Command: $COMMAND"
    echo ""

    # 读取 TOTP 代码
    read -r -s -p "TOTP code: " TOTP_CODE
    echo ""

    # 针对当前用户的密钥验证
    USER=$(whoami)
    SECRET=$(sudo grep "^HOTP.*$USER" /etc/users.oath | awk '{print $4}')

    EXPECTED=$(${pkgs.oath-toolkit}/bin/oathtool --totp --base32 "$SECRET")

    if [ "$TOTP_CODE" != "$EXPECTED" ]; then
      echo "Invalid TOTP code. Operation denied."
      logger -t totp-guard "DENIED: $USER attempted $COMMAND with invalid TOTP"
      exit 1
    fi

    logger -t totp-guard "APPROVED: $USER executed $COMMAND with valid TOTP"
    exec $COMMAND
  '';
in
{
  environment.systemPackages = [ totpGuard ];

  # 为受保护命令创建别名
  environment.shellAliases = {
    "nixos-rebuild" = "totp-guard nixos-rebuild";
  };
}
```

## 时钟同步

TOTP 依赖服务器和身份验证器之间的时钟同步。确保配置了 NTP：

```nix
# 在 configuration.nix 中
services.timesyncd.enable = true;
networking.timeServers = [
  "0.nixos.pool.ntp.org"
  "1.nixos.pool.ntp.org"
  "2.nixos.pool.ntp.org"
  "3.nixos.pool.ntp.org"
];
```

```bash
# 验证时间同步
timedatectl status
# 应显示：System clock synchronized: yes
```

:::danger 时钟漂移会破坏 TOTP
如果服务器时钟与 UTC 漂移超过 90 秒，TOTP 代码将被拒绝。始终保持 NTP 启用并监控时钟同步。PAM 中的 `window=3` 设置给予 90 秒容忍度。
:::

## 备份和恢复

### 备份 TOTP 密钥

```bash
# 加密并备份 users.oath 文件
sudo gpg --symmetric --cipher-algo AES256 -o /root/users.oath.gpg /etc/users.oath

# 离线存储 GPG 加密的备份（USB、密码管理器等）
```

### 丢失 TOTP 设备

如果您丢失了身份验证器设备：

1. **启动进入救援模式**（来自 VPS 提供商控制台）
2. **挂载文件系统**：`mount /dev/sda2 /mnt -o subvol=@root`
3. **编辑或移除 TOTP 要求**：`vim /mnt/etc/users.oath`
4. **重启并用新设备重新注册**

:::提示 始终有备份
保持备份代码或第二个已注册的设备。在服务器需要它时丢失您唯一的 TOTP 设备意味着您需要控制台访问才能恢复。
:::

## 下一步

临界操作现在受 TOTP 保护。接下来，我们将设计一个确保有状态服务一致备份的[数据库快照策略](./database-snapshot-strategy)。
