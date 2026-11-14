import { saveVideoByTestName } from './recorded-context.js';

export function installNamedVideoRecording(test) {
  // Override only the video option; keep the existing screenshot, trace and UI settings.
  test.use({ video: 'on' });

  // Register last so the original afterEach hooks can capture their screenshots first.
  test.afterEach(async ({ page }, testInfo) => {
    await saveVideoByTestName(page, testInfo);
  });
}
