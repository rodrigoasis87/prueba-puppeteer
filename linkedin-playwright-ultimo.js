const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Lista de perfiles a extraer
const PERFILES = [
  {
    nombre: 'pablo-perez',
    url: 'https://www.linkedin.com/in/pablo-p%C3%A9rez-manglano-alday/recent-activity/all/'
  },
  {
    nombre: 'aitor-pastor',
    url: 'https://www.linkedin.com/in/aitor-pastor/recent-activity/all/'
  }
];

// Función para navegar con reintentos
async function navegarConReintentos(page, url, opciones = {}, maxIntentos = 3) {
  const opcionesDefault = {
    waitUntil: 'load',
    timeout: 60000
  };

  const opcionesFinal = { ...opcionesDefault, ...opciones };

  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      console.log(`Navegando a ${url} (intento ${intento}/${maxIntentos})...`);
      await page.goto(url, opcionesFinal);
      console.log('Navegación exitosa.');
      return true;
    } catch (error) {
      console.log(`Error en intento de navegación ${intento}: ${error.message.split('\n')[0]}`);

      if (intento === maxIntentos) {
        console.error(`Fallaron todos los intentos de navegación a ${url}`);
        throw error;
      }

      const tiempoEspera = 5000 * Math.pow(2, intento - 1);
      console.log(`Esperando ${tiempoEspera / 1000} segundos antes de reintentar...`);
      await new Promise(resolve => setTimeout(resolve, tiempoEspera));
    }
  }
}

// Función para extraer publicaciones
async function extraerPublicaciones(page) {
  console.log('Esperando a que carguen las publicaciones iniciales...');

  try {
    await Promise.race([
      page.waitForSelector('.update-components-text', { timeout: 30000 }),
      page.waitForSelector('.feed-shared-update-v2__description', { timeout: 30000 }),
    ]);
    console.log('Contenedor de publicaciones iniciales encontrado.');
  } catch (error) {
    console.log('No se encontraron publicaciones con los selectores esperados inicialmente. Continuando de todos modos...');
  }

  let publicaciones = [];
  let publicacionesAntes = 0;
  let intentosSinNuevas = 0;
  const maxIntentosSinNuevas = 5;

  console.log('Comenzando a extraer publicaciones...');

  while (intentosSinNuevas < maxIntentosSinNuevas) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(3000 + Math.random() * 1000);

    console.log('Buscando y clickeando botones "ver más" en el contenido cargado...');
    const seeMoreButtons = await page.locator(
        '.feed-shared-update-v2__description button.feed-shared-inline-show-more-text__see-more-less-toggle:visible'
    );
    const buttonsCount = await seeMoreButtons.count();

    if (buttonsCount > 0) {
        console.log(`Encontrados ${buttonsCount} botones "ver más" para expandir.`);
        for (let i = 0; i < buttonsCount; ++i) {
            try {
                const button = seeMoreButtons.nth(i);
                if (await button.isVisible()) {
                     await button.click({ timeout: 7000 });
                     await page.waitForTimeout(300 + Math.random() * 400);
                }
            } catch (e) {
                console.warn(`Advertencia: No se pudo clickear un botón "ver más": ${e.message.split('\n')[0]}`);
            }
        }
        console.log('Botones "ver más" procesados.');
        await page.waitForTimeout(1500);
    } else {
        console.log('No se encontraron botones "ver más" visibles para expandir en esta pasada.');
    }

    const nuevasPublicaciones = await page.evaluate(() => {
      const selectores = [
        '.feed-shared-update-v2__description'
      ];

      let elementos = [];
      for (const selector of selectores) {
        const found = document.querySelectorAll(selector);
        if (found.length > 0) {
          elementos = found;
          break;
        }
      }

      return Array.from(elementos).map(elemento => {
        const elementoTextoDiv = elemento.querySelector('.update-components-text');
        const texto = elementoTextoDiv ? elementoTextoDiv.innerText.trim() : '';

        const enlaces = [];
        if (elementoTextoDiv) {
          Array.from(elementoTextoDiv.querySelectorAll('a')).forEach(enlace => {
            enlaces.push({
              texto: enlace.innerText.trim(),
              url: enlace.href
            });
          });
        }
        
        const postCard = elemento.closest('.feed-shared-update-v2, .activity-card, .occludable-update, .scaffold-finite-scroll__content > div[id]');
        let fecha = '';
        if (postCard) {
          const elementoFecha = postCard.querySelector(
            '.feed-shared-actor__sub-description .visually-hidden, .update-components-actor__sub-description .visually-hidden, .feed-shared-actor__sub-description span[aria-hidden="true"], .update-components-actor__sub-description span[aria-hidden="true"]'
          ) || postCard.querySelector(
            '.feed-shared-actor__sub-description, .update-components-actor__sub-description'
          );
          if (elementoFecha) {
            fecha = elementoFecha.innerText.trim();
          }
        }

        return {
          texto,
          enlaces,
          fecha,
          html: elementoTextoDiv ? elementoTextoDiv.innerHTML : ''
        };
      });
    });

    const textosActuales = publicaciones.map(p => p.texto);
    const publicacionesUnicas = nuevasPublicaciones.filter(p => p.texto && !textosActuales.includes(p.texto));

    if (publicacionesUnicas.length > 0) {
      publicaciones = [...publicaciones, ...publicacionesUnicas];
      console.log(`Encontradas ${publicaciones.length} publicaciones únicas hasta ahora...`);
      publicacionesAntes = publicaciones.length;
      intentosSinNuevas = 0;
    } else {
      intentosSinNuevas++;
      console.log(`No se encontraron nuevas publicaciones únicas en esta pasada. Intento ${intentosSinNuevas}/${maxIntentosSinNuevas}`);
    }
    
    await page.waitForTimeout(1000 + Math.random() * 500);
  }

  console.log(`Extracción completada. Total: ${publicaciones.length} publicaciones.`);
  return publicaciones;
}

