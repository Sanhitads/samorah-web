"use client";

import { useRef, useState } from "react";
import { contactSchema, fieldErrors, CONTACT_MESSAGE_MAX, resolveFormConfig, type ContactFormConfig } from "@/lib/contact";

type Fields = { firstName: string; lastName: string; email: string; phone: string; subject: string; orderNumber: string; message: string; consent: boolean };
const EMPTY: Fields = { firstName: "", lastName: "", email: "", phone: "", subject: "", orderNumber: "", message: "", consent: false };

/**
 * Minimal editorial contact form. Validates client-side with the SAME zod schema the API uses
 * (defense-in-depth), posts to /api/contact, and shows human success/error copy. A hidden honeypot
 * (`company`) traps bots. Accessible: labelled inputs, aria-invalid + aria-describedby on errors,
 * role="alert" messages, focus moves to the first error (or the success note) after submit.
 */
export function ContactForm({ config }: { config?: ContactFormConfig }) {
  const cfg = resolveFormConfig(config);
  const [f, setF] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [honeypot, setHoneypot] = useState("");
  const successRef = useRef<HTMLParagraphElement>(null);

  const set = (k: keyof Fields, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const invalid = (k: string) => !!errors[k];
  const describe = (k: string) => (errors[k] ? `err-${k}` : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = fieldErrors(contactSchema, {
      firstName: f.firstName, lastName: f.lastName, email: f.email,
      phone: cfg.enablePhone ? f.phone : "", subject: f.subject,
      orderNumber: cfg.enableOrderNumber ? f.orderNumber : "", message: f.message, consent: f.consent,
    });
    if (Object.keys(errs).length) {
      setErrors(errs);
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
      return;
    }
    setErrors({}); setState("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, phone: cfg.enablePhone ? f.phone : "", orderNumber: cfg.enableOrderNumber ? f.orderNumber : "", company: honeypot }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.fieldErrors) { setErrors(d.fieldErrors); document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }
        setState("error");
        return;
      }
      setState("sent"); setF(EMPTY);
      setTimeout(() => successRef.current?.focus(), 0);
    } catch { setState("error"); }
  };

  if (state === "sent") {
    return (
      <div className="contact-form contact-form--done">
        <p className="contact-form__success" tabIndex={-1} ref={successRef} role="status">
          {cfg.successMessage.split("\n").map((l, i) => <span key={i} style={{ display: "block" }}>{l}</span>)}
        </p>
      </div>
    );
  }

  const field = (id: keyof Fields, label: string, opts: { type?: string; required?: boolean } = {}) => (
    <label className="contact-field" htmlFor={id}>
      <span className="contact-field__label">{label}{opts.required ? <span aria-hidden="true"> *</span> : null}</span>
      <input id={id} name={id} type={opts.type ?? "text"} value={f[id] as string} required={opts.required}
        aria-invalid={invalid(id)} aria-describedby={describe(id)}
        onChange={(e) => set(id, e.target.value)} />
      {errors[id] ? <span className="ff-err" id={`err-${id}`} role="alert">{errors[id]}</span> : null}
    </label>
  );

  return (
    <form className="contact-form" onSubmit={submit} noValidate aria-label="Contact form">
      {/* Honeypot — visually hidden, off the tab order; bots fill it, humans don't. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", height: 0, overflow: "hidden" }}>
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>

      <div className="contact-form__row">
        {field("firstName", "First name", { required: true })}
        {field("lastName", "Last name")}
      </div>
      <div className="contact-form__row">
        {field("email", "Email", { type: "email", required: true })}
        {cfg.enablePhone ? field("phone", "Phone number") : null}
      </div>
      <div className="contact-form__row">
        {field("subject", "Subject", { required: true })}
        {cfg.enableOrderNumber ? field("orderNumber", "Order number") : null}
      </div>

      <label className="contact-field" htmlFor="message">
        <span className="contact-field__label">Message<span aria-hidden="true"> *</span></span>
        <textarea id="message" name="message" rows={6} maxLength={CONTACT_MESSAGE_MAX} required
          aria-invalid={invalid("message")} aria-describedby={`msg-count${errors.message ? " err-message" : ""}`}
          value={f.message} onChange={(e) => set("message", e.target.value)} />
        <span className="contact-field__count" id="msg-count" aria-live="polite">{f.message.length} / {CONTACT_MESSAGE_MAX}</span>
        {errors.message ? <span className="ff-err" id="err-message" role="alert">{errors.message}</span> : null}
      </label>

      <label className="contact-consent">
        <input type="checkbox" checked={f.consent} aria-invalid={invalid("consent")} aria-describedby={describe("consent")} onChange={(e) => set("consent", e.target.checked)} />
        <span>{cfg.consentLabel}</span>
      </label>
      {errors.consent ? <span className="ff-err" id="err-consent" role="alert">{errors.consent}</span> : null}

      <div className="contact-form__foot">
        <button type="submit" className="contact-form__submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send Message"}</button>
        {state === "error" ? (
          <p className="contact-form__error" role="alert">{cfg.errorMessage.split("\n").map((l, i) => <span key={i} style={{ display: "block" }}>{l}</span>)}</p>
        ) : null}
      </div>
    </form>
  );
}
