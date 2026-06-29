import type { ReactNode } from "react";
import type { BlockType, BlockInstance } from "@/platform/section";

/**
 * Block Registry (§7, §16) — maps a block `type` to its component, mirroring the
 * Section Registry one level down (a section's child blocks).
 */
export interface BlockComponentProps {
  settings: Record<string, unknown>;
  block: BlockInstance;
}

export type BlockComponent = (props: BlockComponentProps) => ReactNode;

const BLOCK_REGISTRY = new Map<string, BlockComponent>();

export function registerBlock(type: BlockType, component: BlockComponent): void {
  BLOCK_REGISTRY.set(type, component);
}

export function getBlockComponent(type: BlockType): BlockComponent | undefined {
  return BLOCK_REGISTRY.get(type);
}
