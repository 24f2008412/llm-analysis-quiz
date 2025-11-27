// solver/index.js
const puppeteer = require('puppeteer');
const handlers = require('./handlers');

async function solveAndSubmit({ email, secret, url }){
  console.log('Launching headless browser for', url);

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

  const browser = await puppeteer.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(60_000);

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait a short while for client side JS to populate
    await page.waitForTimeout(700);

    // Extract DOM text and HTML
    const html = await page.content();
    const innerText = await page.evaluate(() => document.documentElement.innerText);

    console.log('Page loaded. Text length:', innerText.length);

    // Let handlers try to parse the task and produce an answer payload
    const task = { url, html, innerText, page, browser };
    const answerPayload = await handlers.handle(task, { email, secret });

    if (!answerPayload) {
      console.warn('No answer generated for', url);
      await browser.close();
      return;
    }

    console.log('Submitting answer payload to', answerPayload.submitUrl);
    // submitUrl and payload were prepared by handlers
    const submitResult = await handlers.submitAnswer(answerPayload.submitUrl, answerPayload.payload);

    console.log('Submit result:', submitResult && submitResult.status);

    // If the quiz system returns a next url, follow it (simple loop, limited)
    if (submitResult && submitResult.data && submitResult.data.url) {
      let loopCount = 0;
      let current = submitResult.data.url;
      while (current && loopCount < 5) {
        loopCount++;
        console.log('Following nextUrl:', current);
        await page.goto(current, { waitUntil: 'networkidle2' });
        await page.waitForTimeout(500);
        const h = await page.content();
        const t = await page.evaluate(() => document.documentElement.innerText);
        const nextTask = { url: current, html: h, innerText: t, page, browser };
        const nextAnswer = await handlers.handle(nextTask, { email, secret });
        if (!nextAnswer) break;
        const r = await handlers.submitAnswer(nextAnswer.submitUrl, nextAnswer.payload);
        if (!r || !r.data || !r.data.url) break;
        current = r.data.url;
      }
    }

    await browser.close();
  } catch (err) {
    console.error('Error while solving:', err.message || err);
    try { await browser.close(); } catch(e){}
    throw err;
  }
}

module.exports = { solveAndSubmit };
