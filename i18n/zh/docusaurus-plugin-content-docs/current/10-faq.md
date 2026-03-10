---
sidebar_position: 12
title: 常见问题
---

# 常见问题

## Btrfs 与快照

### 为什么选择 Btrfs 而不是 ZFS？

两者都是优秀的写时复制文件系统。我们选择 Btrfs 是因为：

| 因素 | Btrfs | ZFS |
|---|---|---|
| Linux 内核集成 | 主线内核，无需 DKMS | 需要内核模块（许可证冲突）|
| NixOS 支持 | 一等公民，disko 原生支持 | 支持但设置更复杂 |
| 内存需求 | 低开销 | 建议每 TB 存储 1 GB RAM |
| Send/receive | 原生增量支持 | 原生增量支持 |
| 快照性能 | 即时 | 即时 |

ZFS 也是一个有效的选择 — 如果您更喜欢它，架构可以直接转换（子卷替换为数据集，`btrfs send` 替换为 `zfs send`）。

### 快照占用多少磁盘空间？

快照是写时复制的 — 它们只在文件与原始版本不同时才消耗空间。实际使用中：

- **系统快照**（@root）：每个快照 100-500 MB（配置变更很小）
- **数据库快照**（@db）：与数据变动成比例（高写入数据库每个快照可能占用数据库大小的 10-30%）
- **典型总量**：在活动适中的服务器上，30 天的每小时系统快照占用 2-5 GB

监控命令：

```bash
sudo btrfs qgroup show -reF /
```

### 磁盘快满了怎么办？

1. **先清理旧快照** — 它们通常是最大的消耗者：

```bash
# 强制清理 timeline 快照
sudo snapper -c root cleanup timeline
sudo snapper -c db cleanup timeline

# 删除特定的旧快照
sudo snapper -c root delete 1-50
```

2. **检查 Nix store** — 旧代数会累积：

```bash
sudo nix-collect-garbage --delete-older-than 14d
```

3. **检查压缩** — 确保 zstd 已激活：

```bash
sudo compsize /
```

### 快照损坏了怎么办？

Btrfs 对所有数据和元数据进行校验。如果快照出现位腐蚀，`btrfs scrub` 会检测到：

```bash
sudo btrfs scrub start /
sudo btrfs scrub status /
```

使用 RAID1 或 `dup` 元数据时，Btrfs 可以自我修复。没有冗余时，您需要从远程备份恢复（`btrfs send/receive`）。

## NixOS 与系统管理

### 可以在现有 NixOS 服务器上使用吗？

可以。跳过第 1 章（`nixos-anywhere`），从第 2 章开始。将 Btrfs 子卷布局添加到现有的 disko 或 fstab 配置中，然后逐步应用 Snapper、OpenClaw 和 TOTP 模块。

:::warning
将现有 ext4 根分区迁移到 Btrfs 需要备份和恢复操作。您无法原地转换正在使用的根文件系统。
:::

### 应该保留多少个 NixOS 代数？

至少 3-5 个。启动菜单将显示最近的代数作为回退选项。在 `configuration.nix` 中配置：

```nix
boot.loader.systemd-boot.configurationLimit = 10;
```

每个代数很小（几 MB 的符号链接）— 保留 10 个以上很便宜。

### `nixos-rebuild` 很慢怎么办？

1. **在更快的机器上构建**并复制结果：

```bash
nixos-rebuild switch --flake .#server \
  --target-host admin@SERVER_IP \
  --build-host localhost \
  --use-remote-sudo
```

2. **使用二进制缓存** — 添加 Cachix 或您自己的 Nix 缓存：

```nix
nix.settings.substituters = [ "https://cache.nixos.org" "https://your-cache.cachix.org" ];
```

3. **锁定 nixpkgs** — 除非需要，否则不要更新 flake lock，避免不必要的重建。

### 这在 ARM（aarch64）服务器上可以工作吗？

可以。将 `flake.nix` 中的 `system = "x86_64-linux"` 改为 `system = "aarch64-linux"`。所有组件（Btrfs、Snapper、pam_oath）都支持 ARM。

## OpenClaw 与 AI 操作

### 可以使用其他 LLM 代替 Claude 吗？

可以。OpenClaw 的 LLM 后端可配置：

