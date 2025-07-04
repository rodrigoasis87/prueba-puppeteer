require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// Configuración de MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/linkedin_scraper';
const DB_NAME = 'linkedin_scraper';
const COLLECTION_PUBLICACIONES = 'publicaciones';
const COLLECTION_METADATOS = 'metadatos';

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

// Función para conectar a MongoDB
async function conectarMongoDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  console.log('Conectado a MongoDB');
  return client;
}

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
async function extraerPublicaciones(page, publicacionesExistentes = []) {
  console.log('Esperando a que carguen las publicaciones...');
  
  // Crear un conjunto de textos existentes para búsqueda rápida
  const textosExistentes = new Set(publicacionesExistentes.map(p => p.texto));
  
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
  let publicacionesNuevas = 0;
  
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
    
    // Filtrar duplicados dentro de esta ejecución
    const textosActuales = publicaciones.map(p => p.texto);
    const publicacionesUnicasEstaEjecucion = nuevasPublicaciones.filter(p => !textosActuales.includes(p.texto));
    
    // Filtrar publicaciones que ya existían en ejecuciones anteriores
    const publicacionesUnicasTotal = publicacionesUnicasEstaEjecucion.filter(p => !textosExistentes.has(p.texto));
    
    // Añadir nuevas publicaciones
    publicaciones = [...publicaciones, ...publicacionesUnicasEstaEjecucion];
    publicacionesNuevas += publicacionesUnicasTotal.length;
    
    console.log(`Encontradas ${publicaciones.length} publicaciones únicas en esta ejecución...`);
    console.log(`De las cuales ${publicacionesNuevas} son nuevas respecto a ejecuciones anteriores.`);
    
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
  console.log(`Publicaciones nuevas: ${publicacionesNuevas}`);
  
  // Añadir timestamp a cada publicación
  const ahora = new Date();
  publicaciones = publicaciones.map(p => ({
    ...p,
    extraido_en: ahora,
    actualizado_en: ahora
  }));
  
  return publicaciones;
}

// Función para obtener publicaciones existentes
async function obtenerPublicacionesExistentes(db, perfilNombre) {
  const collection = db.collection(COLLECTION_PUBLICACIONES);
  const publicaciones = await collection.find({ perfil_id: perfilNombre }).toArray();
  return publicaciones;
}

// Función para guardar publicaciones en MongoDB
async function guardarPublicacionesEnMongoDB(db, perfilNombre, publicaciones) {
  if (publicaciones.length === 0) return;
  
  const collection = db.collection(COLLECTION_PUBLICACIONES);
  
  // Preparar documentos para inserción
  const documentos = publicaciones.map(p => ({
    perfil_id: perfilNombre,
    texto: p.texto,
    enlaces: p.enlaces,
    fecha_texto: p.fecha,
    html: p.html,
    extraido_en: p.extraido_en,
    actualizado_en: p.actualizado_en
  }));
  
  // Insertar documentos
  const resultado = await collection.insertMany(documentos);
  console.log(`${resultado.insertedCount} publicaciones guardadas en MongoDB`);
  return resultado;
}

// Función para guardar metadatos de ejecución
async function guardarMetadatosEjecucion(db, datos) {
  const collection = db.collection(COLLECTION_METADATOS);
  const resultado = await collection.insertOne({
    ...datos,
    timestamp: new Date()
  });
  console.log(`Metadatos de ejecución guardados en MongoDB con ID: ${resultado.insertedId}`);
  return resultado;
}

