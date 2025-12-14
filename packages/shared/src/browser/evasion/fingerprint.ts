import { IEvasionModule } from '../../types/evasion.interface.js';
import logger from '../../utils/logger.js';

export class FingerprintEvader implements IEvasionModule {
    name = 'fingerprint-evader';

    async apply(page: any): Promise<void> {
        try {
            await this.overrideWebGL(page);
            await this.overrideCanvas(page);
            await this.overrideHardwareConcurrency(page);
            await this.overridePermissions(page);

            logger.debug('Fingerprint evasion applied');
        } catch (error) {
            logger.warn(`Failed to apply fingerprint evasion: ${error}`);
        }
    }

    private async overrideWebGL(page: any): Promise<void> {
        await page.addInitScript(() => {
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
        });
    }

    private async overrideCanvas(page: any): Promise<void> {
        await page.addInitScript(() => {
            const toDataURL = HTMLCanvasElement.prototype.toDataURL;
            HTMLCanvasElement.prototype.toDataURL = function (type) {
                // Add slight noise to canvas export
                if (type === 'image/png' && this.width > 0 && this.height > 0) {
                    const context = this.getContext('2d');
                    if (context) {
                        const imageData = context.getImageData(0, 0, this.width, this.height);
                        // Modify one pixel slightly
                        imageData.data[0] = (imageData.data[0] + 1) % 255;
                        context.putImageData(imageData, 0, 0);
                    }
                }
                return toDataURL.apply(this, arguments as any);
            };
        });
    }

    private async overrideHardwareConcurrency(page: any): Promise<void> {
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8, // Pretend to have 8 cores
            });
        });
    }

    private async overridePermissions(page: any): Promise<void> {
        // Pass permissions check for notifications/geolocation if asked
        const context = page.context();
        if (context && context.grantPermissions) {
            await context.grantPermissions(['notifications']);
        }
    }
}

export const fingerprintEvader = new FingerprintEvader();
