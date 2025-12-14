import { LoginHandler } from '../packages/shared/auth/login-handler';
import { LoginErrorType } from '../packages/shared/types/auth-errors';

/**
 * Mock page object for testing
 */
class MockPage {
    private _url = 'https://example.com/login';
    private _pageText = '';
    private _hasCaptcha = false;

    constructor(scenario: 'success' | 'bad-creds' | 'rate-limit' | 'captcha') {
        if (scenario === 'bad-creds') {
            this._pageText = 'incorrect username or password';
        } else if (scenario === 'rate-limit') {
            this._pageText = 'too many attempts. please try again later.';
        } else if (scenario === 'captcha') {
            this._hasCaptcha = true;
        }
    }

    url() { return this._url; }

    async goto(_url: string) {
        this._url = _url;
    }

    async $(selector: string) {
        if (selector === '.success-indicator') return null;
        if (selector.includes('recaptcha') && this._hasCaptcha) return { fake: 'element' };
        return null;
    }

    async waitForNavigation() { }
    async waitForSelector() { }

    async evaluate(fn: any) {
        if (typeof fn === 'function') {
            return fn.toString().includes('innerText') ? this._pageText : {};
        }
        return null;
    }

    async cookies() { return []; }
}

const runVerification = async () => {
    console.log('Starting Auth Flow Verification...\n');

    const handler = new LoginHandler();
    const credentials = {
        loginUrl: 'https://example.com/login',
        username: 'test@example.com',
        password: 'password123',
        usernameSelector: '#username',
        passwordSelector: '#password',
        submitSelector: '#submit'
    };

    // Test 1: Bad Credentials
    console.log('--- Test 1: Bad Credentials ---');
    const badCredsPage = new MockPage('bad-creds') as any;
    const result1 = await handler.login(badCredsPage, credentials, 'example.com');
    console.log('Result:', result1);
    console.log(result1.errorType === LoginErrorType.BAD_CREDENTIALS ? '✅ PASS' : '❌ FAIL');
    console.log('Retry recommended:', result1.retryRecommended);

    // Test 2: Rate Limited
    console.log('\n--- Test 2: Rate Limited ---');
    const rateLimitPage = new MockPage('rate-limit') as any;
    const result2 = await handler.login(rateLimitPage, credentials, 'example.com');
    console.log('Result:', result2);
    console.log(result2.errorType === LoginErrorType.RATE_LIMITED ? '✅ PASS' : '❌ FAIL');
    console.log('Retry recommended:', result2.retryRecommended, 'Delay:', result2.retryDelayMs);

    console.log('\n✅ Auth flow verification complete!');
};

runVerification().catch(console.error);
