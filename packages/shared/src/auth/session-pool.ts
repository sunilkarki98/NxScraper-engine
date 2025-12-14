import { SessionData, SessionConfig } from '../types/session.interface.js';
import { sessionManager } from './session-manager.js';
import logger from '../utils/logger.js';

export class SessionPool {
    private config: SessionConfig;

    constructor(config: SessionConfig) {
        this.config = config;
    }

    /**
     * Get next available session based on rotation strategy
     */
    async getNextSession(): Promise<SessionData | null> {
        const sessions = await sessionManager.getSessionsByDomain(this.config.domain);
        const validSessions = sessions.filter(s => s.isValid && s.expiresAt > Date.now());

        if (validSessions.length === 0) {
            logger.warn(`No valid sessions available for ${this.config.domain}`);
            return null;
        }

        let selected: SessionData;

        switch (this.config.rotationStrategy) {
            case 'least-used':
                selected = validSessions.sort((a, b) => a.useCount - b.useCount)[0];
                break;

            case 'random':
                selected = validSessions[Math.floor(Math.random() * validSessions.length)];
                break;

            case 'round-robin':
            default:
                // Simple round-robin by last used
                selected = validSessions.sort((a, b) => a.lastUsedAt - b.lastUsedAt)[0];
                break;
        }

        return selected;
    }

    /**
     * Add session to pool, enforcing limits
     */
    async addSession(session: SessionData): Promise<void> {
        const existing = await sessionManager.getSessionsByDomain(session.domain);

        if (existing.length >= this.config.maxConcurrent) {
            // Remove oldest/least valuable session
            const sorted = existing.sort((a, b) => {
                if (!a.isValid && b.isValid) return -1; // Remove invalid first
                if (a.isValid && !b.isValid) return 1;
                return a.lastUsedAt - b.lastUsedAt; // Then oldest
            });

            const toRemove = sorted[0];
            await sessionManager.deleteSession(session.domain, toRemove.id);
            logger.info(`Session pool full. Removed session ${toRemove.id}`);
        }

        await sessionManager.saveSession(session);
    }
}
