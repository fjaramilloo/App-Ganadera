-- Script para crear el Super Administrador en Supabase Auth y asignarle su primera finca
-- 1. Habilitar extensión pgcrypto (necesaria para el hash de contraseñas)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_finca_id uuid;
  v_email text := 'fjaramilloconsultor@gmail.com';
  v_password text := 'Veronica23?';
BEGIN

  -- 2. Crear el usuario en auth.users (Si no existe)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    v_user_id := uuid_generate_v4();
    
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      current_timestamp,
      current_timestamp,
      current_timestamp,
      '{"provider":"email","providers":["email"]}',
      '{}',
      current_timestamp,
      current_timestamp,
      '',
      '',
      '',
      ''
    );

    -- 3. Crear su identidad en auth.identities
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      uuid_generate_v4(),
      v_user_id,
      v_user_id::text,
      format('{"sub":"%s","email":"%s"}', v_user_id::text, v_email)::jsonb,
      'email',
      current_timestamp,
      current_timestamp,
      current_timestamp
    );
  ELSE
    -- Si ya existe, simplemente obtenemos su ID
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email LIMIT 1;
  END IF;

  -- 4. Crear la Organización donde este usuario es el DUEÑO
  IF NOT EXISTS (SELECT 1 FROM organizaciones WHERE id_dueño = v_user_id LIMIT 1) THEN
    INSERT INTO organizaciones (nombre, id_dueño)
    VALUES ('Consultoría Agroganadera', v_user_id)
    RETURNING id INTO v_org_id;
  ELSE
    SELECT id INTO v_org_id FROM organizaciones WHERE id_dueño = v_user_id LIMIT 1;
  END IF;

  -- 5. Crear la Finca principal
  IF NOT EXISTS (SELECT 1 FROM fincas WHERE id_organizacion = v_org_id LIMIT 1) THEN
    INSERT INTO fincas (id_organizacion, nombre, ubicacion)
    VALUES (v_org_id, 'Hacienda Principal', 'Sede Central')
    RETURNING id INTO v_finca_id;
  ELSE
    SELECT id INTO v_finca_id FROM fincas WHERE id_organizacion = v_org_id LIMIT 1;
  END IF;

  -- 6. Asignarlo como Administrador Total (con permisos sobre la finca)
  IF NOT EXISTS (SELECT 1 FROM permisos_finca WHERE id_usuario = v_user_id AND id_finca = v_finca_id) THEN
    INSERT INTO permisos_finca (id_usuario, id_finca, rol)
    VALUES (v_user_id, v_finca_id, 'administrador');
  END IF;

  -- 7. Crear el registro base de configuración si no existe
  IF NOT EXISTS (SELECT 1 FROM configuracion_kpi WHERE id_finca = v_finca_id) THEN
    INSERT INTO configuracion_kpi (id_finca, umbral_bajo_gdp)
    VALUES (v_finca_id, 0.434);
  END IF;

END $$;
