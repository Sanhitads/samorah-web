"use client";

import { Component, type ReactNode } from "react";

/**
 * Feature-local error boundary. If ANY experience throws while rendering, it unmounts (renders
 * nothing) and calls `onError` — so a failed animation can never affect the homepage. Combined with
 * the engine's hard failsafe timeout, the overlay is always removable and the user is never trapped.
 */
export class ExperienceBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