async function scrapeLinkedIn() {
  let browser;
  let page; // Declarar page aquí para que esté en el scope del catch y finally

  try {
    console.log('Iniciando navegador...');
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({ // context puede ser const si no se reasigna
      viewport: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.82 Safari/537.36',
      bypassCSP: true
    });
    page = await context.newPage(); // Asignar a la variable page declarada arriba

    let cookiesExistentes = false;
    const cookiesPath = 'linkedin-cookies.json';
    try {
      if (fs.existsSync(cookiesPath)) {
        const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
        const cookies = JSON.parse(cookiesString);
        await context.addCookies(cookies);
        cookiesExistentes = true;
        console.log('Cookies cargadas de archivo existente.');
      }
    } catch (error) {
      console.log('No se pudieron cargar cookies existentes:', error.message);
    }

    if (cookiesExistentes) {
      console.log('Verificando si las cookies son válidas...');
      await navegarConReintentos(page, 'https://www.linkedin.com/feed/');

      const isLoggedInWithCookies = await page.evaluate(() => {
        return window.location.href.includes('/feed/') && 
               !document.querySelector('a[href*="/login"]') && 
               (document.querySelector('.feed-identity-module') || document.querySelector('#ember-app') || document.querySelector('[role="main"]'));
      });

      if (isLoggedInWithCookies) {
        console.log('Inicio de sesión exitoso con cookies guardadas.');
      } else {
        console.log('Las cookies han expirado o no son válidas, iniciando sesión manualmente.');
        cookiesExistentes = false;
        if (fs.existsSync(cookiesPath)) {
            try { fs.unlinkSync(cookiesPath); console.log('Archivo de cookies inválidas eliminado.'); }
            catch (e) { console.error('Error al eliminar archivo de cookies:', e.message); }
        }
      }
    }

    if (!cookiesExistentes) {
      console.log('Navegando a LinkedIn para inicio de sesión manual...');
      await navegarConReintentos(page, 'https://www.linkedin.com/login');

      console.log('Por favor, inicia sesión manualmente en LinkedIn en el navegador abierto.');
      console.log('Tienes hasta 2 minutos para iniciar sesión y llegar al feed principal...');

      try {
        await page.waitForFunction(
          () => window.location.href.includes('/feed/') || // Chequeo primario de URL
                 document.querySelector('.feed-identity-module, .scaffold-layout__main, #voyager-feed, [role="main"] article, .global-nav__me-photo'), // Varios selectores comunes del feed
          { timeout: 120000 } // 2 minutos
        );
        console.log('Se detectó navegación al feed o un elemento principal del feed.');
      } catch (e) {
        console.error('Error en waitForFunction durante el inicio de sesión manual:', e.message.split('\n')[0]);
        // Intenta tomar screenshot ANTES de lanzar el error fatal
        if (page) { // Re-chequea 'page' aquí por si acaso
            const loginTimeoutScreenshotPath = `login_timeout_screenshot_${Date.now()}.png`;
            try {
                await page.screenshot({ path: loginTimeoutScreenshotPath, fullPage: true });
                console.error(`Screenshot del timeout de login guardado en: ${loginTimeoutScreenshotPath}`);
            } catch (ssError) {
                console.error(`No se pudo tomar screenshot del timeout de login: ${ssError.message.split('\n')[0]}`);
            }
        }
        throw new Error('Tiempo de espera agotado para el inicio de sesión manual o no se pudo verificar la llegada al feed principal.');
      }
      
      console.log('Inicio de sesión manual verificado (llegada al feed).');
      
      const cookies = await context.cookies();
      fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
      console.log('Cookies guardadas para uso futuro.');
    }

    const todasLasPublicaciones = {};
    for (const perfil of PERFILES) {
      console.log(`\n--- Procesando perfil: ${perfil.nombre} ---`);
      console.log(`Navegando a: ${perfil.url}`);
      await navegarConReintentos(page, perfil.url);
      
      await page.waitForTimeout(3000 + Math.random() * 2000);

      const publicaciones = await extraerPublicaciones(page);
      todasLasPublicaciones[perfil.nombre] = publicaciones;

      const nombreArchivoIndividual = `publicaciones_${perfil.nombre}.json`;
      fs.writeFileSync(
        path.join(process.cwd(), nombreArchivoIndividual),
        JSON.stringify(publicaciones, null, 2),
        'utf-8'
      );
      console.log(`Publicaciones de ${perfil.nombre} guardadas en: ${nombreArchivoIndividual}`);

      if (publicaciones.length > 0) {
        console.log(`\nEjemplo de publicación de ${perfil.nombre} (Primeros 150 caracteres):`);
        console.log('Texto:', publicaciones[0].texto.substring(0, 150) + '...');
        console.log('Fecha:', publicaciones[0].fecha);
      }
    }

    const nombreArchivoCompleto = 'todas_las_publicaciones.json';
    fs.writeFileSync(
      path.join(process.cwd(), nombreArchivoCompleto),
      JSON.stringify(todasLasPublicaciones, null, 2),
      'utf-8'
    );
    console.log(`\nTodas las publicaciones guardadas en: ${nombreArchivoCompleto}`);

    return todasLasPublicaciones;
  } catch (error) {
    console.error('Error durante la extracción:', error.message.split('\n')[0]); // Mensaje de error principal
    if (error.stack) console.error("Stack trace:\n", error.stack.split('\n').slice(1, 5).join('\n')); // Primeras líneas del stack

    if (page) {
        const errorScreenshotPath = `error_screenshot_${Date.now()}.png`;
        try {
            await page.screenshot({ path: errorScreenshotPath, fullPage: true });
            console.error(`Screenshot del error guardado en: ${errorScreenshotPath}`);
        } catch (ssError) {
            console.error(`No se pudo tomar screenshot del error: ${ssError.message.split('\n')[0]}`);
        }
    } else {
        console.error('La variable "page" no fue inicializada. No se puede tomar screenshot de la página.');
    }
    return null;
  } finally {
    console.log('\n--- Script finalizado ---');
    console.log('El navegador permanecerá abierto. Presiona Ctrl+C en la terminal para cerrar el script y el navegador si es necesario.');
    // Para cerrar automáticamente, descomenta la siguiente línea:
    // if (browser) { try { await browser.close(); console.log('Navegador cerrado.'); } catch(e){ console.error("Error al cerrar el navegador:", e.message);}}
  }
}

scrapeLinkedIn().catch(err => {
  console.error("Error no controlado en la ejecución de scrapeLinkedIn:", err.message.split('\n')[0]);
  if (err.stack) console.error("Stack trace (no controlado):\n", err.stack.split('\n').slice(1, 5).join('\n'));
});