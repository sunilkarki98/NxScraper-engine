import logger from '../utils/logger.js';
import { ghostCursor } from '../browser/evasion/ghost-cursor.js';
import { sessionManager } from './session-manager.js';
import { captchaSolver } from '../utils/captcha-solver.js';
import { LoginResult, LoginErrorType } from '../types/auth-errors.js';
import { getAIEngine } from '../ai/ai-engine.js';
import { LoginSelectorModule } from '../ai/modules/login-selector-module.js';
import { AuthErrorClassifier } from '../ai/modules/auth-error-classifier.js';
import { fingerprintLearning } from '../ai/learning/fingerprint-learning.js';

export interface LoginCredentials {
    loginUrl: string;
    username?: string;
    password?: string;
    usernameSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
    captchaSelector?: string;
    successIndicator?: string; // Selector that appears on success
    cookies?: any[]; // Pre-baked cookies
}

export class LoginHandler {
    private aiEngine = getAIEngine();
    private selectorModule: LoginSelectorModule;
    private errorClassifier: AuthErrorClassifier;

    constructor() {
        // Initialize AI modules
        this.selectorModule = new LoginSelectorModule(
            this.aiEngine.getLLMManager(),
            this.aiEngine['cache'],
            this.aiEngine.selectorGeneration
        );
        this.errorClassifier = new AuthErrorClassifier(
            this.aiEngine.getLLMManager(),
            this.aiEngine['cache']
        );
    }

