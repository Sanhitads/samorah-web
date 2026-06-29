"use client";

import { Component, type ReactNode } from "react";

/**
 * SectionErrorBoundary (§16) — isolates each section so one that throws renders
 * its fallback (nothing, by default) instead of taking down the whole page.
 * Client + best-effort SSR isolation. Principle: one bad section shouldn't kill
 * everything.
 */
interface Props {
  children: ReactNode;
  sectionId?: string;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[sections] Section "${this.props.sectionId ?? "?"}" failed to render.`,
        error,
      );
    }
  }

  render() {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children;
  }
}
