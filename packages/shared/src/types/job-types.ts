import { z } from 'zod';
import { ScrapeOptions, ScrapeResult } from './scraper.interface.js';

/**
 * Job Type Definitions
 * Strongly-typed interfaces for all job data structures to eliminate `any` types
 * Extends existing scraper types and adds job-specific structures
 */

// ============================================
// Scraper Types (extends existing)
// ============================================

export type ScraperType =
    | 'heavy-scraper'
    | 'ultra-scraper'
    | 'universal-scraper'
    | 'google-scraper'
    | 'google-places';

export interface ScrapeJobData {
    scraperType: ScraperType;
    url: string;
    options?: ScrapeOptions;
    metadata?: {
        userId?: string;
        requestId?: string;
        source?: string;
    };
}

// Re-export ScrapeResult from scraper.interface
export type { ScrapeResult, ScrapeOptions };

// ============================================
// AI Extraction Types
// ============================================

export interface AIExtractionSchema {
    [key: string]: any; // Changed to any to match Zod's z.any()
}

export interface AIExtractionOptions {
    url?: string;
    html?: string;
    schema?: AIExtractionSchema; // Made optional to match AIJobData
    model?: string;
    instructions?: string;
    temperature?: number;
}

export interface AIJobData {
    type: 'extraction' | 'classification' | 'summarization';
    url?: string;
    html?: string;
    schema?: AIExtractionSchema;
    model?: string;
    options?: AIExtractionOptions;
}

export interface AIExtractionResult {
    success: boolean;
    data?: unknown;
    confidence?: number;
    model?: string;
    error?: string;
    metadata?: {
        tokensUsed?: number;
        duration: number;
        timestamp: number;
    };
}

// ============================================
// Agent Types
// ============================================

export interface AgentTask {
    goal: string;
    url: string;
    context?: Record<string, unknown>;
    maxSteps?: number;
}

export interface AgentJobData {
    task: AgentTask;
    model?: string;
}

export interface AgentResult {
    success: boolean;
    result?: unknown;
    steps?: Array<{
        action: string;
        result: unknown;
        timestamp: number;
    }>;
    error?: string;
}

// ============================================
// Business Search Types
// ============================================

export type BusinessType =
    | 'restaurant'
    | 'hotel'
    | 'gym'
    | 'store'
    | 'cafe'
    | 'bar'
    | string; // Allow custom types

export interface BusinessSearchOptions {
    query: string;
    location?: string;
    businessType?: BusinessType;
    limit?: number;
    radius?: number;
}

export interface BusinessResult {
    name: string;
    address?: string;
    phone?: string;
    website?: string;
    rating?: number;
    reviews?: number;
    category?: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
}

// ============================================
// Union Types for Job Data
// ============================================

export type JobDataType =
    | ScrapeJobData
    | AIJobData
    | AgentJobData
    | BusinessSearchOptions;

export type JobResultType =
    | ScrapeResult
    | AIExtractionResult
    | AgentResult
    | { businesses: BusinessResult[] };

// ============================================
// Job Metadata
// ============================================

export interface JobMetadata {
    jobId: string;
    queueName: string;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    attempts: number;
    maxAttempts: number;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    error?: string;
}

// ============================================
// Worker Message Types
// ============================================

export interface WorkerMessage {
    packagePath: string;
    className: string;
    options: ScrapeOptions;
}

export interface ScraperPlugin {
    name: string;
    version: string;
    scrape: (options: ScrapeOptions) => Promise<ScrapeResult>;
    cleanup?: () => Promise<void>;
}

// ============================================
// Zod Schemas for Runtime Validation
// ============================================

export const ScrapeJobDataSchema = z.object({
    scraperType: z.enum([
        'heavy-scraper',
        'ultra-scraper',
        'universal-scraper',
        'google-scraper',
        'google-places'
    ]),
    url: z.string().url(),
    options: z.object({
        url: z.string().url().optional(), // Added optional to match ScrapeOptions
        headless: z.boolean().optional(),
        timeout: z.number().optional(),
        waitForSelector: z.string().optional(),
        screenshot: z.boolean().optional(),
        proxy: z.string().optional(),
        userAgent: z.string().optional(),
        cookies: z.array(z.object({
            name: z.string(),
            value: z.string(),
            domain: z.string().optional()
        })).optional(),
        evasion: z.object({
            fingerprint: z.boolean().optional(),
            stealth: z.boolean().optional()
        }).optional()
    }).passthrough().optional(), // passthrough allows additional properties
    metadata: z.object({
        userId: z.string().optional(),
        requestId: z.string().optional(),
        source: z.string().optional()
    }).optional()
});

export const AIJobDataSchema = z.object({
    type: z.enum(['extraction', 'classification', 'summarization']),
    url: z.string().url().optional(),
    html: z.string().optional(),
    schema: z.record(z.string(), z.any()).optional(),
    model: z.string().optional(),
    options: z.object({
        url: z.string().url().optional(),
        html: z.string().optional(),
        schema: z.record(z.string(), z.any()).optional(), // Added schema to options
        model: z.string().optional(),
        instructions: z.string().optional(),
        temperature: z.number().optional()
    }).passthrough().optional()
});
