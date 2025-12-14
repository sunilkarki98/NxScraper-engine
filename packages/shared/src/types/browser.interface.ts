export interface BrowserLaunchOptions {
    headless?: boolean;
    proxy?: string;
    wsEndpoint?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
    args?: string[];
    stealth?: boolean;
    captchaSolver?: boolean;
    evasion?: {
        fingerprint?: boolean;
        ghostCursor?: boolean;
        captchaSolver?: boolean;
    };
}

export interface IBrowserInstance {
    id: string;
    engine: 'puppeteer' | 'playwright';
    browser: unknown;
    createdAt: number;
    lastUsedAt: number;
    pageCount: number;
    totalPagesCreated: number;
}

export interface IBrowserAdapter {
    name: string;
    launch(options: BrowserLaunchOptions): Promise<unknown>;
    close(browser: unknown): Promise<void>;
    newPage(browser: unknown, options?: BrowserLaunchOptions): Promise<unknown>;
    closePage(page: unknown): Promise<void>;
}

export interface BrowserPoolOptions {
    maxBrowsers?: number;
    maxPagesPerBrowser?: number;
    browserIdleTimeout?: number; // ms before recycling idle browser
    defaultEngine?: 'puppeteer' | 'playwright';
}
