import { Page } from 'playwright';
import { ghostCursor } from '../browser/evasion/ghost-cursor.js';
import { ActionPlan, ActionStep } from '../ai/schemas/ai-outputs.schema.js';
import logger from '../utils/logger.js';

export class InteractionManager {

    /**
     * Execute a sequence of AI-planned actions on a page
     */
    async executePlan(page: Page, plan: ActionPlan): Promise<boolean> {
        logger.info({ steps: plan.actions.length, reasoning: plan.reasoning }, '🎬 Executing AI Action Plan');

        for (const action of plan.actions) {
            try {
                await this.performAction(page, action);
                // Random human pause between actions
                await page.waitForTimeout(500 + Math.random() * 1000);
            } catch (error) {
                logger.error({ error, action }, '❌ Action failed');
                if (action.mandatory) {
                    throw new Error(`Critical action failed: ${action.description}`);
                }
            }
        }

        return true;
    }

    private async performAction(page: Page, action: ActionStep): Promise<void> {
        logger.debug({ type: action.type, selector: action.selector }, `👉 Action: ${action.description}`);

        switch (action.type) {
            case 'click':
                if (!action.selector) throw new Error('Selector missing for click');
                await ghostCursor.moveAndClick(page, action.selector);
                break;

            case 'fill':
                if (!action.selector || !action.value) throw new Error('Selector or value missing for fill');
                await ghostCursor.type(page, action.selector, action.value);
                break;

            case 'wait':
                const ms = parseInt(action.value || '1000');
                await page.waitForTimeout(ms);
                break;

            case 'scroll':
                if (action.selector) {
                    await ghostCursor.moveTo(page, action.selector);
                } else {
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                }
                break;

            default:
                logger.warn({ type: action.type }, '⚠️ Unknown action type, skipping');
        }
    }
}

export const interactionManager = new InteractionManager();
