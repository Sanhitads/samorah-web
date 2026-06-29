import type { ReactNode } from "react";
import type { BlockInstance } from "@/platform/section";
import { getBlockComponent } from "./registry";

/**
 * BlockRenderer (§7, §16) — renders a section's child blocks: visibility, order,
 * then each registered block. Unknown types are skipped.
 */
export function BlockRenderer({
  blocks,
}: {
  blocks: BlockInstance[];
}): ReactNode {
  const ordered = [...blocks]
    .filter((b) => b.visibility !== false)
    .sort((a, b) => a.order - b.order);

  return (
    <>
      {ordered.map((block) => {
        const Component = getBlockComponent(block.type);
        if (!Component) return null;
        return <Component key={block.id} settings={block.settings} block={block} />;
      })}
    </>
  );
}
