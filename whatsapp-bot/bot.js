// ============================================================
// BADUY ACADEMY — WhatsApp Bot (Node.js + Meta Cloud API)
// ============================================================
// Este bot:
//  1. Recibe mensajes de WhatsApp vía webhook de Meta
//  2. Responde según el guion de diálogo (amable + CTA)
//  3. Guarda los leads en Google Sheets
//
// REQUISITOS:
//  - Node.js instalado
//  - Token de acceso de Meta (el que ya tienes)
//  - Phone Number ID (el que ya tienes: 1275269752334891)
//  - URL de Google Sheets (la que ya tienes)
// ============================================================

const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIGURACIÓN (EDITA ESTOS VALORES)
// ============================================================
const CONFIG = {
  // Token de acceso de Meta (sustituir por el actual)
  metaToken: process.env.META_TOKEN || 'PON_AQUI_TU_TOKEN',
  // ID del número de teléfono de WhatsApp
  phoneNumberId: process.env.PHONE_ID || '1275269752334891',
  // Verificación del webhook (cualquier texto que elijas)
  webhookVerify: process.env.WEBHOOK_VERIFY || 'baduyacademy_secreto',
  // URL de tu Google Sheets (receptor de leads)
  sheetsUrl: process.env.SHEETS_URL || 'https://script.google.com/macros/s/AKfycbxuWZ3DP2K6fExOS27ztq4XC9B727a13b_3XseHXM_12rrTwmysrt_BE2a3gO5cIi-w/exec',
  // Tu número real de WhatsApp (para avisos)
  ownerWhatsApp: '17868307580',
};

// ============================================================
// SISTEMA DE DIÁLOGO — GUION DE BADUY ACADEMY
// ============================================================
const BIENVENIDA = `🕊️ Bienvenido a Baduy Academy.

Gracias por escribirnos. Es un placer recibirte en nuestra comunidad, donde entrenamos mentes para la paz a través del juego.

¿En qué podemos ayudarte el día de hoy? Responde con el número:

1️⃣ Cursos de dominó
2️⃣ Coach GTO (app de estudio)
3️⃣ Programa para escuelas
4️⃣ Torneos y Federación
5️⃣ Hablar con un asesor

Estamos aquí para ti. 😊`;

const RESPUESTAS = {
  cursos: {
    match: /(1|cursos|curso|clases|clase|aprender|estudiar)/i,
    reply: `🎓 ¡Excelente elección!

Tenemos dos rutas de aprendizaje:

• Dominó para Campeones — de cero a nivel competitivo
• Matemáticas del Dominó — EV, probabilidad y estrategia

🚀 PRÓXIMAMENTE con descuento de lanzamiento.

💬 Para enterarte primero, déjame tu nombre y tu correo y te avisamos apenas abran las inscripciones.`,
  },
  gto: {
    match: /(2|coach|gto|app|ev|analisis|análisis|estudio|analizar)/i,
    reply: `🎯 ¡El Coach GTO es nuestra joya!

Es una app que calcula el VALOR ESPERADO (EV) de cada jugada con precisión profesional. Estudia manos, analiza jugadas y descubre la jugada óptima.

✅ GRATIS para probar:
👉 https://baduyacademy.com/app/

💬 ¿Quieres tips de estrategia en tu WhatsApp? Déjame tu nombre y te agrego a la lista VIP.`,
  },
  escuelas: {
    match: /(3|escuela|colegio|niños|kids|school|programa|educativo)/i,
    reply: `🏫 ¡Eso nos llena de orgullo!

Llevamos el dominó a las escuelas como herramienta educativa:
• Pensamiento crítico
• Matemáticas vivas
• Memoria y patrones
• Trabajo en equipo
• Regulación emocional

💬 Para coordinar el programa piloto, necesito:
• Tu nombre
• Nombre de la escuela
• Ciudad
• Tu correo

Envíalos aquí y te contactamos con el kit gratuito para maestros.`,
  },
  torneos: {
    match: /(4|torneo|competir|competencia|federacion|federación)/i,
    reply: `🏆 ¡Nos encanta que quieras competir!

Estamos lanzando la Federación Mundial Paralela (FMP):
• Torneos oficiales
• Sistema anti-trampas innovador
• Categorías por nivel

🚀 El torneo inaugural está en camino.

💬 Déjame tu nombre y correo para avisarte PRIMERO y con inscripción preferencial.`,
  },
  asesor: {
    match: /(5|asesor|humano|persona|fabio|ayuda)/i,
    reply: `👋 ¡Claro! Un asesor de Baduy Academy te atenderá pronto.

Escríbenos a: contact@baduyacademy.com

O déjame tu nombre y tu pregunta aquí mismo y se la haremos llegar. 💬
¿Qué te gustaría saber de la academia?`,
  },
  precio: {
    match: /(precio|cuanto|costo|costar|valor|pago|pagar)/i,
    reply: `💰 Nuestra app Coach GTO es GRATIS y el sitio también.

Para los cursos premium y el merch, tendremos precios de lanzamiento muy accesibles.

💬 ¿Quieres que te avise cuando abran? Déjame tu correo y te mandamos el descuento de lanzamiento.`,
  },
  reglas: {
    match: /(reglas|como se juega|cómo se juega|basico|básico|principiante)/i,
    reply: `🁢 ¡Claro! El dominó es un juego de lógica y estrategia.

Te recomiendo empezar con nuestra Guía del Principiante (gratis):
👉 https://baduyacademy.com/

Y para análisis profundos, el Coach GTO:
👉 https://baduyacademy.com/app/

💬 ¿Te gustaría recibir un tip cada semana?`,
  },
  merch: {
    match: /(merch|camiseta|tienda|comprar|producto|ropa|domino personalizado)/i,
    reply: `🛍️ ¡Pronto tendremos nuestra tienda con merch exclusiva!
• Dominós personalizados
• Ropa de la marca
• Pósters y arte

🚀 Todo está por lanzarse.

💬 ¿Quieres que te avise cuando abra la tienda? Déjame tu correo.`,
  },
  contacto: {
    match: /(contacto|email|correo|telefono|teléfono|escribir)/i,
    reply: `📧 Escríbenos a: contact@baduyacademy.com
📱 Estás hablando con nosotros AHORA mismo 😄

💬 Cuéntanos en qué podemos ayudarte y te respondemos lo más pronto posible.`,
  },
  gracias: {
    match: /(gracias|thanks|ok|perfecto|genial|excelente)/i,
    reply: `🙌 ¡Un placer! Sigue entrenando mentes para la paz.

¿Hay algo más en lo que pueda ayudarte?
💬 No olvides probar el Coach GTO: https://baduyacademy.com/app/`,
  },
};

