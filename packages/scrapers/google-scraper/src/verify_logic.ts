
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    console.log('🧪 Starting Google Scraper Verification (Final Check)...');

    const mockHtml = `
    <html>
        <body>
             <div role="article" class="local-pack-item">
                <div role="heading">Local Pizza Place</div>
                <div class="Yi4kAD">4.5</div>
                <div class="W4Efsd"><span>123 Main St, New York</span></div>
                <div>+1 212-555-0199</div>
                <a href="https://pizza.com">Website</a>
             </div>
        </body>
    </html>
    `;

    // Write mock to disk
    const mockPath = path.resolve('mock_google.html');
    fs.writeFileSync(mockPath, mockHtml);
    const mockUrl = `file://${mockPath}`;

    // Launch Browser
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(mockUrl);

        const localPack = page.locator('div[role="article"]').first();
        const innerText = await localPack.innerText();
        console.log(`[DEBUG] innerText: \n${innerText}`);

        // Scraper Regex
        const phoneRegex = /(?:^|\n|\s)((?:\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5})(?:$|\n|\s)/;

        const matchInner = innerText?.match(phoneRegex);

        if (matchInner && matchInner[1] === '+1 212-555-0199') {
            console.log('✅ Phone Extraction SUCCESS');
        } else {
            console.log(`❌ Phone Extraction FAILED. Got: ${matchInner ? matchInner[1] : 'null'}`);
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ Test Failed:', e);
        process.exit(1);
    } finally {
        await browser.close();
        if (fs.existsSync(mockPath)) fs.unlinkSync(mockPath);
    }
}

main();
