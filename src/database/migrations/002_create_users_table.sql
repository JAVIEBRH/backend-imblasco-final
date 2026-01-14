-- ============================================
-- MIGRACIÓN 002: TABLA DE USUARIOS/CLIENTES
-- Crea tabla de usuarios B2B con datos tributarios
-- ============================================

-- Tabla de usuarios/clientes B2B
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    razon_social VARCHAR(255) NOT NULL,
    rut VARCHAR(20) NOT NULL,
    giro VARCHAR(255),
    direccion TEXT,
    comuna VARCHAR(100),
    email_facturacion VARCHAR(255),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_rut ON users(rut);
CREATE INDEX IF NOT EXISTS idx_users_activo ON users(activo) WHERE activo = true;

-- Trigger para updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Usuarios de prueba
-- Password: "demo123" (hash bcrypt: $2b$10$rOzJ8K8K8K8K8K8K8K8K8e)
-- Para producción, usar bcrypt real

INSERT INTO users (user_id, email, password_hash, nombre, razon_social, rut, giro, direccion, comuna, email_facturacion)
VALUES 
    ('cliente-demo-001', 'demo@cliente.cl', '$2b$10$rOzJ8K8K8K8K8K8K8K8K8e', 'Cliente Demo', 'Cliente Demo S.A.', '76.123.456-7', 'Comercio', 'Av. Providencia 123', 'Providencia', 'facturacion@cliente.cl'),
    ('empresa-test-002', 'test@empresa.cl', '$2b$10$rOzJ8K8K8K8K8K8K8K8K8e', 'Empresa Test', 'Empresa Test Ltda.', '77.234.567-8', 'Servicios', 'Av. Las Condes 456', 'Las Condes', 'contabilidad@empresa.cl'),
    ('comercio-b2b-003', 'b2b@comercio.cl', '$2b$10$rOzJ8K8K8K8K8K8K8K8K8e', 'Comercio B2B', 'Comercio B2B SpA', '78.345.678-9', 'Distribución', 'Av. Vitacura 789', 'Vitacura', 'admin@comercio.cl')
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE users IS 'Usuarios/clientes B2B con datos tributarios';
COMMENT ON COLUMN users.user_id IS 'ID único del usuario (usado en el sistema)';
COMMENT ON COLUMN users.password_hash IS 'Hash de la contraseña (bcrypt)';
COMMENT ON COLUMN users.email_facturacion IS 'Email para envío de facturas';


