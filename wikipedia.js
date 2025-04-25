const puppeteer = require('puppeteer-core');

async function scrapWikipedia() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://es.wikipedia.org/wiki/Especial:Aleatorio', {
      waitUntil: 'networkidle2'
    });

    // Extraer título e información básica
    const data = await page.evaluate(() => {
      const title = document.querySelector('#firstHeading').innerText;
      const summary = document.querySelector('.mw-parser-output > p:not(.mw-empty-elt)').innerText;
      const categories = Array.from(document.querySelectorAll('.mw-normal-catlinks ul li')).map(el => el.innerText);
      const infoboxData = {};
      
      // Extraer datos de infobox si existe
      const infoboxRows = document.querySelectorAll('.infobox tr');
      infoboxRows.forEach(row => {
        const label = row.querySelector('th');
        const value = row.querySelector('td');
        if (label && value) {
          infoboxData[label.innerText.trim()] = value.innerText.trim();
        }
      });

      return { title, summary, categories, infoboxData };
    });

    console.log('Artículo aleatorio de Wikipedia:');
    console.log('Título:', data.title);
    console.log('Resumen:', data.summary);
    console.log('Categorías:', data.categories);
    console.log('Datos de infobox:', data.infoboxData);

    return data;
  } finally {
    await browser.close();
  }
}

scrapWikipedia().catch(console.error);