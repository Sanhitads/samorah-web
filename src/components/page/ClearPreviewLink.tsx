"use client";

/** Clears a preview cookie and reloads → exits a cookie-driven preview (navigation). */
export function ClearPreviewLink({ cookie, children }: { cookie: string; children: React.ReactNode }) {
  const exit = (e: React.MouseEvent) => {
    e.preventDefault();
    document.cookie = `${cookie}=; path=/; max-age=0`;
    window.location.reload();
  };
  return <a href="#" onClick={exit} style={{ color: "#fff", textDecoration: "underline", fontWeight: 600 }}>{children}</a>;
}
