import { chromium } from 'playwright';
import { IBrowserAdapter, BrowserLaunchOptions } from '../../types/browser.interface.js';
import { fingerprintEvader } from '../evasion/fingerprint.js';

export class PlaywrightAdapter implements IBrowserAdapter {
    name = 'playwright';

    async launch(options: BrowserLaunchOptions): Promise<any> {
        // ... (existing launch)
        // Check for remote connection
        const envWs = process.env.BROWSER_WS_ENDPOINT;
        const optsWs = options.wsEndpoint;
        console.log(`[PlaywrightAdapter] Debug - Env WS: '${envWs}', Options WS: '${optsWs}'`);

        if (envWs || optsWs) {
            const wsEndpoint = options.wsEndpoint || process.env.BROWSER_WS_ENDPOINT;
            // Playwright connects via WebSocket
            // Note: browserless matches Puppeteer's CDP mostly, but for Playwright we might need connectOverCDP or standard connect depending on image
            // standard 'connect' expects a playwright-server. 'connectOverCDP' connects to Chrome directly.
            // browserless is Chrome.
            const browser = await chromium.connectOverCDP(wsEndpoint!);
            return browser;
        }

        const browser = await chromium.launch({
            headless: options.headless ?? true,
            args: [
                ...(options.args || []),
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
            proxy: options.proxy ? { server: options.proxy } : undefined,
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        });

        return browser;
    }

    async close(browser: any): Promise<void> {
        await browser.close();
    }

    async newPage(browser: any, options?: BrowserLaunchOptions): Promise<any> {
        const contextOptions: any = {
            viewport: { width: 1920, height: 1080 },
            userAgent: options?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            proxy: options?.proxy ? { server: options.proxy } : undefined
        };

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();

        // Apply evasion if requested
        if (options?.evasion?.fingerprint) {
            await fingerprintEvader.apply(page);
        }

        return page;
    }

    async closePage(page: any): Promise<void> {
        await page.close();
        // Also close the context if it was created for this page
        const context = page.context();
        if (context) {
            await context.close();
        }
    }
}
