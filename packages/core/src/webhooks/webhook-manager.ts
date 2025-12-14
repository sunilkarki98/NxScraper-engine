import { request, Dispatcher } from 'undici';
import crypto from 'crypto';
import { logger, env, toAppError } from '@nx-scraper/shared';

export interface WebhookEvent<T = unknown> {
    type: 'job.created' | 'job.completed' | 'job.failed';
    payload: T;
    timestamp: string;
}

export class WebhookManager {
    private webhookUrl: string;
    private webhookSecret: string;

    constructor() {
        this.webhookUrl = env.WEBHOOK_URL || '';
        this.webhookSecret = env.WEBHOOK_SECRET || '';

        if (!this.webhookUrl) {
            logger.warn('⚠️ No WEBHOOK_URL configured. Webhook delivery disabled.');
        }
    }

    /**
     * Dispatch an event to the configured webhook
     */
    async dispatch(eventType: WebhookEvent['type'], data: unknown, retryCount = 0): Promise<boolean> {
        if (!this.webhookUrl) return false;

        const event: WebhookEvent = {
            type: eventType,
            payload: data,
            timestamp: new Date().toISOString()
        };

        const signature = this.signPayload(event);

        try {
            await this.performRequest(event, signature, eventType);
            logger.debug({ type: eventType }, 'Webhook delivered successfully');
            return true;
        } catch (error: unknown) {
            const appError = toAppError(error);
            const maxRetries = 3;
            if (retryCount < maxRetries) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
                logger.warn({ retryCount: retryCount + 1, error: appError.message, delay }, 'Retrying webhook delivery');

                await new Promise(resolve => setTimeout(resolve, delay));
                return this.dispatch(eventType, data, retryCount + 1);
            }

            logger.error({
                type: eventType,
                error: appError.message,
                status: appError.statusCode
            }, 'Failed to deliver webhook after retries');
            return false;
        }
    }

    private async performRequest(event: WebhookEvent, signature: string, eventType: string): Promise<void> {
        const { statusCode, body } = await request(this.webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'NxScraper-Engine/2.0',
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': eventType
            },
            body: JSON.stringify(event)
        });

        if (statusCode >= 300) {
            // Drain body to prevent leaks if we're throwing
            // In undici, if you don't consume the body, the socket might hang or leak
            // For errors, we might want to read it for logs or just ignore
            try {
                await body.text();
            } catch (_) { }

            throw new Error(`Webhook responded with status ${statusCode}`);
        }

        // Ensure body is consumed
        await body.text();
    }

    /**
     * Create HMAC SHA256 signature
     */
    private signPayload(payload: unknown): string {
        if (!this.webhookSecret) return '';
        return crypto
            .createHmac('sha256', this.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');
    }
}

export const webhookManager = new WebhookManager();
