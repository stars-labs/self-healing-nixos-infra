# Self-Healing NixOS Infrastructure

A comprehensive tutorial on bootstrapping self-healing infrastructure with NixOS, OpenClaw, Btrfs snapshots, and TOTP-protected operations.

## What You'll Learn

- Bootstrap any VPS/VPC into NixOS using `nixos-anywhere`
- Design a Btrfs subvolume layout for production workloads
- Configure snapshot-based rollback for system state, databases, and configuration
- Install and configure OpenClaw as an AI infrastructure operator
- Protect critical system commands with TOTP sudo authentication
- Build a safe AI-managed infrastructure workflow with guardrails

## Prerequisites

- A VPS or VPC with root SSH access and at least 2 GB RAM
- A local machine with Nix installed (or NixOS)
- Basic familiarity with Linux system administration
- An SSH key pair

## Running Locally

```bash
npm install
npm run start
```

This starts a local development server at `http://localhost:3000` and opens your browser. Changes are reflected live without restart.

## Building for Production

```bash
npm run build
```

Static files are generated in the `build/` directory and can be served by any static hosting provider.

## Project Structure

```
self-healing-nixos-infra/
├── docs/
│   ├── intro.md                         # Introduction and overview
│   ├── architecture.md                  # System architecture
│   ├── 01-bootstrap-nixos-anywhere.md   # NixOS bootstrap via nixos-anywhere
│   ├── 02-btrfs-layout.md              # Btrfs subvolume design
│   ├── 03-btrfs-snapshots.md           # Snapshot configuration
│   ├── 04-install-openclaw.md          # OpenClaw installation
│   ├── 05-ai-managed-infra.md          # AI-managed infrastructure
│   ├── 06-totp-sudo-protection.md      # TOTP sudo protection
│   ├── 07-database-snapshot-strategy.md # Database snapshot strategy
│   ├── 08-disaster-recovery.md         # Disaster recovery
│   └── 09-ai-safety-and-rollback.md    # AI safety and rollback
├── src/
│   └── css/
│       └── custom.css
├── static/
│   └── img/
├── docusaurus.config.js
├── sidebars.js
├── package.json
└── README.md
```

## License

MIT
