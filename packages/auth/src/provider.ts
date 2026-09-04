/**
 * AuthProvider abstraction (§30, §40). The MVP ships a local password provider;
 * external providers (Google / Microsoft / SSO / Passkey) can be added without
 * touching session handling or authorization.
 */
export interface AuthenticationResult {
  ok: true;
  userId: string;
}

export interface AuthenticationFailure {
  ok: false;
  reason: "invalid_credentials" | "locked" | "disabled" | "provider_error";
  lockedUntil?: Date;
}

export interface AuthProvider {
  readonly name: string;
  authenticate(input: { loginId: string; password: string; ipAddress?: string | null }): Promise<AuthenticationResult | AuthenticationFailure>;
}
