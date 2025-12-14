import { Router } from 'express';
import { RAGController } from '../controllers/rag.controller.js';
import { requireAPIKey } from '../middleware/auth.middleware.js';

const router = Router();
const controller = new RAGController();

// Protected by API Key
router.post('/index', requireAPIKey, controller.indexDocument);
router.post('/query', requireAPIKey, controller.query);

export default router;
