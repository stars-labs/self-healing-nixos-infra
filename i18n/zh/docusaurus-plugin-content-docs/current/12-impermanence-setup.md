---
sidebar_position: 12
title: Impermanence 设置
---

# Impermanence —— "擦除您的挚爱"

Impermanence 确保您的 NixOS 根文件系统在**每次启动时都被彻底清除**。只有被明确声明持久化的状态才会保留。这消除了配置漂移，确保了可重现性，并使系统真正实现声明式管理。

## 为什么需要 Impermanence？

如果没有 Impermanence，状态会随着时间推移在 `/etc`、`/var`、`/tmp` 等位置不断积累。运行中的系统会逐渐偏离 NixOS 配置中声明的状态。这正是在基础设施层面导致"在我机器上能跑"问题的根源。

```mermaid
flowchart TB
    subgraph Without["未使用 Impermanence"]
        direction TB
        A1[第 1 次启动] --> A2[/etc 中产生配置漂移]
        A2 --> A3[/var 中残留陈旧状态]
        A3 --> A4[第 100 次启动：雪花服务器]
    end

    subgraph With["使用 Impermanence"]
        direction TB
        B1[第 1 次启动] --> B2[根目录被彻底清除]
        B2 --> B3[仅存在已声明的状态]
        B3 --> B4[第 100 次启动：与第 1 次完全一致]
    end
```

### 对 OpenClaw 的好处

- **可预测的基线**：每次重启都为 OpenClaw 提供一个已知良好的初始状态
- **无隐藏状态**：如果不在 Nix 配置中，重启后它就不存在
- **更安全的回滚**：回滚 NixOS 代次的同时也会回滚文件系统状态
- **漂移检测**：根目录上任何意外文件都保证是本次启动期间产生的

## 工作原理

每次启动时：

1. 根子卷（`@root`）被**删除并重新创建**为一个空的 Btrfs 子卷
2. NixOS 激活新的代次，从 Nix store 填充 `/`
3. 绑定挂载从 `/persist` 恢复**已明确声明持久化的**目录和文件

```mermaid
flowchart LR
    A[启动] --> B[删除 root 子卷]
    B --> C[创建空 root 子卷]
    C --> D[NixOS 激活]
    D --> E[挂载 /persist 绑定]
    E --> F[系统就绪]
```

## 前置条件

本章假设您已经具备：
- 来自[第 2 章](./btrfs-layout)的 Btrfs 文件系统及子卷布局
- 一个 `/persist` 挂载点（我们将使用 `@home` 子卷或创建一个专用的 `@persist`）

## NixOS 配置

### 第 1 步：添加 Impermanence Flake 输入

```nix title="flake.nix"
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    disko.url = "github:nix-community/disko";
    impermanence.url = "github:nix-community/impermanence";
  };

  outputs = { self, nixpkgs, disko, impermanence, ... }: {
    nixosConfigurations.myserver = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        disko.nixosModules.disko
        impermanence.nixosModules.impermanence
        ./configuration.nix
        ./impermanence.nix
      ];
    };
  };
}
```

### 第 2 步：启动时根目录清除脚本

此脚本在启动过程的早期运行，用于清除并重新创建根子卷。

```nix title="impermanence.nix"
{ config, lib, pkgs, ... }:

{
  # 每次启动时清除根目录
  boot.initrd.postDeviceCommands = lib.mkAfter ''
    mkdir -p /mnt
    mount -t btrfs -o subvol=/ /dev/disk/by-partlabel/nixos /mnt

    # 删除旧的根子卷
    if [ -d /mnt/@root ]; then
      btrfs subvolume delete /mnt/@root
    fi

    # 创建新的根子卷
    btrfs subvolume create /mnt/@root

    umount /mnt
  '';

  # 持久化目录 —— 所有需要在重启后保留的状态
  fileSystems."/persist" = {
    device = "/dev/disk/by-partlabel/nixos";
    fsType = "btrfs";
    options = [ "subvol=@persist" "compress=zstd:1" "noatime" ];
    neededForBoot = true;
  };

  # Impermanence：声明需要持久化的内容
  environment.persistence."/persist" = {
    hideMounts = true;

    # 需要在重启后保留的系统目录
    directories = [
      "/etc/nixos"                    # NixOS 配置
      "/var/lib/systemd"              # systemd 状态（定时器、日志游标）
      "/var/lib/nixos"                # NixOS 状态（uid/gid 映射）
      "/var/lib/openclaw"             # OpenClaw 状态和审计日志
      "/var/lib/prometheus2"          # Prometheus 数据
      "/var/lib/grafana"              # Grafana 仪表盘和配置
      "/var/lib/loki"                 # Loki 日志数据
      "/var/lib/snapper"              # Snapper 元数据
      "/var/lib/private"              # DynamicUser 服务的私有状态
      "/var/log"                      # 日志（同时在 @log 子卷上）
    ];

    # 需要在重启后保留的系统文件
    files = [
      "/etc/machine-id"              # 唯一机器标识符
      "/etc/users.oath"              # TOTP 密钥
    ];

    # 按用户持久化
    users.admin = {
      directories = [
        ".ssh"                        # SSH 密钥和 known_hosts
        ".local/share/nix"            # Nix REPL 历史记录
      ];
      files = [
        ".bash_history"
      ];
    };
  };

  # 确保在 disko 配置中创建 /persist
  # 如果使用第 1 章的 disko 布局，请添加 @persist 子卷：
  # disko.devices.disk.main.content.partitions.root.content.subvolumes."@persist" = {
  #   mountpoint = "/persist";
  #   mountOptions = [ "compress=zstd:1" "noatime" ];
  # };
}
```

