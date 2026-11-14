// Record manually created contexts as well as Playwright's default page fixture.
const recordedPages = new WeakMap();

export async function createRecordedContext(browser, testInfo, options = {}) {
  const configured = testInfo.project.use;
  const context = await browser.newContext({
    viewport: configured.viewport || { width: 1280, height: 720 },
    locale: configured.locale || 'en-US',
    ...options,
    recordVideo: {
      dir: testInfo.outputPath('secondary-context-videos'),
      size: { width: 1280, height: 720 },
    },
  });
  const pages = new Set(context.pages());
  context.on('page', page => pages.add(page));
  recordedPages.set(context, pages);
  return context;
}

export async function closeRecordedContext(context, testInfo, label = 'restricted') {
  const pages = recordedPages.get(context) || new Set(context.pages());
  // close() must finish before the recording file is read or attached.
  await context.close();
  await saveNamedVideos(pages, testInfo, label);
  recordedPages.delete(context);
}

function safeVideoName(value, limit = 150) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().slice(0, limit) || 'testcase';
}

async function saveNamedVideos(pages, testInfo, label = '') {
  const recorded = [...new Set(pages)];
  const name = safeVideoName(testInfo.title);
  const session = label ? `-${safeVideoName(label, 40)}` : '';
  const repeat = testInfo.repeatEachIndex ? `-repeat-${testInfo.repeatEachIndex}` : '';
  const retry = testInfo.retry ? `-retry-${testInfo.retry}` : '';

  for (const [index, page] of recorded.entries()) {
    const video = page.video();
    if (!video) {
      throw new Error(`No recording is available for ${label || 'main'} page ${index + 1}.`);
    }
    const extraPage = recorded.length > 1 ? `-page-${index + 1}` : '';
    const filename = `${name}${session}${repeat}${retry}${extraPage}.webm`;
    const savedPath = testInfo.outputPath(filename);

    await video.saveAs(savedPath);
    await testInfo.attach(filename, {
      path: savedPath,
      contentType: 'video/webm',
    });
  }
}

// Save the default page recording without changing any testcase steps.
export async function saveVideoByTestName(page, testInfo) {
  const context = page.context();
  const pages = new Set([page, ...context.pages()]);
  await context.close();
  await saveNamedVideos(pages, testInfo);
}