```nix
services.openclaw.settings.llm = {
  # OpenAI
  provider = "openai";
  model = "gpt-4o";
  apiKeyFile = "/run/secrets/openai-api-key";

  # 或通过 Ollama 使用本地模型
  provider = "ollama";
  model = "llama3:70b";
  endpoint = "http://localhost:11434";
};
```

本地模型避免网络依赖和 API 成本，但可能产生较低质量的分析。

### 如果 OpenClaw 进入重启循环怎么办？

策略引擎有内置保护：

1. **每服务重启限制**（默认：每小时 3 次）— 3 次重启后，服务标记为需要人工干预
2. **全局速率限制**（默认：每小时 5 次操作）— 防止失控自动化
3. **紧急停止** — 创建 `/var/lib/openclaw/STOP` 立即停止所有自主操作：

```bash
sudo touch /var/lib/openclaw/STOP
```

### OpenClaw 运行云 LLM 的成本是多少？

取决于监控间隔和问题频率。典型使用量：

| 活动 | Token/天 | 成本/月（估计）|
|---|---|---|
| 健康监控（60s 间隔）| ~10K | ~$0.50 |
| 问题分析（5 个问题/天）| ~50K | ~$2.50 |
| 配置生成（2 个提案/天）| ~20K | ~$1.00 |
| **合计** | **~80K** | **~$4/月** |

本地模型（Ollama）消除 API 成本，但会增加服务器资源使用。

## TOTP 与安全

### 丢失了 TOTP 设备怎么恢复？

1. 通过 VPS 提供商的 **Web 控制台**（KVM/IPMI/VNC）访问服务器
2. 启动到救援模式或单用户模式
3. 挂载并编辑：

```bash
mount /dev/sda2 /mnt -o subvol=@root
# 临时删除 pam_oath 行
vim /mnt/etc/pam.d/sudo
# 或替换 TOTP 密钥
echo "HOTP/T30/6 admin - $(head -c 20 /dev/urandom | base32 | tr -d '=' | head -c 32)" > /mnt/etc/users.oath
```

4. 重启，用新设备重新注册，然后 `safe-rebuild switch` 恢复 PAM 配置

:::tip 预防措施
始终在密码管理器中或打印在安全地方备份您的 TOTP 密钥。
:::

### TOTP 对生产环境安全足够吗？

TOTP 是纵深防御策略中的一层。对于生产环境，还应考虑：

- **仅 SSH 密钥认证**（已在第 1 章配置）
- **Fail2ban** 或 **SSHGuard** 防暴力破解
- **网络级防火墙**（VPC 安全组、iptables）
- **审计日志**（auditd、OpenClaw 审计跟踪）
- **硬件安全密钥**（U2F/FIDO2 通过 `pam_u2f` 作为 TOTP 替代方案）

## 灾难恢复

### 如何测试灾难恢复计划？

1. **启动一个测试服务器**（相同 VPS 提供商，最低配置）
2. 使用相同的 flake 运行 `nixos-anywhere`
3. 通过 `btrfs send/receive` 接收备份快照
4. 验证服务启动且数据完整
5. 测试 TOTP 注册和认证
6. 销毁测试服务器

每季度做一次。记录任何问题并更新运行手册。

### 如果所有快照都被删除了怎么办？

如果本地快照丢失，您的恢复选项有：

1. **远程备份**通过 `btrfs send/receive`（在第 3 章配置）
2. **NixOS 代数** — 系统配置可以从 flake 重建（数据丢失，但系统状态可复现）
3. **WAL 归档** — 对于 PostgreSQL，`/var/lib/db/wal-archive/` 中的 WAL 文件可以重放事务到某个时间点

这就是为什么远程备份至关重要。本地快照防止不良变更；远程备份防止磁盘故障和数据丢失。

## 监控与可观测性

### 应该设置哪些告警？

至少设置以下告警：

| 告警 | 条件 | 严重性 |
|---|---|---|
| 磁盘使用率高 | Btrfs 使用率 > 85% | 警告 |
| 快照过旧 | 上次根快照 > 2 小时前 | 警告 |
| 远程备份过期 | 上次备份 > 36 小时前 | 严重 |
| OpenClaw 宕机 | 服务未运行 | 严重 |
| 失败的 systemd 单元 | 任何单元失败 > 10 分钟 | 警告 |
| TOTP 时间漂移 | 服务器时钟与 NTP 偏差 > 30 秒 | 严重 |
| Btrfs 错误 | `btrfs device stats` 显示错误 | 严重 |
