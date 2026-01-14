-- ============================================
-- MIGRACIÓN 003: ESQUEMA COMPLETO DE ERP
-- Agrega todas las tablas necesarias para un ERP completo
-- ============================================

-- ============================================
-- TABLA: invoices (Facturas)
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    client_id VARCHAR(255) NOT NULL,
    invoice_type VARCHAR(20) NOT NULL DEFAULT 'factura', -- factura, boleta, nota_credito, nota_debito
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, issued, cancelled, void
    
    -- Montos
    net_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    iva_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    
    -- Datos del cliente (snapshot)
    client_rut VARCHAR(20),
    client_name VARCHAR(255),
    client_address TEXT,
    client_commune VARCHAR(100),
    
    -- Fechas
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    paid_date DATE,
    
    -- Referencias
    erp_reference VARCHAR(255),
    sii_folio VARCHAR(50), -- Folio del SII si aplica
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);

-- ============================================
-- TABLA: invoice_items (Items de Factura)
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    sku VARCHAR(100),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0.00,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);

-- ============================================
-- TABLA: payments (Pagos)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER REFERENCES invoices(id),
    order_id INTEGER REFERENCES orders(id),
    client_id VARCHAR(255) NOT NULL,
    
    payment_type VARCHAR(50) NOT NULL, -- transferencia, efectivo, cheque, tarjeta
    payment_method VARCHAR(50), -- banco, cuenta, etc.
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    reference_number VARCHAR(255), -- Número de transferencia, cheque, etc.
    notes TEXT,
    
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, confirmed, rejected
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);

-- ============================================
-- TABLA: stock_movements (Movimientos de Stock)
-- ============================================
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id),
    sku VARCHAR(100) NOT NULL,
    
    movement_type VARCHAR(20) NOT NULL, -- entrada, salida, ajuste, transferencia
    quantity INTEGER NOT NULL, -- positivo para entrada, negativo para salida
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    
    reference_type VARCHAR(50), -- order, purchase, adjustment, transfer
    reference_id INTEGER, -- ID del pedido, compra, etc.
    
    reason TEXT,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_sku ON stock_movements(sku);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);

-- ============================================
-- TABLA: suppliers (Proveedores)
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    rut VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    commune VARCHAR(100),
    city VARCHAR(100),
    
    payment_terms VARCHAR(100), -- condiciones de pago
    credit_limit DECIMAL(10, 2),
    
    active BOOLEAN DEFAULT true,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suppliers_rut ON suppliers(rut);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(active);

-- ============================================
-- TABLA: purchase_orders (Órdenes de Compra)
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, sent, received, cancelled
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    received_date DATE,
    
    total_amount DECIMAL(10, 2) DEFAULT 0.00,
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

-- ============================================
-- TABLA: purchase_order_items (Items de OC)
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    sku VARCHAR(100),
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_po_items_po_id ON purchase_order_items(purchase_order_id);

-- ============================================
-- TABLA: accounts_receivable (Cuentas por Cobrar)
-- ============================================
CREATE TABLE IF NOT EXISTS accounts_receivable (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER REFERENCES invoices(id),
    client_id VARCHAR(255) NOT NULL,
    
    original_amount DECIMAL(10, 2) NOT NULL,
    paid_amount DECIMAL(10, 2) DEFAULT 0.00,
    balance DECIMAL(10, 2) NOT NULL,
    
    due_date DATE NOT NULL,
    days_overdue INTEGER DEFAULT 0,
    
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, partial, paid, overdue, written_off
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ar_invoice_id ON accounts_receivable(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_client_id ON accounts_receivable(client_id);
CREATE INDEX IF NOT EXISTS idx_ar_status ON accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_ar_due_date ON accounts_receivable(due_date);

-- ============================================
-- TABLA: roles (Roles de Usuario)
-- ============================================
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABLA: user_roles (Usuarios y Roles)
-- ============================================
CREATE TABLE IF NOT EXISTS user_roles (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES roles(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    assigned_by VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- ============================================
-- TABLA: system_settings (Configuración del Sistema)
-- ============================================
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
    category VARCHAR(50), -- general, invoice, stock, etc.
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255)
);

-- ============================================
-- TABLA: audit_log (Log de Auditoría)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(100) NOT NULL, -- create, update, delete, view
    entity_type VARCHAR(50) NOT NULL, -- order, invoice, client, etc.
    entity_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_receivable_updated_at BEFORE UPDATE ON accounts_receivable
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DATOS INICIALES (MOCKUP)
-- ============================================

-- Roles por defecto
INSERT INTO roles (name, description, permissions) VALUES
('admin', 'Administrador del sistema', '{"all": true}'::jsonb),
('vendedor', 'Vendedor - puede crear pedidos y facturas', '{"orders": ["create", "read", "update"], "invoices": ["create", "read"], "clients": ["read"]}'::jsonb),
('contador', 'Contador - gestión financiera', '{"invoices": ["all"], "payments": ["all"], "reports": ["all"]}'::jsonb),
('almacen', 'Almacén - gestión de inventario', '{"stock": ["all"], "products": ["all"]}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Configuración del sistema
INSERT INTO system_settings (key, value, type, category, description) VALUES
('company_name', 'ImBlasco S.A.', 'string', 'general', 'Nombre de la empresa'),
('company_rut', '76.123.456-7', 'string', 'general', 'RUT de la empresa'),
('company_address', 'Álvarez de Toledo 981, San Miguel', 'string', 'general', 'Dirección de la empresa'),
('iva_rate', '0.19', 'number', 'invoice', 'Tasa de IVA (19%)'),
('invoice_prefix', 'FAC', 'string', 'invoice', 'Prefijo para números de factura'),
('low_stock_threshold', '10', 'number', 'stock', 'Umbral de stock bajo para alertas'),
('currency', 'CLP', 'string', 'general', 'Moneda del sistema')
ON CONFLICT (key) DO NOTHING;

-- Proveedores de ejemplo
INSERT INTO suppliers (rut, name, business_name, email, phone, address, commune, active) VALUES
('77.111.222-3', 'Proveedor ABC', 'Proveedor ABC S.A.', 'contacto@proveedorabc.cl', '+56 2 2345 6789', 'Av. Principal 100', 'Santiago', true),
('77.222.333-4', 'Distribuidora XYZ', 'Distribuidora XYZ Ltda.', 'ventas@distribuidoraxyz.cl', '+56 2 3456 7890', 'Calle Secundaria 200', 'Providencia', true)
ON CONFLICT (rut) DO NOTHING;

COMMENT ON TABLE invoices IS 'Facturas emitidas';
COMMENT ON TABLE invoice_items IS 'Items de cada factura';
COMMENT ON TABLE payments IS 'Pagos recibidos';
COMMENT ON TABLE stock_movements IS 'Movimientos de inventario';
COMMENT ON TABLE suppliers IS 'Proveedores';
COMMENT ON TABLE purchase_orders IS 'Órdenes de compra a proveedores';
COMMENT ON TABLE accounts_receivable IS 'Cuentas por cobrar';
COMMENT ON TABLE roles IS 'Roles de usuario del sistema';
COMMENT ON TABLE system_settings IS 'Configuración del sistema';


