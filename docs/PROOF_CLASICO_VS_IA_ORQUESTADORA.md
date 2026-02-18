# PROOF: sistema clásico vs IA orquestadora

Este documento compara el **asistente clásico** (backend orquesta todo) con el **asistente PROOF** (la IA orquesta usando tools) y aclara qué contenido está en el Vector Store.

---

## Criterio PROOF: backend tonto, IA + vectores al frente

En PROOF **no** se replica la lógica de main/develop:

- **Backend:** Solo expone las tools (consultar_productos, obtener_detalle_producto, file_search, contar_productos) y devuelve lo que devuelven las fuentes. No normaliza queries, no decide “si vacío entonces…”, no implementa reglas de negocio en el flujo del chat. Las conexiones (Vector Store, WooCommerce API, MongoDB) están hechas; el backend solo las invoca cuando la IA pide.
- **Instrucciones (system prompt):** Mínimas: rol, que tiene esas herramientas y que las use según la pregunta, no inventar, tono, mayorista. **No** se usan system prompts largos ni pasos obligatorios tipo “primero llama X, luego Y” (eso es arquitectura dominada por el backend).
- **Comportamiento:** Lo define la IA con lo que obtiene de las tools y del file_search (vectores). Si el catálogo o WooCommerce devuelven vacío, la IA puede probar otra tool o decir que no hay datos; no hace falta que el backend “ayude” con lógica extra.

---

## Quién orquesta

| Aspecto | Sistema clásico (develop/main) | Sistema PROOF (rama PROOF) |
|--------|--------------------------------|-----------------------------|
| **Orquestación** | El **backend** analiza intención, consulta WooCommerce/stockf, arma el texto para la IA. | La **IA** decide qué hacer: llama a **file_search**, **consultar_productos**, **contar_productos**. |
| **Rol de la IA** | Solo **redacta** la respuesta final a partir del bloque de texto que le envía el backend. | **Decide** cuándo buscar productos, cuándo buscar en la base de conocimiento, y **redacta** la respuesta. |
| **Intención** | Clasificador en backend (`analizarIntencionConsulta`) → PRODUCTO, INFORMACION_GENERAL, RECLAMO, etc. | La IA interpreta el mensaje y elige la tool (consultar_productos vs file_search). |
| **Datos de empresa** | Backend inyecta texto (p. ej. `formatCompanyInfoForAgent()`, bloques en `conversation.service.js`). | La IA obtiene información de empresa con **file_search** sobre los MDs subidos al Vector Store. |
| **Productos** | Backend consulta WooCommerce (y opcionalmente stockf) y mete resultados en el prompt. | La IA llama a la tool **consultar_productos** (ProductIndex en dataimblasco); no hay stock/precio en vivo en PROOF salvo que se añada después. |

Referencia del sistema clásico: ver **REGLAS DEL ASISTENTE CLASICO.md** (en tus MDS), que documenta `SYSTEM_INSTRUCTIONS_CONKAVO`, análisis de intención, `company-info.service.js` y `conversation.service.js`.

---

## Contenido en el Vector Store (file_search)

Los siguientes MDs son **información de empresa** que tienes cargada en el Vector Store. La IA los usa cuando hace **file_search** para preguntas sobre horarios, contacto, despachos, políticas, etc.:

- **01_info-general.md** – Información general, especialización, enfoque, ubicación  
- **02_horarios-atencion.md** – Horarios, hora de almuerzo  
- **03_ubicacion-acceso.md** – Dirección, acceso  
- **04_contacto.md** – Correos, teléfonos, formulario, redes  
- **05_historia.md** – Historia de la empresa  
- **06_como-comprar.md** – Cómo comprar  
- **07_registro-clientes.md** – Registro de clientes  
- **08_pagos-transferencias.md** – Pagos y transferencias  
- **09_despachos.md** – Despachos  
- **10_cambios-devoluciones.md** – Cambios y devoluciones  
- **11_productos-general.md** – Productos en general  
- **12_servicios-personalizacion.md** – Servicios y personalización  
- **13_faq.md** – Preguntas frecuentes  
- **14_limites-atencion.md** – Límites de atención  
- **15_politica-comercial.md** – Política comercial  
- **16_talleres-recomendados.md** – Talleres recomendados  
- **17_transportes-recomendados.md** – Transportes recomendados  
- **18_descuentos.md** – Descuentos  

El archivo **REGLAS DEL ASISTENTE CLASICO.md** describe la **lógica y reglas del sistema anterior** (backend orquestador); no es necesario subirlo al Vector Store como contenido para el usuario. Las reglas que sigan aplicando en PROOF (tono, no inventar, no reservar, derivación, etc.) se reflejan en el **system prompt** de PROOF (`config/system_prompt.txt`).

---

## Resumen

- **Antes:** el backend orquestaba todo; la IA solo redactaba con el texto que recibía.  
- **Ahora (PROOF):** la IA orquesta usando **file_search** (MDs de empresa en vectors), **consultar_productos** (catálogo en ProductIndex) y **contar_productos**.  
- Los MDs que listaste son la **fuente de verdad** de información de empresa en PROOF; la IA la recupera vía **file_search**, no por inyección del backend.
