---
sidebar_position: 5
title: Btrfs 快照与 Snapper
---

# Btrfs 快照与 Snapper

快照是回滚策略的核心。本章涵盖手动快照、使用 Snapper 的自动化管理，以及确保每个系统变更都有恢复点的预重建钩子。

## 快照基础

Btrfs 快照是子卷的即时、空间高效副本。它使用写时复制 — 创建时，不复制任何数据。只有当原始文件和快照之间的文件发生分歧时，才消耗空间。

```
时间 T0：创建快照
┌────────────────────┐    ┌────────────────────┐
│    @root (活动)    │    │  @root-snap-T0     │
│                    │    │                    │
│  两者都通过 COW 引用指向相同的底层数据块        │
└────────────────────┘    └────────────────────┘

时间 T1：修改 @root 中的文件
┌────────────────────┐    ┌────────────────────┐
│    @root (活动)    │    │  @root-snap-T0     │
│  [修改的块]──────────┼──>│  [原始块]──────────┼─>│
│  [共享块]───────────┼────┼──[共享块]          │  │
└────────────────────┘    └────────────────────┘
只有更改的块消耗额外空间。
```

### 只读 vs 读写快照

| 类型 | 用例 |
|---|---|
| 只读 (`-r`) | 备份、远程 send/receive、归档 |
| 读写 | 回滚目标（您将启动进入其中）|

```bash
# 只读快照（用于备份）
sudo btrfs subvolume snapshot -r / /.snapshots/@root-backup

# 读写快照（用于回滚）
sudo btrfs subvolume snapshot / /.snapshots/@root-rollback
```

## 手动快照

在执行任何有风险的操作之前，手动拍摄快照：

```bash
# 变更前快照根目录
sudo btrfs subvolume snapshot / /.snapshots/@root-$(date +%Y%m%d-%H%M%S)

# 迁移前快照数据库
sudo btrfs subvolume snapshot /var/lib/db /.snapshots/@db-pre-migration

# 列出所有快照
sudo btrfs subvolume list -s /
```

## NixOS 上的 Snapper

Snapper 自动化快照创建、基于时间线的清理和变更前/后配对。NixOS 有原生 Snapper 集成。

### NixOS 模块配置

```nix title="configuration.nix"
{ config, pkgs, ... }:
{
  # 启用 Snapper
  services.snapper = {
    snapshotInterval = "hourly";
    cleanupInterval = "1d";

    configs = {
      # 根文件系统快照
      root = {
        SUBVOLUME = "/";
        ALLOW_USERS = [ "admin" ];
        TIMELINE_CREATE = true;
        TIMELINE_CLEANUP = true;

        # 保留策略
        TIMELINE_MIN_AGE = "1800";       # 30 分钟
        TIMELINE_LIMIT_HOURLY = "24";    # 保留 24 个每小时
        TIMELINE_LIMIT_DAILY = "7";      # 保留 7 个每天
        TIMELINE_LIMIT_WEEKLY = "4";     # 保留 4 个每周
        TIMELINE_LIMIT_MONTHLY = "6";    # 保留 6 个每月
        TIMELINE_LIMIT_YEARLY = "1";     # 保留 1 个每年
      };

      # 主目录快照
      home = {
        SUBVOLUME = "/home";
        ALLOW_USERS = [ "admin" ];
        TIMELINE_CREATE = true;
        TIMELINE_CLEANUP = true;

        TIMELINE_LIMIT_HOURLY = "12";
        TIMELINE_LIMIT_DAILY = "7";
        TIMELINE_LIMIT_WEEKLY = "4";
        TIMELINE_LIMIT_MONTHLY = "3";
        TIMELINE_LIMIT_YEARLY = "0";
      };

      # 数据库快照（更频繁）
      db = {
        SUBVOLUME = "/var/lib/db";
        ALLOW_USERS = [ "admin" ];
        TIMELINE_CREATE = true;
        TIMELINE_CLEANUP = true;

        TIMELINE_LIMIT_HOURLY = "48";    # 2 天的每小时
        TIMELINE_LIMIT_DAILY = "14";     # 2 周的每天
        TIMELINE_LIMIT_WEEKLY = "8";     # 2 月的每周
        TIMELINE_LIMIT_MONTHLY = "6";
        TIMELINE_LIMIT_YEARLY = "0";
      };
    };
  };

  # 确保 snapper 目录存在
  systemd.tmpfiles.rules = [
    "d /.snapshots 0750 root root -"
  ];
}
```

### 验证 Snapper 正在运行

