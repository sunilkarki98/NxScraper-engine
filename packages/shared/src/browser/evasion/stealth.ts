import { Page } from 'playwright';
import logger from '../../utils/logger.js';

/**
 * Advanced Stealth Context for Playwright
 * Injects scripts to evade detection (navigator.webdriver, chrome.runtime, etc.)
 */
export class StealthContext {
    /**
     * Apply stealth scripts to a Playwright Page
     */
    static async apply(page: Page): Promise<void> {
        try {
            await page.addInitScript(() => {
                // 1. Override navigator.webdriver
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });

                // 2. Mock chrome.runtime
                (window as any).chrome = {
                    runtime: {},
                    app: {},
                    csi: () => { },
                    loadTimes: () => { },
                };

                // 3. Mask WebGL Vendor/Renderer
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function (parameter) {
                    // UNMASKED_VENDOR_WEBGL
                    if (parameter === 37445) {
                        return 'Intel Inc.';
                    }
                    // UNMASKED_RENDERER_WEBGL
                    if (parameter === 37446) {
                        return 'Intel Iris OpenGL Engine';
                    }
                    return getParameter.apply(this, [parameter]);
                };

                // 4. Broken Image Dimensions (Detection Check)
                // Some detectors check if broken images share dimensions with Chrome
                ['height', 'width'].forEach(property => {
                    const imageDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, property);
                    Object.defineProperty(HTMLImageElement.prototype, property, {
                        ...imageDescriptor,
                        get: function () {
                            if (this.complete && this.naturalHeight == 0) {
                                return 0;
                            }
                            return imageDescriptor?.get?.apply(this);
                        },
                    });
                });

                // 5. Languages
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });

                // 6. Permissions
                const originalQuery = window.navigator.permissions.query;
                // @ts-ignore
                window.navigator.permissions.query = (parameters: any) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission } as PermissionStatus) :
                        originalQuery(parameters)
                );
            });

            logger.debug('🥷 Stealth scripts injected into new page');
        } catch (error) {
            logger.warn({ error }, 'Failed to apply stealth scripts');
        }
    }
}
