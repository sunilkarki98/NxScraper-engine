import { ICaptchaSolver } from '../../types/evasion.interface.js';
import logger from '../../utils/logger.js';

export interface CaptchaConfig {
    provider: '2captcha' | 'capsolver';
    apiKey: string;
    timeout?: number;
}

export class CaptchaSolver implements ICaptchaSolver {
    private config: CaptchaConfig;

    constructor(config?: CaptchaConfig) {
        this.config = config || {
            provider: '2captcha',
            apiKey: process.env.CAPTCHA_API_KEY || '',
            timeout: 120000 // 2 minutes
        };

        if (!this.config.apiKey) {
            logger.warn('No CAPTCHA_API_KEY configured. CAPTCHA solving will fail.');
        }
    }

    async solve(page: any, type: 'recaptcha' | 'hcaptcha' | 'turnstile'): Promise<{ success: boolean; token?: string }> {
        if (!this.config.apiKey) {
            logger.error('Cannot solve CAPTCHA: No API key configured');
            return { success: false };
        }

        try {
            logger.info(`Attempting to solve ${type} CAPTCHA using ${this.config.provider}`);

            switch (type) {
                case 'recaptcha':
                    return await this.solveRecaptcha(page);
                case 'hcaptcha':
                    return await this.solveHCaptcha(page);
                case 'turnstile':
                    return await this.solveTurnstile(page);
                default:
                    return { success: false };
            }
        } catch (error: any) {
            logger.error(error, `CAPTCHA solving failed:`);
            return { success: false };
        }
    }

    /**
     * AI-Native Vision Solver (Cost Saver)
     * Attempts to click the "I am not a robot" box using Vision LLM
     */
    async solveWithVision(page: any, aiEngine: any): Promise<boolean> {
        try {
            logger.info('👁️ Attempting to solve CAPTCHA visually (Cost Saving Mode)...');

            // 1. Take Screenshot
            const screenshot = await page.screenshot({ fullPage: false, encoding: 'base64' });

            // 2. Ask Vision AI
            const start = Date.now();
            const result = await aiEngine.vision.execute({
                screenshot,
                prompt: `You are a captcha interaction agent. Look at this screenshot.
                Focus on finding the 'I am not a robot' checkbox, or the 'Verify' button for Cloudflare/Turnstile.
                
                Goal: Return the precise X and Y coordinates to click to solve or initiate the captcha.
                center the coordinates on the checkbox/button.
                
                Return VALID JSON ONLY: { "found": true, "x": 123, "y": 456, "reason": "found checkbox" }
                If not found, return { "found": false }`
            });

            const analysis = result.data as any;

            if (analysis && analysis.found && analysis.x && analysis.y) {
                logger.info({ coords: { x: analysis.x, y: analysis.y }, latency: Date.now() - start }, '👁️ Vision found CAPTCHA target');

                // 3. Click with GhostCursor
                const { ghostCursor } = await import('../evasion/ghost-cursor.js');
                const x = typeof analysis.x === 'string' ? parseInt(analysis.x) : analysis.x;
                const y = typeof analysis.y === 'string' ? parseInt(analysis.y) : analysis.y;

                await ghostCursor.moveAndClickAt(page, x, y);

                return true;
            }

            logger.info('👁️ Vision did not find a clickable CAPTCHA element');
            return false;

        } catch (error) {
            logger.warn({ error }, '👁️ Vision Solver failed');
            return false;
        }
    }

