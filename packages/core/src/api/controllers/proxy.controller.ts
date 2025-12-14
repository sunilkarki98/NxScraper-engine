import { Request, Response } from 'express';
import { proxyManager } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

export class ProxyController {
    /**
     * Add new proxies
     * POST /proxies
     * Body: { proxies: ["http://user:pass@host:port", ...] }
     */
    async addProxies(req: Request, res: Response) {
        try {
            const { proxies, provider, country } = req.body;

            if (!proxies || !Array.isArray(proxies)) {
                return res.status(400).json({ error: 'proxies array is required' });
            }

            const results = [];
            for (const url of proxies) {
                const proxy = await proxyManager.addProxy(url, { provider, country });
                results.push(proxy);
            }

            logger.info({ count: results.length, provider }, 'Added new proxies');

            res.status(201).json({
                success: true,
                data: results
            });
        } catch (error) {
            logger.error({ error }, 'Failed to add proxies');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * List all proxies
     * GET /proxies
     */
    async listProxies(req: Request, res: Response) {
        try {
            const proxies = await proxyManager.listProxies();

            res.json({
                success: true,
                count: proxies.length,
                data: proxies.map(p => ({
                    id: p.id,
                    provider: p.provider,
                    country: p.country,
                    status: p.isActive ? 'active' : 'inactive',
                    usage: p.usageCount,
                    lastUsed: p.lastUsed ? new Date(p.lastUsed).toISOString() : null,
                    errors: p.errorCount
                }))
            });
        } catch (error) {
            logger.error({ error }, 'Failed to list proxies');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Remove a proxy
     * DELETE /proxies/:id
     */
    async removeProxy(req: Request, res: Response) {
        try {
            const { id } = req.params;

            await proxyManager.removeProxy(id);

            logger.info({ proxyId: id }, 'Removed proxy');

            res.json({
                success: true,
                message: 'Proxy removed successfully'
            });
        } catch (error) {
            logger.error({ error }, 'Failed to remove proxy');
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
