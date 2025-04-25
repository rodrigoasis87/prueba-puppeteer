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
      console.log('Navegación exitosa');
      return true;
    } catch (error) {
      console.log(`Error en intento ${intento}: ${error.message}`);
      
      if (intento === maxIntentos) {
        console.error(`Fallaron todos los intentos de navegación a ${url}`);
        throw error;
      }
      
      // Esperar antes de reintentar (tiempo exponencial)
      const tiempoEspera = 5000 * Math.pow(2, intento - 1);
      console.log(`Esperando ${tiempoEspera/1000} segundos antes de reintentar...`);
      await new Promise(resolve => setTimeout(resolve, tiempoEspera));
    }
  }
}

// Función para extraer publicaciones
async function extraerPublicaciones(page) {
  console.log('Esperando a que carguen las publicaciones...');
  
  // Esperar a que aparezcan las publicaciones con varios selectores posibles
  try {
    await Promise.race([
      page.waitForSelector('.update-components-text', { timeout: 30000 }),
      page.waitForSelector('.feed-shared-update-v2__description-wrapper', { timeout: 30000 }),
      page.waitForSelector('.feed-shared-text', { timeout: 30000 })
    ]);
  } catch (error) {
    console.log('No se encontraron publicaciones con los selectores esperados. Continuando de todos modos...');
  }
  
  // Array para almacenar publicaciones
  let publicaciones = [];
  let publicacionesAntes = 0;
  let intentosSinNuevas = 0;
  const maxIntentosSinNuevas = 3;
  
  console.log('Comenzando a extraer publicaciones...');
  
  // Hacer scroll y extraer publicaciones
  while (intentosSinNuevas < maxIntentosSinNuevas) {
    // Extraer publicaciones actuales
    const nuevasPublicaciones = await page.evaluate(() => {
      // Intentar con diferentes selectores
      const selectores = [
        '.update-components-text',
        '.feed-shared-update-v2__description-wrapper',
        '.feed-shared-text'
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
        // Extraer texto
        const texto = elemento.innerText.trim();
        
        // Extraer enlaces
        const enlaces = Array.from(elemento.querySelectorAll('a')).map(enlace => {
          return {
            texto: enlace.innerText.trim(),
            url: enlace.href
          };
        });
        
        // Extraer fecha si está disponible
        const contenedorPublicacion = elemento.closest('.feed-shared-update-v2') || 
                                    elemento.closest('.occludable-update');
        let fecha = '';
        if (contenedorPublicacion) {
          const elementoFecha = contenedorPublicacion.querySelector('.feed-shared-actor__sub-description') ||
                               contenedorPublicacion.querySelector('.update-components-actor__sub-description');
          if (elementoFecha) {
            fecha = elementoFecha.innerText.trim();
          }
        }
        
        return {
          texto,
          enlaces,
          fecha,
          html: elemento.innerHTML
        };
      });
    });
    
    // Filtrar duplicados
    const textosActuales = publicaciones.map(p => p.texto);
    const publicacionesUnicas = nuevasPublicaciones.filter(p => !textosActuales.includes(p.texto));
    
    // Añadir nuevas publicaciones
    publicaciones = [...publicaciones, ...publicacionesUnicas];
    
    console.log(`Encontradas ${publicaciones.length} publicaciones únicas hasta ahora...`);
    
    // Verificar si hemos encontrado nuevas
    if (publicaciones.length > publicacionesAntes) {
      publicacionesAntes = publicaciones.length;
      intentosSinNuevas = 0;
    } else {
      intentosSinNuevas++;
      console.log(`No se encontraron nuevas publicaciones. Intento ${intentosSinNuevas}/${maxIntentosSinNuevas}`);
    }
    
    // Hacer scroll
    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(3000);
  }
  
  console.log(`Extracción completada. Total: ${publicaciones.length} publicaciones.`);
  return publicaciones;
}

