import crypto from 'crypto';
import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';
import { SessionData, ISessionManager, Cookie } from '../types/session.interface.js';

export class SessionManager implements ISessionManager {
    private encryptionKey: Buffer;

    constructor() {
        // Use environment variable or generate a random key (note: random key means sessions lost on restart)
        const key = process.env.SESSION_ENCRYPTION_KEY;
        if (key) {
            this.encryptionKey = Buffer.from(key, 'hex');
        } else {
            logger.warn('No SESSION_ENCRYPTION_KEY found. Generating temporary key (sessions will be lost on restart).');
            this.encryptionKey = crypto.randomBytes(32);
        }
    }

    /**
     * Save session to DragonflyDB (encrypted)
     */
    async saveSession(session: SessionData): Promise<void> {
        try {
            const key = this.getSessionKey(session.domain, session.id);
            const encrypted = this.encrypt(JSON.stringify(session));

            // Save with TTL
            const client = dragonfly.getClient();
            const ttl = Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000));

            await client.setex(key, ttl, encrypted);

            // Add to domain index
            await client.sadd(`sessions:domain:${session.domain}`, session.id);

            logger.debug(`Session saved: ${session.id} for ${session.domain}`);
        } catch (error) {
            logger.error(error, `Failed to save session ${session.id}:`);
            throw error;
        }
    }

    /**
     * Retrieve and decrypt session
     */
    async getSession(domain: string, sessionId: string): Promise<SessionData | null> {
        try {
            const key = this.getSessionKey(domain, sessionId);
            const client = dragonfly.getClient();
            const encrypted = await client.get(key);

            if (!encrypted) {
                return null;
            }

            const decrypted = this.decrypt(encrypted);
            const session = JSON.parse(decrypted) as SessionData;

            // Update usage stats
            session.lastUsedAt = Date.now();
            session.useCount++;

            // Save back asynchronously to update stats
            this.saveSession(session).catch(err =>
                logger.warn(`Failed to update session stats: ${err}`)
            );

            return session;
        } catch (error) {
            logger.error(error, `Failed to get session ${sessionId}:`);
            return null;
        }
    }

    /**
     * Get all sessions for a domain
     */
    async getSessionsByDomain(domain: string): Promise<SessionData[]> {
        const client = dragonfly.getClient();
        const sessionIds = await client.smembers(`sessions:domain:${domain}`);
        const sessions: SessionData[] = [];

        for (const id of sessionIds) {
            const session = await this.getSession(domain, id);
            if (session) {
                sessions.push(session);
            } else {
                // Clean up stale index
                await client.srem(`sessions:domain:${domain}`, id);
            }
        }

        return sessions;
    }

    /**
     * Delete session
     */
    async deleteSession(domain: string, sessionId: string): Promise<void> {
        const key = this.getSessionKey(domain, sessionId);
        const client = dragonfly.getClient();
        await client.del(key);
        await client.srem(`sessions:domain:${domain}`, sessionId);
        logger.info(`Session deleted: ${sessionId}`);
    }

    /**
     * Apply session to browser page
     */
    async applySession(page: any, session: SessionData): Promise<void> {
        try {
            // 1. Set cookies
            if (session.cookies && session.cookies.length > 0) {
                // Playwright context
                if (page.context && page.context().addCookies) {
                    await page.context().addCookies(session.cookies);
                }
                // Puppeteer page
                else if (page.setCookie) {
                    await page.setCookie(...session.cookies);
                }
            }

            // 2. Set localStorage & sessionStorage
            await page.evaluate((data: any) => {
                if (data.localStorage) {
                    for (const [key, value] of Object.entries(data.localStorage)) {
                        localStorage.setItem(key, value as string);
                    }
                }
                if (data.sessionStorage) {
                    for (const [key, value] of Object.entries(data.sessionStorage)) {
                        sessionStorage.setItem(key, value as string);
                    }
                }
            }, { localStorage: session.localStorage, sessionStorage: session.sessionStorage });

            // 3. Set custom headers
            if (session.headers) {
                await page.setExtraHTTPHeaders(session.headers);
            }

            logger.debug(`Session ${session.id} applied to page`);
        } catch (error) {
            logger.error(error, `Failed to apply session ${session.id}:`);
            throw error;
        }
    }

    /**
     * Extract session from page
     */
    async extractSession(page: any, domain: string): Promise<SessionData> {
        let cookies: Cookie[] = [];

        // Get cookies (Playwright vs Puppeteer)
        if (page.context && page.context().cookies) {
            cookies = await page.context().cookies();
        } else if (page.cookies) {
            cookies = await page.cookies();
        }

        const localStorage = await page.evaluate(() => {
            const storage: Record<string, string> = {};
            try {
                for (let i = 0; i < window.localStorage.length; i++) {
                    const key = window.localStorage.key(i);
                    if (key) storage[key] = window.localStorage.getItem(key) || '';
                }
            } catch (e) {
                console.error('Error extracting localStorage:', e); // Log the error
            }
            return storage;
        });

        const sessionStorage = await page.evaluate(() => {
            const storage: Record<string, string> = {};
            try {
                for (let i = 0; i < window.sessionStorage.length; i++) {
                    const key = window.sessionStorage.key(i);
                    if (key) storage[key] = window.sessionStorage.getItem(key) || '';
                }
            } catch (e) {
                console.error('Error extracting sessionStorage:', e); // Log the error
            }
            return storage;
        });

        return {
            id: crypto.randomUUID(),
            domain,
            cookies,
            localStorage,
            sessionStorage,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours default
            useCount: 0,
            isValid: true,
            lastValidation: Date.now(),
            failureCount: 0
        };
    }

    /**
     * Validate session
     */
    async validateSession(page: any, session: SessionData, checkUrl: string): Promise<boolean> {
        try {
            await this.applySession(page, session);
            await page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Simple check: if we are redirected to login, session is invalid
            const url = page.url();
            const isInvalid = url.includes('login') || url.includes('signin') || url.includes('auth');

            if (isInvalid) {
                session.isValid = false;
                session.failureCount++;
            } else {
                session.isValid = true;
                session.failureCount = 0;
                session.lastValidation = Date.now();
            }

            await this.saveSession(session);
            return session.isValid;
        } catch (error) {
            logger.warn(`Session validation failed (network error?): ${error}`);
            return false;
        }
    }

    // --- Encryption Helpers ---

    private encrypt(text: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    private decrypt(text: string): string {
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift()!, 'hex');
        const encrypted = parts.join(':');
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    private getSessionKey(domain: string, sessionId: string): string {
        return `session:${domain}:${sessionId}`;
    }
}

/**
 * Factory function to create SessionManager instance
 */
export function createSessionManager(): SessionManager {
    return new SessionManager();
}

/**
 * @deprecated Use createSessionManager() or inject via DI container
 */
export const sessionManager = createSessionManager();
