import { describe, expect, it } from 'vitest';

import { buildResumeLocationHref, selectStoredRelaySession } from '../../web/src/relay-session.ts';

describe('relay-session helpers', () => {
  it('reuses the stored mobile session when the invite targets the same session', () => {
    const storedSession = {
      relayServer: 'http://127.0.0.1:8787',
      sessionId: 'session-123',
      mobileToken: 'mobile-abc',
    };

    expect(selectStoredRelaySession(storedSession, {
      inviteDetected: true,
      sessionId: 'session-123',
    })).toEqual(storedSession);
  });

  it('does not reuse the stored mobile session for a different invite session', () => {
    const storedSession = {
      relayServer: 'http://127.0.0.1:8787',
      sessionId: 'session-123',
      mobileToken: 'mobile-abc',
    };

    expect(selectStoredRelaySession(storedSession, {
      inviteDetected: true,
      sessionId: 'session-999',
    })).toBeNull();
  });

  it('removes the one-time pairing token from a resumable invite URL', () => {
    expect(buildResumeLocationHref(
      'http://127.0.0.1:8787/pair?sessionId=session-123&pairingToken=pair-abc',
      'session-123',
    )).toBe('http://127.0.0.1:8787/pair?sessionId=session-123');
  });

  it('leaves unrelated invite URLs unchanged', () => {
    const href = 'http://127.0.0.1:8787/pair?sessionId=session-999&pairingToken=pair-abc';

    expect(buildResumeLocationHref(href, 'session-123')).toBe(href);
  });
});