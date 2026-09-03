const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  await page.waitForSelector('text=Jeevan Shilp Public School');
  await page.click('text=Jeevan Shilp Public School');
  await new Promise(r => setTimeout(r, 1000));
  const html = await page.content();
  if (html.includes('Login ID')) {
    console.log('Login form appeared successfully.');
  } else {
    console.log('Login form failed to appear.');
  }
  await browser.close();
})();
