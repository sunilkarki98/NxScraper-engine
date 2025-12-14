export interface IEvasionModule {
    name: string;
    apply(page: any): Promise<void>;
}

export interface IGhostCursor {
    moveAndClick(page: any, selector: string): Promise<void>;
    type(page: any, selector: string, text: string): Promise<void>;
    moveTo(page: any, selector: string): Promise<void>;
}

export interface ICaptchaSolver {
    solve(page: any, type: 'recaptcha' | 'hcaptcha' | 'turnstile'): Promise<{ success: boolean; token?: string }>;
}

export interface EvasionOptions {
    fingerprint?: boolean;
    ghostCursor?: boolean;
    captchaSolver?: boolean;
    timezone?: string;
    locale?: string;
    userAgent?: string;
}
