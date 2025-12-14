import logger from './logger.js';

export interface CaptchaChallenge {
    type: 'recaptcha-v2' | 'recaptcha-v3' | 'hcaptcha' | 'funcaptcha' | 'unknown';
    siteKey?: string;
    pageUrl: string;
}

export interface CaptchaSolution {
    success: boolean;
    token?: string;
    error?: string;
}

export interface ICaptchaSolver {
    solve(page: any, challenge: CaptchaChallenge): Promise<CaptchaSolution>;
    detectCaptcha(page: any): Promise<CaptchaChallenge | null>;
}

/**
 * Mock CAPTCHA solver - logs challenges and simulates failure
 * Replace with real implementation (2Captcha, CapSolver, etc.)
 */
export class MockCaptchaSolver implements ICaptchaSolver {

    async detectCaptcha(page: any): Promise<CaptchaChallenge | null> {
        try {
            // Check for reCAPTCHA v2
            const recaptchaV2 = await page.$('iframe[src*="recaptcha"]');
            if (recaptchaV2) {
                logger.info('Detected reCAPTCHA v2');
                return {
                    type: 'recaptcha-v2',
                    pageUrl: page.url(),
                    siteKey: await this.extractSiteKey(page, 'recaptcha')
                };
            }

            // Check for hCaptcha
            const hcaptcha = await page.$('iframe[src*="hcaptcha"]');
            if (hcaptcha) {
                logger.info('Detected hCaptcha');
                return {
                    type: 'hcaptcha',
                    pageUrl: page.url(),
                    siteKey: await this.extractSiteKey(page, 'hcaptcha')
                };
            }

            // Check for generic CAPTCHA indicators
            const captchaText = await page.evaluate(() => {
                const body = document.body.innerText.toLowerCase();
                return body.includes('captcha') || body.includes('verify you are human');
            });

            if (captchaText) {
                logger.info('Detected generic CAPTCHA');
                return {
                    type: 'unknown',
                    pageUrl: page.url()
                };
            }

            return null;
        } catch (error) {
            logger.warn(`Error detecting CAPTCHA: ${error}`);
            return null;
        }
    }

    async solve(page: any, challenge: CaptchaChallenge): Promise<CaptchaSolution> {
        logger.warn(`⚠️ MockCaptchaSolver: CAPTCHA detected but no real solver configured`);
        logger.info(`Challenge type: ${challenge.type}`);
        logger.info(`Page URL: ${challenge.pageUrl}`);
        logger.info(`Site Key: ${challenge.siteKey || 'N/A'}`);

        // Simulate a delay as if we were solving
        await new Promise(r => setTimeout(r, 2000));

        // Mock implementation always fails - replace with real API call
        return {
            success: false,
            error: 'Mock solver is not configured. Please integrate a real CAPTCHA solver service.'
        };
    }

    private async extractSiteKey(page: any, captchaType: string): Promise<string | undefined> {
        try {
            if (captchaType === 'recaptcha') {
                return await page.evaluate(() => {
                    const element = document.querySelector('[data-sitekey]');
                    return element?.getAttribute('data-sitekey') || undefined;
                });
            }
            if (captchaType === 'hcaptcha') {
                return await page.evaluate(() => {
                    const element = document.querySelector('[data-sitekey]');
                    return element?.getAttribute('data-sitekey') || undefined;
                });
            }
        } catch (e) {
            return undefined;
        }
    }
}

export const captchaSolver = new MockCaptchaSolver();
