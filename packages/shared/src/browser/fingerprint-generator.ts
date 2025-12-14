
export interface BrowserFingerprint {
    userAgent: string;
    viewport: { width: number; height: number };
    platform: string;
    hardwareConcurrency: number;
    deviceMemory: number;
    headers: Record<string, string>;
}

export class FingerprintGenerator {
    private readonly operatingSystems = [
        { name: 'Windows NT 10.0; Win64; x64', platform: 'Win32', secChUaPlatform: '"Windows"' },
        { name: 'Macintosh; Intel Mac OS X 10_15_7', platform: 'MacIntel', secChUaPlatform: '"macOS"' },
        { name: 'X11; Linux x86_64', platform: 'Linux x86_64', secChUaPlatform: '"Linux"' }
    ];

    private readonly resolutions = [
        { width: 1920, height: 1080 },
        { width: 1366, height: 768 },
        { width: 1440, height: 900 },
        { width: 2560, height: 1440 },
        { width: 3840, height: 2160 }
    ];

    generate(): BrowserFingerprint {
        const os = this.operatingSystems[Math.floor(Math.random() * this.operatingSystems.length)];
        const res = this.resolutions[Math.floor(Math.random() * this.resolutions.length)];
        const chromeVersion = Math.floor(Math.random() * 5) + 120; // 120-124

        // Generate consistent headers based on the profile
        const ua = `Mozilla/5.0 (${os.name}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}.0.0.0 Safari/537.36`;

        const headers: Record<string, string> = {
            'User-Agent': ua,
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'sec-ch-ua': `"Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}", "Not-A.Brand";v="99"`,
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': os.secChUaPlatform
        };

        return {
            userAgent: ua,
            viewport: res,
            platform: os.platform,
            hardwareConcurrency: Math.floor(Math.random() * 4) * 2 + 4, // 4, 6, 8, 10
            deviceMemory: Math.floor(Math.random() * 4) * 2 + 4, // 4, 8...
            headers
        };
    }
}

export const fingerprintGenerator = new FingerprintGenerator();