async function scrapeLinkedIn() {
  let browser;
  
  try {
    console.log('Iniciando navegador...');
    
    // Iniciar navegador con Playwright
    // Esto detectará automáticamente Chrome en Windows
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome', // Usar Chrome instalado
      args: ['--start-maximized']
    });
    
    // Crear contexto y página
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    
    // Verificar si tenemos cookies guardadas
    let cookiesExistentes = false;
    try {
      if (fs.existsSync('linkedin-cookies.json')) {
        const cookiesString = fs.readFileSync('linkedin-cookies.json', 'utf8');
        const cookies = JSON.parse(cookiesString);
        await context.addCookies(cookies);
        cookiesExistentes = true;
        console.log('Cookies cargadas de archivo existente');
      }
    } catch (error) {
      console.log('No se pudieron cargar cookies existentes:', error.message);
    }
    
    // Intentar usar cookies existentes primero
    if (cookiesExistentes) {
      console.log('Verificando si las cookies son válidas...');
      await navegarConReintentos(page, 'https://www.linkedin.com/feed/');
      
      // Verificar si estamos logueados
      const isLoggedIn = await page.evaluate(() => {
        return !document.querySelector('.nav__button-secondary');
      });
      
      if (isLoggedIn) {
        console.log('Inicio de sesión exitoso con cookies guardadas');
      } else {
        console.log('Las cookies han expirado, iniciando sesión manualmente');
        cookiesExistentes = false;
      }
    }
    
    // Si no tenemos cookies válidas, iniciar sesión manualmente
    if (!cookiesExistentes) {
      console.log('Navegando a LinkedIn...');
      await navegarConReintentos(page, 'https://www.linkedin.com/login');
      
      console.log('Por favor, inicia sesión manualmente en LinkedIn...');
      console.log('Tienes 2 minutos para iniciar sesión...');
      
      // Esperar a que el usuario inicie sesión
      await page.waitForFunction(
        () => {
          return window.location.href.includes('/feed/') || 
                 !document.querySelector('.nav__button-secondary');
        },
        { timeout: 120000 }
      );
      
      // Verificar si el inicio de sesión fue exitoso
      const isLoggedIn = await page.evaluate(() => {
        return !document.querySelector('.nav__button-secondary');
      });
      
      if (!isLoggedIn) {
        throw new Error('No se pudo iniciar sesión. Verifica tus credenciales.');
      }
      
      console.log('Inicio de sesión exitoso!');
      
      // Guardar cookies para uso futuro
      const cookies = await context.cookies();
      fs.writeFileSync('linkedin-cookies.json', JSON.stringify(cookies, null, 2));
      console.log('Cookies guardadas para uso futuro');
    }
    
    // Objeto para almacenar todas las publicaciones
    const todasLasPublicaciones = {};
    
    // Procesar cada perfil
    for (const perfil of PERFILES) {
      console.log(`\n--- Procesando perfil: ${perfil.nombre} ---`);
      
      // Navegar a la página de actividad reciente del perfil
      console.log(`Navegando a: ${perfil.url}`);
      await navegarConReintentos(page, perfil.url);
      
      // Extraer publicaciones
      const publicaciones = await extraerPublicaciones(page);
      
      // Guardar las publicaciones de este perfil
      todasLasPublicaciones[perfil.nombre] = publicaciones;
      
      // También guardar en un archivo individual para este perfil
      const nombreArchivoIndividual = `publicaciones_${perfil.nombre}.json`;
      fs.writeFileSync(
        path.join(process.cwd(), nombreArchivoIndividual),
        JSON.stringify(publicaciones, null, 2),
        'utf-8'
      );
      
      console.log(`Publicaciones de ${perfil.nombre} guardadas en: ${nombreArchivoIndividual}`);
      
      // Mostrar ejemplo de la primera publicación
      if (publicaciones.length > 0) {
        console.log(`\nEjemplo de publicación de ${perfil.nombre}:`);
        console.log('Texto:', publicaciones[0].texto.substring(0, 150) + '...');
      }
    }
    
    // Guardar todas las publicaciones en un solo archivo
    const nombreArchivoCompleto = 'todas_las_publicaciones.json';
    fs.writeFileSync(
      path.join(process.cwd(), nombreArchivoCompleto),
      JSON.stringify(todasLasPublicaciones, null, 2),
      'utf-8'
    );
    
    console.log(`\nTodas las publicaciones guardadas en: ${nombreArchivoCompleto}`);
    
    return todasLasPublicaciones;
  } catch (error) {
    console.error('Error durante la extracción:', error);
    return null;
  } finally {
    // Preguntar si desea cerrar el navegador
    console.log('\nPresiona Ctrl+C para terminar el script y cerrar el navegador.');
    // Si prefieres cerrar automáticamente, descomenta:
    // if (browser) await browser.close();
  }
}

// Ejecutar el script
scrapeLinkedIn().catch(console.error);