const FALLBACK = `🤔 Perdón, no estoy seguro de haber entendido.

¿Puedes elegir una opción?
1️⃣ Cursos     2️⃣ Coach GTO
3️⃣ Escuelas   4️⃣ Torneos
5️⃣ Hablar con un asesor

O escríbenos a: contact@baduyacademy.com`;

// ============================================================
// CAPTURA DE LEADS (guardar en Google Sheets)
// ============================================================
async function saveLead(data) {
  try {
    await fetch(CONFIG.sheetsUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(data),
    });
    return true;
  } catch (e) {
    console.error('Error guardando lead:', e.message);
    return false;
  }
}

// ============================================================
// ENVIAR MENSAJE POR LA API DE META
// ============================================================
async function sendWhatsApp(to, text) {
  const url = `https://graph.facebook.com/v21.0/${CONFIG.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'text',
    text: { body: text },
  };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.metaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) {
      console.error('Error API Meta:', data.error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Error enviando mensaje:', e.message);
    return false;
  }
}

// ============================================================
// SESIONES (para enviar bienvenida solo la primera vez)
// ============================================================
// En producción esto sería una base de datos. Para el MVP usamos
// un objeto en memoria (se resetea al reiniciar — aceptable al inicio).
const sesiones = new Map(); // whatsapp -> { primerContacto: bool }

// ============================================================
// PROCESAR MENSAJE RECIBIDO
// ============================================================
async function processMessage(from, text) {
  // 1. ¿Primera vez que contacta? Enviar bienvenida elegante
  const sesion = sesiones.get(from);
  if (!sesion || !sesion.bienvenidaEnviada) {
    await sendWhatsApp(from, BIENVENIDA);
    sesiones.set(from, { bienvenidaEnviada: true });
    return; // esperamos su elección
  }

  // 2. Encontrar la respuesta según el guion
  let respuesta = null;
  for (const key of Object.keys(RESPUESTAS)) {
    if (RESPUESTAS[key].match.test(text)) {
      respuesta = RESPUESTAS[key].reply;
      break;
    }
  }
  if (!respuesta) respuesta = FALLBACK;

  // 3. Guardar el lead en Google Sheets (información básica)
  await saveLead({
    nombre: '',
    whatsapp: from,
    email: '',
    interes: 'whatsapp-bot',
    mensaje: text.slice(0, 200),
    fuente: 'whatsapp',
  });

  // 4. Enviar la respuesta
  await sendWhatsApp(from, respuesta);
}

// ============================================================
// WEBHOOK (Meta envía aquí los mensajes)
// ============================================================

// GET: verificación inicial del webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === CONFIG.webhookVerify) {
    console.log('✅ Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// POST: recibir mensajes
app.post('/webhook', express.json(), async (req, res) => {
  const body = req.body;
  // Responder rápido para evitar timeout de Meta
  res.sendStatus(200);

  // Procesar el mensaje (si es entrante de WhatsApp)
  if (body.object && body.entry) {
    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        if (change.field === 'messages') {
          for (const msg of change.value.messages || []) {
            if (msg.type === 'text' && msg.text && msg.text.body) {
              const from = msg.from;
              const text = msg.text.body;
              console.log(`📩 Mensaje de ${from}: ${text}`);
              // Procesar en background
              processMessage(from, text).catch(e => console.error(e));
            }
          }
        }
      }
    }
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('🤖 Baduy Academy WhatsApp Bot funcionando');
});

// ============================================================
// INICIO
// ============================================================
app.listen(PORT, () => {
  console.log(`🤖 Bot de Baduy Academy escuchando en puerto ${PORT}`);
  console.log(`📱 Phone ID: ${CONFIG.phoneNumberId}`);
  console.log(`📊 Guardando leads en Google Sheets`);
});
