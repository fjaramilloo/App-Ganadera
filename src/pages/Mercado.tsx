import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, ArrowRight, AlertTriangle, RotateCcw, X, MapPin, ArrowUpDown } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface AnimalMercado {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    etapa: string;
    peso_ingreso: number;
    fecha_ingreso: string;
    id_potrerada: string | null;
    id_potrero_actual: string | null;
    nombre_potrero: string;
    ultimo_peso: number;
    fecha_ultimo_peso: string;
    diasUltimoPesaje: number;
    seleccionado?: boolean;
}

interface Potrero {
    id: string;
    nombre: string;
}

export default function Mercado() {
    const { fincaId, role } = useAuth();
    const [animales, setAnimales] = useState<AnimalMercado[]>([]);
    const [loading, setLoading] = useState(true);
    const [potreros, setPotreros] = useState<Potrero[]>([]);

    // Modal Pasar a Ceba
    const [showModal, setShowModal] = useState(false);
    const [nombrePotrerada, setNombrePotrerada] = useState('');
    const [potreroSeleccionado, setPotreroSeleccionado] = useState('');
    const [animalesSeleccionados, setAnimalesSeleccionados] = useState<Set<string>>(new Set());
    const [creando, setCreando] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    // Ordenamiento
    const [sortBy, setSortBy] = useState('ultimo_peso');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder(['ultimo_peso', 'diasUltimoPesaje'].includes(field) ? 'desc' : 'asc');
        }
    };

    const sortedAnimals = [...animales].sort((a, b) => {
        let res = 0;
        if (sortBy === 'chapeta') {
            res = a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true });
        } else if (sortBy === 'propietario') {
            res = a.nombre_propietario.localeCompare(b.nombre_propietario);
        } else if (sortBy === 'potrero') {
            res = a.nombre_potrero.localeCompare(b.nombre_potrero);
        } else if (sortBy === 'ultimo_peso') {
            res = a.ultimo_peso - b.ultimo_peso;
        } else if (sortBy === 'fecha_pesaje') {
            res = new Date(a.fecha_ultimo_peso).getTime() - new Date(b.fecha_ultimo_peso).getTime();
        } else if (sortBy === 'diasUltimoPesaje') {
            res = a.diasUltimoPesaje - b.diasUltimoPesaje;
        }
        return sortOrder === 'asc' ? res : -res;
    });

    const fetchData = async () => {
        if (!fincaId) return;
        setLoading(true);

        const { data: animData } = await supabase
            .from('animales')
            .select(`
                id, numero_chapeta, nombre_propietario, etapa,
                peso_ingreso, fecha_ingreso, id_potrerada, id_potrero_actual,
                potreros (nombre),
                registros_pesaje (peso, fecha)
            `)
            .eq('id_finca', fincaId)
            .eq('ok_ceba', true)
            .eq('etapa', 'levante')
            .eq('estado', 'activo');

        const { data: potData } = await supabase
            .from('potreros')
            .select('id, nombre')
            .eq('id_finca', fincaId)
            .order('nombre');

        if (potData) setPotreros(potData);

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const processed = (animData || []).map((a: any) => {
            const registros = (a.registros_pesaje || []).sort((x: any, y: any) =>
                new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
            );
            const last = registros[0];
            const fechaRef = last ? new Date(last.fecha) : new Date(a.fecha_ingreso);
            fechaRef.setHours(0, 0, 0, 0);
            return {
                id: a.id,
                numero_chapeta: a.numero_chapeta,
                nombre_propietario: a.nombre_propietario,
                etapa: a.etapa,
                peso_ingreso: a.peso_ingreso,
                fecha_ingreso: a.fecha_ingreso,
                id_potrerada: a.id_potrerada,
                id_potrero_actual: a.id_potrero_actual,
                nombre_potrero: a.potreros?.nombre || 'N/A',
                ultimo_peso: last ? last.peso : a.peso_ingreso,
                fecha_ultimo_peso: last ? last.fecha : a.fecha_ingreso,
                diasUltimoPesaje: differenceInDays(hoy, fechaRef)
            };
        });

        setAnimales(processed);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [fincaId]);

    const toggleAnimal = (id: string) => {
        setAnimalesSeleccionados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const seleccionarTodos = () => {
        setAnimalesSeleccionados(new Set(animales.map(a => a.id)));
    };

    const handleOpenModal = () => {
        setAnimalesSeleccionados(new Set());
        setNombrePotrerada('');
        setPotreroSeleccionado('');
        setMsjError('');
        setShowModal(true);
    };

    const handlePasarACeba = async () => {
        if (!fincaId || !nombrePotrerada.trim() || !potreroSeleccionado || animalesSeleccionados.size === 0) {
            setMsjError('Complete todos los campos y seleccione al menos un animal.');
            return;
        }
        setCreando(true);
        setMsjError('');

        try {
            // 1. Crear la nueva potrerada en etapa ceba
            const { data: nuevaPotrerada, error: errPot } = await supabase
                .from('potreradas')
                .insert({ id_finca: fincaId, nombre: nombrePotrerada.trim(), etapa: 'ceba' })
                .select()
                .single();

            if (errPot) throw new Error('Error al crear potrerada: ' + errPot.message);

            const ids = Array.from(animalesSeleccionados);

            // 2. Actualizar los animales: cambiar etapa a ceba, asignar nueva potrerada y potrero, limpiar ok_ceba
            const { error: errUpdate } = await supabase
                .from('animales')
                .update({
                    etapa: 'ceba',
                    id_potrerada: nuevaPotrerada.id,
                    id_potrero_actual: potreroSeleccionado,
                    ok_ceba: false
                })
                .in('id', ids);

            if (errUpdate) throw new Error('Error al actualizar animales: ' + errUpdate.message);

            // 3. Registrar un único movimiento de potrero para la nueva potrerada
            const hoy = new Date().toISOString().split('T')[0];
            await supabase.from('movimientos_potreros').insert({
                id_finca: fincaId,
                id_potrerada: nuevaPotrerada.id,
                id_potrero: potreroSeleccionado,
                fecha_entrada: hoy
            });

            setShowModal(false);
            setMsjExito(`¡Potrerada "${nombrePotrerada}" creada con ${ids.length} animales en etapa Ceba!`);
            await fetchData();
        } catch (err: any) {
            setMsjError(err.message);
        } finally {
            setCreando(false);
        }
    };

    const handleDevolverALevante = async () => {
        if (!fincaId) return;
        const confirm = window.confirm(`¿Seguro que deseas eliminar la marca de ${animales.length} animales y devolverlos a la lista de levante?`);
        if (!confirm) return;

        setLoading(true);
        const ids = animales.map(a => a.id);
        await supabase
            .from('animales')
            .update({ ok_ceba: false })
            .in('id', ids);
        await fetchData();
        setMsjExito('Animales devueltos a levante correctamente.');
    };

    if (loading) {
        return (
            <div className="page-container" style={{ textAlign: 'center', paddingTop: '80px' }}>
                <div style={{ color: 'var(--primary)' }}>Cargando animales disponibles...</div>
            </div>
        );
    }

    return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="title" style={{ margin: 0 }}>Mercado de Ceba</h1>
                    <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
                        Animales con peso ≥ umbral de entrada a ceba.
                    </p>
                </div>
                {(role === 'administrador' || role === 'vaquero') && animales.length > 0 && (
                    <button
                        onClick={handleOpenModal}
                        style={{ backgroundColor: '#2e7d32', border: '1px solid #4caf50', color: 'white', display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 28px', fontSize: '1rem', width: 'auto' }}
                    >
                        <ArrowRight size={20} /> Pasar a Ceba
                    </button>
                )}
            </div>

            {msjExito && (
                <div style={{ backgroundColor: 'rgba(76,175,80,0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', fontWeight: 'bold' }}>
                    {msjExito}
                </div>
            )}

            {animales.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                    <CheckCircle2 size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                    <p>No hay animales con marca de ceba activa en este momento.</p>
                    <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>Se actualizará automáticamente durante los pesajes del día.</p>
                </div>
            ) : (
                <>
                    {/* Tabla de animales */}
                    <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '24px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <th onClick={() => handleSort('chapeta')} style={{ padding: '16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Chapeta <ArrowUpDown size={12} opacity={sortBy === 'chapeta' ? 1 : 0.4} />
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('propietario')} style={{ padding: '16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Propietario <ArrowUpDown size={12} opacity={sortBy === 'propietario' ? 1 : 0.4} />
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('potrero')} style={{ padding: '16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Potrero <ArrowUpDown size={12} opacity={sortBy === 'potrero' ? 1 : 0.4} />
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('ultimo_peso')} style={{ padding: '16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                            Peso Actual <ArrowUpDown size={12} opacity={sortBy === 'ultimo_peso' ? 1 : 0.4} />
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('fecha_pesaje')} style={{ padding: '16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                            Fecha Pesaje <ArrowUpDown size={12} opacity={sortBy === 'fecha_pesaje' ? 1 : 0.4} />
                                        </div>
                                    </th>
                                    <th onClick={() => handleSort('diasUltimoPesaje')} style={{ padding: '16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                            Días sin pesar <ArrowUpDown size={12} opacity={sortBy === 'diasUltimoPesaje' ? 1 : 0.4} />
                                        </div>
                                    </th>
                                    <th style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedAnimals.map((a, i) => (
                                    <tr key={a.id} style={{ borderBottom: i < animales.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                        <td style={{ padding: '16px', fontWeight: 'bold', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</td>
                                        <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{a.nombre_propietario}</td>
                                        <td style={{ padding: '16px', color: 'var(--text-muted)' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <MapPin size={14} style={{ opacity: 0.6 }} /> {a.nombre_potrero}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold' }}>{a.ultimo_peso} kg</td>
                                        <td style={{ padding: '16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            {format(new Date(a.fecha_ultimo_peso), 'dd/MM/yyyy')}
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right', color: a.diasUltimoPesaje > 30 ? 'var(--warning)' : 'var(--text-muted)' }}>
                                            {a.diasUltimoPesaje}d
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center' }}>
                                            <span style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--success)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                ✓ Listo Ceba
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Botón devolver a levante */}
                    {(role === 'administrador' || role === 'vaquero') && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleDevolverALevante}
                                style={{ backgroundColor: 'rgba(244,67,54,0.15)', border: '1px solid rgba(244,67,54,0.4)', color: '#ef5350', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', width: 'auto' }}
                            >
                                <RotateCcw size={18} /> Devolver a Levante
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Modal Pasar a Ceba */}
            {showModal && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '560px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, color: 'var(--primary-light)' }}>Crear Potrerada de Ceba</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                                <X size={24} />
                            </button>
                        </div>

                        {msjError && (
                            <div style={{ backgroundColor: 'rgba(244,67,54,0.15)', color: '#ef5350', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                                <AlertTriangle size={16} /> {msjError}
                            </div>
                        )}

                        <div style={{ marginBottom: '20px' }}>
                            <label>Nombre de la nueva Potrerada</label>
                            <input
                                type="text"
                                value={nombrePotrerada}
                                onChange={e => setNombrePotrerada(e.target.value)}
                                placeholder="Ej: Lote Ceba - Marzo 2025"
                                autoFocus
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label>Potrero de destino</label>
                            <select
                                value={potreroSeleccionado}
                                onChange={e => setPotreroSeleccionado(e.target.value)}
                            >
                                <option value="">-- Seleccionar potrero --</option>
                                {potreros.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <label style={{ margin: 0 }}>Seleccionar Animales ({animalesSeleccionados.size}/{animales.length})</label>
                                <button
                                    type="button"
                                    onClick={seleccionarTodos}
                                    style={{ background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.3)', color: 'var(--success)', padding: '6px 14px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', width: 'auto' }}
                                >
                                    Todos
                                </button>
                            </div>
                            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                                {animales.map(a => (
                                    <label
                                        key={a.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px 16px',
                                            background: animalesSeleccionados.has(a.id) ? 'rgba(76,175,80,0.1)' : 'rgba(255,255,255,0.03)',
                                            border: animalesSeleccionados.has(a.id) ? '1px solid rgba(76,175,80,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={animalesSeleccionados.has(a.id)}
                                            onChange={() => toggleAnimal(a.id)}
                                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer', margin: 0, flex: 'none' }}
                                        />
                                        <span style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flex: 1 }}>{a.nombre_propietario}</span>
                                        <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem' }}>{a.ultimo_peso} kg</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => setShowModal(false)}
                                style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handlePasarACeba}
                                disabled={creando || animalesSeleccionados.size === 0 || !nombrePotrerada.trim() || !potreroSeleccionado}
                                style={{ flex: 1, backgroundColor: '#2e7d32', border: '1px solid #4caf50', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                {creando ? 'Creando...' : <><ArrowRight size={18} /> Confirmar Pase a Ceba</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
