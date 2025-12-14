import { SessionData, ISessionManager } from '../types/session.interface.js';
export declare class SessionManager implements ISessionManager {
    private encryptionKey;
    constructor();
    /**
     * Save session to DragonflyDB (encrypted)
     */
    saveSession(session: SessionData): Promise<void>;
    /**
     * Retrieve and decrypt session
     */
    getSession(domain: string, sessionId: string): Promise<SessionData | null>;
    /**
     * Get all sessions for a domain
     */
    getSessionsByDomain(domain: string): Promise<SessionData[]>;
    /**
     * Delete session
     */
    deleteSession(domain: string, sessionId: string): Promise<void>;
    /**
     * Apply session to browser page
     */
    applySession(page: any, session: SessionData): Promise<void>;
    /**
     * Extract session from page
     */
    extractSession(page: any, domain: string): Promise<SessionData>;
    /**
     * Validate session
     */
    validateSession(page: any, session: SessionData, checkUrl: string): Promise<boolean>;
    private encrypt;
    private decrypt;
    private getSessionKey;
}
export declare const sessionManager: SessionManager;
//# sourceMappingURL=session-manager.d.ts.map