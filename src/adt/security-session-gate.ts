/**
 * Lets one request establish the SAP security session before a cold client fans out.
 *
 * SAP issues a new security session to every request that arrives without the
 * `SAP_SESSIONID_<SID>_<CLNT>` cookie. A parallel fan-out on a cold client (startup
 * feature probes, compound handlers) therefore opens one session per request, and all
 * but one are never sent back. SAP counts those unused sessions per user
 * (SICF_SESSIONS "session limit", default 100, kept for http/security_session_timeout);
 * once the limit is reached it stops issuing sessions for that user. Reads still work
 * with Basic auth, but a stateful LOCK → PUT → UNLOCK then fails with
 * "400 Session not found" (ICF re-authentication, SAP Note 1301591) and leaves the
 * enqueue lock behind.
 */

import { awaitWithinRequestBudget, type RequestDeadlineOptions } from './http-deadline.js';

/** True when one of the cookies is a SAP security session cookie (`SAP_SESSIONID_<SID>_<CLNT>`). */
export function hasSecuritySessionCookie(cookieNames: Iterable<string>): boolean {
  return [...cookieNames].some((name) => name.startsWith('SAP_SESSIONID'));
}

export class SecuritySessionGate {
  private opened: Promise<void> | undefined;
  private release: (() => void) | undefined;
  private done = false;

  /**
   * Runs the request. Without a session cookie only the first request goes to SAP; the
   * others wait until its response (and its Set-Cookie) has arrived, see open(). They do not
   * wait for a long-running first request to finish. Once open, the gate stays open even if
   * SAP sent no session cookie, so a system without security sessions is not serialized.
   */
  async run<T>(
    hasSessionCookie: () => boolean,
    request: () => Promise<T>,
    options?: RequestDeadlineOptions,
  ): Promise<T> {
    if (this.done || hasSessionCookie()) return request();
    if (this.opened) {
      await awaitWithinRequestBudget(this.opened, options);
      return request();
    }
    this.opened = new Promise<void>((resolve) => {
      this.release = resolve;
    });
    try {
      return await request();
    } finally {
      this.open();
    }
  }

  /** Called once a SAP response's cookies are stored: the session it issued (if any) now exists. */
  open(): void {
    this.done = true;
    this.opened = undefined;
    this.release?.();
    this.release = undefined;
  }

  /** Arms the gate again after the session cookies were cleared. */
  reset(): void {
    this.done = false;
  }
}
