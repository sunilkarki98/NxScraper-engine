import { describe, it, expect, beforeEach } from 'vitest';
import { getBrowserPage } from '../utils/helpers';

describe('Browser Integration', () => {
    it('should launch real browser and navigate', async () => {
        const page = await getBrowserPage();

        try {
            // Navigate to real website
            await page.goto('https://example.com', {
                waitUntil: 'networkidle'
            });

            // Verify page loaded
            const title = await page.title();
            expect(title).toContain('Example');

            // Extract real content
            const content = await page.content();
            expect(content).toContain('Example Domain');

            // Find real element
            const heading = await page.$('h1');
            expect(heading).not.toBeNull();

            const headingText = await heading?.textContent();
            expect(headingText).toBe('Example Domain');

        } finally {
            await page.close();
        }
    }, 15000); // 15 second timeout

    it('should handle JavaScript execution', async () => {
        const page = await getBrowserPage();

        try {
            await page.goto('https://example.com');

            // Execute real JavaScript
            const result = await page.evaluate(() => {
                return {
                    title: document.title,
                    url: window.location.href,
                    hasH1: !!document.querySelector('h1'),
                };
            });

            expect(result.title).toBeTruthy();
            expect(result.url).toContain('example.com');
            expect(result.hasH1).toBe(true);

        } finally {
            await page.close();
        }
    }, 15000);
});
