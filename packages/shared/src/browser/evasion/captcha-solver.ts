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

    /**
     * Solve CAPTCHA on page
     * 
     * NOTE: This implementation provides a framework for CAPTCHA solving.
     * For Puppeteer, it can use puppeteer-extra-plugin-recaptcha (requires API key config).
     * For third-party solvers like 2Captcha, integrate their API directly or use HTTP requests.
     */
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
    private async solve2Captcha(params: any): Promise<string | null> {
        logger.warn('CAPTCHA solver placeholder - integrate 2Captcha API for production use');

        // Example integration with 2Captcha API (requires undici):
        /*
        const { request } = require('undici');
        
        // Submit CAPTCHA
        const { body } = await request('https://2captcha.com/in.php?json=1', {
            method: 'POST',
            query: { // For GET requests, use 'query' or append to URL
                key: this.config.apiKey,
                method: 'userrecaptcha',
                googlekey: params.siteKey,
                pageurl: params.pageUrl,
            }
        });
        
        const taskId = submitResponse.data.request;
        
        // Poll for result
        await new Promise(r => setTimeout(r, 20000)); // Wait 20s
        
        const resultResponse = await axios.get('https://2captcha.com/res.php', {
            params: {
                key: this.config.apiKey,
                action: 'get',
                id: taskId,
                json: 1
            }
        });
        
        if (resultResponse.data.status === 1) {
            return resultResponse.data.request; // CAPTCHA token
        }
        */

        return null;
    }
}

export const captchaSolver = new CaptchaSolver();
