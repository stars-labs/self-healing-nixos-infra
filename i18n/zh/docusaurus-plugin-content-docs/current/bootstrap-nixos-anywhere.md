---
sidebar_position: 3
title: 使用 nixos-anywhere 引导
---

# 使用 nixos-anywhere 引导

`nixos-anywhere` 允许您在任何具有 root SSH 访问权限的 Linux 服务器上安装 NixOS — 无需 ISO 镜像，无需控制台访问，无需特定供应商的工具。它通过 kexec 进入 RAM 中的 NixOS 安装程序，对磁盘进行分区，然后安装您声明的配置。

## 工作原理

```
┌─────────────────┐     SSH      ┌─────────────────────────────┐
│  本地机器        │─────────────│  目标服务器                 │
│  (有 Nix)      │              │  (任何 Linux 发行版)        │
│                 │              │                              │
│  flake.nix      │   1. kexec   │  ┌───────────────────────┐  │
│  disko 配置      │──────────────>  │ NixOS 安装程序 (RAM) │  │
│                 │              │  └───────────┬───────────┘  │
│                 │   2. disko   │              │               │
│                 │──────────────>  分区 + 格式化磁盘          │
│                 │              │              │               │
│                 │   3. 安装    │              ▼               │
│                 │──────────────>  从 flake 安装 nixos        │
│                 │              │              │               │
│                 │   4. 重启    │              ▼               │
│                 │──────────────>  启动进入 NixOS            │
└─────────────────┘              └─────────────────────────────┘
```

## 前提条件

在本地机器上：

```bash
# 如果没有 Nix，安装它
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh

# 验证 nix 可用
nix --version
```

在目标服务器上：
- 使用公钥的 root SSH 访问
- 至少 2 GB 内存（kexec 安装程序在内存中运行）
- 至少 20 GB 磁盘空间

:::warning 破坏性操作
`nixos-anywhere` 将**清除目标磁盘**。确保您有备份，并且正在针对正确的服务器。双检 IP 地址。
:::

## 项目结构

为您的 NixOS 配置创建一个本地目录：

```bash
mkdir -p nixos-config && cd nixos-config
```

## Flake 配置

创建 `flake.nix` — 这是整个系统配置的入口点：

```nix title="flake.nix"
{
  description = "自愈式 NixOS 服务器";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    disko = {
      url = "github:nix-community/disko";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, disko, ... }: {
    nixosConfigurations.server = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        disko.nixosModules.disko
        ./disk-config.nix
        ./configuration.nix
      ];
    };
  };
}
```

## Disko 磁盘配置

这定义了 `nixos-anywhere` 将应用的磁盘布局。我们使用 GPT，带有 EFI 系统分区和带有子卷的 Btrfs 分区：

```nix title="disk-config.nix"
{ lib, ... }:
{
  disko.devices = {
    disk = {
      main = {
        type = "disk";
        # 更改此以匹配目标服务器的磁盘
        # 常见：/dev/sda, /dev/vda, /dev/nvme0n1
        device = "/dev/sda";
        content = {
          type = "gpt";
          partitions = {
            ESP = {
              size = "512M";
              type = "EF00";
              content = {
                type = "filesystem";
                format = "vfat";
                mountpoint = "/boot";
                mountOptions = [ "umask=0077" ];
              };
            };
            root = {
              size = "100%";
              content = {
                type = "btrfs";
                extraArgs = [ "-f" ]; # 强制覆盖
                subvolumes = {
                  "@root" = {
                    mountpoint = "/";
                    mountOptions = [
                      "compress=zstd:1"
                      "noatime"
                      "space_cache=v2"
                    ];
                  };
                  "@home" = {
                    mountpoint = "/home";
                    mountOptions = [
                      "compress=zstd:1"
                      "noatime"
                      "space_cache=v2"
                    ];
                  };
                  "@nix" = {
                    mountpoint = "/nix";
                    mountOptions = [
                      "compress=zstd:1"
                      "noatime"
                      "space_cache=v2"
                    ];
                  };
                  "@log" = {
                    mountpoint = "/var/log";
                    mountOptions = [
                      "compress=zstd:1"
                      "noatime"
                      "space_cache=v2"
                    ];
                  };
                  "@db" = {
                    mountpoint = "/var/lib/db";
                    mountOptions = [
                      "noatime"
                      "space_cache=v2"
                    ];
                  };
                  "@snapshots" = {
                    mountpoint = "/.snapshots";
                    mountOptions = [
                      "noatime"
                      "space_cache=v2"
                    ];
                  };
                };
              };
            };
          };
        };
      };
    };
  };
}
```

:::tip 磁盘设备名称
`device` 字段必须与目标服务器的主磁盘匹配。常见名称：
- **KVM/QEMU VPS**: `/dev/vda`
- **Hetzner 专用**: `/dev/nvme0n1`
- **通用 VPS**: `/dev/sda`

