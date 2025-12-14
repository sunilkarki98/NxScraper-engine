import { logger } from '@nx-scraper/shared';
import { ROUTER_CONFIG } from './router.config.js';

export interface WebsiteAnalysis {
    requiresJavaScript: boolean;
    hasAntiBot: boolean;
    recommendedEngine: string;
    confidence: number;
    reasons: string[];
}

export class Router {
    /**
     * Analyze a URL to determine the best scraping engine
     */
    async analyze(url: string): Promise<WebsiteAnalysis> {
        const reasons: string[] = [];
        let requiresJavaScript = false;
        let hasAntiBot = false;
        let recommendedEngine = 'universal-scraper';
        let confidence = 0.8;

        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;

            // Check 1: Known JS-heavy domains
            if (this.isJSHeavyDomain(domain)) {
                requiresJavaScript = true;
                recommendedEngine = 'universal-scraper';
                confidence = 0.9;
                reasons.push(`Known JavaScript-heavy domain: ${domain}`);
            }

            // Check 2: Known anti-bot domains
            if (this.isAntiBotDomain(domain)) {
                hasAntiBot = true;
                recommendedEngine = 'heavy-scraper';
                confidence = 0.85;
                reasons.push(`Known anti-bot protection: ${domain}`);
            }

            // Check 3: SPA indicators in URL
            if (this.hasSPAIndicators(url)) {
                requiresJavaScript = true;
                recommendedEngine = 'universal-scraper';
                confidence = 0.75;
                reasons.push('URL contains SPA routing pattern');
            }



            // Check 5: Google Search (special case)
            if (domain.includes('google.com') && url.includes('/search')) {
                recommendedEngine = 'google-scraper';
                confidence = 1.0;
                reasons.push('Google search requires specialized scraper');
            }

            // Check 6: Common static site patterns
            if (this.isLikelyStaticSite(urlObj)) {
                // We don't have a scrapy plugin yet, so default to universal
                recommendedEngine = 'universal-scraper';
                confidence = 0.9;
                reasons.push('URL pattern suggests static content');
            }

            logger.debug(`Analysis for ${url}: engine=${recommendedEngine}, confidence=${confidence}`);

            return {
                requiresJavaScript,
                hasAntiBot,
                recommendedEngine,
                confidence,
                reasons,
            };

        } catch (error: any) {
            logger.error(`Failed to analyze URL ${url}: ${error.message}`);
            // On error, default to Universal (safer option)
            return {
                requiresJavaScript: true,
                hasAntiBot: false,
                recommendedEngine: 'universal-scraper',
                confidence: 0.5,
                reasons: ['Error analyzing URL, defaulting to Universal'],
            };
        }
    }

    /**
     * Check if domain is known to be JavaScript-heavy
     */
    private isJSHeavyDomain(domain: string): boolean {
        return ROUTER_CONFIG.JS_HEAVY_DOMAINS.some(jsDomain =>
            domain.includes(jsDomain)
        );
    }

    /**
     * Check if domain is known to have anti-bot protection
     */
    private isAntiBotDomain(domain: string): boolean {
        return ROUTER_CONFIG.ANTI_BOT_DOMAINS.some(botDomain =>
            domain.includes(botDomain)
        );
    }

    /**
     * Check if URL contains SPA routing indicators
     */
    private hasSPAIndicators(url: string): boolean {
        return ROUTER_CONFIG.SPA_INDICATORS.some(indicator =>
            url.includes(indicator)
        );
    }

    /**
     * Check if URL pattern suggests static site
     */
    private isLikelyStaticSite(urlObj: URL): boolean {
        const path = urlObj.pathname;
        const staticExtensions = ['.html', '.htm', '.php', '.asp', '.aspx'];
        const blogPatterns = ['/blog/', '/post/', '/article/', '/news/'];

        // Check for static file extensions
        if (staticExtensions.some(ext => path.endsWith(ext))) {
            return true;
        }

        // Check for common blog/CMS patterns (often static or server-rendered)
        if (blogPatterns.some(pattern => path.includes(pattern))) {
            return true;
        }

        // Root domain pages are often static
        if (path === '/' || path === '') {
            return true;
        }

        return false;
    }
}
