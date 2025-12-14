import puppeteerPkg, { PuppeteerExtra } from 'puppeteer-extra';
const puppeteer = ((puppeteerPkg as any).default ?? puppeteerPkg) as PuppeteerExtra;
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { IBrowserAdapter, BrowserLaunchOptions } from '../../types/browser.interface.js';
import { fingerprintEvader } from '../evasion/fingerprint.js';

// Apply stealth plugin once
puppeteer.use(StealthPlugin());

export class PuppeteerAdapter implements IBrowserAdapter {
    name = 'puppeteer';

    async launch(options: BrowserLaunchOptions): Promise<any> {
        // ... (existing launch code)
        const launchOptions: any = {
            headless: options.headless ?? true,
            args: [
                ...(options.args || []),
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
        };

        if (options.proxy) {
            launchOptions.args.push(`--proxy-server=${options.proxy}`);
        }

        if (process.env.BROWSER_WS_ENDPOINT || options.wsEndpoint) {
            const browserWSEndpoint = options.wsEndpoint || process.env.BROWSER_WS_ENDPOINT;
            // When proxy is used with browserless/remote, it's often passed via query param 'stealth' or 'proxy'
            // But for standard connect:
            const browser = await puppeteer.connect({
                browserWSEndpoint,
                defaultViewport: null
            });
            return browser;
        }

        const browser = await puppeteer.launch(launchOptions);
        return browser;
    }

    async close(browser: any): Promise<void> {
        await browser.close();
    }

    async newPage(browser: any, options?: BrowserLaunchOptions): Promise<any> {
        // Create isolated incognito context (God Mode Optimization)
        const context = browser.createIncognitoBrowserContext
            ? await browser.createIncognitoBrowserContext()
            : await browser.createBrowserContext();
        const page = await context.newPage();

        // Use custom viewport if needed (or fingerprint)
        const width = options?.viewport?.width || 1920;
        const height = options?.viewport?.height || 1080;
        await page.setViewport({ width, height });

        // Apply evasion if requested
        if (options?.evasion?.fingerprint) {
            await fingerprintEvader.apply(page);
        }

        return page;
    }

    async closePage(page: any): Promise<void> {
        // Close the entire isolated context
        const context = page.browserContext();
        if (context) {
            await context.close();
        } else {
            await page.close();
        }
    }
}
