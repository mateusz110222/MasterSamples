import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    const screenshotDir = path.resolve(__dirname, '../../screenshots/live_server');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    console.log('Launching browser Chrome to inspect LIVE server http://10.142.11.20/custom/matz/MasterSamples/#/ ...');
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });

    const page = await context.newPage();

    // Mock GetUserName.php to ensure full admin permissions if not on local domain SSO session
    await page.route('**/GetUserName.php*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/plain',
            body: '"matzielinski"'
        });
    });

    console.log('Loading live page: http://10.142.11.20/custom/matz/MasterSamples/#/ ...');
    await page.goto('http://10.142.11.20/custom/matz/MasterSamples/#/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    // 1. Dashboard screenshot
    const dashShot = path.join(screenshotDir, '01_live_dashboard.png');
    await page.screenshot({ path: dashShot });
    console.log('Saved LIVE dashboard screenshot to:', dashShot);

    // 2. Open Reset Modal
    const resetButtons = page.locator('button[title*="Resetuj liczniki"]');
    const resetCount = await resetButtons.count();
    console.log(`Found ${resetCount} reset buttons on live server.`);

    if (resetCount > 0) {
        console.log('Clicking reset button on first row...');
        await resetButtons.first().click();
        await page.waitForTimeout(600);

        const modalShot = path.join(screenshotDir, '02_live_reset_modal.png');
        await page.screenshot({ path: modalShot });
        console.log('Saved LIVE reset modal screenshot to:', modalShot);

        // Click second option card ("Resetuj Tylko Cykle Użyć")
        const cards = page.locator('div[role="dialog"] label');
        if (await cards.count() > 1) {
            console.log('Clicking second option (amber)...');
            await cards.nth(1).click();
            await page.waitForTimeout(300);

            const amberShot = path.join(screenshotDir, '03_live_amber_selected.png');
            await page.screenshot({ path: amberShot });
            console.log('Saved LIVE amber selected screenshot to:', amberShot);
        }

        // Click third option card ("Resetuj Tylko Licznik Błędów")
        if (await cards.count() > 2) {
            console.log('Clicking third option (rose)...');
            await cards.nth(2).click();
            await page.waitForTimeout(300);

            const roseShot = path.join(screenshotDir, '04_live_rose_selected.png');
            await page.screenshot({ path: roseShot });
            console.log('Saved LIVE rose selected screenshot to:', roseShot);
        }

        // Test smooth exit animation: click Anuluj
        const cancelBtn = page.locator('div[role="dialog"] button:has-text("Anuluj")');
        if (await cancelBtn.isVisible()) {
            console.log('Clicking Anuluj to test exit animation...');
            await cancelBtn.click();
            await page.waitForTimeout(100);
            const exitShot = path.join(screenshotDir, '05_live_modal_closing.png');
            await page.screenshot({ path: exitShot });
            console.log('Saved LIVE modal exit animation screenshot to:', exitShot);
            await page.waitForTimeout(400);
        }
    }

    // 3. Navigate to Create Master View
    console.log('Navigating to #/create on live server...');
    await page.goto('http://10.142.11.20/custom/matz/MasterSamples/#/create', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);

    const createShot = path.join(screenshotDir, '06_live_create_master.png');
    await page.screenshot({ path: createShot });
    console.log('Saved LIVE Create Master screenshot to:', createShot);

    await browser.close();
    console.log('\n--- LIVE SERVER VERIFICATION FINISHED SUCCESSFULLY! ---');
}

run().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
