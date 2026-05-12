import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { firebaseAuth } from "../../config/firebase";

let _confirmation: ConfirmationResult | null = null;
let _recaptcha: RecaptchaVerifier | null = null;
let _container: HTMLElement | null = null;

function _destroyRecaptcha(): void {
  if (_recaptcha) {
    try { _recaptcha.clear(); } catch (_) {}
    _recaptcha = null;
  }
  if (_container) {
    try { _container.remove(); } catch (_) {}
    _container = null;
  }
}

export async function sendFirebaseOTP(phoneE164: string): Promise<void> {
  _destroyRecaptcha();

  // Always create a brand-new element — Firebase tracks elements by reference,
  // so reusing the same element (even after innerHTML clear) causes "already rendered".
  const el = document.createElement("div");
  document.body.appendChild(el);
  _container = el;

  _recaptcha = new RecaptchaVerifier(firebaseAuth, el, { size: "invisible" });
  try {
    _confirmation = await signInWithPhoneNumber(firebaseAuth, phoneE164, _recaptcha);
  } catch (err) {
    _destroyRecaptcha();
    throw err;
  }
}

export async function confirmFirebaseOTP(code: string): Promise<string> {
  if (!_confirmation) throw new Error("No pending OTP — call sendFirebaseOTP first");
  const result = await _confirmation.confirm(code);
  return result.user.getIdToken();
}

export function clearConfirmation(): void {
  _confirmation = null;
}

export function clearRecaptcha(): void {
  _destroyRecaptcha();
}
