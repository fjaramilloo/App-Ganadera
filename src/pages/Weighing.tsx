import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Save, PlusCircle } from 'lucide-react';

interface AnimalPreview {
    id: string;
    numero_chapeta: string;
    peso_ingreso: number;
    etapa: string;
}

export default function Weighing() {
    const { fincaId } = useAuth();
    const [chapeta, setChapeta] = useState('');
    const [animal, setAnimal] = useState<AnimalPreview | null>(null);
    const [nuevoPeso, setNuevoPeso] = useState('');

    // Estados para la creación
    const [animalNoEncontrado, setAnimalNoEncontrado] = useState(false);
    const [showCrearAnimal, setShowCrearAnimal] = useState(false);
    const [propietarioNuevo, setPropietarioNuevo] = useState('');
    const [fechaIngresoNueva, setFechaIngresoNueva] = useState(new Date().toISOString().split('T')[0]);
    const [pesoIngresoNuevo, setPesoIngresoNuevo] = useState('');

    // Lista de propietarios cargados desde la base de datos
    const [propietarios, setPropietarios] = useState<{ id: string, nombre: string }[]>([]);

    const [loading, setLoading] = useState(false);
    const [msjError, setMsjError] = useState('');
    const [msjExito, setMsjExito] = useState('');

    useEffect(() => {
        if (!fincaId) return;
        const fetchPropietarios = async () => {
            const { data } = await supabase
                .from('propietarios')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) setPropietarios(data);
        };
        fetchPropietarios();
    }, [fincaId]);

    const buscarAnimal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !chapeta.trim()) return;

        setLoading(true);
        setMsjError('');
        setMsjExito('');
        setAnimal(null);
        setAnimalNoEncontrado(false);
        setShowCrearAnimal(false);

        const { data, error } = await supabase
            .from('animales')
            .select('id, numero_chapeta, peso_ingreso, etapa')
            .eq('id_finca', fincaId)
            .eq('numero_chapeta', chapeta.trim())
            .single();

        if (error || !data) {
            setAnimalNoEncontrado(true);
            setMsjError('Animal no encontrado. Puede revisar la chapeta o crear uno nuevo.');
        } else {
            setAnimal(data);
        }
        setLoading(false);
    };

    const crearRegistroAnimal = async () => {
        if (!fincaId || !chapeta.trim() || !propietarioNuevo || !pesoIngresoNuevo) return;
        setLoading(true);
        setMsjError('');

        try {
            const pesoFloat = parseFloat(pesoIngresoNuevo);
            if (isNaN(pesoFloat) || pesoFloat <= 0) {
                throw new Error('El peso inicial debe ser mayor a 0');
            }

            const insertData = {
                id_finca: fincaId,
                numero_chapeta: chapeta.trim(),
                nombre_propietario: propietarioNuevo,
                especie: 'bovino',
                sexo: 'M',
                etapa: 'levante',
                fecha_ingreso: fechaIngresoNueva,
                peso_ingreso: pesoFloat,
                estado: 'activo'
            };

            const { data, error } = await supabase.from('animales').insert(insertData).select().single();

            if (error) throw error;

            // REGISTRO DE PESAJE INICIAL
            await supabase.from('registros_pesaje').insert({
                id_animal: data.id,
                peso: pesoFloat,
                fecha: fechaIngresoNueva,
                etapa: 'levante'
            });

            setMsjExito(`¡Animal #${chapeta} creado exitosamente! Su peso inicial ha sido registrado.`);

            setAnimal({
                id: data.id,
                numero_chapeta: data.numero_chapeta,
                peso_ingreso: data.peso_ingreso,
                etapa: data.etapa
            });
            setAnimalNoEncontrado(false);
            setShowCrearAnimal(false);
            setNuevoPeso(pesoIngresoNuevo);

        } catch (err: any) {
            setMsjError(err.message || 'Error al crear el animal.');
        } finally {
            setLoading(false);
        }
    };

    const guardarPesaje = async () => {
        if (!animal || !fincaId || !nuevoPeso) return;
        setLoading(true);
        setMsjError('');

        try {
            const pesoFloat = parseFloat(nuevoPeso);
            if (isNaN(pesoFloat) || pesoFloat <= 0) {
                throw new Error('El peso debe ser un número mayor a 0');
            }

            const { error } = await supabase.from('registros_pesaje').insert({
                id_animal: animal.id,
                peso: pesoFloat,
                fecha: new Date().toISOString().split('T')[0],
                etapa: animal.etapa
            });

            if (error) throw error;

            setMsjExito(`¡Pesaje de ${pesoFloat}kg guardado para la chapeta #${animal.numero_chapeta}!`);
            setAnimal(null);
            setChapeta('');
            setNuevoPeso('');
        } catch (err: any) {
            setMsjError(err.message || 'Error al guardar el pesaje');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container" style={{ maxWidth: '600px' }}>
            <h1 className="title text-center" style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Registro de Pesaje</h1>
            <p className="text-center" style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Busque al animal para registrar el peso actual.</p>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div className="error-message text-center" style={{ fontWeight: 'bold' }}>{msjError}</div>}

            <div className="card" style={{ padding: '32px' }}>
                <form onSubmit={buscarAnimal} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: animal || showCrearAnimal ? '32px' : '0' }}>
                    <div style={{ flex: '1 1 200px', position: 'relative' }}>
                        <Search size={24} style={{ position: 'absolute', left: '16px', top: '16px', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Nro. Chapeta"
                            value={chapeta}
                            onChange={(e) => setChapeta(e.target.value)}
                            style={{ fontSize: '1.5rem', padding: '16px 16px 16px 56px', marginBottom: 0 }}
                            disabled={loading || showCrearAnimal}
                            autoFocus
                        />
                    </div>
                    <button type="submit" disabled={loading || showCrearAnimal} style={{ width: 'auto', padding: '0 32px', fontSize: '1.2rem', flex: '1 1 120px' }}>
                        Buscar
                    </button>
                </form>

                {animalNoEncontrado && !showCrearAnimal && !animal && (
                    <div style={{ textAlign: 'center', marginTop: '24px', padding: '24px', border: '1px dashed var(--warning)', borderRadius: '8px' }}>
                        <p style={{ color: 'white', marginBottom: '16px' }}>El animal no está en la base de datos.</p>
                        <button
                            type="button"
                            onClick={() => { setShowCrearAnimal(true); setMsjError(''); }}
                            style={{ width: 'auto', backgroundColor: 'var(--warning)', color: '#000', margin: '0 auto' }}
                        >
                            <PlusCircle size={20} /> Crear Animal Ahora
                        </button>
                    </div>
                )}

                {showCrearAnimal && !animal && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px', marginTop: '16px' }}>
                        <h3 style={{ color: 'var(--warning)', marginBottom: '16px', fontSize: '1.2rem' }}>Registro Rápido: #{chapeta}</h3>

                        <label>Seleccionar Propietario</label>
                        {propietarios.length > 0 ? (
                            <select
                                value={propietarioNuevo}
                                onChange={e => setPropietarioNuevo(e.target.value)}
                                required
                            >
                                <option value="">-- Elija un propietario --</option>
                                {propietarios.map(p => (
                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                        ) : (
                            <div style={{ padding: '12px', marginBottom: '16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', fontSize: '0.9rem', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                No hay propietarios configurados en esta finca. Vaya a <b>Ajustes</b> para crearlos.
                                <input
                                    type="text"
                                    placeholder="Nombre del propietario (Manual)"
                                    value={propietarioNuevo}
                                    style={{ marginTop: '12px' }}
                                    onChange={e => setPropietarioNuevo(e.target.value)}
                                />
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ flex: 1 }}>
                                <label>Fecha de Ingreso</label>
                                <input
                                    type="date"
                                    value={fechaIngresoNueva}
                                    onChange={e => setFechaIngresoNueva(e.target.value)}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label>Peso de Ingreso (kg)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="Ej 180"
                                    value={pesoIngresoNuevo}
                                    onChange={e => setPesoIngresoNuevo(e.target.value)}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button type="button" onClick={() => setShowCrearAnimal(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={crearRegistroAnimal} disabled={!propietarioNuevo || !pesoIngresoNuevo || loading}>
                                {loading ? 'Creando...' : 'Crear y Continuar'}
                            </button>
                        </div>
                    </div>
                )}

                {animal && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px', marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
                            <div>
                                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Animal Encontrado</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>#{animal.numero_chapeta}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>Etapa Actual</div>
                                <div style={{ fontSize: '1.2rem', textTransform: 'capitalize' }}>{animal.etapa}</div>
                            </div>
                        </div>

                        <label style={{ fontSize: '1.2rem', color: 'white', marginBottom: '12px' }}>Nuevo Peso (kg)</label>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <input
                                type="number"
                                inputMode="decimal"
                                step="0.1"
                                placeholder="Ej. 350.5"
                                value={nuevoPeso}
                                onChange={(e) => setNuevoPeso(e.target.value)}
                                style={{ fontSize: '2rem', padding: '20px', textAlign: 'center', marginBottom: 0, flex: '1 1 200px' }}
                                disabled={loading}
                            />
                            <button
                                type="button"
                                onClick={guardarPesaje}
                                disabled={loading || !nuevoPeso}
                                style={{ width: 'auto', padding: '0 40px', fontSize: '1.2rem', display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 120px' }}
                            >
                                <Save size={28} />
                                <span style={{ fontSize: '0.8rem' }}>Guardar</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
