/**
 * Script para probar el cuestionario "Revisión chat" contra el backend.
 * Envía UNA pregunta a la vez, espera respuesta, espera una pausa larga, luego la siguiente.
 *
 * IMPORTANTE: Aunque el backend esté en local, usa la WooCommerce REAL (WC_URL en .env).
 * Cada pregunta genera varias llamadas a la API de WC; si se envían muchas seguidas,
 * se puede saturar WC y afectar la página del cliente. Por eso la pausa es de 30 s
 * y se recomienda probar primero con pocas preguntas (LIMIT=5).
 *
 * Uso:
 *   1. Backend en marcha: npm run dev
 *   2. En otra terminal:
 *      npm run revision-chat
 *   Prueba suave (solo 5 preguntas): LIMIT=5 npm run revision-chat
 *
 * Opcional: BASE_URL=... LIMIT=10 (solo primeras 10) DELAY_MS=30000 (pausa en ms)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001/api'
const DELAY_MS = Number(process.env.DELAY_MS) || 30000 // 30 s entre preguntas para no colapsar WC
const RECOVERY_DELAY_MS = 90000 // 90 s de pausa extra si hubo error (dar tiempo a WC/API a recuperarse)
const MAX_CONSECUTIVE_ERRORS = 1 // con 1 fallo (timeout/error) se detiene para no seguir golpeando el sistema
const LIMIT = process.env.LIMIT ? Math.max(1, parseInt(process.env.LIMIT, 10)) : null // null = todas
const SKIP = Math.max(0, parseInt(process.env.SKIP, 10) || 0) // saltar primeras N preguntas (ej. SKIP=27 para empezar en la 28)
const USER_ID = 'revision-cuestionario-' + Date.now()

const PREGUNTAS = [
  // Parte 1 (1-40)
  { id: 1, categoria: 'Medidas', pregunta: 'tienen estuche con medidas 17 cms. X 7 cms. X 2,8 cms. ?' },
  { id: 2, categoria: 'Existencia con proxima llegada', pregunta: 'tienen disponible este producto M34?' },
  { id: 3, categoria: 'Horario', pregunta: 'a que hora salen a colación?' },
  { id: 4, categoria: 'Existencia', pregunta: 'tienen el producto XL602 ?, en que colores?' },
  { id: 5, categoria: 'Medidas', pregunta: 'cual es el tamaño de este producto?' },
  { id: 6, categoria: 'Existencia', pregunta: 'que colores tienen de este producto?' },
  { id: 7, categoria: 'Personalizacion', pregunta: 'el producto XL602 se puede personalizar?' },
  { id: 8, categoria: 'Medidas', pregunta: 'Cual es el tmaño de la placa de este producto?' },
  { id: 9, categoria: 'Horario', pregunta: 'Abrena a la hora de colación?' },
  { id: 10, categoria: 'Color', pregunta: 'de que color es el sku 701020065?' },
  { id: 11, categoria: 'Ajena', pregunta: 'cuando es mi cumpleaños?' },
  { id: 12, categoria: 'Ajena', pregunta: 'Quien es el dueño de imblasco?' },
  { id: 13, categoria: 'General empresa', pregunta: 'Tienen precios para mayoristas?' },
  { id: 14, categoria: 'Disponibilidad', pregunta: 'tienen disponble la ficha técnica de este producto?' },
  { id: 15, categoria: 'General empresa', pregunta: 'como puedo saber los precios de los productos?' },
  { id: 16, categoria: 'General empresa', pregunta: 'Comopuedo comprar? TIenen estacionamiento? dan factura?' },
  { id: 17, categoria: 'General empresa', pregunta: 'hacen envíos fuera de santiago?' },
  { id: 18, categoria: 'General empresa', pregunta: 'con que transportes trabajan?' },
  { id: 19, categoria: 'General Empresa', pregunta: 'En que comuna quedan?' },
  { id: 20, categoria: 'Medidas', pregunta: 'Me puede informar el tamaño del producto XL 602?' },
  { id: 21, categoria: 'Medidas', pregunta: 'Me pueden informar Tamaño Producto, Tamaño Placa, Embalaje, Embalaje Master, Tamaño Caja Master, Peso Caja Master?' },
  { id: 22, categoria: 'Colores', pregunta: 'Que colores tienen disponibles para este producto?' },
  { id: 23, categoria: 'Precios', pregunta: 'que puedo hacer para ver los precios?' },
  { id: 24, categoria: 'Existencia', pregunta: 'que ariculos publicitarios tienen?' },
  { id: 25, categoria: 'General empresa', pregunta: 'donde queda la casa matriz?' },
  { id: 26, categoria: 'General empresa', pregunta: 'a que cuenta les puedo depositar? que formas de pago manejan?' },
  { id: 27, categoria: 'Ajena', pregunta: 'cuando es año biciesto?' },
  { id: 28, categoria: 'General empresa', pregunta: 'Qué telefonos tienen?' },
  { id: 29, categoria: 'General empresa', pregunta: 'cuales son las categorías de productos que venden?' },
  { id: 30, categoria: 'Existencia', pregunta: 'tienen trofeo por el bicentenario de colo colo' },
  { id: 31, categoria: 'General empresa', pregunta: 'como puedo pedir una copia del catálogo?' },
  { id: 32, categoria: 'Caracteristicas', pregunta: 'Tienes especificaciones de la Calculadora Fashion Rojo T74 ?' },
  { id: 33, categoria: 'Personalizacion', pregunta: 'Que opciones personalización tienes para el producto T74?' },
  { id: 34, categoria: 'Caracteristicas', pregunta: 'tienes foto de este producto?' },
  { id: 35, categoria: 'Características', pregunta: 'cuantas piezas trae el producto SU01?' },
  { id: 36, categoria: 'Productos', pregunta: 'que productos relacionados al producto SU01 tienen ?' },
  { id: 37, categoria: 'Existencia', pregunta: 'Cuando llega el producto T14?' },
  { id: 38, categoria: 'Personalización', pregunta: 'Que opciones de personalizacion tiene el producto GR30' },
  { id: 39, categoria: 'General empresa', pregunta: 'Como comprar?' },
  { id: 40, categoria: 'General empresa', pregunta: 'Que datos debo enviar para registrarme coo cliente?' },
  // Parte 2
  { id: '2.1', categoria: 'Informacion Básica', pregunta: 'Cual es su Direccion' },
  { id: '2.2', categoria: 'Informacion Básica', pregunta: 'Qué Horario tienen' },
  { id: '2.3', categoria: 'Informacion Básica', pregunta: 'Cual es el Horario sábado' },
  { id: '2.4', categoria: 'Informacion Básica', pregunta: 'Cual es la hora de colacion' },
  { id: '2.5', categoria: 'Informacion Básica', pregunta: 'Ubicación taller de grabado' },
  { id: '2.6', categoria: 'Solicitudes de cotización', pregunta: 'Necesito una cotización' },
  { id: '2.7', categoria: 'Solicitudes de cotización', pregunta: 'Quiero cotizar' },
  { id: '2.8', categoria: 'Solicitudes de cotización', pregunta: 'Me puedes cotizar' },
  { id: '2.9', categoria: 'Solicitudes incompletas', pregunta: 'Necesito precio' },
  { id: '2.10', categoria: 'Solicitudes incompletas', pregunta: 'Quiero comprar' },
  { id: '2.11', categoria: 'Solicitudes incompletas', pregunta: 'Cuánto cuesta' },
  { id: '2.12', categoria: 'Solicitudes incompletas', pregunta: 'Necesito presupuesto' },
  { id: '2.13', categoria: 'Productos y servicios', pregunta: '¿Qué venden?' },
  { id: '2.14', categoria: 'Productos y servicios', pregunta: '¿Hacen grabado?' },
  { id: '2.15', categoria: 'Productos y servicios', pregunta: '¿Trabajan acero inoxidable?' },
  { id: '2.16', categoria: 'Taller de grabado', pregunta: 'Necesito hablar con grabado' },
  { id: '2.17', categoria: 'Taller de grabado', pregunta: 'Contacto del taller de grabado' },
  { id: '2.18', categoria: 'Información bancaria', pregunta: 'Cuales son los Datos de transferencia?' },
  { id: '2.19', categoria: 'Información bancaria', pregunta: 'Cual es la cuenta bancaria?' },
  { id: '2.20', categoria: 'Preguntas fuera de alcance', pregunta: '¿Cuánto stock tienen?' },
  { id: '2.21', categoria: 'Preguntas fuera de alcance', pregunta: '¿Puedes generar la cotización?' },
  { id: '2.22', categoria: 'Preguntas fuera de alcance', pregunta: '¿Cuál es el precio del SKU XL60?' },
  { id: '2.23', categoria: 'Preguntas fuera de alcance', pregunta: '¿Cuándo llega mi pedido?' },
  { id: '2.24', categoria: 'Conversación básica', pregunta: 'Hola' },
  { id: '2.25', categoria: 'Conversación básica', pregunta: 'Gracias' },
  { id: '2.26', categoria: 'Conversación básica', pregunta: 'ok' },
  { id: '2.27', categoria: 'Conversación básica', pregunta: 'No entendí (inmediatamente despues de la pregunta anterior)' },
  { id: '2.28', categoria: 'Varias', pregunta: 'Que regalo me recomiendan para una mujer' },
  { id: '2.29', categoria: 'Varias', pregunta: 'Tienen mochilas?' }
]

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function enviarPregunta (p) {
  const url = `${BASE_URL}/chat/message`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: USER_ID,
      message: p.pregunta
    })
  })
  const data = await res.json().catch(() => ({}))
  return {
    ok: res.ok,
    status: res.status,
    botMessage: data.botMessage ?? (data.message || ''),
    error: data.error,
    hasProduct: !!data.product,
    hasProductList: Array.isArray(data.productSearchResults) && data.productSearchResults.length > 0
  }
}

async function main () {
  let lista = PREGUNTAS.slice(SKIP)
  if (LIMIT) lista = lista.slice(0, LIMIT)
  const results = []
  const total = lista.length

  console.log(`\n=== Revisión chat – cuestionario ===`)
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Pausa entre preguntas: ${DELAY_MS / 1000} s (para no colapsar WooCommerce)`)
  console.log(`Preguntas a enviar: ${total}${SKIP ? ` (desde la ${SKIP + 1}, SKIP=${SKIP})` : ''}${LIMIT ? ` | límite LIMIT=${LIMIT}` : ''}`)
  console.log(`(Tiempo estimado: ~${Math.ceil((total * (DELAY_MS / 1000 + 15)) / 60)} min)`)
  console.log(`\n⚠️  Aunque el backend sea local, usa la WooCommerce REAL. Si WC se satura, la página del cliente puede caerse.`)
  console.log(`🛡️  Seguro: tras un error se esperan ${RECOVERY_DELAY_MS / 1000} s. Con 1 fallo (timeout/error) se detiene.\n`)

  let consecutiveErrors = 0

  // Secuencial: la siguiente pregunta solo se envía cuando la anterior terminó (respuesta recibida).
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i]
    const n = SKIP + i + 1 // número de pregunta (1-69) para que se vea "desde la 28"
    process.stdout.write(`[${n}/69] ${p.id} ${p.categoria}: "${p.pregunta.slice(0, 45)}..." `)
    try {
      const out = await enviarPregunta(p) // espera respuesta completa antes de seguir
      const isError = !out.ok || out.status >= 500 || out.status === 429
      if (isError) consecutiveErrors++
      else consecutiveErrors = 0

      results.push({
        id: p.id,
        categoria: p.categoria,
        pregunta: p.pregunta,
        ok: out.ok,
        status: out.status,
        botMessage: out.botMessage,
        hasProduct: out.hasProduct,
        hasProductList: out.hasProductList,
        error: out.error
      })
      if (out.ok) {
        console.log(`OK (${(out.botMessage || '').length} chars)`)
      } else {
        console.log(`HTTP ${out.status}`)
        console.error(`   [LOG FALLO] URL: ${BASE_URL}/chat/message | status: ${out.status} | respuesta: ${(out.botMessage || out.error || 'sin mensaje').toString().slice(0, 200)}`)
      }

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`\n🛑 Fallo detectado. Deteniendo para no sobrecargar el sistema. Revisa backend/WC y vuelve a ejecutar.`)
        break
      }

      if (i < lista.length - 1) {
        const pause = isError ? RECOVERY_DELAY_MS : DELAY_MS
        if (isError) console.log(`   ⏳ Pausa de recuperación: ${pause / 1000} s...`)
        await sleep(pause)
      }
    } catch (err) {
      consecutiveErrors++
      console.log(`Error: ${err.message}`)
      console.error(`   [LOG FALLO] URL: ${BASE_URL}/chat/message | mensaje: ${err.message}${err.cause ? ` | cause: ${err.cause}` : ''}`)
      if (err.code) console.error(`   [LOG FALLO] code: ${err.code} (ECONNREFUSED = backend no está corriendo o puerto distinto)`)
      results.push({
        id: p.id,
        categoria: p.categoria,
        pregunta: p.pregunta,
        ok: false,
        error: err.message
      })
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`\n🛑 Fallo detectado. Deteniendo para no sobrecargar el sistema.`)
        break
      }
      if (i < lista.length - 1) {
        console.log(`   ⏳ Pausa de recuperación: ${RECOVERY_DELAY_MS / 1000} s...`)
        await sleep(RECOVERY_DELAY_MS)
      }
    }
  }

  const outPath = 'revision-chat-results.json'
  const fs = await import('fs')
  fs.writeFileSync(outPath, JSON.stringify({ userId: USER_ID, results }, null, 2), 'utf8')
  console.log(`\nResultados guardados en: ${outPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
