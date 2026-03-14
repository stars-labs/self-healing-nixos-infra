// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  tutorialSidebar: [
    'intro',
    'architecture',
    {
      type: 'category',
      label: 'Bootstrap & Filesystem',
      items: [
        'bootstrap-nixos-anywhere',
        'btrfs-layout',
        'btrfs-snapshots',
      ],
    },
    {
      type: 'category',
      label: 'AI Infrastructure Management',
      items: [
        'install-openclaw',
        'ai-managed-infra',
      ],
    },
    {
      type: 'category',
      label: 'Security & Recovery',
      items: [
        'totp-sudo-protection',
        'database-snapshot-strategy',
        'disaster-recovery',
        'ai-safety-and-rollback',
      ],
    },
    {
      type: 'category',
      label: 'Production Operations',
      items: [
        'monitoring-alerting',
        'impermanence-setup',
        'security-hardening',
        'faq',
      ],
    },
  ],
};

module.exports = sidebars;
