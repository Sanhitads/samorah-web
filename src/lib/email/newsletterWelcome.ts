/**
 * The quiet welcome note sent when someone subscribes to "The Letters" from the homepage.
 * Deterministic → unit-testable; editorial voice matching the section (no marketing noise).
 */
export function buildNewsletterWelcomeEmail(): { subject: string; html: string; text: string } {
  const subject = "The Letters — welcome";
  const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;color:#2a2a2a;line-height:1.7">
    <p style="font-size:19px;font-style:italic;margin:0 0 18px">You're on the list.</p>
    <p style="font-size:15px;margin:0 0 14px">Thank you for joining <b>The Letters</b> — the quiet correspondence from the Samorah studio. Now and then, a note on new chapters, the craft behind them, and the hours they're made for.</p>
    <p style="font-size:15px;margin:0 0 14px">No noise. Just the next chapter, when it's ready.</p>
    <p style="font-size:13px;color:#6b6259;margin:22px 0 0">Samorah · Handcrafted in India<br/>You can unsubscribe at any time by replying to this email.</p>
  </div>`;
  const text = "You're on the list.\n\nThank you for joining The Letters — the quiet correspondence from the Samorah studio. Now and then, a note on new chapters, the craft behind them, and the hours they're made for.\n\nNo noise. Just the next chapter, when it's ready.\n\nSamorah · Handcrafted in India\nYou can unsubscribe at any time by replying to this email.";
  return { subject, html, text };
}
