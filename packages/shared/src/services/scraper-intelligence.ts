import { Page, Locator } from 'playwright';
import logger from '../utils/logger.js';
import { AIEngine } from '../ai/ai-engine.js';
import { container, Tokens } from '../di/container.js';

/**
 * ScraperIntelligence Mixin/Service
 * 
 * Provides "Self-Driving" capabilities to any Playwright page:
 * 1. Self-Healing Selectors
 * 2. Visual Verification
 * 3. AI Extraction Fallback
 */
export class ScraperIntelligence {
    private get aiEngine(): AIEngine {
        return container.resolve(Tokens.AIEngine);
    }

    /**
     * Locate an element with AI Self-Healing
     * If the primary selector fails, it asks AI to find the element and returns a new selector.
     */
    async safeLocate(page: Page, primarySelector: string, description: string): Promise<Locator | null> {
        try {
            // 1. Try Primary
            const locator = page.locator(primarySelector).first();
            if (await locator.count() > 0 && await locator.isVisible()) {
                return locator;
            }

            logger.warn({ selector: primarySelector, description }, '🩹 Standard selector failed. Attempting AI Healing...');

            // 2. Heal
            const html = await page.content();
            const url = page.url();

            const newSelector = await this.aiEngine.healSelector({
                url,
                html: html.substring(0, 50000), // Limit context
                fieldName: description,
                brokenSelector: primarySelector
            });

            if (newSelector) {
                logger.info({ old: primarySelector, new: newSelector }, '✨ AI Healed Selector!');
                return page.locator(newSelector).first();
            }

            return null;

        } catch (error) {
            logger.error({ error }, '❌ Healing failed');
            return null;
        }
    }

    /**
     * Verify page is actually loaded using Vision (if enabled)
     * Detects "Soft 404s", empty states, or captchas that return 200 OK.
     */
    async verifyContent(page: Page, expectation: string): Promise<boolean> {
        try {
            const buffer = await page.screenshot({ type: 'jpeg', quality: 60 });
            const screenshot = buffer.toString('base64');

            const result = await this.aiEngine.vision.execute({
                screenshot,
                prompt: `Does this page look correct? Expectation: "${expectation}". 
                         If it's an error page, empty, or captcha, say NO. 
                         Respond JSON: { valid: boolean, reason: string }`,
                format: 'json'
            });

            if (!result.valid) {
                logger.warn({ reason: result.reason }, '👁️ Visual Verification Failed');
                return false;
            }
            return true;
        } catch (error) {
            logger.warn({ error }, 'Visual verification error (defaulting to true)');
            return true;
        }
    }

    /**
     * Plan navigation actions when simple clicks fail
     */
    async planNavigation(page: Page, goal: string): Promise<void> {
        // This would utilize ActionPlanningModule
        // For MVP, we stub this or implement a simple version
        logger.info({ goal }, '🧠 AI Planning Navigation...');

        // MVP: Just log for now, as ActionPlanning is complex to wire up without full state
        // In full implementation, this calls aiEngine.actionPlanning.execute(...)
    }
}

// Singleton for easy access, though DI is preferred
export const scraperIntelligence = new ScraperIntelligence();