    /**
     * Solve reCAPTCHA
     */
    private async solveRecaptcha(page: any): Promise<{ success: boolean; token?: string }> {
        // Extract site key
        const siteKey = await page.evaluate(() => {
            const elem = document.querySelector('[data-sitekey]');
            return elem ? elem.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) {
            logger.error('Could not find reCAPTCHA site key');
            return { success: false };
        }

        const pageUrl = page.url();
        logger.info(`Solving reCAPTCHA with siteKey: ${siteKey}`);

        // Submit to solving service
        const token = await this.submitCaptcha({
            type: 'recaptcha',
            siteKey,
            pageUrl
        });

        if (token) {
            // Inject token into page
            await page.evaluate((captchaToken: string) => {
                const textarea = document.getElementById('g-recaptcha-response') as HTMLTextAreaElement;
                if (textarea) {
                    textarea.value = captchaToken;
                    textarea.style.display = 'block';
                }
                // Trigger callback if exists
                if ((window as any).___grecaptcha_cfg) {
                    const widgetId = Object.keys((window as any).___grecaptcha_cfg.clients?.[0] || {})[0];
                    if (widgetId) {
                        (window as any).___grecaptcha_cfg.clients[0][widgetId].callback(captchaToken);
                    }
                }
            }, token);

            logger.info('reCAPTCHA solved successfully');
            return { success: true, token };
        }

        return { success: false };
    }

    /**
     * Solve hCaptcha
     */
    private async solveHCaptcha(page: any): Promise<{ success: boolean; token?: string }> {
        // Extract site key
        const siteKey = await page.evaluate(() => {
            const elem = document.querySelector('[data-sitekey]');
            return elem ? elem.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) {
            logger.error('Could not find hCaptcha site key');
            return { success: false };
        }

        const pageUrl = page.url();
        logger.info(`Solving hCaptcha with siteKey: ${siteKey}`);

        const token = await this.submitCaptcha({
            type: 'hcaptcha',
            siteKey,
            pageUrl
        });

        if (token) {
            // Inject token
            await page.evaluate((captchaToken: string) => {
                const textarea = document.querySelector('[name="h-captcha-response"]') as HTMLTextAreaElement;
                if (textarea) {
                    textarea.value = captchaToken;
                }
            }, token);

            logger.info('hCaptcha solved successfully');
            return { success: true, token };
        }

        return { success: false };
    }

    /**
     * Solve Cloudflare Turnstile
     */
    private async solveTurnstile(page: any): Promise<{ success: boolean; token?: string }> {
        // Extract site key
        const siteKey = await page.evaluate(() => {
            const elem = document.querySelector('[data-sitekey]');
            return elem ? elem.getAttribute('data-sitekey') : null;
        });

        if (!siteKey) {
            logger.error('Could not find Turnstile site key');
            return { success: false };
        }

        const pageUrl = page.url();
        logger.info(`Solving Turnstile with siteKey: ${siteKey}`);

        const token = await this.submitCaptcha({
            type: 'turnstile',
            siteKey,
            pageUrl
        });

        if (token) {
            logger.info('Turnstile solved successfully');
            return { success: true, token };
        }

        return { success: false };
    }

    /**
     * Submit CAPTCHA to solving service
     */
    private async submitCaptcha(params: {
        type: string;
        siteKey: string;
        pageUrl: string;
    }): Promise<string | null> {
        try {
            switch (this.config.provider) {
                case '2captcha':
                    return await this.solve2Captcha(params);
                default:
                    logger.error(`Unsupported CAPTCHA provider: ${this.config.provider}`);
                    return null;
            }
        } catch (error: any) {
            logger.error(error, `Failed to submit CAPTCHA to ${this.config.provider}:`);
            return null;
        }
    }

    /**
     * Solve using 2Captcha service (or any HTTP-based solver)
     * 
     * To integrate:
     * 1. Install http client: npm install undici
     * 2. Follow 2Captcha API docs: https://2captcha.com/2captcha-api
     * 3. Implement HTTP requests to submit/retrieve CAPTCHA solutions
     */
    private async solve2Captcha(params: {
        siteKey: string;
        pageUrl: string;
        type: string;
    }): Promise<string | null> {
        if (!this.config.apiKey) return null;

        try {
            // 1. Submit CAPTCHA
            const submitUrl = new URL('https://2captcha.com/in.php');
            submitUrl.searchParams.append('key', this.config.apiKey);
            submitUrl.searchParams.append('json', '1');

            // Map types to 2Captcha methods
            if (params.type === 'recaptcha') {
                submitUrl.searchParams.append('method', 'userrecaptcha');
                submitUrl.searchParams.append('googlekey', params.siteKey);
            } else if (params.type === 'hcaptcha') {
                submitUrl.searchParams.append('method', 'hcaptcha');
                submitUrl.searchParams.append('sitekey', params.siteKey);
            } else if (params.type === 'turnstile') {
                submitUrl.searchParams.append('method', 'turnstile');
                submitUrl.searchParams.append('sitekey', params.siteKey);
            } else {
                return null;
            }

            submitUrl.searchParams.append('pageurl', params.pageUrl);

            const submitRes = await fetch(submitUrl.toString());
            const submitData = await submitRes.json() as any;

            if (submitData.status !== 1) {
                logger.error({ response: submitData }, '2Captcha submission failed');
                return null;
            }

            const taskId = submitData.request;
            logger.info({ taskId }, 'CAPTCHA submitted to 2Captcha. Waiting for solution...');

            // 2. Poll for result
            const maxAttempts = 30; // 30 * 5s = 150s max
            for (let i = 0; i < maxAttempts; i++) {
                await new Promise(r => setTimeout(r, 5000)); // Wait 5s

                const resultUrl = new URL('https://2captcha.com/res.php');
                resultUrl.searchParams.append('key', this.config.apiKey);
                resultUrl.searchParams.append('action', 'get');
                resultUrl.searchParams.append('id', taskId);
                resultUrl.searchParams.append('json', '1');

                const resultRes = await fetch(resultUrl.toString());
                const resultData = await resultRes.json() as any;

                if (resultData.status === 1) {
                    return resultData.request; // The token
                }

                if (resultData.request !== 'CAPCHA_NOT_READY') {
                    logger.warn({ response: resultData }, '2Captcha polling error');
                    return null;
                }
            }

            logger.error('2Captcha timeout');
            return null;

        } catch (error) {
            logger.error({ error }, '2Captcha API error');
            return null;
        }
    }
}

export const captchaSolver = new CaptchaSolver();

/**
 * Factory function to create CaptchaSolver instance
 */
export function createCaptchaSolver(): CaptchaSolver {
    return new CaptchaSolver();
}