```bash
# 检查 snapper 配置
sudo snapper list-configs

# 输出：
# Config | Subvolume
# -------+----------
# root   | /
# home   | /home
# db     | /var/lib/db

# 列出根配置的快照
sudo snapper -c root list

# 检查 snapper 定时器
systemctl status snapper-timeline.timer
systemctl status snapper-cleanup.timer
```

## 预重建快照钩子

最关键的快照发生在 `nixos-rebuild` 之前。创建一个包装脚本，确保每次重建前都拍摄快照：

```nix title="modules/safe-rebuild.nix"
{ config, pkgs, lib, ... }:
let
  safeRebuild = pkgs.writeShellScriptBin "safe-rebuild" ''
    set -euo pipefail

    ACTION="''${1:-switch}"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    SNAP_DESC="nixos-rebuild $ACTION"

    echo "=== Safe NixOS Rebuild ==="
    echo "Action: $ACTION"
    echo "Time:   $TIMESTAMP"
    echo ""

    # 步骤 1：创建预重建快照
    echo "[1/4] Creating pre-rebuild snapshots..."
    sudo snapper -c root create \
      --type pre \
      --description "$SNAP_DESC" \
      --print-number > /tmp/snap-root-num

    ROOT_SNAP=$(cat /tmp/snap-root-num)
    echo "       Root snapshot: #$ROOT_SNAP"

    # 步骤 2：运行 nixos-rebuild
    echo "[2/4] Running nixos-rebuild $ACTION..."
    if sudo nixos-rebuild "$ACTION" "''${@:2}"; then
      REBUILD_STATUS=0
      echo "[3/4] Rebuild succeeded."
    else
      REBUILD_STATUS=$?
      echo "[3/4] Rebuild FAILED with exit code $REBUILD_STATUS"
    fi

    # 步骤 3：创建重建后快照
    echo "[4/4] Creating post-rebuild snapshot..."
    sudo snapper -c root create \
      --type post \
      --pre-number "$ROOT_SNAP" \
      --description "$SNAP_DESC (exit: $REBUILD_STATUS)"

    # 步骤 4：报告
    if [ $REBUILD_STATUS -ne 0 ]; then
      echo ""
      echo "╔══════════════════════════════════════════╗"
      echo "║  REBUILD FAILED — Rollback available     ║"
      echo "║                                          ║"
      echo "║  To rollback:                            ║"
      echo "║  sudo snapper -c root undochange         ║"
      echo "║         $ROOT_SNAP..0                    ║"
      echo "║                                          ║"
      echo "║  Or reboot into previous generation:     ║"
      echo "║  sudo reboot (select older entry in GRUB)║"
      echo "╚══════════════════════════════════════════╝"
      exit $REBUILD_STATUS
    fi

    echo ""
    echo "Rebuild complete. Snapshot #$ROOT_SNAP saved as restore point."
  '';
in
{
  environment.systemPackages = [ safeRebuild ];
}
```

用法：

```bash
# 而不是：sudo nixos-rebuild switch
safe-rebuild switch

# 带额外标志：
safe-rebuild switch --flake /etc/nixos#server

# Boot（用于下次重启）：
safe-rebuild boot
```

## 列出和比较快照

```bash
# 列出所有根快照
sudo snapper -c root list

# 输出：
#  # | Type   | Pre # | Date                | User | Cleanup  | Description
# ---+--------+-------+---------------------+------+----------+------------------
#  0 | single |       |                     | root |          | current
#  1 | pre    |       | 2024-01-15 10:30:00 | root |          | nixos-rebuild switch
#  2 | post   |     1 | 2024-01-15 10:32:15 | root |          | nixos-rebuild switch (exit: 0)
#  3 | single |       | 2024-01-15 11:00:00 | root | timeline | timeline

# 显示两个快照之间发生了什么变化
sudo snapper -c root status 1..2

# 显示特定文件在快照之间的差异
sudo snapper -c root diff 1..2 /etc/nixos/configuration.nix
```

## 回滚流程

### 方法 1：Snapper Undochange（在线）

在不重启的情况下还原两个快照之间更改的文件：

```bash
# 撤销快照 1（预）和当前状态之间所做的更改
sudo snapper -c root undochange 1..0
```

:::warning Undochange 限制
`snapper undochange` 单独替换文件。它适用于配置回滚，但可能无法优雅地处理运行中的服务。要进行干净的回滚，请使用方法 2 或 3。
:::

### 方法 2：子卷交换（完整回滚）

用快照替换活动根：

```bash
# 1. 启动进入救援系统或使用快照作为临时根

# 2. 直接挂载 Btrfs 分区
sudo mount /dev/sda2 /mnt

# 3. 将损坏的根移开
sudo mv /mnt/@root /mnt/@root-broken

# 4. 从已知良好的快照创建读写快照
sudo btrfs subvolume snapshot /mnt/@snapshots/root/1/snapshot /mnt/@root

# 5. 卸载并重启
sudo umount /mnt
sudo reboot
```

