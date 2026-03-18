import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Settings as SettingsIcon, Upload, FileText, UserPlus, Users, CheckSquare, Square, Trash2, Plus, CheckCircle2, MapPin, Maximize, Home, Lock } from 'lucide-react';
// @ts-ignore type definitions for papaparse are throwing a false positive in the IDE
import Papa from 'papaparse';

const parseFechaCol = (fechaStr: string) => {
    if (!fechaStr) return null;
    if (fechaStr.includes('/')) {
        const parts = fechaStr.split('/');
        if (parts.length === 3) {
            let d = parts[0], m = parts[1], y = parts[2];
            // Si el año viene de 2 dígitos (ej 24), lo pasamos a 2024
            if (y.length === 2) y = '20' + y;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }
    return fechaStr;
};

export default function Settings() {
    const { fincaId, role, userFincas, isSuperAdmin } = useAuth();
    const [umbral, setUmbral] = useState('0.434');
    const [umbralMedioGMP, setUmbralMedioGMP] = useState('10');
    const [umbralAltoGMP, setUmbralAltoGMP] = useState('20');
    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');
    const [showExitoModal, setShowExitoModal] = useState(false);
    const [showErrorModal, setShowErrorModal] = useState(false);

    // Estados para Cambio de Contraseña
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [newUserRole, setNewUserRole] = useState<'vaquero' | 'observador'>('vaquero');
    const [selectedFincas, setSelectedFincas] = useState<string[]>([]);
    
    // Estados para secciones colapsables
    const [collapsed, setCollapsed] = useState({
        seguridad: true,
        datosTecnicos: true, 
        usuarios: true,
        propietarios: true,
        proveedores: true,
        compradores: true,
        cargasMasivas: true
    });

    const toggleSection = (section: keyof typeof collapsed) => {
        setCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Estados para creación de usuario

    // Estados para Propietarios
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoPropietario, setNuevoPropietario] = useState('');

    // Estados para Proveedores
    const [proveedores, setProveedores] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoProveedor, setNuevoProveedor] = useState('');

    // Estados para Compradores
    const [compradores, setCompradores] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoComprador, setNuevoComprador] = useState('');

    // Estados para Potreradas (Movidos a Potreradas.tsx)

    // Estados para Rotaciones y Potreros (Eliminados, movidos a Rotations.tsx)

    // Estados para Información de la Finca
    const [farmInfo, setFarmInfo] = useState({
        area_total: '',
        area_aprovechable: '',
        ubicacion: '',
        proposito: '',
        precio_venta_promedio: '',
        peso_entrada_ceba: '380'
    });

    // Filtrar fincas donde el usuario es administrador
    const fincasAdmin = userFincas.filter(f => f.rol === 'administrador' || isSuperAdmin);

    const fetchConfig = async () => {
        if (!fincaId) return;
        const { data } = await supabase
            .from('configuracion_kpi')
            .select('umbral_bajo_gdp, umbral_medio_gmp, umbral_alto_gmp')
            .eq('id_finca', fincaId)
            .single();

        if (data) {
            setUmbral(data.umbral_bajo_gdp?.toString() || '0.434');
            if (data.umbral_medio_gmp !== undefined && data.umbral_medio_gmp !== null) setUmbralMedioGMP(data.umbral_medio_gmp.toString());
            if (data.umbral_alto_gmp !== undefined && data.umbral_alto_gmp !== null) setUmbralAltoGMP(data.umbral_alto_gmp.toString());
        }
    };

    const fetchPropietarios = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('propietarios')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setPropietarios(data);
    };

    const fetchProveedores = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('proveedores')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setProveedores(data);
    };

    const fetchCompradores = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('compradores')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setCompradores(data);
    };

    // fetchPotreradas movido a Potreradas.tsx


    const fetchFincaInfo = async () => {
        if (!fincaId) return;
        
        // Datos generales de la finca
        const { data: finca, error: fincaErr } = await supabase
            .from('fincas')
            .select('area_total, area_aprovechable, ubicacion, proposito')
            .eq('id', fincaId)
            .single();

        // Precio de venta y umbral ceba desde configuracion_kpi
        const { data: config } = await supabase
            .from('configuracion_kpi')
            .select('precio_venta_promedio, peso_entrada_ceba')
            .eq('id_finca', fincaId)
            .single();

        if (!fincaErr && finca) {
            setFarmInfo({
                area_total: finca.area_total?.toString() || '',
                area_aprovechable: finca.area_aprovechable?.toString() || '',
                ubicacion: finca.ubicacion || '',
                proposito: finca.proposito || '',
                precio_venta_promedio: config?.precio_venta_promedio?.toString() || '0',
                peso_entrada_ceba: config?.peso_entrada_ceba?.toString() || '380'
            });
        }
    };

    useEffect(() => {
        if (!fincaId) return;
        fetchConfig();
        fetchPropietarios();
        fetchProveedores();
        fetchCompradores();
        fetchFincaInfo();

        if (fincaId && selectedFincas.length === 0) {
            setSelectedFincas([fincaId]);
        }
    }, [fincaId]);

    const toggleFincaSelection = (id: string) => {
        setSelectedFincas(prev =>
            prev.includes(id)
                ? prev.filter(f => f !== id)
                : [...prev, id]
        );
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setMsjError('Las contraseñas no coinciden.');
            return;
        }
        if (newPassword.length < 6) {
            setMsjError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        setLoading(true);
        setMsjError('');
        setMsjExito('');
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            setMsjError('Error al actualizar contraseña: ' + error.message);
        } else {
            setMsjExito('Contraseña actualizada correctamente.');
            setNewPassword('');
            setConfirmPassword('');
        }
        setLoading(false);
    };

    const guardarConfiguracionYFinca = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        try {
            // 1. Guardar configuracion_kpi (umbrales y precios)
            const valorNum = parseFloat(umbral);
            const valorMedioGMP = parseFloat(umbralMedioGMP);
            const valorAltoGMP = parseFloat(umbralAltoGMP);
            const precioVenta = parseFloat(farmInfo.precio_venta_promedio) || 0;
            const pesoCeba = parseFloat(farmInfo.peso_entrada_ceba) || 380;

            const { error: kpiError } = await supabase
                .from('configuracion_kpi')
                .upsert({ 
                    id_finca: fincaId, 
                    umbral_bajo_gdp: valorNum,
                    umbral_medio_gmp: valorMedioGMP,
                    umbral_alto_gmp: valorAltoGMP,
                    precio_venta_promedio: precioVenta,
                    peso_entrada_ceba: pesoCeba
                }, { onConflict: 'id_finca' });

            if (kpiError) throw kpiError;

            // 2. Guardar información de la finca
            const { error: fincaError } = await supabase
                .from('fincas')
                .update({
                    area_total: farmInfo.area_total ? parseFloat(farmInfo.area_total) : null,
                    area_aprovechable: farmInfo.area_aprovechable ? parseFloat(farmInfo.area_aprovechable) : null,
                    ubicacion: farmInfo.ubicacion,
                    proposito: farmInfo.proposito || null
                })
                .eq('id', fincaId);

            if (fincaError) throw fincaError;

            setMsjExito('Información y parámetros actualizados exitosamente.');
        } catch (err: any) {
            setMsjError('Error al guardar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedFincas.length === 0) {
            setMsjError('Debe seleccionar al menos una finca para asignar al usuario.');
            return;
        }
        if (!newUserEmail || !newUserPass) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        try {
            const { error } = await supabase.rpc('crear_trabajador_finca', {
                p_email: newUserEmail,
                p_password: newUserPass,
                p_finca_ids: selectedFincas,
                p_rol: newUserRole
            });

            if (error) throw error;

            setMsjExito(`Usuario ${newUserEmail} creado y asignado a ${selectedFincas.length} fincas.`);
            setNewUserEmail('');
            setNewUserPass('');
            setSelectedFincas([fincaId || '']);
        } catch (err: any) {
            setMsjError('Error creando usuario: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPropietario = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoPropietario.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('propietarios')
                .insert({ id_finca: fincaId, nombre: nuevoPropietario.trim() });

            if (error) throw error;

            setNuevoPropietario('');
            fetchPropietarios();
            setMsjExito('Propietario agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar propietario: ' + (err.code === '23505' ? 'Ya existe un propietario con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removePropietario = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar este propietario?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('propietarios').delete().eq('id', id);
            if (error) throw error;
            fetchPropietarios();
            setMsjExito('Propietario eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddProveedor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoProveedor.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('proveedores')
                .insert({ id_finca: fincaId, nombre: nuevoProveedor.trim() });

            if (error) throw error;

            setNuevoProveedor('');
            fetchProveedores();
            setMsjExito('Proveedor agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar proveedor: ' + (err.code === '23505' ? 'Ya existe un proveedor con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removeProveedor = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar este proveedor?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('proveedores').delete().eq('id', id);
            if (error) throw error;
            fetchProveedores();
            setMsjExito('Proveedor eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddComprador = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevoComprador.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('compradores')
                .insert({ id_finca: fincaId, nombre: nuevoComprador.trim() });

            if (error) throw error;

            setNuevoComprador('');
            fetchCompradores();
            setMsjExito('Comprador agregado correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar comprador: ' + (err.code === '23505' ? 'Ya existe un comprador con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removeComprador = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar este comprador?')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('compradores').delete().eq('id', id);
            if (error) throw error;
            fetchCompradores();
            setMsjExito('Comprador eliminado.');
        } catch (err: any) {
            setMsjError('Error al eliminar: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // handleAddPotrerada y removePotrerada movidos a Potreradas.tsx


    const handleBulkAnimalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['numero_chapeta', 'propietario', 'peso_ingreso', 'fecha_ingreso'];
                    const isWeighingFile = headers.includes('peso') && !headers.includes('peso_ingreso');
                    const isRotationFile = headers.includes('nombre_rotacion') || headers.includes('nombre_potrero');

                    if (isWeighingFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de SEGUIMIENTO DE PESAJES en la sección de INVENTARIO. Por favor, use la sección correcta.');
                    }
                    if (isRotationFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de ROTACIONES en la sección de INVENTARIO.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Inventario. Faltan columnas: ${missing.join(', ')}`);
                    }
                    // 1. Obtener mapeos de potreradas y potreros existentes
                    const { data: pds } = await supabase.from('potreradas').select('id, nombre').eq('id_finca', fincaId);
                    const { data: pts } = await supabase.from('potreros').select('id, nombre').eq('id_finca', fincaId);

                    const mapPotreradas = new Map(pds?.map(p => [p.nombre.toLowerCase().trim(), p.id]));
                    const mapPotreros = new Map(pts?.map(p => [p.nombre.toLowerCase().trim(), p.id]));

                    // 2. Detectar potreradas nuevas que vengan en el CSV y crearlas
                    //    Usamos la etapa del animal para la potrerada
                    const potreradasNuevas = new Map<string, string>(); // nombre_lower -> etapa
                    results.data.forEach((row: any) => {
                        const nombre = row.potrerada?.toString().trim();
                        const etapa = row.etapa?.toLowerCase() || 'levante';
                        if (nombre && !mapPotreradas.has(nombre.toLowerCase())) {
                            potreradasNuevas.set(nombre.toLowerCase(), etapa);
                        }
                    });

                    if (potreradasNuevas.size > 0) {
                        // Obtener nombre original (con capitalización) del CSV para insertar
                        const inserts = results.data.reduce((acc: any[], row: any) => {
                            const nombre = row.potrerada?.toString().trim();
                            const nombreLower = nombre?.toLowerCase();
                            if (nombre && potreradasNuevas.has(nombreLower) && !acc.find(a => a.nombre.toLowerCase() === nombreLower)) {
                                acc.push({
                                    id_finca: fincaId,
                                    nombre: nombre,
                                    etapa: row.etapa?.toLowerCase() || 'levante'
                                });
                            }
                            return acc;
                        }, []);

                        const { data: creadas, error: errCreate } = await supabase
                            .from('potreradas')
                            .insert(inserts)
                            .select('id, nombre');

                        if (errCreate) throw new Error(`Error al crear potreradas: ${errCreate.message}`);

                        // Agregar al mapa las recién creadas
                        creadas?.forEach(p => mapPotreradas.set(p.nombre.toLowerCase().trim(), p.id));
                    }

                    // 3. Construir filas de animales con IDs resueltos
                    const rows = results.data.map((row: any) => {
                        const potreradaNombre = row.potrerada?.toString().toLowerCase().trim();
                        const potreroNombre = row.potrero?.toString().toLowerCase().trim();
                        const etapa = row.etapa?.toLowerCase() || 'levante';
                        
                        // Mapeo flexible de fechas
                        const rawFecha = row.fecha_ingreso || row['fecha_ingreso(Año-Mes-Día)'] || row.fecha_ingreso_ceba || row.fecha || row.Fecha;
                        const fechaFinal = parseFechaCol(rawFecha) || new Date().toISOString().split('T')[0];
                        const pesoIngreso = parseFloat(row.peso_ingreso) || 0;

                        return {
                            id_finca: fincaId,
                            numero_chapeta: row.numero_chapeta?.toString().trim(),
                            nombre_propietario: row.propietario || 'Sin Datos',
                            especie: row.especie?.toLowerCase() || 'bovino',
                            sexo: row.sexo?.toUpperCase() || 'M',
                            etapa: etapa,
                            fecha_ingreso: fechaFinal,
                            peso_ingreso: pesoIngreso,
                            id_potrerada: potreradaNombre ? (mapPotreradas.get(potreradaNombre) ?? null) : null,
                            id_potrero_actual: potreroNombre ? (mapPotreros.get(potreroNombre) ?? null) : null,
                            estado: 'activo',
                            // Nuevos campos para trazabilidad de ceba
                            fecha_ingreso_ceba: etapa === 'ceba' ? fechaFinal : null,
                            peso_ingreso_ceba: etapa === 'ceba' ? pesoIngreso : null,
                            ok_ceba: false,
                            // Campos opcionales de compra
                            proveedor_compra: row.proveedor || row.proveedor_compra || null,
                            observaciones_compra: row.observaciones || row.observaciones_compra || null
                        };
                    });

                    const chapetas = rows.map((r: any) => r.numero_chapeta);
                    if (chapetas.some((c: any) => !c)) throw new Error("Todas las filas deben tener un número de chapeta.");
                    
                    const duplicados = chapetas.filter((c: any, index: number) => chapetas.indexOf(c) !== index);
                    if (duplicados.length > 0) {
                        throw new Error(`El archivo CSV contiene números de chapeta duplicados: ${[...new Set(duplicados)].join(', ')}`);
                    }

                    // 4. Separar animales en: nuevos (insertar) y existentes (actualizar)
                    const { data: existentes, error: checkError } = await supabase
                        .from('animales')
                        .select('id, numero_chapeta')
                        .eq('id_finca', fincaId)
                        .in('numero_chapeta', chapetas);

                    if (checkError) throw checkError;

                    const existentesMap = new Map(existentes?.map(e => [e.numero_chapeta, e.id]) ?? []);
                    const rowsNuevos = rows.filter((r: any) => !existentesMap.has(r.numero_chapeta));
                    const rowsActualizar = rows.filter((r: any) => existentesMap.has(r.numero_chapeta));

                    // 5. Insertar animales nuevos y su pesaje inicial
                    let insertados = 0;
                    if (rowsNuevos.length > 0) {
                        const { data: nuevosAnimales, error: errIns } = await supabase
                            .from('animales')
                            .insert(rowsNuevos)
                            .select();
                        if (errIns) throw errIns;
                        insertados = nuevosAnimales?.length ?? 0;

                        if (nuevosAnimales && nuevosAnimales.length > 0) {
                            const pesajes = nuevosAnimales.map(anim => ({
                                id_animal: anim.id,
                                peso: anim.peso_ingreso,
                                fecha: anim.fecha_ingreso,
                                etapa: anim.etapa,
                                id_potrero: anim.id_potrero_actual
                            }));
                            await supabase.from('registros_pesaje').insert(pesajes);
                        }
                    }

                    // 6. Actualizar animales existentes usando lotes paralelos (Batches) para evitar problemas de N+1 queries.
                    let actualizados = 0;
                    const pesajesEfectuados: any[] = [];
                    const BATCH_SIZE = 50;

                    for (let i = 0; i < rowsActualizar.length; i += BATCH_SIZE) {
                        const batch = rowsActualizar.slice(i, i + BATCH_SIZE);
                        await Promise.all(batch.map(async (row: any) => {
                            const animalId = existentesMap.get(row.numero_chapeta);
                            if (!animalId) return;

                            const { numero_chapeta: _nc, id_finca: _if, ...camposActualizar } = row;
                            
                            const { error: errUpd } = await supabase
                                .from('animales')
                                .update(camposActualizar)
                                .eq('id', animalId);

                            if (!errUpd) {
                                actualizados++;
                                pesajesEfectuados.push({
                                    id_animal: animalId,
                                    peso: row.peso_ingreso,
                                    fecha: row.fecha_ingreso,
                                    etapa: row.etapa,
                                    id_potrero: row.id_potrero_actual
                                });
                            }
                        }));
                    }

                    if (pesajesEfectuados.length > 0) {
                        const { error: errPesExist } = await supabase
                            .from('registros_pesaje')
                            .insert(pesajesEfectuados);
                        if (errPesExist) console.error("Error al registrar pesajes de animales existentes:", errPesExist);
                    }

                    const msgPotreradas = potreradasNuevas.size > 0
                        ? ` Se crearon ${potreradasNuevas.size} potrerada(s) nueva(s): ${[...potreradasNuevas.keys()].join(', ')}.`
                        : '';
                    const partes = [];
                    if (insertados > 0) partes.push(`${insertados} animal(es) nuevo(s) registrado(s)`);
                    if (actualizados > 0) partes.push(`${actualizados} animal(es) existente(s) actualizado(s)`);
                    setMsjExito(`¡Carga masiva completada! ${partes.join(' y ')}.${msgPotreradas}`);
                    setShowExitoModal(true);
                } catch (err: any) {
                    setMsjError('Error en carga de animales: ' + err.message);
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            }
        });
    };

    const handleBulkPesajeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['numero_chapeta', 'peso', 'fecha'];
                    const isInventoryFile = headers.includes('peso_ingreso') || headers.includes('propietario');
                    const isRotationFile = headers.includes('nombre_rotacion') || headers.includes('nombre_potrero');

                    if (isInventoryFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de INVENTARIO en la sección de PESAJES. Por favor, use la sección correcta.');
                    }
                    if (isRotationFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de ROTACIONES en la sección de PESAJES.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Seguimiento de Pesajes. Faltan columnas: ${missing.join(', ')}`);
                    }

                    // 1. Obtener mapeos necesarios
                    const { data: animalesData, error: animError } = await supabase
                        .from('animales')
                        .select('id, numero_chapeta, etapa, fecha_ingreso, peso_ingreso, fecha_ingreso_ceba, peso_ingreso_ceba')
                        .eq('id_finca', fincaId);

                    if (animError || !animalesData) throw new Error("No se pudieron cargar los datos de los animales");

                    const { data: pts } = await supabase.from('potreros').select('id, nombre').eq('id_finca', fincaId);
                    const mapPotreros = new Map(pts?.map(p => [p.nombre.toLowerCase().trim(), p.id]));

                    // Incluir fecha_ingreso y peso_ingreso para poder comparar luego
                    const mapAnimales = new Map(animalesData.map(a => [
                        a.numero_chapeta,
                        { 
                            id: a.id, 
                            etapa: a.etapa, 
                            fecha_ingreso: a.fecha_ingreso, 
                            peso_ingreso: a.peso_ingreso,
                            fecha_ingreso_ceba: a.fecha_ingreso_ceba,
                            peso_ingreso_ceba: a.peso_ingreso_ceba
                        }
                    ]));

                    const records: any[] = [];
                    const errores: string[] = [];
                    const cebaUpdates = new Map<string, { fecha: string, peso: number }>();

                    results.data.forEach((row: any, index: number) => {
                        const anim = mapAnimales.get(row.numero_chapeta);
                        if (!anim) {
                            errores.push(`Fila ${index + 2}: Chapeta ${row.numero_chapeta} no existe.`);
                            return;
                        }

                        const peso = parseFloat(row.peso);
                        const rawFecha = row.fecha || row['fecha(Año-Mes-Día)'] || row['Fecha'];
                        const fecha = parseFechaCol(rawFecha) || new Date().toISOString().split('T')[0];
                        const potreroNombre = row.potrero?.toString().toLowerCase().trim();


                        // Nueva lógica: Priorizar etapa del CSV, sino usar la actual del animal
                        const etapaCSV = row.etapa?.toString().toLowerCase().trim();
                        let etapaFinal = (etapaCSV === 'cria' || etapaCSV === 'levante' || etapaCSV === 'ceba') 
                            ? etapaCSV 
                            : anim.etapa;

                        if (isNaN(peso) || peso <= 0) {
                            errores.push(`Fila ${index + 2}: Peso inválido.`);
                            return;
                        }

                        records.push({
                            id_animal: anim.id,
                            peso,
                            fecha,
                            etapa: etapaFinal,
                            id_potrero: potreroNombre ? mapPotreros.get(potreroNombre) : null
                        });

                        // Si el pesaje es de ceba, marcar al animal para actualizar su etapa actual e ingreso a ceba
                        if (etapaFinal === 'ceba') {
                            const fechaDB = anim.fecha_ingreso_ceba;
                            const actualBuffer = cebaUpdates.get(anim.id);
                            
                            // Si no tiene fecha en DB o la del CSV es anterior...
                            if (!fechaDB || fecha < fechaDB) {
                                // ...y si no hay nada en el buffer o la del CSV es anterior a la del buffer
                                if (!actualBuffer || fecha < actualBuffer.fecha) {
                                    cebaUpdates.set(anim.id, { fecha, peso });
                                }
                            }
                        }
                    });

                    if (records.length === 0) {
                        throw new Error("El archivo no contenía datos válidos o compatibles con los animales de esta finca.");
                    }

                    // 2. Detectar pesajes con fecha anterior a fecha_ingreso del animal
                    //    Para cada animal afectado, guardamos la fecha/peso más antiguo del CSV
                    const ingresoAActualizar: Map<string, { fecha: string; peso: number }> = new Map();

                    records.forEach(r => {
                        const animInfo = animalesData.find(a => a.id === r.id_animal);
                        if (!animInfo) return;
                        if (r.fecha < animInfo.fecha_ingreso) {
                            const existente = ingresoAActualizar.get(r.id_animal);
                            if (!existente || r.fecha < existente.fecha) {
                                ingresoAActualizar.set(r.id_animal, { fecha: r.fecha, peso: r.peso });
                            }
                        }
                    });

                    // Actualizar animales con fecha/peso de ingreso más antiguos
                    let animalesActualizados = 0;
                    for (const [idAnimal, nuevoDato] of ingresoAActualizar.entries()) {
                        const { error: updErr } = await supabase
                            .from('animales')
                            .update({ fecha_ingreso: nuevoDato.fecha, peso_ingreso: nuevoDato.peso })
                            .eq('id', idAnimal);
                        if (!updErr) animalesActualizados++;
                    }

                    // 3. Insertar los pesajes
                    const { error: insertError } = await supabase.from('registros_pesaje').insert(records);
                    if (insertError) throw insertError;

                    // 4. Actualizar etapa de animales que pasaron a ceba
                    if (cebaUpdates.size > 0) {
                        for (const [id, data] of cebaUpdates.entries()) {
                            await supabase
                                .from('animales')
                                .update({ 
                                    etapa: 'ceba', 
                                    ok_ceba: true,
                                    fecha_ingreso_ceba: data.fecha,
                                    peso_ingreso_ceba: data.peso
                                })
                                .eq('id', id);
                        }
                    }

                    let msg = `¡Carga exitosa! Se registraron ${records.length} seguimientos de pesaje.`;
                    if (animalesActualizados > 0) {
                        msg += ` Se actualizó automáticamente la fecha y peso de ingreso de ${animalesActualizados} animal(es) porque se encontraron pesajes anteriores a su ingreso registrado.`;
                    }
                    setMsjExito(msg);
                    setShowExitoModal(true);
                    if (errores.length > 0) {
                        setMsjError(`Se omitieron algunos registros:\n${errores.join('\n')}`);
                        setShowErrorModal(true);
                    }
                } catch (err: any) {
                    setMsjError(err.message || 'Error procesando el archivo CSV.');
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            }
        });
    };

    const handleBulkRotacionesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results: any) => {
                try {
                    const headers = results.meta.fields || [];
                    const required = ['nombre_rotacion', 'nombre_potrero', 'area_hectareas'];
                    const isInventoryFile = headers.includes('peso_ingreso') || headers.includes('numero_chapeta');
                    const isWeighingFile = headers.includes('peso') && !headers.includes('area_hectareas');

                    if (isInventoryFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de INVENTARIO en la sección de ROTACIONES.');
                    }
                    if (isWeighingFile) {
                        throw new Error('¡Atención! Parece que está intentando subir un archivo de PESAJES en la sección de ROTACIONES.');
                    }

                    const missing = required.filter(h => !headers.includes(h));
                    if (missing.length > 0) {
                        throw new Error(`El archivo no corresponde a la plantilla de Rotaciones y Potreros. Faltan columnas: ${missing.join(', ')}`);
                    }

                    // 1. Obtener datos existentes
                    const { data: exRot } = await supabase.from('rotaciones').select('id, nombre').eq('id_finca', fincaId);
                    const { data: exPot } = await supabase.from('potreros').select('id, nombre, id_rotacion').eq('id_finca', fincaId);

                    const mapRotaciones = new Map(exRot?.map(r => [r.nombre.toLowerCase().trim(), r.id]));
                    const mapPotreros = new Map(exPot?.map(p => [p.nombre.toLowerCase().trim(), { id: p.id, id_rotacion: p.id_rotacion }]));

                    // 2. Identificar rotaciones nuevas
                    const rotacionesNuevas = new Map<string, string>(); // nombre_lower -> original
                    (results.data as any[]).forEach((row: any) => {
                        const rotName = row.nombre_rotacion?.toString().trim();
                        if (rotName && !mapRotaciones.has(rotName.toLowerCase())) {
                            rotacionesNuevas.set(rotName.toLowerCase(), rotName);
                        }
                    });

                    if (rotacionesNuevas.size > 0) {
                        const inserts = Array.from(rotacionesNuevas.values()).map(nombre => ({
                            id_finca: fincaId,
                            nombre: nombre
                        }));
                        const { data: creadas, error: rotErr } = await supabase.from('rotaciones').insert(inserts).select();
                        if (rotErr) throw rotErr;
                        creadas?.forEach(r => mapRotaciones.set(r.nombre.toLowerCase().trim(), r.id));
                    }

                    // 3. Procesar potreros
                    const recordsPotreros: any[] = [];
                    let updatesPotrerosCnt = 0;

                    for (const row of results.data as any[]) {
                        const potName = row.nombre_potrero?.toString().trim();
                        const rotName = row.nombre_rotacion?.toString().trim();
                        const area = parseFloat(row.area_hectareas) || 0;
                        const rotId = rotName ? mapRotaciones.get(rotName.toLowerCase()) : null;

                        if (!potName) continue;

                        const existingPot = mapPotreros.get(potName.toLowerCase());
                        if (existingPot) {
                            // Si el potrero ya existe, actualizamos su área. 
                            // Y solo cambiamos la rotación si se proporcionó una nueva.
                            const updateData: any = { area_hectareas: area };
                            if (rotId) {
                                updateData.id_rotacion = rotId;
                            }
                            
                            const { error: potUpdErr } = await supabase
                                .from('potreros')
                                .update(updateData)
                                .eq('id', existingPot.id);
                            if (potUpdErr) throw potUpdErr;
                            updatesPotrerosCnt++;
                        } else {
                            recordsPotreros.push({
                                id_finca: fincaId,
                                nombre: potName,
                                area_hectareas: area,
                                id_rotacion: rotId
                            });
                        }
                    }

                    if (recordsPotreros.length > 0) {
                        const { error: potInsErr } = await supabase.from('potreros').insert(recordsPotreros);
                        if (potInsErr) throw potInsErr;
                    }

                    setMsjExito(`¡Carga exitosa! Se crearon ${recordsPotreros.length} potreros nuevos y se actualizaron ${updatesPotrerosCnt} existentes.`);
                    setShowExitoModal(true);
                } catch (err: any) {
                    setMsjError(err.message || 'Error procesando el archivo CSV.');
                    setShowErrorModal(true);
                } finally {
                    setLoading(false);
                    if (e.target) e.target.value = '';
                }
            }
        });
    };

    return (
        <div className="page-container" style={{ maxWidth: '800px' }}>
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'left', marginBottom: '32px' }}>
                <SettingsIcon size={32} /> {role === 'administrador' ? 'Ajustes y Gestión de la Finca' : 'Mi Perfil'}
            </h1>

            {/* Modal de Éxito para Cargas Masivas */}
            {showExitoModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center', border: '1px solid var(--primary)', padding: '40px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                            <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', padding: '20px', borderRadius: '50%' }}>
                                <CheckCircle2 size={60} color="var(--primary)" />
                            </div>
                        </div>
                        <h2 style={{ marginBottom: '16px', color: 'white' }}>¡Importación Exitosa!</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '32px', fontSize: '1.1rem' }}>
                            {msjExito}
                        </p>
                        <button
                            onClick={() => { setShowExitoModal(false); setMsjExito(''); }}
                            style={{ backgroundColor: 'var(--primary)', padding: '12px 40px', fontSize: '1rem' }}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Error para Cargas Masivas / Errores Críticos */}
            {showErrorModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', border: '1px solid #ef5350', padding: '40px' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                            <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.1)', padding: '20px', borderRadius: '50%' }}>
                                <Upload size={60} color="#ef5350" />
                            </div>
                        </div>
                        <h2 style={{ marginBottom: '16px', color: 'white' }}>Error en la Carga</h2>
                        <div style={{ 
                            backgroundColor: 'rgba(244, 67, 54, 0.05)', 
                            padding: '20px', 
                            borderRadius: '12px', 
                            marginBottom: '32px',
                            border: '1px solid rgba(244, 67, 54, 0.1)',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            <p style={{ color: '#ef5350', fontSize: '1.05rem', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>
                                {msjError}
                            </p>
                        </div>
                        <button
                            onClick={() => { setShowErrorModal(false); setMsjError(''); }}
                            style={{ backgroundColor: '#ef5350', color: 'white', padding: '12px 40px', fontSize: '1rem', border: 'none' }}
                        >
                            Corregir Archivo
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>

                {/* Cambio de Contraseña */}
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div 
                        onClick={() => toggleSection('seguridad')}
                        style={{ 
                            padding: '20px 24px', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            background: collapsed.seguridad ? 'transparent' : 'rgba(255,255,255,0.03)'
                        }}
                    >
                        <h3 style={{ margin: 0, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Lock size={20} /> Seguridad de la Cuenta
                        </h3>
                        <Plus size={20} style={{ transform: collapsed.seguridad ? 'none' : 'rotate(45deg)', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
                    </div>

                    {!collapsed.seguridad && (
                        <div style={{ padding: '0 24px 24px 24px' }}>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                                Actualiza tu contraseña para mantener tu cuenta segura.
                            </p>

                            <form onSubmit={handleUpdatePassword}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                    <div>
                                        <label>Nueva Contraseña</label>
                                        <input
                                            type="password"
                                            placeholder="Contraseña segura"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            required
                                            disabled={loading}
                                        />
                                    </div>
                                    <div>
                                        <label>Confirmar Contraseña</label>
                                        <input
                                            type="password"
                                            placeholder="Repite la contraseña"
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            required
                                            disabled={loading}
                                        />
                                    </div>
                                </div>
                                <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary-dark)', border: '1px solid var(--primary)' }}>
                                    Actualizar Contraseña
                                </button>
                            </form>
                        </div>
                    )}
                </div>
                {(role === 'administrador' || isSuperAdmin) && (
                    <>
                        {/* Datos Técnicos de la Finca y Umbrales */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div 
                                onClick={() => toggleSection('datosTecnicos')}
                                style={{ 
                                    padding: '20px 24px', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    background: collapsed.datosTecnicos ? 'transparent' : 'rgba(255,255,255,0.03)'
                                }}
                            >
                                <h3 style={{ margin: 0, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Home size={20} /> Datos Técnicos y Parámetros
                                </h3>
                                <Plus size={20} style={{ transform: collapsed.datosTecnicos ? 'none' : 'rotate(45deg)', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
                            </div>

                            {!collapsed.datosTecnicos && (
                                <div style={{ padding: '0 24px 24px 24px' }}>
                                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                                        Configure los datos geográficos y los umbrales de rendimiento para el semáforo de su hato.
                                    </p>

                                    <form onSubmit={guardarConfiguracionYFinca}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Maximize size={16} /> Área Total (Ha)</label>
                                                <input type="number" step="0.01" value={farmInfo.area_total} onChange={e => setFarmInfo({ ...farmInfo, area_total: e.target.value })} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle2 size={16} /> Área Aprovechable (Ha)</label>
                                                <input type="number" step="0.01" value={farmInfo.area_aprovechable} onChange={e => setFarmInfo({ ...farmInfo, area_aprovechable: e.target.value })} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={16} /> Ubicación</label>
                                                <input type="text" value={farmInfo.ubicacion} onChange={e => setFarmInfo({ ...farmInfo, ubicacion: e.target.value })} />
                                            </div>
                                            <div>
                                                <label>Propósito</label>
                                                <select value={farmInfo.proposito} onChange={e => setFarmInfo({ ...farmInfo, proposito: e.target.value })}>
                                                    <option value="">Seleccione...</option>
                                                    <option value="Doble propósito">Doble propósito</option>
                                                    <option value="producción de carne">Producción de carne</option>
                                                    <option value="Producción de leche">Producción de leche</option>
                                                    <option value="cría">Cría</option>
                                                    <option value="Levante">Levante</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label>Precio Venta (COP/kg)</label>
                                                <input type="number" value={farmInfo.precio_venta_promedio} onChange={e => setFarmInfo({ ...farmInfo, precio_venta_promedio: e.target.value })} />
                                            </div>
                                            <div>
                                                <label>Entrada Ceba (kg)</label>
                                                <input type="number" step="0.5" value={farmInfo.peso_entrada_ceba} onChange={e => setFarmInfo({ ...farmInfo, peso_entrada_ceba: e.target.value })} />
                                            </div>
                                        </div>

                                        <h4 style={{ color: 'white', marginBottom: '16px', fontSize: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>Configuración de Umbrales (Semáforo GMP)</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                            <div>
                                                <label>Umbral Bajo GDP (kg/día)</label>
                                                <input type="number" step="0.001" value={umbral} onChange={(e) => setUmbral(e.target.value)} />
                                            </div>
                                            <div>
                                                <label>Límite Superior Rojo (kg/mes)</label>
                                                <input type="number" step="0.1" value={umbralMedioGMP} onChange={(e) => setUmbralMedioGMP(e.target.value)} />
                                            </div>
                                            <div>
                                                <label>Límite Superior Amarillo (kg/mes)</label>
                                                <input type="number" step="0.1" value={umbralAltoGMP} onChange={(e) => setUmbralAltoGMP(e.target.value)} />
                                            </div>
                                        </div>

                                        <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary-dark)', border: '1px solid var(--primary)' }}>
                                            {loading ? 'Guardando...' : 'Guardar Datos y Parámetros'}
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>

                        {/* Gestión de Usuarios */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div 
                                onClick={() => toggleSection('usuarios')}
                                style={{ 
                                    padding: '20px 24px', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    background: collapsed.usuarios ? 'transparent' : 'rgba(255,255,255,0.03)'
                                }}
                            >
                                <h3 style={{ margin: 0, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={20} /> Gestión de Personal
                                </h3>
                                <Plus size={20} style={{ transform: collapsed.usuarios ? 'none' : 'rotate(45deg)', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
                            </div>

                            {!collapsed.usuarios && (
                                <div style={{ padding: '0 24px 24px 24px' }}>
                                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                                        Cree cuentas y asígnelas a una o varias de sus fincas simultáneamente.
                                    </p>

                                    <form onSubmit={handleCreateUser}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label>Correo Electrónico</label>
                                                <input
                                                    type="email"
                                                    placeholder="empleado@finca.com"
                                                    value={newUserEmail}
                                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                                    required
                                                    disabled={loading}
                                                />
                                            </div>
                                            <div>
                                                <label>Contraseña Temporal</label>
                                                <input
                                                    type="text"
                                                    placeholder="Contraseña segura"
                                                    value={newUserPass}
                                                    onChange={(e) => setNewUserPass(e.target.value)}
                                                    required
                                                    disabled={loading}
                                                />
                                            </div>
                                            <div>
                                                <label>Perfil / Rol</label>
                                                <select
                                                    value={newUserRole}
                                                    onChange={(e) => setNewUserRole(e.target.value as any)}
                                                    disabled={loading}
                                                >
                                                    <option value="vaquero">Trabajador / Vaquero</option>
                                                    <option value="observador">Visualizador / Observador</option>
                                                </select>
                                            </div>
                                        </div>

                                        <label style={{ marginBottom: '12px', display: 'block' }}>Asignar a Fincas:</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            {fincasAdmin.map(f => (
                                                <div
                                                    key={f.id_finca}
                                                    onClick={() => toggleFincaSelection(f.id_finca)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '10px',
                                                        padding: '8px 12px',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        backgroundColor: selectedFincas.includes(f.id_finca) ? 'rgba(76, 175, 80, 0.15)' : 'transparent',
                                                        border: '1px solid',
                                                        borderColor: selectedFincas.includes(f.id_finca) ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {selectedFincas.includes(f.id_finca) ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} color="var(--text-muted)" />}
                                                    <span style={{ fontSize: '0.9rem', color: selectedFincas.includes(f.id_finca) ? 'white' : 'var(--text-muted)' }}>{f.nombre_finca}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary)' }}>
                                            <UserPlus size={18} /> {loading ? 'Creando Usuario...' : 'Crear Usuario'}
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>

                        {/* Propietarios */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div 
                                onClick={() => toggleSection('propietarios')}
                                style={{ 
                                    padding: '20px 24px', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    background: collapsed.propietarios ? 'transparent' : 'rgba(255,255,255,0.03)'
                                }}
                            >
                                <h3 style={{ margin: 0, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={20} /> Propietarios de Ganado
                                </h3>
                                <Plus size={20} style={{ transform: collapsed.propietarios ? 'none' : 'rotate(45deg)', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
                            </div>

                            {!collapsed.propietarios && (
                                <div style={{ padding: '0 24px 24px 24px' }}>
                                    <form onSubmit={handleAddPropietario} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                                        <input type="text" placeholder="Nombre" value={nuevoPropietario} onChange={e => setNuevoPropietario(e.target.value)} style={{ marginBottom: 0 }} />
                                        <button type="submit" style={{ width: 'auto' }} disabled={loading || !nuevoPropietario.trim()}><Plus size={18} /></button>
                                    </form>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                        {propietarios.map(p => (
                                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                                <span>{p.nombre}</span>
                                                <button onClick={() => removePropietario(p.id)} style={{ background: 'transparent', width: 'auto', padding: 0 }}><Trash2 size={16} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Proveedores */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div onClick={() => toggleSection('proveedores')} style={{ padding: '20px 24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={20} /> Proveedores</h3>
                                <Plus size={20} style={{ transform: collapsed.proveedores ? 'none' : 'rotate(45deg)', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
                            </div>
                            {!collapsed.proveedores && (
                                <div style={{ padding: '0 24px 24px 24px' }}>
                                    <form onSubmit={handleAddProveedor} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                                        <input type="text" placeholder="Nombre" value={nuevoProveedor} onChange={e => setNuevoProveedor(e.target.value)} style={{ marginBottom: 0 }} />
                                        <button type="submit" style={{ width: 'auto' }} disabled={loading || !nuevoProveedor.trim()}><Plus size={18} /></button>
                                    </form>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                        {proveedores.map(p => (
                                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                                <span>{p.nombre}</span>
                                                <button onClick={() => removeProveedor(p.id)} style={{ background: 'transparent', width: 'auto', padding: 0 }}><Trash2 size={16} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Compradores */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div onClick={() => toggleSection('compradores')} style={{ padding: '20px 24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={20} /> Compradores</h3>
                                <Plus size={20} style={{ transform: collapsed.compradores ? 'none' : 'rotate(45deg)', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
                            </div>
                            {!collapsed.compradores && (
                                <div style={{ padding: '0 24px 24px 24px' }}>
                                    <form onSubmit={handleAddComprador} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                                        <input type="text" placeholder="Nombre" value={nuevoComprador} onChange={e => setNuevoComprador(e.target.value)} style={{ marginBottom: 0 }} />
                                        <button type="submit" style={{ width: 'auto' }} disabled={loading || !nuevoComprador.trim()}><Plus size={18} /></button>
                                    </form>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                                        {compradores.map(c => (
                                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                                <span>{c.nombre}</span>
                                                <button onClick={() => removeComprador(c.id)} style={{ background: 'transparent', width: 'auto', padding: 0 }}><Trash2 size={16} /></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>



                        {/* Cargas Masivas */}
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div onClick={() => toggleSection('cargasMasivas')} style={{ padding: '20px 24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}><Upload size={20} /> Carga Masiva (CSV)</h3>
                                <Plus size={20} style={{ transform: collapsed.cargasMasivas ? 'none' : 'rotate(45deg)', transition: 'transform 0.3s', color: 'var(--text-muted)' }} />
                            </div>
                            {!collapsed.cargasMasivas && (
                                <div style={{ padding: '0 24px 24px 24px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                                        <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontWeight: 'bold' }}>Inventario</span>
                                                <a href="/plantilla_animales.csv" download style={{ color: 'var(--primary-light)' }}><FileText size={16} /></a>
                                            </div>
                                            <input type="file" id="bulkAnimalSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkAnimalUpload} />
                                            <button onClick={() => document.getElementById('bulkAnimalSettings')?.click()} style={{ width: '100%' }} disabled={loading}>Subir Inventario</button>
                                        </div>
                                        <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontWeight: 'bold' }}>Pesajes</span>
                                                <a href="/plantilla_pesajes.csv" download style={{ color: 'var(--primary-light)' }}><FileText size={16} /></a>
                                            </div>
                                            <input type="file" id="bulkPesajeSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkPesajeUpload} />
                                            <button onClick={() => document.getElementById('bulkPesajeSettings')?.click()} style={{ width: '100%' }} disabled={loading}>Subir Pesajes</button>
                                        </div>
                                        <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontWeight: 'bold' }}>Rotaciones</span>
                                                <a href="/plantilla_rotaciones_potreros.csv" download style={{ color: 'var(--primary-light)' }}><FileText size={16} /></a>
                                            </div>
                                            <input type="file" id="bulkRotacionSettings" accept=".csv" style={{ display: 'none' }} onChange={handleBulkRotacionesUpload} />
                                            <button onClick={() => document.getElementById('bulkRotacionSettings')?.click()} style={{ width: '100%' }} disabled={loading}>Subir Rotaciones</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
