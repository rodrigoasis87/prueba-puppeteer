const puppeteer = require('puppeteer-core');
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

// Función principal
(async () => {
    // Usar Chrome de Windows
    const chromePath = '/mnt/c/program files/google/chrome/application/chrome.exe';
    
    // Verificar si existen las cookies guardadas
    const cookiesPath = path.join(process.cwd(), 'linkedin-cookies.json');
    if (!fs.existsSync(cookiesPath)) {
        console.error('No se encontró el archivo de cookies. Ejecuta primero guardar-cookies.js');
        return;
    }

    console.log('Iniciando navegador...');
    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1280,800'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Cargar cookies guardadas
        console.log('Cargando cookies guardadas...');
        const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        
        // Objeto para almacenar todas las publicaciones de todos los perfiles
        const todasLasPublicaciones = {};
        
        // Procesar cada perfil
        for (const perfil of PERFILES) {
            console.log(`\n--- Procesando perfil: ${perfil.nombre} ---`);
            
            // Navegar a la página de actividad reciente del perfil
            console.log(`Navegando a: ${perfil.url}`);
            await page.goto(perfil.url, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });
            
            // Verificar si seguimos con la sesión iniciada
            const isLoggedIn = await page.evaluate(() => {
                return !document.querySelector('.nav__button-secondary');
            });
            
            if (!isLoggedIn) {
                console.error('Las cookies han expirado o no son válidas. Ejecuta guardar-cookies.js nuevamente.');
                break;
            }
            
            // Extraer publicaciones para este perfil
            const publicaciones = await extraerPublicacionesDePerfil(page);
            
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
                console.log('Enlaces:', publicaciones[0].enlaces.length);
                console.log('Fecha:', publicaciones[0].fecha);
            }
            
            // Pequeña pausa entre perfiles
            await page.waitForTimeout(2000);
        }
        
        // Guardar todas las publicaciones en un solo archivo
        const nombreArchivoCompleto = 'todas_las_publicaciones.json';
        fs.writeFileSync(
            path.join(process.cwd(), nombreArchivoCompleto),
            JSON.stringify(todasLasPublicaciones, null, 2),
            'utf-8'
        );
        
        console.log(`\nTodas las publicaciones guardadas en: ${nombreArchivoCompleto}`);
        
        // Resumen final
        console.log('\n--- Resumen de extracción ---');
        for (const perfil of PERFILES) {
            const cantidad = todasLasPublicaciones[perfil.nombre]?.length || 0;
            console.log(`${perfil.nombre}: ${cantidad} publicaciones`);
        }
        
    } catch (error) {
        console.error('Error durante la extracción:', error);
    } finally {
        // Preguntar al usuario si desea cerrar el navegador
        console.log('\n¿Deseas cerrar el navegador? (El script seguirá ejecutándose hasta que cierres manualmente el navegador)');
        // No cerramos el navegador automáticamente para que puedas ver los resultados
        // Si quieres cerrarlo automáticamente, descomenta la siguiente línea:
        // await browser.close();
    }
})().catch(error => {
    console.error('Error en la ejecución principal:', error);
});

// Función para extraer publicaciones de un perfil
async function extraerPublicacionesDePerfil(page) {
    // Esperar a que aparezcan las publicaciones
    console.log('Esperando a que carguen las publicaciones...');
    await page.waitForSelector('.update-components-text', { 
        timeout: 30000 
    }).catch(() => {
        console.log('No se encontraron publicaciones con la clase .update-components-text');
        console.log('Verificando clases alternativas...');
    });
    
    // Array para almacenar todas las publicaciones
    let publicaciones = [];
    let publicacionesAntes = 0;
    let intentosSinNuevas = 0;
    const maxIntentosSinNuevas = 3; // Número máximo de intentos sin encontrar nuevas publicaciones
    
    console.log('Comenzando a extraer publicaciones...');
    
    // Hacer scroll y extraer publicaciones hasta que no haya más o alcancemos un límite
    while (intentosSinNuevas < maxIntentosSinNuevas) {
        // Extraer publicaciones actuales
        const nuevasPublicaciones = await extraerPublicacionesActuales(page);
        
        // Filtrar publicaciones duplicadas (comparando por texto)
        const textosActuales = publicaciones.map(p => p.texto);
        const publicacionesUnicas = nuevasPublicaciones.filter(p => !textosActuales.includes(p.texto));
        
        // Añadir nuevas publicaciones únicas
        publicaciones = [...publicaciones, ...publicacionesUnicas];
        
        console.log(`Encontradas ${publicaciones.length} publicaciones únicas hasta ahora...`);
        
        // Verificar si hemos encontrado nuevas publicaciones
        if (publicaciones.length > publicacionesAntes) {
            publicacionesAntes = publicaciones.length;
            intentosSinNuevas = 0; // Reiniciar contador si encontramos nuevas
        } else {
            intentosSinNuevas++;
            console.log(`No se encontraron nuevas publicaciones. Intento ${intentosSinNuevas}/${maxIntentosSinNuevas}`);
        }
        
        // Hacer scroll para cargar más publicaciones
        await page.evaluate(() => {
            window.scrollBy(0, 1000);
        });
        
        // Esperar a que se carguen nuevas publicaciones
        await page.waitForTimeout(3000);
    }
    
    console.log(`Extracción completada. Total: ${publicaciones.length} publicaciones.`);
    return publicaciones;
}

// Función para extraer publicaciones de la página actual
async function extraerPublicacionesActuales(page) {
    return await page.evaluate(() => {
        // Intentar con diferentes selectores que podrían contener las publicaciones
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
            // Extraer el texto completo
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
                html: elemento.innerHTML // Guardar también el HTML para análisis posterior
            };
        });
    });
}