# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tutorial documentation for building self-healing infrastructure with NixOS, OpenClaw, Btrfs snapshots, and TOTP-protected operations. Built with **Astro + Starlight**. Supports English (default) and Chinese (`zh`) locales.

Deployed to GitHub Pages at `https://stars-labs.github.io/self-healing-nixos-infra/`.

## Commands

- `npm run dev` (or `npm start`) — dev server at localhost:4321
- `npm run build` — production build to `dist/`
- `npm run preview` — serve production build locally

## Architecture

- **Astro + Starlight** with React integration for interactive demos
- **Docs**: `src/content/docs/` — numbered markdown files (01–15) forming a sequential tutorial
- **i18n**: English (default root) + Chinese (`zh`). Chinese translations: `src/content/docs/zh/` — must use identical filenames to English counterparts
- **Sidebar**: manually configured in `astro.config.mjs` with 5 categories matching the original structure
- **Interactive demos**: 4 React components in `src/components/` — use `client:only="react"` directive in MDX
- **Mermaid**: ` ```mermaid ``` ` blocks converted by `plugins/remarkMermaid.js`, rendered client-side
- **Syntax highlighting**: Shiki with `bash`, `nix`, `toml`, `json` languages (configured in `astro.config.mjs`)

## Content Conventions

- Doc files use numeric prefixes for ordering (`01-bootstrap-nixos-anywhere.md`, etc.)
- Frontmatter ordering: use `sidebar:\n  order: N`
- The `index.md` in each locale is the landing page
- Code blocks: use `nix`, `bash`, `toml`, or `json` language tags
- When adding a new doc, update `astro.config.mjs` sidebar config with the new item

## Interactive Components

Components live in `src/components/` as standalone `.js` files (pure React, no Docusaurus APIs):
- `HealingWorkflow.js` — animated self-healing workflow
- `TerminalReplay.js` — terminal session replay
- `TierSimulator.js` — OpenClaw decision tier simulator
- `ContextTimeline.js` — context management timeline

Usage in MDX: `<HealingWorkflow client:only="react" lang="en" />`

The `@site` alias maps to the project root (configured in Vite config inside `astro.config.mjs`).
