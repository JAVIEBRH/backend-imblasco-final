-- ============================================
-- MIGRACIÓN 001: EXTENSIÓN DE FACTURACIÓN
-- Agrega campos para soporte de facturación
-- NO DESTRUCTIVA - Solo agrega campos nuevos
-- ============================================

-- 1. Modificar ENUM de status para incluir nuevos estados
-- Primero eliminamos la constraint existente
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_order_status;

-- Agregamos nuevos valores al ENUM (PostgreSQL no permite modificar ENUM directamente)
-- Usamos CHECK constraint en su lugar
ALTER TABLE orders 
  ADD CONSTRAINT chk_order_status 
  CHECK (status IN ('draft', 'confirmed', 'rejected', 'cancelled', 'sent_to_erp', 'invoiced', 'error'));

-- 2. Agregar campos nuevos (todos opcionales/nullable para no romper datos existentes)
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS net_amount DECIMAL(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS iva_amount DECIMAL(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_snapshot JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS items_snapshot JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS erp_reference VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 3. Comentarios para documentación
COMMENT ON COLUMN orders.net_amount IS 'Monto neto calculado al confirmar el pedido';
COMMENT ON COLUMN orders.iva_amount IS 'IVA (19%) calculado al confirmar el pedido';
COMMENT ON COLUMN orders.total_amount IS 'Monto total (neto + IVA) calculado al confirmar el pedido';
COMMENT ON COLUMN orders.client_snapshot IS 'Snapshot de datos tributarios del cliente al momento de confirmar';
COMMENT ON COLUMN orders.items_snapshot IS 'Snapshot de items del pedido al momento de confirmar';
COMMENT ON COLUMN orders.erp_reference IS 'Referencia del pedido en el ERP externo';
COMMENT ON COLUMN orders.invoiced_at IS 'Fecha y hora en que se facturó el pedido';

-- 4. Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_orders_erp_reference ON orders(erp_reference) WHERE erp_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_invoiced_at ON orders(invoiced_at) WHERE invoiced_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status_invoicing ON orders(status) WHERE status IN ('sent_to_erp', 'invoiced', 'error');

-- 5. Migrar datos existentes (si hay orders con total, copiar a total_amount)
UPDATE orders 
SET total_amount = total 
WHERE total_amount IS NULL AND total IS NOT NULL;

-- Nota: Esta migración es segura y no afecta datos existentes
-- Todos los campos nuevos son opcionales y se llenarán progresivamente


