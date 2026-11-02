import { test, expect } from '@playwright/test';

test.describe('HDL ClearVoice AAC Speech WordPress Plugin', () => {
  test('1. Renders simplified Two-Panel UI (Push to Listen + What It Heard / Push to Say It Out), learns patterns, and isolates profiles', async ({ page, context }) => {
    // Prevent automated E2E test runs from writing synthetic test phrases to real benchmark/learned_cases.json
    await page.route('**/wp-json/hdl-aac-speech/v1/save-sample', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ saved: true })
      });
    });

    await page.goto('/wordpress/hdl-aac-speech');

    // 1. Verify Left Panel ("1. Push to Listen") and Right Panel ("What I Heard You Say" + "2. Push to Say It Out")
    const listenBtn = page.getByTestId('push-to-listen-btn');
    const sayItOutBtn = page.getByTestId('say-it-out-btn');
    const closestMatchText = page.getByTestId('closest-match-text');

    await expect(listenBtn).toBeVisible();
    await expect(listenBtn).toContainText('1. Push to Listen');
    await expect(sayItOutBtn).toBeVisible();
    await expect(sayItOutBtn).toContainText('2. Push to Say It Out');

    // 2. Test Push-to-Listen button toggle state
    await listenBtn.click();
    await expect(listenBtn).toContainText('Listening');
    await listenBtn.click();
    await expect(listenBtn).toContainText('1. Push to Listen');

    // 3. Child pushes "2. Push to Say It Out" button -> speaks out loud & learns pattern
    await sayItOutBtn.click();
    await expect(closestMatchText).toContainText('I want water please');
    await expect(page.getByTestId('learned-count-badge')).toHaveText('1');

    // 4. Teach/Fix an academic sentence via Edit / Teach modal ("Save & Teach Pattern" without speaking out loud)
    await page.getByTestId('hero-edit-btn').click();
    await expect(page.getByTestId('save-and-speak-edit-btn')).toContainText('Save & Teach Pattern');
    await page.getByTestId('edit-phrase-textarea').fill('The answer to the fraction question is three');
    await page.getByTestId('save-and-speak-edit-btn').click();

    // Verify it updated the right panel and incremented learned patterns, ready for her to push Say It Out
    await expect(closestMatchText).toContainText('The answer to the fraction question is three');
    await expect(page.getByTestId('learned-count-badge')).toHaveText('2');

    // 5. Verify Memory & Settings modal has Academic AI Audio configuration
    await page.getByTestId('open-memory-hub-btn').click();
    await page.getByText('Speech & Voice Settings').click();
    await expect(page.getByText('High-Accuracy Academic & Open-Vocabulary AI Audio')).toBeVisible();
    await page.getByTestId('close-memory-hub-btn').click();

    // 6. Test Individual Profile Isolation: create/switch to a second person ("Liam")
    await page.getByTestId('profile-switcher-btn').click();
    await page.getByTestId('add-new-profile-btn').click();
    await page.getByTestId('onboarding-name-input').fill('Liam');
    await page.getByTestId('onboarding-submit-btn').click();

    // Verify Liam has his own isolated profile with 0 learned patterns
    await expect(page.getByTestId('active-profile-name')).toHaveText('Liam');
    await expect(page.getByTestId('learned-count-badge')).toHaveText('0');

    // 7. Test 100% Offline operation on mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await context.setOffline(true);

    await sayItOutBtn.click();
    await expect(closestMatchText).toBeVisible();
    await expect(page.getByTestId('learned-count-badge')).toHaveText('1');

    await context.setOffline(false);
  });
});
