import { Registry, collectDefaultMetrics } from 'prom-client';
import logger from '../utils/logger.js';

// Create a global registry for the entire application (Shared across Core and Plugins)
export const register = new Registry();

// Initialize default Node.js metrics
// Prevent multiple initializations
let initialized = false;

export function initMetrics(): void {
    if (initialized) return;

    collectDefaultMetrics({ register });
    logger.info('📊 Shared Metrics Registry initialized');
    initialized = true;
}

export async function getMetrics(): Promise<string> {
    return register.metrics();
}
