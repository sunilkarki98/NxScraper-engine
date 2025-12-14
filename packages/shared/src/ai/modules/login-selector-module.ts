import { z } from 'zod';
import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { SelectorGenerationModule } from './selector-generation.js';
import { healingManager } from '../healing/healing-manager.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Login Form Selectors Schema
 */
export const LoginSelectorsSchema = z.object({
    username: z.object({
        selector: z.string(),
        confidence: z.number().min(0).max(1),
        fallbacks: z.array(z.string()).optional()
    }),
    password: z.object({
        selector: z.string(),
        confidence: z.number().min(0).max(1),
        fallbacks: z.array(z.string()).optional()
    }),
    submit: z.object({
        selector: z.string(),
        confidence: z.number().min(0).max(1),
        fallbacks: z.array(z.string()).optional()
    }),
    rememberMe: z.object({
        selector: z.string(),
        confidence: z.number().min(0).max(1)
    }).optional(),
    formAction: z.string().optional()
});

export type LoginSelectors = z.infer<typeof LoginSelectorsSchema>;

/**
 * Input for login selector discovery
 */
export interface LoginSelectorInput {
    html: string;
    url: string;
    domain?: string;
}

/**
 * Login Selector Module
 * Intelligently discovers login form fields using AI
 */
export class LoginSelectorModule implements IAIModule<LoginSelectorInput, LoginSelectors, AIModuleOptions> {
    readonly name = 'login-selector-discovery';

    private readonly SYSTEM_PROMPT = `You are an expert at analyzing HTML login forms.
Your task is to identify the correct CSS selectors for username, password, and submit button fields.

Analysis Guidelines:
- Look for common patterns: id="username", name="email", type="password", etc.
- Check placeholder text, labels, aria-labels
- Identify submit buttons (type="submit", button with text "login", "sign in", etc.)
- Provide fallback selectors for robustness
- Return confidence scores based on selector specificity

Prefer selectors in this order:
1. Unique IDs (#username)
2. Unique names ([name="email"])
3. Type + context ([type="email"][autocomplete="username"])
4. Positional (form input[type="email"]:first-of-type) - least preferred

Generate fallback chains for critical fields (username, password, submit).`;

    // Request deduplication map
    private pendingRequests = new Map<string, Promise<AIModuleResult<LoginSelectors>>>();

    constructor(
        private llmManager: LLMManager,
        private cache: AICache,
        private selectorGen: SelectorGenerationModule
    ) { }

    async execute(input: LoginSelectorInput, options?: AIModuleOptions): Promise<AIModuleResult<LoginSelectors>> {
        const cacheKey = this.getCacheKey(input);

        // Check if there's already a pending request for this input
        if (this.pendingRequests.has(cacheKey)) {
            logger.debug('Deduplicating concurrent selector discovery request');
            return this.pendingRequests.get(cacheKey)!;
        }

        // Create promise and store in map
        const promise = this._executeInternal(input, options, cacheKey);
        this.pendingRequests.set(cacheKey, promise);

        try {
            return await promise;
        } finally {
            // Remove from pending map when done
            this.pendingRequests.delete(cacheKey);
        }
    }

    private async _executeInternal(input: LoginSelectorInput, options: AIModuleOptions | undefined, cacheKey: string): Promise<AIModuleResult<LoginSelectors>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            const domain = input.domain || new URL(input.url).hostname;

            // 1. Check HealingManager first
            const healed = await this.getHealedSelectors(domain);
            if (healed) {
                logger.info({ domain }, 'Using healed login selectors');
                return {
                    data: healed,
                    metadata: {
                        module: this.name,
                        provider: 'healing-manager',
                        model: 'healing',
                        executionTime: Date.now() - startTime,
                        cached: true,
                    },
                };
            }

            // 2. Check cache
            const useCache = options?.useCache !== false;

