import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toAppError, AppError, ValidationError, ScraperError, NotFoundError } from '@nx-scraper/shared/types/errors.js';

describe('Error Classes', () => {
    describe('AppError', () => {
        it('should create error with correct properties', () => {
            const error = new AppError('Test error', 'TEST_CODE', 500);

            expect(error.message).toBe('Test error');
            expect(error.code).toBe('TEST_CODE');
            expect(error.statusCode).toBe(500);
            expect(error.name).toBe('AppError');
        });

        it('should default to 500 status code', () => {
            const error = new AppError('Test', 'CODE');
            expect(error.statusCode).toBe(500);
        });
    });

    describe('ValidationError', () => {
        it('should create validation error with details', () => {
            const validationErrors = [
                { field: 'email', message: 'Invalid email' }
            ];
            const error = new ValidationError('Validation failed', validationErrors);

            expect(error.statusCode).toBe(400);
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.validationErrors).toEqual(validationErrors);
        });
    });

    describe('ScraperError', () => {
        it('should create scraper error with context', () => {
            const error = new ScraperError(
                'Scrape failed',
                'heavy-scraper',
                'https://example.com'
            );

            expect(error.statusCode).toBe(500);
            expect(error.code).toBe('SCRAPER_ERROR');
            expect(error.scraper).toBe('heavy-scraper');
            expect(error.url).toBe('https://example.com');
        });
    });

    describe('NotFoundError', () => {
        it('should create not found error', () => {
            const error = new NotFoundError('User', '123');

            expect(error.statusCode).toBe(404);
            expect(error.code).toBe('NOT_FOUND');
            expect(error.message).toContain('User');
            expect(error.message).toContain('123');
        });
    });

    describe('toAppError', () => {
        it('should return AppError as-is', () => {
            const appError = new AppError('Test', 'CODE');
            const result = toAppError(appError);

            expect(result).toBe(appError);
        });

        it('should convert Error to AppError', () => {
            const error = new Error('Test error');
            const result = toAppError(error);

            expect(result).toBeInstanceOf(AppError);
            expect(result.message).toBe('Test error');
            expect(result.code).toBe('INTERNAL_ERROR');
        });

        it('should convert unknown to AppError', () => {
            const result = toAppError('string error');

            expect(result).toBeInstanceOf(AppError);
            expect(result.message).toBe('string error');
        });
    });
});
