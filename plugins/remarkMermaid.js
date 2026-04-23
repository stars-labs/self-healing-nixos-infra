import { visit } from 'unist-util-visit';

/**
 * Remark plugin: converts ```mermaid code blocks to <div class="mermaid"> HTML,
 * allowing mermaid.js to render them client-side without Shiki interference.
 */
export function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid') return;
      parent.children.splice(index, 1, {
        type: 'html',
        value: `<div class="mermaid">\n${node.value}\n</div>`,
      });
    });
  };
}
