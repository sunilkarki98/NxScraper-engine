import { Page } from 'playwright';
import logger from '../utils/logger.js';
import { container, Tokens } from '../di/container.js';
import { ghostCursor } from '../browser/evasion/ghost-cursor.js';
import { AIEngine } from '../ai/ai-engine.js';
import { ICaptchaSolver } from '../utils/captcha-solver.js';

export interface EvasionServiceOptions {
    level: 'low' | 'medium' | 'high';
    randomizeCursor?: boolean;
    solveCaptchas?: boolean;
}

export class EvasionService {
    private get aiEngine(): AIEngine {
        return container.resolve(Tokens.AIEngine);
    }

    private get captchaSolver(): ICaptchaSolver {
        return container.resolve(Tokens.CaptchaSolver);
    }

    /**
     * Apply evasion techniques to the page
     */
    async apply(page: Page, options: EvasionServiceOptions = { level: 'medium' }): Promise<void> {
        logger.debug({ level: options.level }, '👻 EvasionService: Applying stealth protocols');

        // 1. Cursor Humanization
        if (options.randomizeCursor !== false) {
            await ghostCursor.moveRandomly(page);
        }

        // 2. Behavioral Patterns based on Level
        if (options.level === 'high') {
            await this.simulateHumanReading(page);
        }
    }

    /**
     * Detect and attempt to solve blocking mechanisms
     * @returns true if block was detected and solved, false otherwise
     */
    async handleBlocking(page: Page, url: string): Promise<boolean> {
        // 1. Initial Quick Check (Heuristic)
        const content = await page.content();
        const isSuspicious = content.includes('captcha') ||
            content.includes('challenge-platform') ||
            content.includes('Cloudflare');

        if (!isSuspicious) return false;

        logger.warn({ url }, '🛡️ EvasionService: Potential block detected. Engaging AI countermeasures...');

        // 2. AI Analysis
        if (!this.aiEngine.isAvailable()) {
            logger.warn('AI Engine unavailable for evasion analysis');
            return false;
        }

        try {
            const protectionAnalysis = await this.aiEngine.antiBlocking.execute({
                url: url,
                html: content,
                statusCode: 200
            });

            // 3. Active Countermeasures
            if (protectionAnalysis.data?.recommendations?.captcha?.detected) {
                logger.info('🤖 AI identified CAPTCHA. Initiating Vision Solver...');

                const visionSuccess = await this.captchaSolver.solveWithVision(page, this.aiEngine);

                if (visionSuccess) {
                    logger.info('✅ EvasionService: CAPTCHA defeated!');
                    await page.waitForTimeout(3000); // Cool-down
                    return true;
                } else {
                    logger.warn('👁️ Vision Solver failed. Attempting fallback evasion...');
                    await ghostCursor.moveRandomly(page);
                    return false;
                }
            }
        } catch (error) {
            logger.error({ error }, 'EvasionService: Countermeasures failed');
        }

        return false;
    }

    private async simulateHumanReading(page: Page) {
        // Simulate reading behavior: scroll, pause, scroll
        await page.evaluate(() => window.scrollBy(0, 300));
        await page.waitForTimeout(500 + Math.random() * 1000);
        await page.evaluate(() => window.scrollBy(0, 200));
    }
}

// Factory for DI
export function createEvasionService(): EvasionService {
    return new EvasionService();
}

// Singleton instance
export const evasionService = new EvasionService();

// Register in DI Container
container.register(Tokens.EvasionService, evasionService);
