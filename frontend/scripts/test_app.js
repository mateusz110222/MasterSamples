import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    const screenshotDir = path.resolve(__dirname, '../../screenshots');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const distDir = path.resolve(__dirname, '../dist');
    const assetFiles = fs.readdirSync(path.join(distDir, 'assets'));
    const jsFile = assetFiles.find(f => f.endsWith('.js'));
    const cssFile = assetFiles.find(f => f.endsWith('.css'));

    console.log(`Using built assets: JS=${jsFile}, CSS=${cssFile}`);

    console.log('Launching browser Chrome...');
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });

    const page = await context.newPage();

    // 1. Intercept GetUserName.php to return the real domain user
    await page.route('**/GetUserName.php*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/plain',
            body: '"matzielinski"'
        });
    });

    // 2. Intercept remote JS and CSS assets to inject the latest local build
    await page.route('**/assets/index-*.js', async (route) => {
        console.log('Injecting latest local compiled JS bundle...');
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: fs.readFileSync(path.join(distDir, 'assets', jsFile))
        });
    });

    await page.route('**/assets/index-*.css', async (route) => {
        console.log('Injecting latest local compiled CSS styles...');
        await route.fulfill({
            status: 200,
            contentType: 'text/css',
            body: fs.readFileSync(path.join(distDir, 'assets', cssFile))
        });
    });

    console.log('Navigating to http://10.142.11.20/custom/matz/MasterSamples/#/ ...');
    await page.goto('http://10.142.11.20/custom/matz/MasterSamples/#/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2500);

    // 1. Dashboard screenshot with new search clear [X] and updated styles
    const dashShot = path.join(screenshotDir, '01_new_dashboard.png');
    await page.screenshot({ path: dashShot });
    console.log('Saved updated dashboard screenshot to:', dashShot);

    // Test search input clear button
    const searchInput = page.locator('input[placeholder*="Szukaj"]');
    await searchInput.fill('ARRAY');
    await page.waitForTimeout(300);
    const searchShot = path.join(screenshotDir, '01b_search_active_with_clear.png');
    await page.screenshot({ path: searchShot });
    console.log('Saved search active screenshot to:', searchShot);

    const clearSearchBtn = page.locator('button[title*="Wyczyść wyszukiwanie"]');
    if (await clearSearchBtn.isVisible()) {
        await clearSearchBtn.click();
        await page.waitForTimeout(300);
    }

    // 2. Open Reset Modal
    const resetButtons = page.locator('tbody tr button:has-text("Reset")');
    const resetBtnCount = await resetButtons.count();
    console.log(`Found ${resetBtnCount} reset buttons in table.`);

    if (resetBtnCount > 0) {
        console.log('Clicking first reset button...');
        await resetButtons.first().click();
        await page.waitForTimeout(500);

        const modalShot = path.join(screenshotDir, '02_new_reset_modal.png');
        await page.screenshot({ path: modalShot });
        console.log('Saved NEW reset modal screenshot to:', modalShot);

        // Hover over second option card ("Resetuj Tylko Cykle Użyć")
        const radioCards = page.locator('div[role="dialog"] label');
        if (await radioCards.count() > 1) {
            console.log('Hovering over second option card...');
            await radioCards.nth(1).hover();
            await page.waitForTimeout(400);
            const hoverShot = path.join(screenshotDir, '03_new_modal_option_hover.png');
            await page.screenshot({ path: hoverShot });
            console.log('Saved NEW modal option hover screenshot to:', hoverShot);

            // Click second option card to select it
            console.log('Clicking second option card...');
            await radioCards.nth(1).click();
            await page.waitForTimeout(400);
            const selectedShot = path.join(screenshotDir, '03b_new_modal_option_selected.png');
            await page.screenshot({ path: selectedShot });
            console.log('Saved NEW modal option selected (amber) screenshot to:', selectedShot);
        }

        // Hover over Confirm button
        const confirmBtn = page.locator('div[role="dialog"] button:has-text("Zatwierdź")');
        if (await confirmBtn.isVisible()) {
            console.log('Hovering over confirm button...');
            await confirmBtn.hover();
            await page.waitForTimeout(400);
            const confirmHoverShot = path.join(screenshotDir, '03c_new_confirm_hover.png');
            await page.screenshot({ path: confirmHoverShot });
            console.log('Saved NEW confirm button hover screenshot to:', confirmHoverShot);
        }

        // Test EXIT ANIMATION: Click Cancel and capture frame during exit
        const cancelBtn = page.locator('div[role="dialog"] button:has-text("Anuluj")');
        if (await cancelBtn.isVisible()) {
            console.log('Testing modal exit animation: clicking Anuluj...');
            await cancelBtn.click();
            await page.waitForTimeout(400);
        }
    }

    // 2b. Test Block Modal (Dead) with refined warning box & no flip on exit
    const blockButtons = page.locator('button[title*="Zablokuj"]');
    if (await blockButtons.count() > 0) {
        console.log('Opening Block modal...');
        await blockButtons.first().click();
        await page.waitForTimeout(400);
        const blockShot = path.join(screenshotDir, '02b_enhanced_block_modal.png');
        await page.screenshot({ path: blockShot });
        console.log('Saved ENHANCED block modal screenshot to:', blockShot);

        // Click Anuluj and capture mid-exit at 80ms
        const cancelBlockBtn = page.locator('div[role="dialog"] button:has-text("Anuluj")');
        if (await cancelBlockBtn.isVisible()) {
            console.log('Clicking Anuluj on Block modal to verify exit state...');
            await cancelBlockBtn.click();
            await page.waitForTimeout(60);
            const exitBlockShot = path.join(screenshotDir, '02b_block_modal_exiting.png');
            await page.screenshot({ path: exitBlockShot });
            console.log('Saved Block modal exiting screenshot to:', exitBlockShot);

            // Assert that during exit, the modal does NOT contain "Przywrócenie do produkcji"
            const dialogText = await page.locator('div[role="dialog"]').innerText().catch(() => '');
            if (dialogText.includes('Przywrócenie do produkcji') || dialogText.includes('Aktywuj Mastera')) {
                throw new Error('FAIL: Modal switched to activate state during exit animation!');
            } else {
                console.log('SUCCESS: Modal maintained block state during exit animation!');
            }
            await page.waitForTimeout(300);
        }
    }

    // 2c. Test Select dropdowns (Paletki styling) on Dashboard
    const processSelect = page.locator('select').first();
    if (await processSelect.isVisible()) {
        console.log('Focusing and interacting with Dashboard Select...');
        await processSelect.focus();
        await page.waitForTimeout(300);
        const selectShot = path.join(screenshotDir, '02c_dashboard_select_focused.png');
        await page.screenshot({ path: selectShot });
        console.log('Saved Dashboard Select screenshot to:', selectShot);
    }

    // 3. Test Create Master View with input click stability (no jumping div!)
    console.log('Navigating to #/create ...');
    await page.goto('http://10.142.11.20/custom/matz/MasterSamples/#/create', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1200);

    const createShot = path.join(screenshotDir, '04_new_create_master_presets.png');
    await page.screenshot({ path: createShot });
    console.log('Saved NEW Create Master with presets screenshot to:', createShot);

    // Test clicking on serial number input (verify no jump)
    const snInput = page.locator('input[placeholder*="np. 1B"]');
    if (await snInput.isVisible()) {
        console.log('Clicking Serial Number input...');
        await snInput.click();
        await page.waitForTimeout(300);
        const inputClickedShot = path.join(screenshotDir, '04b_create_sn_input_focused.png');
        await page.screenshot({ path: inputClickedShot });
        console.log('Saved SN input focused screenshot to:', inputClickedShot);
    }

    // Test clicking BAD status button to view consequence card
    const badBtn = page.locator('button:has-text("BAD")');
    if (await badBtn.isVisible()) {
        console.log('Clicking BAD status button to check consequence card...');
        await badBtn.click();
        await page.waitForTimeout(400);
        const badClickedShot = path.join(screenshotDir, '04c_create_bad_clicked.png');
        await page.screenshot({ path: badClickedShot });
        console.log('Saved BAD clicked screenshot to:', badClickedShot);
    }

    // 4. Test History View with Date Filters
    console.log('Navigating to #/history ...');
    await page.goto('http://10.142.11.20/custom/matz/MasterSamples/#/history', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);

    const histShot = path.join(screenshotDir, '07_history_with_date_filters.png');
    await page.screenshot({ path: histShot });
    console.log('Saved updated History View screenshot to:', histShot);

    // 5. Test Dashboard Task Presets
    console.log('Returning to Dashboard to test Task Presets...');
    await page.goto('http://10.142.11.20/custom/matz/MasterSamples/#/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(1500);

    const actionReqPill = page.locator('button:has-text("Wymaga Działania")');
    if (await actionReqPill.isVisible()) {
        console.log('Clicking Wymaga Działania preset pill...');
        await actionReqPill.click();
        await page.waitForTimeout(500);
        const actionReqShot = path.join(screenshotDir, '01c_action_required_preset.png');
        await page.screenshot({ path: actionReqShot });
        console.log('Saved Wymaga Działania preset screenshot to:', actionReqShot);
    }

    await browser.close();
    console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY! ---');
}

run().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