您可以在开始前在目标服务器上运行 `lsblk` 找到它。
:::

## 系统配置

```nix title="configuration.nix"
{ config, pkgs, ... }:
{
  # 启动
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # 网络
  networking.hostName = "nixos-server";
  networking.firewall = {
    enable = true;
    allowedTCPPorts = [ 22 ];
  };

  # 启用 SSH
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "prohibit-password";
      PasswordAuthentication = false;
    };
  };

  # 您的 SSH 公钥
  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3Nz... your-key-here"
  ];

  # 创建管理员用户
  users.users.admin = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3Nz... your-key-here"
    ];
  };

  # 基本软件包
  environment.systemPackages = with pkgs; [
    vim
    git
    htop
    btrfs-progs
    compsize
  ];

  # 启用 Btrfs 清理定时器
  services.btrfs.autoScrub = {
    enable = true;
    interval = "weekly";
    fileSystems = [ "/" ];
  };

  # 时区和语言
  time.timeZone = "UTC";
  i18n.defaultLocale = "en_US.UTF-8";

  system.stateVersion = "24.11";
}
```

## 运行 nixos-anywhere

配置准备就绪后，在目标上安装 NixOS：

```bash
# 将 TARGET_IP 替换为您服务器的 IP 地址
nix run github:nix-community/nixos-anywhere -- \
  --flake .#server \
  --target-host root@TARGET_IP
```

根据网络速度，此过程需要 5-15 分钟。您将看到：

1. **SSH 连接**到目标
2. **kexec** 进入 RAM 中的 NixOS 安装程序
3. **磁盘分区**通过 disko
4. **NixOS 安装**从您的 flake
5. **重启**进入新系统

:::note 连接断开是正常的
SSH 连接会在服务器重启进入 kexec 安装程序时断开，最终安装后再次断开。这是预期的 — `nixos-anywhere` 会自动重新连接。
:::

## 安装后验证

安装完成后，SSH 到您的新 NixOS 服务器：

```bash
ssh admin@TARGET_IP
```

验证系统：

```bash
# 检查 NixOS 版本
nixos-version

# 验证 Btrfs 子卷
sudo btrfs subvolume list /
# 应显示：@root, @home, @nix, @log, @db, @snapshots

# 检查 Btrfs 文件系统
sudo btrfs filesystem show /

# 检查挂载点
findmnt -t btrfs

# 验证压缩是否启用
sudo compsize /
```

预期的 `btrfs subvolume list /` 输出：

```
ID 256 gen 50 top level 5 path @root
ID 257 gen 50 top level 5 path @home
ID 258 gen 48 top level 5 path @nix
ID 259 gen 45 top level 5 path @log
ID 260 gen 42 top level 5 path @db
ID 261 gen 40 top level 5 path @snapshots
```

## 故障排除

### kexec 后"连接被拒绝"

服务器的 host key 在 kexec 后会更改。删除旧 key：

```bash
ssh-keygen -R TARGET_IP
```

### 找不到磁盘设备

如果 disko 找不到磁盘，SSH 到安装程序并检查：

```bash
# 在安装程序阶段，使用以下方式 SSH 进入：
ssh root@TARGET_IP -p 22
lsblk
```

使用正确的设备路径更新 `disk-config.nix`。

### 安装期间内存不足

kexec 安装程序在内存中运行。如果服务器可用内存少于 1.5 GB，安装程序可能会失败。考虑：

- 在运行 nixos-anywhere 前停止不必要的服务
- 使用更多内存的服务器
- 添加 `--build-on-remote` 标志在目标上构建系统

```bash
nix run github:nix-community/nixos-anywhere -- \
  --flake .#server \
  --target-host root@TARGET_IP \
  --build-on-remote
```

## 生产环境提示

:::tip 锁定一切
始终使用 `flake.lock` 锁定您的 nixpkgs 版本。有意运行 `nix flake update`，不要意外运行。将 lock 文件提交到版本控制。
:::

:::tip 先在本地测试
在部署到真实服务器之前，在 VM 中测试您的配置：

```bash
# 在 QEMU VM 中构建和运行
nix run .#nixosConfigurations.server.config.system.build.vm
```
:::

:::tip 幂等重建
初始安装后，使用 `nixos-rebuild` 管理服务器：

```bash
# 在服务器上
sudo nixos-rebuild switch --flake /etc/nixos#server

# 或远程
nixos-rebuild switch --flake .#server \
  --target-host admin@TARGET_IP \
  --use-remote-sudo
```
:::

## 下一步

服务器正在运行带有 Btrfs 的 NixOS。接下来，让我们详细查看 [Btrfs 子卷布局](./btrfs-layout)，了解每个子卷存在的原因。
