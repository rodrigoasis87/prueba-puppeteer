# LinkedIn Profile Scraper

Este repositorio contiene scripts para extraer publicaciones de perfiles de LinkedIn utilizando Playwright. El script principal (`linkedin-playwright.js`) permite extraer publicaciones de la actividad reciente de perfiles específicos y guardarlas en archivos JSON.

## Requisitos previos

- Node.js (v14 o superior)
- npm (incluido con Node.js)
- Cuenta de LinkedIn

## Instalación

1. Clona este repositorio:
   ```bash
   git clone [URL_DEL_REPOSITORIO]
   cd [NOMBRE_DEL_DIRECTORIO]
  ```

2. Instala las dependencias:
   ```bash
   npm install playwright
    ```

3. Instala los navegadores necesarios:
    ```bash
    npx playwright install chrome
    ```

## Configuración

1. Abre el archivo `linkedin-playwright.js` y modifica la lista de perfiles según tus necesidades:
    ```js
    const PERFILES = [
  {
    nombre: 'nombre-perfil',
    url: 'https://www.linkedin.com/in/nombre-perfil/recent-activity/all/'
  },
  // Añade más perfiles si es necesario
];
    ```

## Uso 

1. Ejecuta el script:
    ```bash
    node linkedin-playwright.js
    ```

2. El script abrirá un navegador Chrome/Chromium. Si es la primera vez que lo ejecutas, deberás iniciar sesión manualmente en LinkedIn cuando se te solicite.

3. Una vez iniciada la sesión, el script guardará las cookies para futuros usos y comenzará a extraer las publicaciones de los perfiles configurados.

4. Los resultados se guardarán en:

- Un archivo JSON individual para cada perfil: `publicaciones_[nombre-perfil].json`
- Un archivo JSON con todas las publicaciones: `todas_las_publicaciones.json`

## Estructura de archivos

- `linkedin-playwright.js`: Script principal que utiliza Playwright para extraer publicaciones
- `linkedin-cookies.json`: Archivo generado automáticamente que almacena las cookies de sesión
- `publicaciones_*.json`: Archivos generados con las publicaciones extraídas
- `todas_las_publicaciones.json`: Archivo generado con todas las publicaciones de todos los perfiles

### LinkedIn Profile Scraper

Este repositorio contiene scripts para extraer publicaciones de perfiles de LinkedIn utilizando Playwright. El script principal (`linkedin-playwright.js`) permite extraer publicaciones de la actividad reciente de perfiles específicos y guardarlas en archivos JSON.

## Requisitos previos

- Node.js (v14 o superior)
- npm (incluido con Node.js)
- Cuenta de LinkedIn


## Instalación

1. Clona este repositorio:

```shellscript
git clone [URL_DEL_REPOSITORIO]
cd [NOMBRE_DEL_DIRECTORIO]
```


2. Instala las dependencias:

```shellscript
npm install playwright
```


3. Instala los navegadores necesarios:

```shellscript
npx playwright install chrome
```




## Configuración

1. Abre el archivo `linkedin-playwright.js` y modifica la lista de perfiles según tus necesidades:

```javascript
const PERFILES = [
  {
    nombre: 'nombre-perfil',
    url: 'https://www.linkedin.com/in/nombre-perfil/recent-activity/all/'
  },
  // Añade más perfiles si es necesario
];
```




## Uso

1. Ejecuta el script:

```shellscript
node linkedin-playwright.js
```


2. El script abrirá un navegador Chrome/Chromium. Si es la primera vez que lo ejecutas, deberás iniciar sesión manualmente en LinkedIn cuando se te solicite.
3. Una vez iniciada la sesión, el script guardará las cookies para futuros usos y comenzará a extraer las publicaciones de los perfiles configurados.
4. Los resultados se guardarán en:

1. Un archivo JSON individual para cada perfil: `publicaciones_[nombre-perfil].json`
2. Un archivo JSON con todas las publicaciones: `todas_las_publicaciones.json`


## Estructura de archivos

- `linkedin-playwright.js`: Script principal que utiliza Playwright para extraer publicaciones
- `linkedin-cookies.json`: Archivo generado automáticamente que almacena las cookies de sesión
- `publicaciones_*.json`: Archivos generados con las publicaciones extraídas
- `todas_las_publicaciones.json`: Archivo generado con todas las publicaciones de todos los perfiles


## Notas sobre entornos

- **WSL (Windows Subsystem for Linux)**: El script ha sido probado y funciona correctamente en WSL. Playwright detectará automáticamente el navegador Chrome instalado en Windows.
- **Windows nativo**: El script también debería funcionar en Windows nativo sin modificaciones.
- **Linux**: En sistemas Linux, asegúrate de tener Chrome o Chromium instalado. Si es necesario, puedes modificar la línea `channel: 'chrome'` a `channel: 'chromium'` si prefieres usar Chromium.
- **macOS**: El script debería funcionar sin modificaciones en macOS.


## Solución de problemas

- Si encuentras problemas de conexión, intenta aumentar los tiempos de espera en la función `navegarConReintentos`.
- Si LinkedIn detecta la automatización, el script está diseñado para permitir el inicio de sesión manual.
- Para problemas con WSL, asegúrate de que puedes acceder a los navegadores instalados en Windows.


## Comparación con otros scripts

Este repositorio también incluye scripts que utilizan Puppeteer, pero se recomienda usar la versión de Playwright (`linkedin-playwright.js`) ya que ofrece mejor compatibilidad con LinkedIn y entornos WSL.