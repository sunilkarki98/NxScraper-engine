import { Request, Response } from 'express';
import { apiKeyManager } from '@nx-scraper/shared';
import { externalKeyManager } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

export class KeyController {
    /**
     * Generate a new internal API key
     * POST /keys/internal
     */
    async generateInternalKey(req: Request, res: Response) {
        try {
            const { userId, tier = 'free', metadata } = req.body;

            if (!userId) {
                return res.status(400).json({ error: 'userId is required' });
            }

            const result = await apiKeyManager.generateKey({ userId, tier, name: metadata?.name });

            logger.info({ userId, tier }, 'Generated new internal API key');

            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            logger.error({ error }, 'Failed to generate internal key');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Register a pre-generated API key from admin panel
     * POST /keys/register
     */
    async registerInternalKey(req: Request, res: Response) {
        try {
            const { keyHash, userId, tier, rateLimit, name } = req.body;

            if (!keyHash || !userId) {
                return res.status(400).json({ error: 'keyHash and userId are required' });
            }

            if (!rateLimit || !rateLimit.maxRequests || !rateLimit.windowSeconds) {
                return res.status(400).json({ error: 'rateLimit with maxRequests and windowSeconds is required' });
            }

            const keyId = await apiKeyManager.registerHashedKey({
                keyHash,
                userId,
                tier: tier || 'free',
                rateLimit,
                name
            });

            logger.info({ keyId, userId, tier }, 'Registered API key from admin panel');

            res.status(201).json({
                success: true,
                data: { id: keyId }
            });
        } catch (error) {
            logger.error({ error }, 'Failed to register internal key');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * List internal API keys for a user
     * GET /keys/internal?userId=...
     */
    async listInternalKeys(req: Request, res: Response) {
        try {
            const { userId } = req.query;

            if (!userId || typeof userId !== 'string') {
                return res.status(400).json({ error: 'userId query parameter is required' });
            }

            const keys = await apiKeyManager.listKeys(userId);

            res.json({
                success: true,
                data: keys
            });
        } catch (error) {
            logger.error({ error }, 'Failed to list internal keys');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Revoke an internal API key
     * DELETE /keys/internal/:id
     */
    async revokeInternalKey(req: Request, res: Response) {
        try {
            const { id } = req.params;

            await apiKeyManager.revokeKey(id);

            logger.info({ keyId: id }, 'Revoked internal API key');

            res.json({
                success: true,
                message: 'Key revoked successfully'
            });
        } catch (error) {
            logger.error({ error }, 'Failed to revoke internal key');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Add a new external API key (e.g. OpenAI)
     * POST /keys/external
     */
    async addExternalKey(req: Request, res: Response) {
        try {
            const { provider, value, name } = req.body;

            if (!provider || !value) {
                return res.status(400).json({ error: 'provider and value are required' });
            }

            const id = await externalKeyManager.addKey(provider, value, name);

            logger.info({ provider, name }, 'Added new external API key');

            res.status(201).json({
                success: true,
                data: { id, provider, name }
            });
        } catch (error) {
            logger.error({ error }, 'Failed to add external key');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * List external API keys (masked)
     * GET /keys/external?provider=...
     */
    async listExternalKeys(req: Request, res: Response) {
        try {
            const { provider } = req.query;

            const keys = await externalKeyManager.listKeys(provider as string);

            res.json({
                success: true,
                data: keys
            });
        } catch (error) {
            logger.error({ error }, 'Failed to list external keys');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Remove an external API key
     * DELETE /keys/external/:id
     */
    async removeExternalKey(req: Request, res: Response) {
        try {
            const { id } = req.params;

            await externalKeyManager.removeKey(id);

            logger.info({ keyId: id }, 'Removed external API key');

            res.json({
                success: true,
                message: 'Key removed successfully'
            });
        } catch (error) {
            logger.error({ error }, 'Failed to remove external key');
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
