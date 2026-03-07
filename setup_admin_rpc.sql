-- Función para que los Administradores puedan crear Vaqueros u Observadores en su finca
CREATE OR REPLACE FUNCTION crear_trabajador_finca(
    p_email TEXT,
    p_password TEXT,
    p_finca_id UUID,
    p_rol rol_finca
) RETURNS JSON AS $$
DECLARE
    v_caller_id UUID;
    v_is_superadmin BOOLEAN;
    v_is_admin_of_finca BOOLEAN;
    v_user_id UUID;
BEGIN
    -- 1. Validar quien llama
    v_caller_id := auth.uid();
    
    -- Verificar si es superadmin
    SELECT EXISTS(SELECT 1 FROM superadmins WHERE id_usuario = v_caller_id) INTO v_is_superadmin;
    
    -- Verificar si es administrador de la finca específica
    SELECT EXISTS(
        SELECT 1 FROM permisos_finca 
        WHERE id_usuario = v_caller_id 
        AND id_finca = p_finca_id 
        AND rol = 'administrador'
    ) INTO v_is_admin_of_finca;

    -- 2. Validar permisos
    IF NOT v_is_superadmin AND NOT v_is_admin_of_finca THEN
        RAISE EXCEPTION 'Acceso denegado. Solo administradores de esta finca pueden crear trabajadores.';
    END IF;

    -- 3. Restricción de Roles para Admins regulares
    IF NOT v_is_superadmin AND p_rol = 'administrador' THEN
        RAISE EXCEPTION 'Un administrador no puede crear otros administradores.';
    END IF;

    -- 4. Verificar si el email ya existe
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
        RAISE EXCEPTION 'El correo electrónico ya está registrado en el sistema.';
    END IF;

    -- 5. Crear usuario en auth.users (ID manual para control)
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

    -- 6. Crear identidad vinculada
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      uuid_generate_v4(), v_user_id, v_user_id::text,
      format('{"sub":"%s","email":"%s"}', v_user_id::text, p_email)::jsonb,
      'email', current_timestamp, current_timestamp, current_timestamp
    );

    -- 7. Asignar Permiso en la Finca
    INSERT INTO permisos_finca (id_usuario, id_finca, rol)
    VALUES (v_user_id, p_finca_id, p_rol);

    RETURN json_build_object('success', true, 'user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
