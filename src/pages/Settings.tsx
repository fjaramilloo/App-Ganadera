import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Settings as SettingsIcon, Upload, FileText, UserPlus, Users, CheckSquare, Square, Trash2, Plus, CheckCircle2, MapPin, Maximize, Home } from 'lucide-react';
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
    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');
    const [showExitoModal, setShowExitoModal] = useState(false);

    // Estados para creación de usuario
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPass, setNewUserPass] = useState('');
    const [newUserRole, setNewUserRole] = useState<'vaquero' | 'observador'>('vaquero');
    const [selectedFincas, setSelectedFincas] = useState<string[]>([]);

    // Estados para Propietarios
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoPropietario, setNuevoPropietario] = useState('');

    // Estados para Proveedores
    const [proveedores, setProveedores] = useState<{ id: string, nombre: string }[]>([]);
    const [nuevoProveedor, setNuevoProveedor] = useState('');

    // Estados para Potreradas
    const [potreradas, setPotreradas] = useState<{ id: string, nombre: string, etapa: string }[]>([]);
    const [nuevaPotreradaNombre, setNuevaPotreradaNombre] = useState('');
    const [nuevaPotreradaEtapa, setNuevaPotreradaEtapa] = useState('levante');

    // Estados para Rotaciones y Potreros (Eliminados, movidos a Rotations.tsx)

    // Estados para Información de la Finca
    const [farmInfo, setFarmInfo] = useState({
        area_total: '',
        area_aprovechable: '',
        ubicacion: '',
        proposito: ''
    });

    // Filtrar fincas donde el usuario es administrador
    const fincasAdmin = userFincas.filter(f => f.rol === 'administrador' || isSuperAdmin);

    const fetchConfig = async () => {
        if (!fincaId) return;
        const { data } = await supabase
            .from('configuracion_kpi')
            .select('umbral_bajo_gdp')
            .eq('id_finca', fincaId)
            .single();

        if (data) {
            setUmbral(data.umbral_bajo_gdp.toString());
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

    const fetchPotreradas = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('potreradas')
            .select('id, nombre, etapa')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (!error && data) setPotreradas(data);
    };


    const fetchFincaInfo = async () => {
        if (!fincaId) return;
        const { data, error } = await supabase
            .from('fincas')
            .select('area_total, area_aprovechable, ubicacion, proposito')
            .eq('id', fincaId)
            .single();

        if (!error && data) {
            setFarmInfo({
                area_total: data.area_total?.toString() || '',
                area_aprovechable: data.area_aprovechable?.toString() || '',
                ubicacion: data.ubicacion || '',
                proposito: data.proposito || ''
            });
        }
    };

    useEffect(() => {
        if (!fincaId) return;
        fetchConfig();
        fetchPropietarios();
        fetchProveedores();
        fetchPotreradas();
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

    const guardarConfiguracion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId) return;

        setLoading(true);
        setMsjExito('');

        const valorNum = parseFloat(umbral);

        const { error } = await supabase
            .from('configuracion_kpi')
            .upsert({ id_finca: fincaId, umbral_bajo_gdp: valorNum }, { onConflict: 'id_finca' });

        if (!error) {
            setMsjExito('Configuración guardada exitosamente.');
        }

        setLoading(false);
    };

    const guardarFincaInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId) return;

        setLoading(true);
        setMsjExito('');

        const { error } = await supabase
            .from('fincas')
            .update({
                area_total: farmInfo.area_total ? parseFloat(farmInfo.area_total) : null,
                area_aprovechable: farmInfo.area_aprovechable ? parseFloat(farmInfo.area_aprovechable) : null,
                ubicacion: farmInfo.ubicacion,
                proposito: farmInfo.proposito || null
            })
            .eq('id', fincaId);

        if (!error) {
            setMsjExito('Información de la finca actualizada correctamente.');
        } else {
            setMsjError('Error al actualizar la finca: ' + error.message);
        }

        setLoading(false);
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

    const handleAddPotrerada = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevaPotreradaNombre.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('potreradas')
                .insert({ id_finca: fincaId, nombre: nuevaPotreradaNombre.trim(), etapa: nuevaPotreradaEtapa });

            if (error) throw error;

            setNuevaPotreradaNombre('');
            fetchPotreradas();
            setMsjExito('Potrerada agregada correctamente.');
        } catch (err: any) {
            setMsjError('Error al agregar potrerada: ' + (err.code === '23505' ? 'Ya existe una potrerada con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const removePotrerada = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar esta potrerada? Tenga en cuenta que los animales perderán su referencia a la misma.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('potreradas').delete().eq('id', id);
            if (error) throw error;
            fetchPotreradas();
            setMsjExito('Potrerada eliminada.');
        } catch (err: any) {
            setMsjError('Error al eliminar potrerada: ' + err.message);
        } finally {
            setLoading(false);
        }
    };


    const handleBulkAnimalUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fincaId) return;

        setLoading(true);
        setMsjExito('');
        setMsjError('');

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const rows = results.data.map((row: any) => ({
                        id_finca: fincaId,
                        numero_chapeta: row.numero_chapeta?.toString().trim(),
                        nombre_propietario: row.propietario || 'Sin Datos',
                        especie: row.especie?.toLowerCase() || 'bovino',
                        sexo: row.sexo?.toUpperCase() || 'M',
                        etapa: row.etapa?.toLowerCase() || 'levante',
                        fecha_ingreso: parseFechaCol(row.fecha_ingreso) || new Date().toISOString().split('T')[0],
                        peso_ingreso: parseFloat(row.peso_ingreso) || 0,
                        estado: 'activo'
                    }));

                    const chapetas = rows.map((r: any) => r.numero_chapeta);
                    if (chapetas.some(c => !c)) throw new Error("Todas las filas deben tener un número de chapeta.");
                    if (new Set(chapetas).size !== chapetas.length) throw new Error("El archivo CSV contiene números de chapeta duplicados.");

                    // Validar contra la base de datos
                    const { data: existentes, error: checkError } = await supabase
                        .from('animales')
                        .select('numero_chapeta')
                        .eq('id_finca', fincaId)
                        .in('numero_chapeta', chapetas);

                    if (checkError) throw checkError;
                    if (existentes && existentes.length > 0) {
                        const caps = existentes.map(e => e.numero_chapeta).join(', ');
                        throw new Error(`Las siguientes chapetas ya existen en esta finca: ${caps}. Por favor corríjalas en su archivo.`);
                    }

                    const { data: nuevosAnimales, error } = await supabase.from('animales').insert(rows).select();
                    if (error) throw error;

                    if (nuevosAnimales && nuevosAnimales.length > 0) {
                        const pesajes = nuevosAnimales.map(anim => ({
                            id_animal: anim.id,
                            peso: anim.peso_ingreso,
                            fecha: anim.fecha_ingreso,
                            etapa: anim.etapa
                        }));
                        await supabase.from('registros_pesaje').insert(pesajes);
                    }

                    setMsjExito(`¡Carga masiva de animales completada! ${rows.length} animales registrados con su peso inicial.`);
                    setShowExitoModal(true);
                } catch (err: any) {
                    setMsjError('Error en carga de animales: ' + err.message);
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
            complete: async (results) => {
                try {
                    const { data: animalesData, error: animError } = await supabase
                        .from('animales')
                        .select('id, numero_chapeta, etapa')
                        .eq('id_finca', fincaId);

                    if (animError || !animalesData) throw new Error("No se pudieron cargar los datos de los animales");

                    const mapAnimales = new Map(animalesData.map(a => [a.numero_chapeta, { id: a.id, etapa: a.etapa }]));

                    const records: any[] = [];
                    const errores: string[] = [];

                    results.data.forEach((row: any, index: number) => {
                        const anim = mapAnimales.get(row.numero_chapeta);
                        if (!anim) {
                            errores.push(`Fila ${index + 2}: Chapeta ${row.numero_chapeta} no existe.`);
                            return;
                        }

                        const peso = parseFloat(row.peso);
                        const fecha = parseFechaCol(row.fecha) || new Date().toISOString().split('T')[0];

                        if (isNaN(peso) || peso <= 0) {
                            errores.push(`Fila ${index + 2}: Peso inválido.`);
                            return;
                        }

                        records.push({
                            id_animal: anim.id,
                            peso,
                            fecha,
                            etapa: anim.etapa
                        });
                    });

                    if (records.length === 0) {
                        throw new Error("El archivo no contenía datos válidos o compatibles con los animales de esta finca.");
                    }

                    const { error: insertError } = await supabase.from('registros_pesaje').insert(records);
                    if (insertError) throw insertError;

                    setMsjExito(`¡Carga exitosa! Se registraron ${records.length} seguimientos de pesaje.`);
                    setShowExitoModal(true);
                    if (errores.length > 0) {
                        setMsjError(`Se omitieron algunos registros:\n${errores.join('\n')}`);
                    }
                } catch (err: any) {
                    setMsjError(err.message || 'Error procesando el archivo CSV.');
                } finally {
                    setLoading(false);
                    e.target.value = '';
                }
            }
        });
    };

    if (role !== 'administrador') {
        return <div className="page-container text-center">Acceso denegado. Solo administradores pueden ver ajustes.</div>;
    }

    return (
        <div className="page-container" style={{ maxWidth: '800px' }}>
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'left', marginBottom: '32px' }}>
                <SettingsIcon size={32} /> Ajustes y Gestión de la Finca
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

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'pre-line' }}>{msjError}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>

                {/* Información de la Finca */}
                <div className="card">
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Home size={20} /> Datos Técnicos de la Finca
                    </h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                        Registre el área y el propósito principal de su explotación ganadera.
                    </p>

                    <form onSubmit={guardarFincaInfo}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Maximize size={16} /> Área Total (Hectáreas)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Ej: 50.5"
                                    value={farmInfo.area_total}
                                    onChange={e => setFarmInfo({ ...farmInfo, area_total: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={16} /> Área Aprovechable (Ha)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Ej: 45.0"
                                    value={farmInfo.area_aprovechable}
                                    onChange={e => setFarmInfo({ ...farmInfo, area_aprovechable: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MapPin size={16} /> Ubicación / Municipio
                                </label>
                                <input
                                    type="text"
                                    placeholder="Municipio, Departamento"
                                    value={farmInfo.ubicacion}
                                    onChange={e => setFarmInfo({ ...farmInfo, ubicacion: e.target.value })}
                                />
                            </div>
                            <div>
                                <label>Propósito de la Finca</label>
                                <select
                                    value={farmInfo.proposito}
                                    onChange={e => setFarmInfo({ ...farmInfo, proposito: e.target.value })}
                                >
                                    <option value="">Seleccione un propósito...</option>
                                    <option value="Doble propósito">Doble propósito</option>
                                    <option value="producción de carne">Producción de carne</option>
                                    <option value="Producción de leche">Producción de leche</option>
                                    <option value="cría">Cría</option>
                                    <option value="Levante">Levante</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--primary-dark)', border: '1px solid var(--primary)' }}>
                            Actualizar Información de Finca
                        </button>
                    </form>
                </div>

                {/* Gestión de Usuarios */}
                <div className="card">
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={20} /> Gestión de Personal Multi-Finca
                    </h3>
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

                        <label style={{ marginBottom: '12px', display: 'block' }}>Asignar a Fincas (Seleccione una o varias):</label>
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
                            <UserPlus size={18} /> {loading ? 'Creando Usuario...' : 'Crear Usuario y Asignar Fincas'}
                        </button>
                    </form>
                </div>

                {/* Gestión de Propietarios */}
                <div className="card">
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={20} /> Propietarios de Ganado
                    </h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                        Defina los posibles dueños de los animales para esta finca específica.
                    </p>

                    <form onSubmit={handleAddPropietario} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                        <input
                            type="text"
                            placeholder="Nombre del Propietario"
                            value={nuevoPropietario}
                            onChange={e => setNuevoPropietario(e.target.value)}
                            style={{ marginBottom: 0 }}
                            disabled={loading}
                        />
                        <button type="submit" style={{ width: 'auto' }} disabled={loading || !nuevoPropietario.trim()}>
                            <Plus size={18} /> Agregar
                        </button>
                    </form>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                        {propietarios.length === 0 ? (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                No hay propietarios definidos para esta finca.
                            </div>
                        ) : (
                            propietarios.map(p => (
                                <div key={p.id} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    backgroundColor: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{p.nombre}</span>
                                    <button
                                        onClick={() => removePropietario(p.id)}
                                        style={{ backgroundColor: 'transparent', padding: '4px', color: 'rgba(255,255,255,0.3)', width: 'auto' }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Gestión de Proveedores */}
                <div className="card">
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={20} /> Vendedores / Proveedores
                    </h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                        Defina los proveedores a quienes les compra el ganado.
                    </p>

                    <form onSubmit={handleAddProveedor} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                        <input
                            type="text"
                            placeholder="Nombre del Proveedor"
                            value={nuevoProveedor}
                            onChange={e => setNuevoProveedor(e.target.value)}
                            style={{ marginBottom: 0 }}
                            disabled={loading}
                        />
                        <button type="submit" style={{ width: 'auto' }} disabled={loading || !nuevoProveedor.trim()}>
                            <Plus size={18} /> Agregar
                        </button>
                    </form>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                        {proveedores.length === 0 ? (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                No hay proveedores definidos para esta finca.
                            </div>
                        ) : (
                            proveedores.map(p => (
                                <div key={p.id} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    backgroundColor: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{p.nombre}</span>
                                    <button
                                        onClick={() => removeProveedor(p.id)}
                                        style={{ backgroundColor: 'transparent', padding: '4px', color: 'rgba(255,255,255,0.3)', width: 'auto' }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Gestión de Potreradas */}
                <div className="card">
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={20} /> Potreradas (Grupos de Animales)
                    </h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                        Defina los grupos formales (potreradas) y asígneles una etapa productiva.
                    </p>

                    <form onSubmit={handleAddPotrerada} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Nombre (ej. Lote 1)"
                            value={nuevaPotreradaNombre}
                            onChange={e => setNuevaPotreradaNombre(e.target.value)}
                            style={{ marginBottom: 0, flex: '1 1 200px' }}
                            disabled={loading}
                        />
                        <select
                            value={nuevaPotreradaEtapa}
                            onChange={e => setNuevaPotreradaEtapa(e.target.value)}
                            style={{ marginBottom: 0, flex: '1 1 150px' }}
                            disabled={loading}
                        >
                            <option value="cria">Cría</option>
                            <option value="levante">Levante</option>
                            <option value="ceba">Ceba</option>
                        </select>
                        <button type="submit" style={{ width: 'auto' }} disabled={loading || !nuevaPotreradaNombre.trim()}>
                            <Plus size={18} /> Agregar
                        </button>
                    </form>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                        {potreradas.length === 0 ? (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '20px', color: 'var(--text-muted)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                                No hay potreradas definidas para esta finca.
                            </div>
                        ) : (
                            potreradas.map(p => (
                                <div key={p.id} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    backgroundColor: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>{p.nombre}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>Etapa: {p.etapa}</span>
                                    </div>
                                    <button
                                        onClick={() => removePotrerada(p.id)}
                                        style={{ backgroundColor: 'transparent', padding: '4px', color: 'rgba(255,255,255,0.3)', width: 'auto' }}
                                        onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Parámetros */}
                <div className="card">
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary-light)' }}>Umbrales Zootécnicos</h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                        Configure los parámetros para el semáforo de rendimiento en el hato.
                    </p>

                    <form onSubmit={guardarConfiguracion}>
                        <label>Umbral Bajo GDP (kg/día)</label>
                        <input
                            type="number"
                            step="0.001"
                            value={umbral}
                            onChange={(e) => setUmbral(e.target.value)}
                            disabled={loading}
                        />
                        <button type="submit" disabled={loading} style={{ marginTop: '16px' }}>
                            {loading ? 'Guardando...' : 'Guardar Parámetros'}
                        </button>
                    </form>
                </div>

                {/* Cargas Masivas */}
                <div className="card">
                    <h3 style={{ marginBottom: '16px', color: 'var(--primary-light)' }}>Importación de Datos (Carga Masiva)</h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9em' }}>
                        Utilice archivos CSV para registrar grandes volúmenes de datos de una sola vez.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                        <div style={{ padding: '20px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 'bold' }}>Animales</span>
                                <a href="/plantilla_animales.csv" download style={{ textDecoration: 'none', color: 'var(--primary-light)' }}><FileText size={16} /></a>
                            </div>
                            <input
                                type="file"
                                id="bulkAnimalSettings"
                                accept=".csv"
                                style={{ display: 'none' }}
                                onChange={handleBulkAnimalUpload}
                            />
                            <button
                                onClick={() => document.getElementById('bulkAnimalSettings')?.click()}
                                style={{ width: '100%', fontSize: '0.9rem', padding: '10px' }}
                                disabled={loading}
                            >
                                <Upload size={16} /> Subir Inventario
                            </button>
                        </div>

                        <div style={{ padding: '20px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 'bold' }}>Seguimiento</span>
                                <a href="/plantilla_pesajes.csv" download style={{ textDecoration: 'none', color: 'var(--primary-light)' }}><FileText size={16} /></a>
                            </div>
                            <input
                                type="file"
                                id="bulkPesajeSettings"
                                accept=".csv"
                                style={{ display: 'none' }}
                                onChange={handleBulkPesajeUpload}
                            />
                            <button
                                onClick={() => document.getElementById('bulkPesajeSettings')?.click()}
                                style={{ width: '100%', fontSize: '0.9rem', padding: '10px' }}
                                disabled={loading}
                            >
                                <Upload size={16} /> Subir Pesajes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