            if (useCache) {
                const cached = await this.cache.get<LoginSelectors>(cacheKey);
                if (cached) {
                    logger.debug(`Cache hit for ${this.name}`);
                    return {
                        data: cached,
                        metadata: {
                            module: this.name,
                            provider: 'cache',
                            model: 'cache',
                            executionTime: Date.now() - startTime,
                            cached: true,
                        },
                    };
                }
            }

            // 3. Use AI to discover selectors
            const selectors = await this.discoverSelectors(input, options);

            // 4. Save to HealingManager for future use
            await this.saveToHealing(domain, selectors);

            // 5. Cache result
            if (useCache) {
                const ttl = options?.cacheTTL || 3600; // 1 hour
                await this.cache.set(cacheKey, selectors, ttl);
            }

            return {
                data: selectors,
                metadata: {
                    module: this.name,
                    provider: options?.provider || 'gemini-flash',
                    model: options?.model || 'default',
                    executionTime: Date.now() - startTime,
                    cached: false,
                },
            };
        } catch (error: any) {
            logger.error({ error, url: input.url }, `${this.name} execution failed`);

            // Fallback to common patterns
            return this.fallbackSelectors(input, startTime);
        }
    }

    private async discoverSelectors(
        input: LoginSelectorInput,
        options?: AIModuleOptions
    ): Promise<LoginSelectors> {
        const llm = this.llmManager.getProvider(options?.provider || 'gemini-flash');

        // Extract only the relevant form HTML to reduce token usage
        const formHtml = this.extractFormHTML(input.html);

        const userPrompt = `Analyze this login form and identify selectors:

URL: ${input.url}

HTML (truncated to form):
${formHtml}

Return CSS selectors for:
1. username field (could be email, username, phone)
2. password field
3. submit button
4. optional: remember me checkbox

Include fallback selectors and confidence scores.`;

        const selectors = await llm.generateJSON<LoginSelectors>(
            userPrompt,
            LoginSelectorsSchema,
            {
                systemPrompt: this.SYSTEM_PROMPT,
                temperature: 0.1,
                model: options?.model,
            }
        );

        return selectors;
    }

    private extractFormHTML(html: string): string {
        // Optimized: Use string parsing instead of regex to avoid ReDoS
        const truncated = html.substring(0, 10000); // Limit search space

        const formStart = truncated.toLowerCase().indexOf('<form');
        if (formStart === -1) {
            // No form found, return first 3000 chars
            return html.substring(0, 3000);
        }

        // Find closing tag
        const formEnd = truncated.indexOf('</form>', formStart);
        if (formEnd === -1) {
            // Form not closed in first 10KB, take what we can
            return truncated.substring(formStart, Math.min(formStart + 3000, truncated.length));
        }

        return truncated.substring(formStart, formEnd + 7); // +7 for '</form>'
    }

    private async getHealedSelectors(domain: string): Promise<LoginSelectors | null> {
        try {
            const [username, password, submit] = await Promise.all([
                healingManager.getSelectors(domain, 'username'),
                healingManager.getSelectors(domain, 'password'),
                healingManager.getSelectors(domain, 'submit')
            ]);

            if (username.length > 0 && password.length > 0 && submit.length > 0) {
                return {
                    username: {
                        selector: username[0].selector.primary.css || username[0].selector.primary.xpath,
                        confidence: username[0].score,
                        fallbacks: username[0].selector.fallbacks?.map(f => f.css || f.xpath) || []
                    },
                    password: {
                        selector: password[0].selector.primary.css || password[0].selector.primary.xpath,
                        confidence: password[0].score,
                        fallbacks: password[0].selector.fallbacks?.map(f => f.css || f.xpath) || []
                    },
                    submit: {
                        selector: submit[0].selector.primary.css || submit[0].selector.primary.xpath,
                        confidence: submit[0].score,
                        fallbacks: submit[0].selector.fallbacks?.map(f => f.css || f.xpath) || []
                    }
                };
            }
        } catch (err) {
            logger.debug('No healed selectors found');
        }
        return null;
    }

    private async saveToHealing(domain: string, selectors: LoginSelectors): Promise<void> {
        try {
            if (selectors.username.confidence > 0.7) {
                await healingManager.saveSelector(domain, 'username', {
                    primary: {
                        css: selectors.username.selector,
                        xpath: '',
                        confidence: selectors.username.confidence,
                    },
                    fallbacks: selectors.username.fallbacks?.map(s => ({
                        css: s,
                        xpath: '',
                        confidence: 0.5,
                        reason: 'Fallback selector'
                    })) || [],
                    selfHealingStrategy: {
                        attributes: ['id', 'name', 'type'],
                        structures: ['form input'],
                        avoidance: ['nth-child']
                    },
                    fieldName: 'username'
                });
            }

            if (selectors.password.confidence > 0.7) {
                await healingManager.saveSelector(domain, 'password', {
                    primary: {
                        css: selectors.password.selector,
                        xpath: '',
                        confidence: selectors.password.confidence,
                    },
                    fallbacks: selectors.password.fallbacks?.map(s => ({
                        css: s,
                        xpath: '',
                        confidence: 0.5,
                        reason: 'Fallback selector'
                    })) || [],
                    selfHealingStrategy: {
                        attributes: ['id', 'name', 'type'],
                        structures: ['form input[type=password]'],
                        avoidance: ['nth-child']
                    },
                    fieldName: 'password'
                });
            }

            if (selectors.submit.confidence > 0.7) {
                await healingManager.saveSelector(domain, 'submit', {
                    primary: {
                        css: selectors.submit.selector,
                        xpath: '',
                        confidence: selectors.submit.confidence,
                    },
                    fallbacks: selectors.submit.fallbacks?.map(s => ({
                        css: s,
                        xpath: '',
                        confidence: 0.5,
                        reason: 'Fallback selector'
                    })) || [],
                    selfHealingStrategy: {
                        attributes: ['type', 'class'],
                        structures: ['button[type=submit]'],
                        avoidance: ['nth-child']
                    },
                    fieldName: 'submit'
                });
            }

            logger.info({ domain }, 'Saved login selectors to healing manager');
        } catch (err) {
            logger.warn({ err }, 'Failed to save selectors to healing manager');
        }
    }

    private fallbackSelectors(input: LoginSelectorInput, startTime: number): AIModuleResult<LoginSelectors> {
        logger.warn('Using fallback common login selectors');

        // Common patterns as fallback
        return {
            data: {
                username: {
                    selector: 'input[type="email"], input[name*="user"], input[name*="email"], input[id*="user"], input[id*="email"]',
                    confidence: 0.5,
                    fallbacks: ['#username', '#email', '[name="username"]', '[name="email"]']
                },
                password: {
                    selector: 'input[type="password"]',
                    confidence: 0.8,
                    fallbacks: ['#password', '[name="password"]']
                },
                submit: {
                    selector: 'button[type="submit"], input[type="submit"], button:contains("Log"), button:contains("Sign")',
                    confidence: 0.6,
                    fallbacks: ['button[type="submit"]', 'input[type="submit"]']
                }
            },
            metadata: {
                module: this.name,
                provider: 'fallback',
                model: 'common-patterns',
                executionTime: Date.now() - startTime,
                cached: false,
            },
        };
    }

    async validate(input: LoginSelectorInput): Promise<boolean> {
        if (!input.html || typeof input.html !== 'string') {
            throw new Error('Invalid input: html is required');
        }
        if (!input.url || typeof input.url !== 'string') {
            throw new Error('Invalid input: url is required');
        }
        return true;
    }

    async healthCheck(): Promise<boolean> {
        try {
            const providers = this.llmManager.getAvailableProviders();
            return providers.length > 0;
        } catch {
            return false;
        }
    }

    private getCacheKey(input: LoginSelectorInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(input.url);
        hash.update(input.html.substring(0, 2000));
        return `${this.name}:${hash.digest('hex')}`;
    }
}
