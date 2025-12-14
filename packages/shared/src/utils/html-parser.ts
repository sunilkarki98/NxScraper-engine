import * as cheerio from 'cheerio';

export class HtmlParser {
    private $: any;

    constructor(html: string) {
        this.$ = cheerio.load(html);
    }

    /**
     * Get text content from a selector
     */
    getText(selector: string): string | null {
        return this.$(selector).first().text().trim() || null;
    }

    /**
     * Get attribute value from a selector
     */
    getAttribute(selector: string, attr: string): string | null {
        return this.$(selector).first().attr(attr) || null;
    }

    /**
     * Get all text content from multiple elements
     */
    getAllText(selector: string): string[] {
        const results: string[] = [];
        this.$(selector).each((_: number, el: any) => {
            const text = this.$(el).text().trim();
            if (text) results.push(text);
        });
        return results;
    }

    /**
     * Get list of items using a mapper function
     */
    getList<T>(selector: string, mapper: (el: any) => T | null): T[] {
        const results: T[] = [];
        this.$(selector).each((_: number, el: any) => {
            const mapped = mapper(this.$(el));
            if (mapped !== null) {
                results.push(mapped);
            }
        });
        return results;
    }

    /**
     * Get JSON-LD structured data
     */
    getJsonLd(): any[] {
        const jsonLd: any[] = [];
        this.$('script[type="application/ld+json"]').each((_: number, el: any) => {
            try {
                const content = this.$(el).html();
                if (content) {
                    jsonLd.push(JSON.parse(content));
                }
            } catch (e) {
                // Skip invalid JSON-LD
            }
        });
        return jsonLd;
    }

    /**
     * Check if element exists
     */
    exists(selector: string): boolean {
        return this.$(selector).length > 0;
    }

    /**
     * Get raw HTML
     */
    getHtml(selector?: string): string {
        return selector ? this.$(selector).html() || '' : this.$.html();
    }

    /**
     * Get Cheerio instance for custom queries
     */
    get$() {
        return this.$;
    }
}
