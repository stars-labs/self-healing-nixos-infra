import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import { remarkMermaid } from './plugins/remarkMermaid.js';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  site: 'https://stars-labs.github.io',
  base: '/self-healing-nixos-infra',
  integrations: [
    starlight({
      title: 'Self-Healing NixOS Infrastructure',
      description: 'AI-managed infrastructure with NixOS, OpenClaw, Btrfs snapshots, and TOTP protection',
      favicon: '/img/favicon.ico',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/stars-labs/self-healing-nixos-infra',
        },
      ],
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'English',
          lang: 'en',
        },
        zh: {
          label: '中文',
          lang: 'zh',
        },
      },
      sidebar: [
        { label: 'Introduction', link: '/' },
        { label: 'Architecture', link: '/architecture' },
        {
          label: 'Bootstrap & Filesystem',
          items: [
            { label: 'Bootstrap NixOS Anywhere', link: '/01-bootstrap-nixos-anywhere' },
            { label: 'Btrfs Layout', link: '/02-btrfs-layout' },
            { label: 'Btrfs Snapshots', link: '/03-btrfs-snapshots' },
          ],
        },
        {
          label: 'AI Infrastructure Management',
          items: [
            { label: 'Install OpenClaw', link: '/04-install-openclaw' },
            { label: 'AI Managed Infrastructure', link: '/05-ai-managed-infra' },
            { label: 'Context Management', link: '/15-context-management' },
          ],
        },
        {
          label: 'Security & Recovery',
          items: [
            { label: 'TOTP sudo Protection', link: '/06-totp-sudo-protection' },
            { label: 'Database Snapshot Strategy', link: '/07-database-snapshot-strategy' },
            { label: 'Disaster Recovery', link: '/08-disaster-recovery' },
            { label: 'AI Safety and Rollback', link: '/09-ai-safety-and-rollback' },
          ],
        },
        {
          label: 'Production Operations',
          items: [
            { label: 'Monitoring & Alerting', link: '/11-monitoring-alerting' },
            { label: 'Impermanence Setup', link: '/12-impermanence-setup' },
            { label: 'Security Hardening', link: '/13-security-hardening' },
            { label: 'FAQ', link: '/10-faq' },
          ],
        },
        { label: 'Interactive Demo', link: '/14-interactive-demo' },
      ],
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'script',
          attrs: { type: 'module' },
          content: `
            import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
            const init = () => {
              const dark = document.documentElement.dataset.theme === 'dark';
              mermaid.initialize({ startOnLoad: true, theme: dark ? 'dark' : 'default' });
            };
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', init);
            } else {
              init();
            }
            document.addEventListener('astro:after-swap', init);
          `,
        },
      ],
    }),
    react(),
  ],
  markdown: {
    remarkPlugins: [remarkMermaid],
    shikiConfig: {
      langs: ['bash', 'nix', 'toml', 'json'],
    },
  },
  vite: {
    resolve: {
      alias: {
        '@site': resolve(__dirname, '.'),
      },
    },
  },
});
