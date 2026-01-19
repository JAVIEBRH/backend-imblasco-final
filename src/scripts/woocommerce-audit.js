/**
 * Auditoría de WooCommerce
 * Revisa productos, tipos, categorías, descripciones y variaciones.
 *
 * Uso:
 *   node src/scripts/woocommerce-audit.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: false
});

const WC_URL = process.env.WC_URL || 'https://imblasco.cl';
const WC_KEY = process.env.WC_KEY;
const WC_SECRET = process.env.WC_SECRET;

if (!WC_KEY || !WC_SECRET) {
  console.error('❌ WC_KEY o WC_SECRET no configuradas en .env');
  process.exit(1);
}

function getAuthHeader() {
  const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');
  return `Basic ${auth}`;
}

async function wcRequest(endpoint, returnHeaders = false) {
  const url = `${WC_URL}/wp-json/wc/v3/${endpoint}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WooCommerce API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  if (!returnHeaders) return data;

  return {
    data,
    headers: {
      total: response.headers.get('X-WP-Total'),
      totalPages: response.headers.get('X-WP-TotalPages')
    }
  };
}

async function getAllProducts() {
  const firstPage = await wcRequest('products?per_page=100&page=1&status=publish', true);
  const totalPages = firstPage.headers.totalPages ? parseInt(firstPage.headers.totalPages, 10) : 1;
  let allProducts = Array.isArray(firstPage.data) ? firstPage.data : [];

  for (let page = 2; page <= totalPages; page += 1) {
    const pageData = await wcRequest(`products?per_page=100&page=${page}&status=publish`);
    if (Array.isArray(pageData)) {
      allProducts = allProducts.concat(pageData);
    }
  }

  return allProducts;
}

async function getVariationCount(productId) {
  const resp = await wcRequest(`products/${productId}/variations?per_page=1&page=1`, true);
  const total = resp.headers.total ? parseInt(resp.headers.total, 10) : (Array.isArray(resp.data) ? resp.data.length : 0);
  return total;
}

async function withConcurrency(items, limit, handler) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      try {
        results[currentIndex] = await handler(items[currentIndex], currentIndex);
      } catch (error) {
        results[currentIndex] = { error: error.message };
      }
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}

async function runAudit() {
  console.log('\n=== AUDITORÍA WOOCOMMERCE ===\n');
  console.log(`WC_URL: ${WC_URL}`);

  const products = await getAllProducts();
  const totalProducts = products.length;
  console.log(`✅ Productos publicados: ${totalProducts}`);

  const typeCounts = { simple: 0, variable: 0, other: 0 };
  const noSku = [];
  const noDescription = [];
  const categoryCounts = {};

  products.forEach((p) => {
    if (p.type === 'simple') typeCounts.simple += 1;
    else if (p.type === 'variable') typeCounts.variable += 1;
    else typeCounts.other += 1;

    if (!p.sku || String(p.sku).trim().length === 0) {
      noSku.push({ id: p.id, name: p.name });
    }

    const desc = (p.description || '').trim();
    if (!desc) {
      noDescription.push({ id: p.id, name: p.name });
    }

    if (Array.isArray(p.categories)) {
      p.categories.forEach((c) => {
        const key = c.name || 'Sin categoría';
        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
      });
    }
  });

  console.log('\n--- Tipos de producto ---');
  console.log(`Simple:   ${typeCounts.simple}`);
  console.log(`Variable: ${typeCounts.variable}`);
  console.log(`Otros:    ${typeCounts.other}`);

  console.log('\n--- Productos sin SKU ---');
  console.log(`Total sin SKU: ${noSku.length}`);

  console.log('\n--- Productos sin descripción ---');
  console.log(`Total sin descripción: ${noDescription.length}`);

  console.log('\n--- Categorías (top 15) ---');
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  topCategories.forEach(([name, count]) => {
    console.log(`${name}: ${count}`);
  });

  console.log('\n--- Variaciones (conteo por producto variable) ---');
  const variableProducts = products.filter(p => p.type === 'variable');
  const variationCounts = await withConcurrency(variableProducts, 5, async (p) => {
    const count = await getVariationCount(p.id);
    return { id: p.id, name: p.name, count };
  });

  const totalVariations = variationCounts.reduce((sum, v) => sum + (v?.count || 0), 0);
  console.log(`Productos variables: ${variableProducts.length}`);
  console.log(`Variaciones totales (según headers): ${totalVariations}`);

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      products: totalProducts,
      simple: typeCounts.simple,
      variable: typeCounts.variable,
      other: typeCounts.other,
      variations: totalVariations
    },
    missing: {
      noSkuCount: noSku.length,
      noDescriptionCount: noDescription.length
    },
    topCategories,
    sampleMissingSku: noSku.slice(0, 20),
    sampleMissingDescription: noDescription.slice(0, 20)
  };

  const outputPath = path.resolve(__dirname, '../../reports/woocommerce-audit.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\n✅ Reporte guardado en: ${outputPath}\n`);
}

runAudit().catch((error) => {
  console.error('❌ Error en auditoría:', error.message);
  process.exit(1);
});
