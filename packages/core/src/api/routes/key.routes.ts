import { Router } from 'express';
import { KeyController } from '../controllers/key.controller.js';
import { requireAPIKey, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();
const controller = new KeyController();

// Internal Keys (Protected by Admin Key)
router.post('/internal', requireAPIKey, requireAdmin, controller.generateInternalKey);
router.get('/internal', requireAPIKey, requireAdmin, controller.listInternalKeys);
router.delete('/internal/:id', requireAPIKey, requireAdmin, controller.revokeInternalKey);

// Register pre-generated key from admin panel
router.post('/register', requireAPIKey, requireAdmin, controller.registerInternalKey);

// External Keys
router.post('/external', requireAPIKey, requireAdmin, controller.addExternalKey);
router.get('/external', requireAPIKey, requireAdmin, controller.listExternalKeys);
router.delete('/external/:id', requireAPIKey, requireAdmin, controller.removeExternalKey);

export default router;

