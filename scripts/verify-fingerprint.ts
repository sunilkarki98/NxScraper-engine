
import { fingerprintGenerator } from '../packages/shared/browser/fingerprint-generator';

const runVerification = () => {
    console.log('Starting Fingerprint Verification...');

    // Generate multiple fingerprints
    for (let i = 0; i < 5; i++) {
        const fp = fingerprintGenerator.generate();
        console.log(`\n--- Fingerprint #${i + 1} ---`);
        console.log(`UserAgent: ${fp.userAgent}`);
        console.log(`Platform: ${fp.platform}`);
        console.log(`Viewport: ${fp.viewport.width}x${fp.viewport.height}`);
        console.log(`Headers:`, fp.headers);

        // Verification Logic
        let isValid = true;

        // Check platform consistency
        if (fp.userAgent.includes('Windows') && fp.platform !== 'Win32') {
            console.error('❌ Mismatch: Windows UA but platform is ' + fp.platform);
            isValid = false;
        }
        if (fp.userAgent.includes('Mac') && fp.platform !== 'MacIntel') {
            console.error('❌ Mismatch: Mac UA but platform is ' + fp.platform);
            isValid = false;
        }

        // Check headers presence
        if (!fp.headers['User-Agent']) {
            console.error('❌ Mismatch: Missing User-Agent header');
            isValid = false;
        }

        if (isValid) {
            console.log('✅ Consistency Check Passed');
        }
    }
};

runVerification();
