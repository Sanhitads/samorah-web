"use client";

/** Triggers the browser's print dialog → "Save as PDF". Hidden when printing. */
export function PrintButton() {
  return (
    <button type="button" className="inv__print" onClick={() => window.print()}>
      Download / Print
    </button>
  );
}
