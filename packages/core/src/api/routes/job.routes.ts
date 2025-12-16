import { Router } from 'express';
import { JobController } from '../controllers/job.controller.js';
import { requireAPIKey } from '../middleware/auth.middleware.js';

const router = Router();
const jobController = new JobController();

// Protect all job routes
router.use(requireAPIKey);

router.get('/:id', (req, res) => jobController.getJobStatus(req, res));

export default router;
