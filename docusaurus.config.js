// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Self-Healing NixOS Infrastructure',
  tagline: 'AI-managed infrastructure with NixOS, OpenClaw, Btrfs snapshots, and TOTP protection',
  favicon: 'img/favicon.ico',

  url: 'https://stars-labs.github.io',
  baseUrl: '/self-healing-nixos-infra/',

  organizationName: 'stars-labs',
  projectName: 'self-healing-nixos-infra',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  markdown: {
    mermaid: true,
  },

  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    localeConfigs: {
      en: {
        label: 'English',
      },
      zh: {
        label: '中文',
      },
    },
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Self-Healing NixOS',
        items: [
          {
            type: 'docSidebar',
            sidebarId: 'tutorialSidebar',
            position: 'left',
            label: 'Tutorial',
          },
          {
            type: 'doc',
            docId: 'interactive-demo',
            position: 'left',
            label: 'Demos',
          },
          {
            type: 'localeDropdown',
            position: 'right',
          },
          {
            href: 'https://github.com/stars-labs/self-healing-nixos-infra',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Introduction',
                to: '/',
              },
              {
                label: 'Architecture',
                to: '/architecture',
              },
            ],
          },
          {
            title: 'Resources',
            items: [
              {
                label: 'NixOS Manual',
                href: 'https://nixos.org/manual/nixos/stable/',
              },
              {
                label: 'Btrfs Wiki',
                href: 'https://btrfs.readthedocs.io/',
              },
            ],
          },
        ],
        copyright: `Copyright ${new Date().getFullYear()} Self-Healing NixOS Infrastructure. Built with Docusaurus.`,
      },
      prism: {
        theme: require('prism-react-renderer').themes.github,
        darkTheme: require('prism-react-renderer').themes.dracula,
        additionalLanguages: ['bash', 'nix', 'toml', 'json'],
      },
    }),
};

module.exports = config;