### 第 3 步：更新 Disko 配置

将 `@persist` 子卷添加到[第 1 章](./bootstrap-nixos-anywhere)中的 disko 配置。

```nix title="disk-config.nix (additions)"
# 添加到现有 disko 配置的 subvolumes 部分：
"@persist" = {
  mountpoint = "/persist";
  mountOptions = [ "compress=zstd:1" "noatime" ];
};
```

## 需要持久化的内容

### 核心系统状态

| 路径 | 原因 |
|---|---|
| `/etc/nixos` | NixOS 配置文件 |
| `/etc/machine-id` | systemd 需要稳定的 machine-id |
| `/etc/users.oath` | 用于 sudo 认证的 TOTP 密钥 |
| `/var/lib/systemd` | 定时器状态、日志游标 |
| `/var/lib/nixos` | UID/GID 分配映射 |
| `/var/log` | 日志必须保留以便调试 |

### 服务状态

| 路径 | 原因 |
|---|---|
| `/var/lib/openclaw` | AI 运维代理状态、审计跟踪、提案 |
| `/var/lib/prometheus2` | 指标时序数据 |
| `/var/lib/grafana` | 仪表盘和告警配置 |
| `/var/lib/loki` | 聚合日志数据 |
| `/var/lib/snapper` | 快照元数据和配置 |
| `/var/lib/postgresql` | 数据库（同时在 @db 子卷上） |

### 不应持久化的内容

以下内容会在重启时被有意清除：

- `/tmp` —— 临时文件
- `/var/cache` —— 从 Nix store 重建
- `/var/tmp` —— 临时存储
- `/root` —— Root 用户的主目录（请使用 admin 用户代替）
- `/etc` 中未明确列出的内容 —— 由 NixOS 激活过程重新生成

## OpenClaw 集成

OpenClaw 可以从 Impermanence 中获得多方面的好处：

```nix title="openclaw-impermanence.nix"
{ config, ... }:

{
  # OpenClaw 状态必须在重启后保留
  environment.persistence."/persist".directories = [
    {
      directory = "/var/lib/openclaw";
      user = "openclaw";
      group = "openclaw";
      mode = "0750";
    }
  ];

  # OpenClaw 可以检测根目录上的意外状态
  services.openclaw.settings.monitoring.impermanence = {
    enable = true;
    # 在这些路径中出现意外文件时发出告警
    watchPaths = [ "/etc" "/var/lib" "/opt" ];
    # 忽略已知的临时路径
    ignorePaths = [ "/etc/resolv.conf" "/etc/mtab" ];
  };
}
```

## 验证

重建并重启后：

```bash
# 验证根目录是一个全新的子卷
sudo btrfs subvolume show /
# 应显示一个最近的创建时间（本次启动）

# 验证 persist 挂载
findmnt /persist
# 应显示 @persist 子卷

# 验证持久化的状态存在
ls /persist/etc/nixos/
ls /persist/var/lib/openclaw/

# 验证符号链接正常工作
ls -la /etc/machine-id
# 应显示来自 /persist 的绑定挂载

# 在根目录创建一个测试文件并重启
echo "test" > /tmp/impermanence-test
# 重启后：
ls /tmp/impermanence-test  # 应该不存在
```

## 故障排除

### 启用 Impermanence 后系统无法启动

**原因**：遗漏了关键的持久化路径（例如 `/var/lib/nixos` 或 `/etc/machine-id`）。

**修复方法**：在 GRUB 中从上一个 NixOS 代次启动，将缺失的路径添加到持久化配置中，然后重新构建。

### 重启后 SSH 主机密钥发生变化

**原因**：`/etc/ssh/` 中的 SSH 主机密钥未被持久化。

**修复方法**：
```nix
environment.persistence."/persist".files = [
  "/etc/ssh/ssh_host_ed25519_key"
  "/etc/ssh/ssh_host_ed25519_key.pub"
  "/etc/ssh/ssh_host_rsa_key"
  "/etc/ssh/ssh_host_rsa_key.pub"
];
```

### 重启后服务丢失状态

**原因**：服务的状态目录未包含在持久化配置中。

**修复方法**：将服务的状态目录添加到 `environment.persistence."/persist".directories` 中。检查服务 systemd 单元中的 `StateDirectory`。

```bash
# 查找服务的状态目录
systemctl show <service> -p StateDirectory
```

### NetworkManager 或 WiFi 配置丢失

**原因**：`/etc/NetworkManager/` 中的网络配置未被持久化。

**修复方法**：
```nix
environment.persistence."/persist".directories = [
  "/etc/NetworkManager/system-connections"
];
```

:::warning 从保守配置开始
首次启用 Impermanence 时，请从最小的持久化列表开始，然后根据发现的问题逐步扩展。每个缺失的路径都是了解系统实际需要哪些状态的学习机会。
:::

:::tip Impermanence + OpenClaw = 无漂移运维
有了 Impermanence，OpenClaw 再也不需要猜测"这个文件应该在这里吗？"如果一个文件存在于根目录上，且不在 Nix 配置或持久化列表中，那么它一定是在本次启动期间创建的——这使得异常检测变得非常简单。
:::
