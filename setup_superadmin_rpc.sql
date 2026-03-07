-- 1. Tabla de Superadministradores
CREATE TABLE IF NOT EXISTS superadmins (
    id_usuario UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Asegurarse de insertar el correo que acabamos de crear en la tabla de superadmins
INSERT INTO superadmins (id_usuario)
SELECT id FROM auth.users WHERE email = 'fjaramilloconsultor@gmail.com'
ON CONFLICT DO NOTHING;

-- Habilitar extensión pgcrypto (por si no lo estaba)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Crear función RPC (Remote Procedure Call) segura para crear Dueños de Fincas (Administradores)
CREATE OR REPLACE FUNCTION crear_dueno_finca(
    p_email TEXT,
    p_password TEXT,
    p_nombre_organizacion TEXT,
    p_nombre_finca TEXT,
    p_ubicacion_finca TEXT
) RETURNS JSON AS $$
DECLARE
    v_caller_id UUID;
    v_is_superadmin BOOLEAN;
    v_user_id UUID;
    v_org_id UUID;
    v_finca_id UUID;
BEGIN
    -- Validar que el llamador existe y es superadministrador
    v_caller_id := auth.uid();
    SELECT EXISTS(SELECT 1 FROM superadmins WHERE id_usuario = v_caller_id) INTO v_is_superadmin;
    
    IF NOT v_is_superadmin THEN
        RAISE EXCEPTION 'Acceso denegado. Solo los Superadministradores pueden crear dueños de fincas.';
    END IF;

    -- Verificar si el email ya existe
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
        RAISE EXCEPTION 'El correo electrónico ya está registrado.';
    END IF;

    -- 1. Crear usuario en auth.users (GoTrue)
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated', p_email,
      crypt(p_password, gen_salt('bf')), current_timestamp, current_timestamp, current_timestamp,
      '{"provider":"email","providers":["email"]}', '{}', current_timestamp, current_timestamp, '', '', '', ''
    );

    -- 2. Crear identidad vinculada
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      uuid_generate_v4(), v_user_id, v_user_id::text,
      format('{"sub":"%s","email":"%s"}', v_user_id::text, p_email)::jsonb,
      'email', current_timestamp, current_timestamp, current_timestamp
    );

    -- 3. Crear Organización a nombre del nuevo usuario
    INSERT INTO organizaciones (nombre, id_dueño)
    VALUES (p_nombre_organizacion, v_user_id)
    RETURNING id INTO v_org_id;

    -- 4. Crear Finca inicial de la organización
    INSERT INTO fincas (id_organizacion, nombre, ubicacion)
    VALUES (v_org_id, p_nombre_finca, p_ubicacion_finca)
    RETURNING id INTO v_finca_id;

    -- 5. Asignar Permiso de Administrador al nuevo usuario para esta finca
    INSERT INTO permisos_finca (id_usuario, id_finca, rol)
    VALUES (v_user_id, v_finca_id, 'administrador');

    -- 6. Configurar KPIs por defecto para la nueva finca
    INSERT INTO configuracion_kpi (id_finca, umbral_bajo_gdp)
    VALUES (v_finca_id, 0.434);

    RETURN json_build_object('success', true, 'finca_id', v_finca_id, 'user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Establecer RLS para la tabla de superadmins (solo ellos mismos pueden verse y confirmar que lo son)
ALTER TABLE superadmins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Superadmins pueden ver si son superadmins" ON superadmins;
CREATE POLICY "Superadmins pueden ver si son superadmins" ON superadmins 
FOR SELECT TO authenticated USING (id_usuario = auth.uid());
