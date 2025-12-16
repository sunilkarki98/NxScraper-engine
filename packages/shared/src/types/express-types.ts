import { Request } from 'express';
import { APIKeyData } from './api-key.interface.js';

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        role: string;
    };
    apiKey?: APIKeyData;
    id?: string; // Request ID from middleware
    correlationId?: string;
}
