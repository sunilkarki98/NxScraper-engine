export interface Cookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
}
export interface SessionData {
    id: string;
    domain: string;
    userId?: string;
    cookies: Cookie[];
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    createdAt: number;
    lastUsedAt: number;
    expiresAt: number;
    useCount: number;
    isValid: boolean;
    lastValidation: number;
    failureCount: number;
    headers?: Record<string, string>;
}
export interface SessionConfig {
    domain: string;
    ttl: number;
    maxConcurrent: number;
    rotationStrategy: 'round-robin' | 'least-used' | 'random';
    healthCheckInterval: number;
    autoRenew: boolean;
}
export interface ISessionManager {
    saveSession(session: SessionData): Promise<void>;
    getSession(domain: string, id: string): Promise<SessionData | null>;
    applySession(page: any, session: SessionData): Promise<void>;
    extractSession(page: any, domain: string): Promise<SessionData>;
    validateSession(page: any, session: SessionData, checkUrl: string): Promise<boolean>;
    deleteSession(domain: string, sessionId: string): Promise<void>;
}
//# sourceMappingURL=session.interface.d.ts.map