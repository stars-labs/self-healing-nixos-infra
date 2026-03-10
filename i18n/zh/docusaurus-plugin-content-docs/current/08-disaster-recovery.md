---
sidebar_position: 10
title: 灾难恢复
---

# 灾难恢复

本章是运行手册。它涵盖每种主要故障场景、检测方法和逐步恢复程序。打印此页面并将其放在可访问的地方 — 当事情出错时您会需要它。

## 恢复矩阵

| 场景 | RTO | RPO | 方法 |
|---|---|---|---|
| 错误的 nixos-rebuild（服务损坏）| 2 分钟 | 0 | Snapper 回滚或 NixOS 代数 |
| 错误的 nixos-rebuild（无法启动）| 5 分钟 | 0 | GRUB 之前的代数 |
| 数据库损坏 | 10 分钟 | 最多 6 小时 | Btrfs 快照恢复 |
| 意外文件删除 | 2 分钟 | 最多 1 小时 | Snapper undochange |
| 完全磁盘故障 | 30 分钟 | 最多 24 小时 | 远程备份恢复 |
| 服务器被攻陷 | 1 小时 | 可变 | 从 flake 全新安装 |
| 丢失 TOTP 设备 | 15 分钟 | 0 | 控制台访问恢复 |

:::note RTO 和 RPO
**RTO**（恢复时间目标）— 恢复需要多长时间。
**RPO**（恢复点目标）— 最大数据丢失窗口。
:::

## 场景 1：错误的 nixos-rebuild（服务损坏）

**症状**：重建后服务崩溃、应用程序错误、网络问题。

**检测**：
```bash
# 检查失败的服务
systemctl --failed

# 检查最近的重建
journalctl -u nixos-rebuild --since "1 hour ago"
```

**恢复选项 A — Snapper 回滚**：
```bash
# 列出最近的快照（找到重建前的快照）
sudo snapper -c root list

# 输出：
#  # | Type | Pre # | Date                | Description
#  5 | pre  |       | 2024-01-15 10:30:00 | nixos-rebuild switch
#  6 | post |     5 | 2024-01-15 10:32:15 | nixos-rebuild switch (exit: 0)

# 撤销快照 #5 以来的更改
sudo snapper -c root undochange 5..0

# 重启受影响的服务
sudo systemctl daemon-reload
sudo systemctl restart nginx postgresql
```

**恢复选项 B — NixOS 代数回滚**：
```bash
# 列出代数
sudo nix-env --list-generations -p /nix/var/nix/profiles/system

# 切换到之前的代数
sudo nix-env --switch-generation 41 -p /nix/var/nix/profiles/system
sudo /nix/var/nix/profiles/system/bin/switch-to-configuration switch
```

## 场景 2：错误的 nixos-rebuild（无法启动）

**症状**：`nixos-rebuild boot` + 重启后服务器无法恢复。

**恢复**：

1. 通过 VPS 提供商的 web 控制台或 KVM 访问服务器控制台
2. 在 GRUB 菜单中，选择之前的 NixOS 代数（列为 "NixOS - Configuration XX"）
3. 系统启动到已知良好的代数
4. 修复配置：

```bash
# 检查当前（损坏）代数中有什么不同

diff <(nixos-rebuild dry-run 2>&1) <(cat /run/current-system/nixos-version)

# 修复配置
vim /etc/nixos/configuration.nix

# 用修复后的配置重建
safe-rebuild switch
```

:::tip 始终保留 3+ 代数
确保您的引导加载程序保留多个代数：

```nix
# 在 configuration.nix 中
boot.loader.systemd-boot.configurationLimit = 10;
```

这会在启动菜单中保留最后 10 个代数。
:::

## 场景 3：数据库损坏

**症状**：应用程序错误、PostgreSQL 无法启动、数据不一致。

**检测**：
```bash
# 检查 PostgreSQL 状态
sudo systemctl status postgresql
sudo journalctl -u postgresql --since "1 hour ago"

# 尝试连接
sudo -u postgres psql -c "SELECT 1;"
```

**恢复**：
```bash
# 列出数据库快照
ls -la /.snapshots/@db-*

# 停止 PostgreSQL
sudo systemctl stop postgresql

# 将损坏的数据移开
sudo mv /var/lib/db /var/lib/db-corrupted-$(date +%Y%m%d-%H%M%S)

# 从最后一个已知良好的快照恢复
sudo btrfs subvolume snapshot /.snapshots/@db-20240115-060000 /var/lib/db

# 修复所有权
sudo chown -R postgres:postgres /var/lib/db

# 启动 PostgreSQL
sudo systemctl start postgresql

# 验证
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_user_tables;"
```

**恢复后**：
```bash
# 检查是否有可以重放的 WAL 文件以进行时间点恢复
ls -la /var/lib/db/wal-archive/

# 如果可以 WAL 重放：
sudo -u postgres pg_resetwal /var/lib/db/postgresql
```

## 场景 4：意外文件删除

**症状**：文件丢失、配置损坏、用户数据删除。

**恢复**：
```bash
# 在最近的快照中找到文件
sudo snapper -c root list

# 检查文件是否在快照 #5 中存在
ls /.snapshots/5/snapshot/path/to/deleted/file

# 恢复单个文件
sudo cp /.snapshots/5/snapshot/path/to/deleted/file /path/to/deleted/file

# 或恢复整个目录
sudo cp -a /.snapshots/5/snapshot/etc/nginx/ /etc/nginx/
```

## 场景 5：完全磁盘故障

**症状**：I/O 错误、文件系统只读、服务器无响应。

**前提条件**：您有通过 `btrfs send/receive` 配置的远程备份（在[第 3 章](./btrfs-snapshots)中配置）。

