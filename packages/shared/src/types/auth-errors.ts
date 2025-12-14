/**
 * Login error types for granular error handling
 */
export enum LoginErrorType {
    /** Invalid username or password */
    BAD_CREDENTIALS = 'BAD_CREDENTIALS',

    /** Too many failed attempts, temporarily blocked */
    RATE_LIMITED = 'RATE_LIMITED',

    /** CAPTCHA challenge failed or couldn't be solved */
    CAPTCHA_FAILED = 'CAPTCHA_FAILED',

    /** Network timeout or page load failure */
    TIMEOUT = 'TIMEOUT',

    /** Account is locked/suspended */
    ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',

    /** Two-factor authentication required */
    TWO_FACTOR_REQUIRED = 'TWO_FACTOR_REQUIRED',

    /** Unknown or unclassified error */
    UNKNOWN = 'UNKNOWN'
}

/**
 * Detailed login result
 */
export interface LoginResult {
    /** Whether login succeeded */
    success: boolean;

    /** Error type if failed */
    errorType?: LoginErrorType;

    /** Human-readable error message */
    errorMessage?: string;

    /** Session ID if successful */
    sessionId?: string;

    /** Whether retry is recommended */
    retryRecommended: boolean;

    /** Suggested delay before retry (ms) */
    retryDelayMs?: number;
}