### 方法 3：NixOS 代数（启动级）

NixOS 将之前的系统配置保留为引导加载程序条目：

```bash
# 列出可用的代数
sudo nix-env --list-generations -p /nix/var/nix/profiles/system

# 切换到之前的代数
sudo nix-env --switch-generation 42 -p /nix/var/nix/profiles/system
sudo /nix/var/nix/profiles/system/bin/switch-to-configuration switch

# 或者简单地重启并从 GRUB 菜单选择之前的代数
```

:::tip 双保险
NixOS 代数和 Btrfs 快照相互补充：
- **NixOS 代数** 回滚*系统配置*（包、服务、启动）
- **Btrfs 快照** 回滚*文件系统状态*（数据、数据库、Nix 管理之外的配置）

为最大可恢复性，两者都使用。
:::

## 使用 Send/Receive 远程备份

将快照流式传输到远程备份服务器：

```bash
# 创建只读快照
sudo btrfs subvolume snapshot -r / /.snapshots/@root-backup-$(date +%Y%m%d)

# 发送到远程服务器（首次 — 完整发送）
sudo btrfs send /.snapshots/@root-backup-20240115 | \
  ssh backup-server "sudo btrfs receive /backups/server1/"

# 增量发送（后续备份 — 仅发送更改）
sudo btrfs send -p /.snapshots/@root-backup-20240115 \
  /.snapshots/@root-backup-20240116 | \
  ssh backup-server "sudo btrfs receive /backups/server1/"
```

### 自动化备份脚本

```nix title="modules/btrfs-backup.nix"
{ config, pkgs, ... }:
let
  btrfsBackup = pkgs.writeShellScriptBin "btrfs-backup" ''
    set -euo pipefail

    REMOTE="backup-server"
    REMOTE_PATH="/backups/$(hostname)"
    LOCAL_SNAPS="/.snapshots"
    TODAY=$(date +%Y%m%d)

    # 创建只读快照
    sudo btrfs subvolume snapshot -r / "$LOCAL_SNAPS/@root-backup-$TODAY"

    # 找到昨天的快照用于增量发送
    YESTERDAY=$(date -d yesterday +%Y%m%d)
    if [ -d "$LOCAL_SNAPS/@root-backup-$YESTERDAY" ]; then
      echo "Incremental send (parent: $YESTERDAY)..."
      sudo btrfs send -p "$LOCAL_SNAPS/@root-backup-$YESTERDAY" \
        "$LOCAL_SNAPS/@root-backup-$TODAY" | \
        ssh "$REMOTE" "sudo btrfs receive $REMOTE_PATH/"
    else
      echo "Full send..."
      sudo btrfs send "$LOCAL_SNAPS/@root-backup-$TODAY" | \
        ssh "$REMOTE" "sudo btrfs receive $REMOTE_PATH/"
    fi

    echo "Backup complete: @root-backup-$TODAY -> $REMOTE:$REMOTE_PATH"
  '';
in
{
  environment.systemPackages = [ btrfsBackup ];

  # 每日备份定时器
  systemd.services.btrfs-backup = {
    description = "Btrfs snapshot backup to remote";
    serviceConfig = {
      Type = "oneshot";
      ExecStart = "${btrfsBackup}/bin/btrfs-backup";
    };
  };

  systemd.timers.btrfs-backup = {
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "daily";
      Persistent = true;
      RandomizedDelaySec = "1h";
    };
  };
}
```

## 监控快照空间

如果不清理，快照可能会消耗大量空间。监控使用情况：

```bash
# 检查整体文件系统使用
sudo btrfs filesystem usage /

# 检查快照消耗了多少空间
sudo btrfs filesystem du -s /.snapshots/

# 检查独占空间（删除时将释放的空间）
sudo btrfs qgroup show -reF /
```

:::danger 不要让快照填满磁盘
满的 Btrfs 文件系统可能无法挂载。设置监控：

```bash
# 简单检查脚本 — 如果使用率超过 85% 则警报
USAGE=$(sudo btrfs filesystem usage / | grep "Used:" | awk '{print $2}' | tr -d '%')
if [ "$USAGE" -gt 85 ]; then
  echo "WARNING: Btrfs usage at ${USAGE}%"
  # 在此触发警报
fi
```

NixOS 配置中的 snapper 清理策略会自动删除旧的 timeline 快照，但始终进行监控。
:::

## 下一步

快照已配置和自动化。接下来，我们将安装 [OpenClaw](./install-openclaw)，这个 AI 运维代理将在管理基础设施变更的同时使用这些快照作为安全网。
