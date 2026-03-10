# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Docusaurus 3 documentation site for a tutorial on building self-healing infrastructure with NixOS, OpenClaw, Btrfs snapshots, and TOTP-protected operations. Deployed to GitHub Pages under the `stars-labs` org.

## Commands

- `npm run start` — dev server at localhost:3000
- `npm run build` — production build to `build/`
- `npm run start -- --locale zh` — dev server for Chinese locale

## Architecture

- **Docusaurus 3** with `preset-classic`, blog disabled, docs served at root (`routeBasePath: '/'`)
- **Docs**: `docs/` contains numbered markdown files (01–09) forming a sequential tutorial, plus `intro.md` (landing page) and `architecture.md`
- **i18n**: English (default) + Chinese (`zh`). Translations live in `i18n/zh/`
- **Sidebar**: auto-generated from `sidebars.js`
- **Custom CSS only**: `src/css/custom.css` — no custom React components
- **Syntax highlighting**: Prism with `bash`, `nix`, `toml`, `json` languages enabled
- **Diagrams**: Mermaid is used for architecture diagrams within markdown files

## Content Conventions

- Doc files use numeric prefixes for ordering (e.g., `01-bootstrap-nixos-anywhere.md`)
- Each doc has YAML frontmatter with `sidebar_position` matching its number
- Code blocks use `nix`, `bash`, `toml`, or `json` language tags
