import { z } from 'zod';

/**
 * Standard API Response Envelope
 */
export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    meta?: {
        timestamp: string;
        requestId?: string;
        pagination?: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    };
}

/**
 * Helper to create success response
 */
export function successResponse<T>(data: T, meta?: Partial<APIResponse['meta']>): APIResponse<T> {
    return {
        success: true,
        data,
        meta: {
            timestamp: new Date().toISOString(),
            ...meta
        }
    };
}

/**
 * Helper to create error response
 */
export function errorResponse(code: string, message: string, details?: any): APIResponse {
    return {
        success: false,
        error: {
            code,
            message,
            details
        },
        meta: {
            timestamp: new Date().toISOString()
        }
    };
}

/**
 * Pagination query parameters schema
 */
export const PaginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20)
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

/**
 * Calculate pagination metadata
 */
export function getPaginationMeta(total: number, params: PaginationParams) {
    return {
        pagination: {
            page: params.page,
            limit: params.limit,
            total,
            totalPages: Math.ceil(total / params.limit)
        }
    };
}