**恢复**：

```bash
# 在新的替换服务器上：

# 步骤 1：通过 nixos-anywhere 安装 NixOS（与初始设置相同）
nix run github:nix-community/nixos-anywhere -- \
  --flake .#server \
  --target-host root@NEW_SERVER_IP

# 步骤 2：SSH 到新服务器
ssh admin@NEW_SERVER_IP

# 步骤 3：从备份服务器接收备份快照
# 挂载 Btrfs 分区
sudo mount /dev/sda2 /mnt

# 接收根快照
ssh backup-server "sudo btrfs send /backups/server1/@root-backup-20240115" | \
  sudo btrfs receive /mnt/

# 将接收的快照重命名为 @root
sudo btrfs subvolume delete /mnt/@root
sudo btrfs subvolume snapshot /mnt/@root-backup-20240115 /mnt/@root

# 接收数据库快照
ssh backup-server "sudo btrfs send /backups/server1/@db-backup-20240115" | \
  sudo btrfs receive /mnt/
sudo btrfs subvolume delete /mnt/@db
sudo btrfs subvolume snapshot /mnt/@db-backup-20240115 /mnt/@db

# 步骤 4：卸载并重启
sudo umount /mnt
sudo reboot
```

## 场景 6：服务器被攻陷

**症状**：可疑进程、未授权用户、修改的二进制文件、意外网络连接。

**响应**：

```bash
# 立即：隔离服务器
# 通过 VPS 提供商：断开网络 / 启用仅防火墙模式

# 从干净的机器 — 不要信任被攻陷服务器的工具

# 步骤 1：快照被攻陷的状态（取证）
# 如果您仍有访问权限：
ssh root@COMPROMISED_IP "btrfs subvolume snapshot -r / /.snapshots/@root-compromised"

# 步骤 2：从头重新安装使用您的 flake
# 这保证了一个干净的系统 — NixOS 是声明式的
nix run github:nix-community/nixos-anywhere -- \
  --flake .#server \
  --target-host root@SERVER_IP

# 步骤 3：从已知良好的备份恢复数据
# 只恢复数据，不恢复系统文件 — 系统来自 flake
ssh backup-server "sudo btrfs send /backups/server1/@db-backup-KNOWN_GOOD" | \
  ssh root@SERVER_IP "sudo btrfs receive /.snapshots/"

# 步骤 4：轮换所有凭据
# - SSH 密钥
# - TOTP 密钥
# - API 密钥
# - 数据库密码
# - OpenClaw API 密钥
```

:::danger 不要信任被攻陷的系统
被攻陷后，从您的 flake 重新安装 — 不要尝试"清理"现有系统。NixOS 使这变得实用，因为整个系统状态都在代码中定义。只从备份恢复**数据**，而不是系统文件。
:::

## 场景 7：丢失 TOTP 设备

**症状**：无法通过 sudo 身份验证，被锁定在管理命令之外。

**恢复**：

1. 通过 VPS 提供商访问服务器控制台（web 控制台 / KVM / IPMI）
2. 启动进入救援系统或单用户模式
3. 挂载并编辑 TOTP 配置：

```bash
# 挂载根文件系统
mount /dev/sda2 /mnt -o subvol=@root

# 选项 A：临时移除 TOTP 要求
# 编辑 PAM 配置以注释掉 pam_oath
vim /mnt/etc/pam.d/sudo

# 选项 B：替换 TOTP 密钥
# 生成新密钥
NEW_SECRET=$(head -c 20 /dev/urandom | base32 | tr -d '=' | head -c 32)
echo "HOTP/T30/6 admin - $NEW_SECRET" > /mnt/etc/users.oath
chmod 600 /mnt/etc/users.oath

# 卸载并重启
umount /mnt
reboot
```

4. 重启后，在您的新设备上注册新的 TOTP 密钥
5. 重建 NixOS 以恢复正确的 PAM 配置

## 恢复检查清单

在任何恢复后使用此检查清单：

```
□ 系统启动且所有服务正在运行
  systemctl --failed  （应显示 0 个单元）

□ 数据完整性已验证
  sudo -u postgres psql -c "SELECT count(*) FROM critical_table;"

□ 快照正在再次拍摄
  sudo snapper -c root list  （验证最近的 timeline 条目）

□ OpenClaw 正在运行
  sudo systemctl status openclaw

□ TOTP 身份验证有效
  sudo echo "test"  （应提示输入 TOTP）

□ 远程备份已恢复
  检查备份定时器：systemctl status btrfs-backup.timer

□ 监控和警报处于活动状态
  检查指标端点：curl localhost:9101/metrics

□ 已记录根本原因
  发生了什么、为什么、如何修复、如何防止再次发生
```

## 备份验证计划

| 检查 | 频率 | 方法 |
|---|---|---|
| Snapper 正在创建快照 | 每天 | `snapper -c root list \| tail -5` |
| 远程备份正在运行 | 每天 | `systemctl status btrfs-backup.timer` |
| 备份可以恢复 | 每月 | 测试恢复到临时子卷 |
| 完全灾难恢复 | 每季度 | 从备份恢复到测试服务器 |
| TOTP 恢复路径有效 | 每季度 | 测试控制台访问 + TOTP 重置 |

:::warning 测试您的运行手册
未经测试的灾难恢复计划只是文档。安排每季度的 DR 演练，实际从备份恢复到测试服务器。在演练中发现的问题更新此运行手册。
:::

## 下一步

我们已经涵盖了每种故障模式的恢复。最后一章将所有内容整合在一起，介绍 [AI 安全和回滚工作流](./ai-safety-and-rollback) — 日常 AI 管理基础设施的操作程序。
