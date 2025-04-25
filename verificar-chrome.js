const { execSync } = require('child_process');
const fs = require('fs');

// Verificar rutas comunes de Chrome en Windows desde WSL
const rutasPosibles = [
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe'
];

console.log('Verificando rutas de Chrome:');
for (const ruta of rutasPosibles) {
    try {
        if (fs.existsSync(ruta)) {
            console.log(`✅ Chrome encontrado en: ${ruta}`);
        } else {
            console.log(`❌ No se encontró Chrome en: ${ruta}`);
        }
    } catch (error) {
        console.log(`❌ Error al verificar ${ruta}: ${error.message}`);
    }
}

// Intentar encontrar Chrome usando PowerShell
try {
    console.log('\nBuscando Chrome con PowerShell:');
    const comando = 'powershell.exe -Command "Get-ItemProperty \\"HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe\\" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty \\"(Default)\\""';
    const resultado = execSync(comando).toString().trim();
    
    if (resultado) {
        const rutaWSL = resultado.replace(/\\/g, '/').replace(/^([A-Za-z]):/i, '/mnt/$1').toLowerCase();
        console.log(`PowerShell encontró Chrome en: ${resultado}`);
        console.log(`Ruta equivalente en WSL: ${rutaWSL}`);
        
        if (fs.existsSync(rutaWSL)) {
            console.log(`✅ La ruta en WSL existe y es accesible`);
        } else {
            console.log(`❌ La ruta en WSL NO es accesible`);
        }
    } else {
        console.log('PowerShell no pudo encontrar Chrome');
    }
} catch (error) {
    console.log(`Error al buscar con PowerShell: ${error.message}`);
}