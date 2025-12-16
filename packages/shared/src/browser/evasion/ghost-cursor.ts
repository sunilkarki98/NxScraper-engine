import { IGhostCursor } from '../../types/evasion.interface.js';
import logger from '../../utils/logger.js';

// We'll dynamically import ghost-cursor to avoid build errors if not installed yet
// In a real scenario, we'd ensure it's in package.json
let createCursor: any;
try {
    // Attempt to require ghost-cursor for Playwright
    // Note: This requires the 'ghost-cursor' package
    // createCursor = require('ghost-cursor').createCursor;
} catch (e) {
    logger.debug('ghost-cursor package not found, using fallback implementation');
}

export class GhostCursor implements IGhostCursor {
    async moveAndClick(page: any, selector: string): Promise<void> {
        try {
            if (createCursor) {
                const cursor = createCursor(page);
                await cursor.click(selector);
            } else {
                // Fallback: Human-like movement simulation
                const element = await page.$(selector);
                if (element) {
                    const box = await element.boundingBox();
                    if (box) {
                        // Move to random point within element
                        const x = box.x + Math.random() * box.width;
                        const y = box.y + Math.random() * box.height;

                        // Simple curve simulation (bezier) could be added here
                        // For now, just move and click with delay
                        await page.mouse.move(x, y, { steps: 10 });
                        await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
                        await page.mouse.down();
                        await new Promise(r => setTimeout(r, Math.random() * 50 + 20));
                        await page.mouse.up();
                    }
                }
            }
        } catch (error) {
            logger.warn(`GhostCursor moveAndClick failed for ${selector}: ${error}`);
            // Fallback to standard click
            await page.click(selector);
        }
    }

    async type(page: any, selector: string, text: string): Promise<void> {
        try {
            await this.moveAndClick(page, selector);

            // Human-like typing with variable delays
            for (const char of text) {
                await page.keyboard.type(char, { delay: Math.random() * 100 + 30 });

                // Occasional pause
                if (Math.random() > 0.9) {
                    await new Promise(r => setTimeout(r, Math.random() * 300 + 100));
                }
            }
        } catch (error) {
            logger.warn(`GhostCursor type failed: ${error}`);
            await page.type(selector, text);
        }
    }

    async moveTo(page: any, selector: string): Promise<void> {
        // Implementation similar to moveAndClick but without the click
        const element = await page.$(selector);
        if (element) {
            const box = await element.boundingBox();
            if (box) {
                const x = box.x + box.width / 2;
                const y = box.y + box.height / 2;
                await page.mouse.move(x, y, { steps: 20 });
            }
        }
    }
    async moveRandomly(page: any): Promise<void> {
        try {
            const viewport = (typeof page.viewport === 'function' ? page.viewport() : page.viewportSize()) || { width: 1920, height: 1080 };
            const steps = Math.floor(Math.random() * 3) + 2; // 2 to 4 movements

            for (let i = 0; i < steps; i++) {
                const x = Math.random() * viewport.width;
                const y = Math.random() * viewport.height;

                await page.mouse.move(x, y, { steps: 25 });
                await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
            }
        } catch (error) {
            logger.warn(`GhostCursor moveRandomly failed: ${error}`);
        }
    }

    async moveAndClickAt(page: any, x: number, y: number): Promise<void> {
        try {
            // Bezier curve simulation (simplified)
            await page.mouse.move(x, y, { steps: 25 });
            await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
            await page.mouse.down();
            await new Promise(r => setTimeout(r, Math.random() * 50 + 20));
            await page.mouse.up();
        } catch (error) {
            logger.warn({ error, x, y }, 'GhostCursor moveAndClickAt failed');
            await page.mouse.click(x, y);
        }
    }
}

export const ghostCursor = new GhostCursor();
