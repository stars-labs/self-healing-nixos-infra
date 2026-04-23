---
sidebar:
  order: 10
title: 灾难恢复
---

# 灾难恢复

本章是操作手册。涵盖每种主要故障场景、检测方法和逐步恢复流程。建议打印本页并放在随手可取之处 -- 出问题时你会用到它。

## 恢复矩阵

| 场景 | RTO | RPO | 方法 |
|---|---|---|---|
| nixos-rebuild 出错（服务异常） | 2 分钟 | 0 | Snapper 回滚或 NixOS 代际切换 |
| nixos-rebuild 出错（无法启动） | 5 分钟 | 0 | GRUB 选择上一代配置 |
| 数据库损坏 | 10 分钟 | 最多 6 小时 | Btrfs 快照恢复 |
| 误删文件 | 2 分钟 | 最多 1 小时 | Snapper undochange |
| 整盘故障 | 30 分钟 | 最多 24 小时 | 远程备份恢复 |
| 服务器被入侵 | 1 小时 | 视情况而定 | 从 flake 全新安装 |
| TOTP 设备丢失 | 15 分钟 | 0 | 控制台访问恢复 |

:::note RTO 和 RPO
**RTO**（恢复时间目标）-- 恢复所需时间。
**RPO**（恢复点目标）-- 最大数据丢失窗口。
:::

## 场景一：nixos-rebuild 出错（服务异常）

**症状**：重建后服务崩溃、应用报错、网络异常。

**检测**：
```bash
# Check for failed services
systemctl --failed

# Check recent rebuild
journalctl -u nixos-rebuild --since "1 hour ago"
```

**恢复方案 A -- Snapper 回滚**：
```bash
# List recent snapshots (find the pre-rebuild snapshot)
sudo snapper -c root list

# Output:
#  # | Type | Pre # | Date                | Description
#  5 | pre  |       | 2024-01-15 10:30:00 | nixos-rebuild switch
#  6 | post |     5 | 2024-01-15 10:32:15 | nixos-rebuild switch (exit: 0)

# Undo changes since snapshot #5
sudo snapper -c root undochange 5..0

# Restart affected services
sudo systemctl daemon-reload
sudo systemctl restart nginx postgresql
```

**恢复方案 B -- NixOS 代际回滚**：
```bash
# List generations
sudo nix-env --list-generations -p /nix/var/nix/profiles/system

# Switch to previous generation
sudo nix-env --switch-generation 41 -p /nix/var/nix/profiles/system
sudo /nix/var/nix/profiles/system/bin/switch-to-configuration switch
```

## 场景二：nixos-rebuild 出错（无法启动）

**症状**：执行 `nixos-rebuild boot` 并重启后服务器无法启动。

**恢复步骤**：

1. 通过 VPS 提供商的 Web 控制台或 KVM 访问服务器
2. 在 GRUB 菜单中选择之前的 NixOS 代际配置（显示为「NixOS - Configuration XX」）
3. 系统将从已知可用的代际启动
4. 修复配置：

```bash
# Check what's different in the current (broken) generation
diff <(nixos-rebuild dry-run 2>&1) <(cat /run/current-system/nixos-version)

# Fix the configuration
vim /etc/nixos/configuration.nix

# Rebuild with the fixed config
safe-rebuild switch
```

:::tip 始终保留 3 个以上的代际配置
确保引导加载器保留多个代际：

```nix
# In configuration.nix
boot.loader.systemd-boot.configurationLimit = 10;
```

这会在启动菜单中保留最近 10 个代际配置。
:::

## 场景三：数据库损坏

**症状**：应用报错、PostgreSQL 无法启动、数据不一致。

**检测**：
```bash
# Check PostgreSQL status
sudo systemctl status postgresql
sudo journalctl -u postgresql --since "1 hour ago"

# Try to connect
sudo -u postgres psql -c "SELECT 1;"
```

**恢复**：
```bash
# List database snapshots
ls -la /.snapshots/@db-*

# Stop PostgreSQL
sudo systemctl stop postgresql

# Move corrupted data aside
sudo mv /var/lib/db /var/lib/db-corrupted-$(date +%Y%m%d-%H%M%S)

# Restore from last known-good snapshot
sudo btrfs subvolume snapshot /.snapshots/@db-20240115-060000 /var/lib/db

# Fix ownership
sudo chown -R postgres:postgres /var/lib/db

# Start PostgreSQL
sudo systemctl start postgresql

# Verify
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_user_tables;"
```

**恢复后操作**：
```bash
# Check for any WAL files that can be replayed for point-in-time recovery
ls -la /var/lib/db/wal-archive/

# If WAL replay is possible:
sudo -u postgres pg_resetwal /var/lib/db/postgresql
```

## 场景四：误删文件

**症状**：文件缺失、配置损坏、用户数据被删除。

**恢复**：
```bash
# Find the file in a recent snapshot
sudo snapper -c root list

# Check if file exists in snapshot #5
ls /.snapshots/5/snapshot/path/to/deleted/file

# Restore a single file
sudo cp /.snapshots/5/snapshot/path/to/deleted/file /path/to/deleted/file

# Or restore an entire directory
sudo cp -a /.snapshots/5/snapshot/etc/nginx/ /etc/nginx/
```

## 场景五：整盘故障

**症状**：I/O 错误、文件系统变为只读、服务器无响应。

**前提条件**：你已通过 `btrfs send/receive` 配置了远程备份（参见[第三章](./btrfs-snapshots)）。

**恢复**：

