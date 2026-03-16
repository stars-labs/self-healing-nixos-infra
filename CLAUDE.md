# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Docusaurus 3 documentation site for a tutorial on building self-healing infrastructure with NixOS, OpenClaw, Btrfs snapshots, and TOTP-protected operations. Deployed to GitHub Pages under the `stars-labs` org.

## Commands

- `npm run start` — dev server at localhost:3000
- `npm run build` — production build to `build/` (fails on broken links due to `onBrokenLinks: 'throw'`)
- `npm run start -- --locale zh` — dev server for Chinese locale
- `npm run serve` — serve production build locally (run `npm run build` first)
- `npm run clear` — clear Docusaurus cache (useful when build behaves unexpectedly)

## Architecture

- **Docusaurus 3** with `preset-classic`, blog disabled, docs served at root (`routeBasePath: '/'`)
- **Docs**: `docs/` contains numbered markdown files (01–10) forming a sequential tutorial, plus `intro.md` (landing page) and `architecture.md`
- **i18n**: English (default) + Chinese (`zh`). Chinese doc translations live in `i18n/zh/docusaurus-plugin-content-docs/current/` and **must use identical filenames** to their English counterparts
- **Sidebar**: manually configured in `sidebars.js` with three categories (`Bootstrap & Filesystem`, `AI Infrastructure Management`, `Security & Recovery`). When adding a new doc, it must be added to both `sidebars.js` and given a matching `sidebar_position` in frontmatter
- **Custom CSS only**: `src/css/custom.css` — no custom React components
- **Syntax highlighting**: Prism with `bash`, `nix`, `toml`, `json` languages enabled
- **Diagrams**: Mermaid enabled via `@docusaurus/theme-mermaid` — use `mermaid` code blocks in markdown

## Content Conventions

- Doc files use numeric prefixes for ordering (e.g., `01-bootstrap-nixos-anywhere.md`)
- Each doc has YAML frontmatter with `sidebar_position` matching its number
- Code blocks use `nix`, `bash`, `toml`, or `json` language tags
- When adding or renaming a doc, update `sidebars.js` (uses slug without numeric prefix, e.g., `'bootstrap-nixos-anywhere'`)