async function scrapeLinkedIn() {
  let browser;
  let mongoClient;
  
  try {
    // Conectar a MongoDB
    mongoClient = await conectarMongoDB();
    const db = mongoClient.db(DB_NAME);
    
    // Crear índices si no existen
    await db.collection(COLLECTION_PUBLICACIONES).createIndex({ perfil_id: 1 });
    await db.collection(COLLECTION_PUBLICACIONES).createIndex({ texto: 1 });
    
    console.log('Iniciando navegador...');
    
    // Iniciar navegador con Playwright
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
    const metadatosEjecucion = {
      perfiles_procesados: [],
      total_publicaciones: 0,
      nuevas_publicaciones: 0,
      inicio_ejecucion: new Date()
    };
    
    // Procesar cada perfil
    for (const perfil of PERFILES) {
      console.log(`\n--- Procesando perfil: ${perfil.nombre} ---`);
      
      // Obtener publicaciones existentes de MongoDB
      const publicacionesExistentes = await obtenerPublicacionesExistentes(db, perfil.nombre);
      console.log(`Encontradas ${publicacionesExistentes.length} publicaciones existentes para ${perfil.nombre} en MongoDB`);
      
      // Navegar a la página de actividad reciente del perfil
      console.log(`Navegando a: ${perfil.url}`);
      await navegarConReintentos(page, perfil.url);
      
      // Extraer publicaciones (pasando las existentes para filtrar)
      const publicaciones = await extraerPublicaciones(page, publicacionesExistentes);
      
      // Filtrar publicaciones que ya existen en MongoDB
      const textosExistentes = new Set(publicacionesExistentes.map(p => p.texto));
      const publicacionesNuevas = publicaciones.filter(p => !textosExistentes.has(p.texto));
      
      console.log(`Encontradas ${publicacionesNuevas.length} publicaciones nuevas para ${perfil.nombre}`);
      
      // Guardar las publicaciones de este perfil
      todasLasPublicaciones[perfil.nombre] = publicaciones;
      
      // Guardar en MongoDB
      if (publicacionesNuevas.length > 0) {
        await guardarPublicacionesEnMongoDB(db, perfil.nombre, publicacionesNuevas);
      }
      
      // Actualizar metadatos
      metadatosEjecucion.perfiles_procesados.push({
        nombre: perfil.nombre,
        total_publicaciones: publicaciones.length,
        nuevas_publicaciones: publicacionesNuevas.length
      });
      metadatosEjecucion.total_publicaciones += publicaciones.length;
      metadatosEjecucion.nuevas_publicaciones += publicacionesNuevas.length;
      
      // También guardar en un archivo individual para este perfil
      const nombreArchivoIndividual = `publicaciones_${perfil.nombre}.json`;
      
      // Leer archivo existente si existe
      let todasLasPublicacionesPerfil = [];
      try {
        if (fs.existsSync(nombreArchivoIndividual)) {
          const contenidoExistente = fs.readFileSync(nombreArchivoIndividual, 'utf-8');
          todasLasPublicacionesPerfil = JSON.parse(contenidoExistente);
          console.log(`Archivo existente leído: ${nombreArchivoIndividual}`);
        }
      } catch (error) {
        console.log(`No se pudo leer el archivo existente: ${error.message}`);
      }
      
      // Filtrar publicaciones nuevas para el archivo
      const textosArchivoExistente = new Set(todasLasPublicacionesPerfil.map(p => p.texto));
      const publicacionesNuevasArchivo = publicaciones.filter(p => !textosArchivoExistente.has(p.texto));
      
      // Combinar publicaciones existentes con nuevas
      const publicacionesCombinadas = [...todasLasPublicacionesPerfil, ...publicacionesNuevasArchivo];
      
      // Guardar archivo combinado
      fs.writeFileSync(
        path.join(process.cwd(), nombreArchivoIndividual),
        JSON.stringify(publicacionesCombinadas, null, 2),
        'utf-8'
      );
      
      console.log(`Publicaciones de ${perfil.nombre} guardadas en: ${nombreArchivoIndividual}`);
      console.log(`Se añadieron ${publicacionesNuevasArchivo.length} nuevas publicaciones al archivo.`);
      
      // Mostrar ejemplo de la primera publicación nueva
      if (publicacionesNuevas.length > 0) {
        console.log(`\nEjemplo de publicación nueva de ${perfil.nombre}:`);
        console.log('Texto:', publicacionesNuevas[0].texto.substring(0, 150) + '...');
      }
    }
    
    // Guardar todas las publicaciones en un solo archivo
    const nombreArchivoCompleto = 'todas_las_publicaciones.json';
    
    // Leer archivo existente si existe
    let todasLasPublicacionesExistentes = {};
    try {
      if (fs.existsSync(nombreArchivoCompleto)) {
        const contenidoExistente = fs.readFileSync(nombreArchivoCompleto, 'utf-8');
        todasLasPublicacionesExistentes = JSON.parse(contenidoExistente);
        console.log(`Archivo existente leído: ${nombreArchivoCompleto}`);
      }
    } catch (error) {
      console.log(`No se pudo leer el archivo existente: ${error.message}`);
    }
    
    // Combinar publicaciones existentes con nuevas
    const todasLasPublicacionesCombinadas = { ...todasLasPublicacionesExistentes };
    
    // Para cada perfil, combinar publicaciones
    for (const perfil of PERFILES) {
      const publicacionesNuevas = todasLasPublicaciones[perfil.nombre] || [];
      const publicacionesExistentes = todasLasPublicacionesExistentes[perfil.nombre] || [];
      
      // Filtrar publicaciones nuevas
      const textosExistentes = new Set(publicacionesExistentes.map(p => p.texto));
      const publicacionesNuevasFiltradas = publicacionesNuevas.filter(p => !textosExistentes.has(p.texto));
      
      // Combinar
      todasLasPublicacionesCombinadas[perfil.nombre] = [
        ...publicacionesExistentes,
        ...publicacionesNuevasFiltradas
      ];
    }
    
    // Guardar archivo combinado
    fs.writeFileSync(
      path.join(process.cwd(), nombreArchivoCompleto),
      JSON.stringify(todasLasPublicacionesCombinadas, null, 2),
      'utf-8'
    );
    
    console.log(`\nTodas las publicaciones guardadas en: ${nombreArchivoCompleto}`);
    
    // Finalizar metadatos y guardar
    metadatosEjecucion.fin_ejecucion = new Date();
    metadatosEjecucion.duracion_ms = metadatosEjecucion.fin_ejecucion - metadatosEjecucion.inicio_ejecucion;
    await guardarMetadatosEjecucion(db, metadatosEjecucion);
    
    // Guardar metadatos en archivo local también
    fs.writeFileSync(
      path.join(process.cwd(), 'ultima_ejecucion_metadatos.json'),
      JSON.stringify(metadatosEjecucion, null, 2),
      'utf-8'
    );
    
    console.log('\nResumen de la ejecución:');
    console.log(`- Perfiles procesados: ${metadatosEjecucion.perfiles_procesados.length}`);
    console.log(`- Total de publicaciones: ${metadatosEjecucion.total_publicaciones}`);
    console.log(`- Nuevas publicaciones: ${metadatosEjecucion.nuevas_publicaciones}`);
    console.log(`- Duración: ${metadatosEjecucion.duracion_ms / 1000} segundos`);
    
    return todasLasPublicacionesCombinadas;
  } catch (error) {
    console.error('Error durante la extracción:', error);
    return null;
  } finally {
    // Cerrar conexiones
    if (mongoClient) {
      await mongoClient.close();
      console.log('Conexión a MongoDB cerrada');
    }
    
    // Preguntar si desea cerrar el navegador
    console.log('\nPresiona Ctrl+C para terminar el script y cerrar el navegador.');
    // Si prefieres cerrar automáticamente, descomenta:
    // if (browser) await browser.close();
  }
}

// Ejecutar el script
scrapeLinkedIn().catch(console.error);