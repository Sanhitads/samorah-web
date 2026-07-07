// Razorpay Checkout (checkout.js) — loaded via next/script on the checkout page.
interface RazorpayPrefill {
  name?: string;
  email?: string;
  contact?: string;
}
interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  amount: number; // paise
  currency: string;
  order_id: string;
  name?: string;
  description?: string;
  prefill?: RazorpayPrefill;
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler?: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}
interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (resp: { error?: { description?: string } }) => void): void;
}
interface Window {
  Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
}
