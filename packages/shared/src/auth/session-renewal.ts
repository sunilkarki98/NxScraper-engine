import { SessionConfig } from '../types/session.interface.js';
import { sessionManager } from './session-manager.js';
import logger from '../utils/logger.js';

export class SessionRenewalService {
    private intervals: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Start auto-renewal for domain
     */
    startAutoRenewal(domain: string, config: SessionConfig, renewCallback: (session: any) => Promise<void>) {
        if (this.intervals.has(domain)) {
            return;
        }

        logger.info(`Starting session auto-renewal for ${domain}`);

        const interval = setInterval(async () => {
            try {
                const sessions = await sessionManager.getSessionsByDomain(domain);

                for (const session of sessions) {
                    const timeUntilExpiry = session.expiresAt - Date.now();

                    // Renew if less than 1 hour remaining and session is valid
                    if (timeUntilExpiry < 3600000 && session.isValid) {
                        logger.info(`Auto-renewing session ${session.id} for ${domain}`);

                        try {
                            await renewCallback(session);
                        } catch (error) {
                            logger.error(error, `Failed to renew session ${session.id}:`);
                            // Mark as potentially invalid if renewal fails?
                            // session.failureCount++;
                            // await sessionManager.saveSession(session);
                        }
                    }
                }
            } catch (error) {
                logger.error(error, `Error in auto-renewal loop for ${domain}:`);
            }
        }, config.healthCheckInterval * 1000);

        this.intervals.set(domain, interval);
    }

    /**
     * Stop auto-renewal
     */
    stopAutoRenewal(domain: string) {
        const interval = this.intervals.get(domain);
        if (interval) {
            clearInterval(interval);
            this.intervals.delete(domain);
            logger.info(`Stopped session auto-renewal for ${domain}`);
        }
    }
}

export const sessionRenewal = new SessionRenewalService();
