export type InitialRelayInvite = {
  inviteDetected: boolean;
  sessionId: string;
};

export type StoredRelaySession = {
  relayServer: string;
  sessionId: string;
  mobileToken: string;
};

export function selectStoredRelaySession(
  storedSession: StoredRelaySession | null,
  invite: InitialRelayInvite,
): StoredRelaySession | null {
  if (!storedSession) {
    return null;
  }

  if (!invite.inviteDetected) {
    return storedSession;
  }

  return storedSession.sessionId === invite.sessionId ? storedSession : null;
}

export function buildResumeLocationHref(rawHref: string, sessionId: string): string {
  const url = new URL(rawHref);
  const pairingToken = url.searchParams.get('pairingToken');

  if (!pairingToken) {
    return rawHref;
  }

  const inviteSessionId = url.searchParams.get('sessionId') ?? '';

  if (inviteSessionId && sessionId && inviteSessionId !== sessionId) {
    return rawHref;
  }

  url.searchParams.delete('pairingToken');
  return url.toString();
}