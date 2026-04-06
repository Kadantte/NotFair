import { Resend } from "resend";

let resend: Resend | null = null;

export function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}