```bash
# On the NEW replacement server:

# Step 1: Install NixOS via nixos-anywhere (same as initial setup)
nix run github:nix-community/nixos-anywhere -- \
  --flake .#server \
  --target-host root@NEW_SERVER_IP

# Step 2: SSH into the new server
ssh admin@NEW_SERVER_IP

# Step 3: Receive the backup snapshots from the backup server
# Mount the Btrfs partition
sudo mount /dev/sda2 /mnt

# Receive the root snapshot
ssh backup-server "sudo btrfs send /backups/server1/@root-backup-20240115" | \
  sudo btrfs receive /mnt/

# Rename received snapshot to @root
sudo btrfs subvolume delete /mnt/@root
sudo btrfs subvolume snapshot /mnt/@root-backup-20240115 /mnt/@root

# Receive the database snapshot
ssh backup-server "sudo btrfs send /backups/server1/@db-backup-20240115" | \
  sudo btrfs receive /mnt/
sudo btrfs subvolume delete /mnt/@db
sudo btrfs subvolume snapshot /mnt/@db-backup-20240115 /mnt/@db

# Step 4: Unmount and reboot
sudo umount /mnt
sudo reboot
```

## 场景六：服务器被入侵

**症状**：可疑进程、未授权用户、被篡改的二进制文件、异常网络连接。

**应对措施**：

```bash
# IMMEDIATE: Isolate the server
# Via VPS provider: disconnect from network / enable firewall-only mode

# From a CLEAN machine — do NOT trust the compromised server's tools

# Step 1: Snapshot the compromised state (forensics)
# If you still have access:
ssh root@COMPROMISED_IP "btrfs subvolume snapshot -r / /.snapshots/@root-compromised"

# Step 2: Reinstall from scratch using your flake
# This guarantees a clean system — NixOS is declarative
nix run github:nix-community/nixos-anywhere -- \
  --flake .#server \
  --target-host root@SERVER_IP

# Step 3: Restore data from a KNOWN-GOOD backup
# Only restore data, not system files — system comes from the flake
ssh backup-server "sudo btrfs send /backups/server1/@db-backup-KNOWN_GOOD" | \
  ssh root@SERVER_IP "sudo btrfs receive /.snapshots/"

# Step 4: Rotate all credentials
# - SSH keys
# - TOTP secrets
# - API keys
# - Database passwords
# - OpenClaw API key
```

:::danger 不要信任被入侵的系统
入侵发生后，应从你的 flake 重新安装 -- 不要试图「清理」现有系统。NixOS 的声明式特性使这变得可行，因为整个系统状态都定义在代码中。只从备份恢复**数据**，不恢复系统文件。
:::

## 场景七：TOTP 设备丢失

**症状**：无法通过 sudo 认证，被锁定在管理命令之外。

**恢复步骤**：

1. 通过 VPS 提供商的控制台访问服务器（Web 控制台 / KVM / IPMI）
2. 进入救援系统或单用户模式
3. 挂载并编辑 TOTP 配置：

```bash
# Mount the root filesystem
mount /dev/sda2 /mnt -o subvol=@root

# Option A: Remove TOTP requirement temporarily
# Edit the PAM config to comment out pam_oath
vim /mnt/etc/pam.d/sudo

# Option B: Replace the TOTP secret
# Generate new secret
NEW_SECRET=$(head -c 20 /dev/urandom | base32 | tr -d '=' | head -c 32)
echo "HOTP/T30/6 admin - $NEW_SECRET" > /mnt/etc/users.oath
chmod 600 /mnt/etc/users.oath

# Unmount and reboot
umount /mnt
reboot
```

4. 重启后，在新设备上注册新的 TOTP 密钥
5. 重建 NixOS 以恢复正确的 PAM 配置

## 恢复后检查清单

每次恢复后使用此清单进行验证：

```
□ 系统启动且所有服务运行正常
  systemctl --failed  (应显示 0 个单元)

□ 数据完整性已验证
  sudo -u postgres psql -c "SELECT count(*) FROM critical_table;"

□ 快照正在正常创建
  sudo snapper -c root list  (确认有最近的时间线条目)

□ OpenClaw 运行正常
  sudo systemctl status openclaw

□ TOTP 认证正常工作
  sudo echo "test"  (应提示输入 TOTP)

□ 远程备份已恢复
  检查备份定时器: systemctl status btrfs-backup.timer

□ 监控和告警正常运行
  检查指标端点: curl localhost:9101/metrics

□ 根因已记录
  发生了什么、为什么、如何修复、如何防止再次发生
```

## 备份验证计划

| 检查项 | 频率 | 方法 |
|---|---|---|
| Snapper 正在创建快照 | 每日 | `snapper -c root list \| tail -5` |
| 远程备份正在运行 | 每日 | `systemctl status btrfs-backup.timer` |
| 备份可以成功恢复 | 每月 | 测试恢复到临时子卷 |
| 完整灾难恢复 | 每季度 | 从备份恢复到测试服务器 |
| TOTP 恢复路径可用 | 每季度 | 测试控制台访问 + TOTP 重置 |

:::warning 测试你的操作手册
未经测试的灾难恢复计划只是文档。定期安排季度 DR 演练，实际从备份恢复到测试服务器。根据演练中发现的问题更新本手册。
:::

## 下一步

我们已经覆盖了所有故障模式的恢复方案。最后一章将通过 [AI 安全与回滚工作流](./ai-safety-and-rollback)将所有内容整合 -- 这是日常 AI 管理基础设施的操作规程。
