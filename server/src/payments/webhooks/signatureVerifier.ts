// TODO Phase D: Implement HMAC SHA256 verification deterministically.
// Phase D scaffolding only.

export type SignatureVerificationResult = {
  signature_valid: boolean;
  reason?: string;
};

export function verifyHmacSha256Signature(_params: {
  rawBody: string;
  signatureHeader?: string;
  secret: string;
}): SignatureVerificationResult {
  // Scaffold: always invalid unless future wiring sets secret.
  return { signature_valid: false, reason: "signature verification not implemented (scaffold)" };
}