    /**
     * Perform login flow
     */
    async login(page: any, credentials: LoginCredentials, domain: string): Promise<LoginResult> {
        const startTime = Date.now();  // Track execution time

        try {
            logger.info(`Starting login flow for ${domain}`);

            // 1. Navigate to login page
            await page.goto(credentials.loginUrl, { waitUntil: 'domcontentloaded' });

            // 2. Check if already logged in (if we have cookies)
            if (credentials.successIndicator) {
                if (await page.$(credentials.successIndicator)) {
                    logger.info('Already logged in');
                    const session = await sessionManager.extractSession(page, domain);
                    return {
                        success: true,
                        sessionId: session.id,
                        retryRecommended: false
                    };
                }
            }

            // 3. AI-Powered Selector Discovery (if not provided)
            let selectors = {
                username: credentials.usernameSelector,
                password: credentials.passwordSelector,
                submit: credentials.submitSelector
            };

            if (!selectors.username || !selectors.password || !selectors.submit) {
                try {
                    logger.info('Auto-discovering login selectors with AI...');
                    const html = await page.content();
                    const discovered = await this.selectorModule.execute({
                        html,
                        url: credentials.loginUrl,
                        domain
                    });

                    selectors.username = selectors.username || discovered.data.username.selector;
                    selectors.password = selectors.password || discovered.data.password.selector;
                    selectors.submit = selectors.submit || discovered.data.submit.selector;

                    logger.info({ selectors: discovered.data }, 'AI-discovered login selectors');
                } catch (err) {
                    logger.warn({ err }, 'Selector discovery failed, using fallback');
                }
            }

            // 4. Fill form using Ghost Cursor with discovered/provided selectors
            if (credentials.username && selectors.username) {
                await ghostCursor.type(page, selectors.username, credentials.username);
            }

            if (credentials.password && selectors.password) {
                await ghostCursor.type(page, selectors.password, credentials.password);
            }

            // 4. Handle CAPTCHA (Auto-detect and solve)
            const captchaChallenge = await captchaSolver.detectCaptcha(page);
            if (captchaChallenge) {
                logger.info(`CAPTCHA detected: ${captchaChallenge.type}`);
                const solution = await captchaSolver.solve(page, captchaChallenge);

                if (!solution.success) {
                    logger.error(`CAPTCHA solving failed: ${solution.error}`);
                    return {
                        success: false,
                        errorType: LoginErrorType.CAPTCHA_FAILED,
                        errorMessage: solution.error,
                        retryRecommended: true,
                        retryDelayMs: 30000 // 30s delay for CAPTCHA
                    };
                }

                logger.info('CAPTCHA solved successfully');
                // Token would be injected here in a real implementation
            }

            // 5. Submit
            if (credentials.submitSelector) {
                await ghostCursor.moveAndClick(page, credentials.submitSelector);
            }

            // 6. Wait for navigation/success
            try {
                await page.waitForNavigation({ timeout: 15000 });
            } catch (e) {
                // Ignore timeout if we just stayed on page (SPA)
            }

            // 7. Verify success
            let success = false;
            if (credentials.successIndicator) {
                try {
                    await page.waitForSelector(credentials.successIndicator, { timeout: 10000 });
                    success = true;
                } catch (e) {
                    success = false;
                }
            } else {
                // Heuristic: check if URL changed and no login form
                const url = page.url();
                success = !url.includes('login') && !url.includes('signin');
            }

            // If failed, provide feedback to healing system
            if (!success && selectors.username) {
                // Mark selectors as potentially invalid for future healing
                logger.debug('Login failed - selector feedback will be recorded');
            }

            if (success) {
                logger.info(`Login successful for ${domain}`);

                // 8. Save session
                const session = await sessionManager.extractSession(page, domain);
                await sessionManager.saveSession(session);

                // 9. Record fingerprint success (if fingerprint attached to page)
                if ((page as any).fingerprint) {
                    await fingerprintLearning.recordSuccess(
                        domain,
                        (page as any).fingerprint,
                        Date.now() - startTime
                    );
                }

                return {
                    success: true,
                    sessionId: session.id,
                    retryRecommended: false
                };
            } else {
                logger.warn(`Login failed for ${domain}`);

                // Use AI to classify error
                const classification = await this.classifyErrorWithAI(page);

                // Record fingerprint failure/block
                if ((page as any).fingerprint) {
                    if (classification.errorType === 'RATE_LIMITED' || classification.errorType === 'CAPTCHA_FAILED') {
                        await fingerprintLearning.recordBlock(domain, (page as any).fingerprint);
                    } else {
                        await fingerprintLearning.recordFailure(domain, (page as any).fingerprint);
                    }
                }

                return {
                    success: false,
                    errorType: classification.errorType as LoginErrorType,
                    errorMessage: classification.reason,
                    retryRecommended: classification.suggestedAction !== 'abort',
                    retryDelayMs: classification.retryDelayMs
                };
            }

        } catch (error: any) {
            logger.error(error, `Login error for ${domain}:`);

            // Classify based on error type
            let errorType = LoginErrorType.UNKNOWN;
            if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
                errorType = LoginErrorType.TIMEOUT;
            }

            return {
                success: false,
                errorType,
                errorMessage: error.message,
                retryRecommended: errorType === LoginErrorType.TIMEOUT,
                retryDelayMs: 5000
            };
        }
    }

    /**
     * Classify login error using AI (with fallback)
     */
    private async classifyErrorWithAI(page: any) {
        try {
            const pageContent = await page.evaluate('document.body.innerText');
            const pageUrl = page.url();

            // Use AI error classifier
            const result = await this.errorClassifier.execute({
                pageUrl,
                pageContent
            });

            return result.data;
        } catch (error) {
            logger.warn({ error }, 'AI error classification failed, using fallback');

            // Fallback to keyword-based
            return this.classifyLoginErrorFallback(page);
        }
    }

    /**
     * Fallback: Classify login error by keyword matching
     */
    private async classifyLoginErrorFallback(page: any) {
        try {
            const pageText = await page.evaluate('document.body.innerText.toLowerCase()');

            let errorType: LoginErrorType = LoginErrorType.UNKNOWN;
            let suggestedAction: 'abort' | 'wait_medium' | 'retry_immediately' = 'retry_immediately';

            if (pageText.includes('rate limit') || pageText.includes('too many attempts')) {
                errorType = LoginErrorType.RATE_LIMITED;
                suggestedAction = 'wait_medium';
            } else if (pageText.includes('account locked') || pageText.includes('suspended')) {
                errorType = LoginErrorType.ACCOUNT_LOCKED;
                suggestedAction = 'abort';
            } else if (pageText.includes('two-factor') || pageText.includes('2fa')) {
                errorType = LoginErrorType.TWO_FACTOR_REQUIRED;
                suggestedAction = 'abort';
            } else if (pageText.includes('incorrect') || pageText.includes('invalid')) {
                errorType = LoginErrorType.BAD_CREDENTIALS;
                suggestedAction = 'abort';
            }

            return {
                errorType: errorType as any,
                confidence: 0.5,
                reason: 'Fallback keyword detection',
                suggestedAction,
                retryDelayMs: suggestedAction === 'wait_medium' ? 60000 : 0
            };
        } catch (e) {
            return {
                errorType: 'UNKNOWN' as any,
                confidence: 0,
                reason: 'Error classification failed',
                suggestedAction: 'abort' as any,
                retryDelayMs: 0
            };
        }
    }
}

export const loginHandler = new LoginHandler();
