import { Router } from 'express';
import { ProxyController } from '../controllers/proxy.controller.js';
import { requireAPIKey } from '../middleware/auth.middleware.js';

const router = Router();
const controller = new ProxyController();

// Protected by API Key (Admin)
router.post('/', requireAPIKey, controller.addProxies);
router.get('/', requireAPIKey, controller.listProxies);
router.delete('/:id', requireAPIKey, controller.removeProxy);

export default router;
