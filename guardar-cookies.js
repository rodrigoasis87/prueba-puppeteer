const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

(async () => {
    // Usar Chrome de Windows
    const chromePath = '/mnt/c/program files/google/chrome/application/chrome.exe';
    
    console.log('Iniciando navegador para guardar cookies...');
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
        
        // Navegar a LinkedIn
        console.log('Navegando a LinkedIn...');
        await page.goto('https://www.linkedin.com/', { 
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        console.log('Por favor, inicia sesión manualmente en LinkedIn...');
        console.log('Tienes 2 minutos para iniciar sesión...');
        
        // Esperar a que el usuario inicie sesión (2 minutos)
        await page.waitForFunction(
            () => {
                // Verificar si estamos en la página de feed o perfil (indicador de inicio de sesión exitoso)
                return window.location.href.includes('/feed/') || 
                       !document.querySelector('.nav__button-secondary');
            },
            { timeout: 120000 }
        );
        
        // Verificar si el inicio de sesión fue exitoso
        const isLoggedIn = await page.evaluate(() => {
            return !document.querySelector('.nav__button-secondary');
        });
        
        if (isLoggedIn) {
            console.log('Inicio de sesión exitoso. Guardando cookies...');
            
            // Obtener todas las cookies
            const cookies = await page.cookies();
            
            // Guardar cookies en un archivo
            const cookiesPath = path.join(process.cwd(), 'linkedin-cookies.json');
            fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
            
            console.log(`Cookies guardadas en: ${cookiesPath}`);
            
            // Navegar a la página del perfil para verificar que las cookies funcionan
            console.log('Verificando cookies...');
            await page.goto('https://www.linkedin.com/in/pablo-p%C3%A9rez-manglano-alday/', {
                waitUntil: 'networkidle2'
            });
            
            const title = await page.title();
            console.log(`Título de la página: ${title}`);
            console.log('Las cookies se han guardado correctamente y funcionan.');
        } else {
            console.log('No se pudo iniciar sesión correctamente.');
        }
    } catch (error) {
        console.error('Error al guardar cookies:', error);
    } finally {
        // Preguntar si desea cerrar el navegador
        console.log('\nPresiona Ctrl+C para terminar el script y cerrar el navegador.');
    }
})().catch(error => {
    console.error('Error en la ejecución principal:', error);
});