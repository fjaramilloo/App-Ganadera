import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Edit2, Scale, Calendar, Save, X, Plus, Trash2, Search, MapPin, TrendingUp, Info } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Potrerada {
    id: string;
    nombre: string;
    etapa: string;
    animalCount: number;
    pesoPromedio: number;
    diasPesajePromedio: number;
}

interface AnimalPotrero {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    id_potrerada: string | null;
    pesoActual: number;
    gdp?: number;
    gmp?: number;
}

interface ChartData {
    fecha: string;
    pesoPromedio: number;
    gmpPromedio: number;
}

export default function Potreradas() {
    const { fincaId } = useAuth();
    const [potreradas, setPotreradas] = useState<Potrerada[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingPotrerada, setEditingPotrerada] = useState<Potrerada | null>(null);
    const [newName, setNewName] = useState('');
    
    // Estados para gestión de animales
    const [managingPotrerada, setManagingPotrerada] = useState<Potrerada | null>(null);
    const [animalesFinca, setAnimalesFinca] = useState<AnimalPotrero[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [updatingAnimal, setUpdatingAnimal] = useState<string | null>(null);

    // Estados para el detalle de la potrerada
    const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailData, setDetailData] = useState<{
        potrerada: Potrerada;
        potreroActual: string;
        animales: AnimalPotrero[];
        gmpPromedioGrupo: number;
        history: ChartData[];
    } | null>(null);

    const fetchPotreradasData = async () => {
        if (!fincaId) return;
        setLoading(true);

        try {
            // 1. Obtener todas las potreradas de la finca
            const { data: pots, error: potsErr } = await supabase
                .from('potreradas')
                .select('*')
                .eq('id_finca', fincaId)
                .order('nombre', { ascending: true });

            if (potsErr) throw potsErr;

            // 2. Obtener todos los animales activos de la finca para agruparlos
            const { data: animals, error: animErr } = await supabase
                .from('animales')
                .select(`
                    id, 
                    numero_chapeta,
                    nombre_propietario,
                    id_potrerada,
                    peso_ingreso,
                    fecha_ingreso,
                    registros_pesaje (
                        peso,
                        fecha
                    )
                `)
                .eq('id_finca', fincaId)
                .eq('estado', 'activo');

            if (animErr) throw animErr;

            const animalesProcesados: AnimalPotrero[] = (animals || []).map((a: any) => {
                const registros = (a.registros_pesaje || []).sort((x: any, y: any) => 
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                return {
                    id: a.id,
                    numero_chapeta: a.numero_chapeta,
                    nombre_propietario: a.nombre_propietario,
                    id_potrerada: a.id_potrerada,
                    pesoActual: registros[0] ? registros[0].peso : a.peso_ingreso
                };
            });

            setAnimalesFinca(animalesProcesados);

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            const processedPots = pots.map((p: any) => {
                const groupAnimals = animals?.filter((a: any) => a.id_potrerada === p.id) || [];
                
                let totalPeso = 0;
                let totalDiasPesaje = 0;
                let validWeightCount = 0;
                let validDateCount = 0;

                groupAnimals.forEach((a: any) => {
                    const registros = (a.registros_pesaje || []).sort((x: any, y: any) => 
                        new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                    );
                    const lastP = registros[0];
                    
                    const pesoActual = lastP ? lastP.peso : a.peso_ingreso;
                    totalPeso += Number(pesoActual);
                    validWeightCount++;

                    const fechaRef = lastP ? new Date(lastP.fecha) : new Date(a.fecha_ingreso);
                    fechaRef.setHours(0,0,0,0);
                    const diff = differenceInDays(hoy, fechaRef);
                    totalDiasPesaje += diff;
                    validDateCount++;
                });

                return {
                    id: p.id,
                    nombre: p.nombre,
                    etapa: p.etapa,
                    animalCount: groupAnimals.length,
                    pesoPromedio: validWeightCount > 0 ? totalPeso / validWeightCount : 0,
                    diasPesajePromedio: validDateCount > 0 ? totalDiasPesaje / validDateCount : 0
                };
            });

            setPotreradas(processedPots);
        } catch (error) {
            console.error('Error fetching potreradas:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPotreradasData();
    }, [fincaId]);

    const handleEditClick = (p: Potrerada) => {
        setEditingPotrerada(p);
        setNewName(p.nombre);
    };

    const handleUpdateName = async () => {
        if (!editingPotrerada || !newName.trim()) return;

        try {
            const { error } = await supabase
                .from('potreradas')
                .update({ nombre: newName.trim() })
                .eq('id', editingPotrerada.id);

            if (error) throw error;

            setEditingPotrerada(null);
            fetchPotreradasData();
        } catch (error: any) {
            alert('Error al actualizar: ' + error.message);
        }
    };

    const handleAddAnimal = async (animalId: string) => {
        if (!managingPotrerada) return;
        setUpdatingAnimal(animalId);
        try {
            const { error } = await supabase
                .from('animales')
                .update({ id_potrerada: managingPotrerada.id })
                .eq('id', animalId);
            
            if (error) throw error;
            await fetchPotreradasData();
        } catch (error: any) {
            alert('Error al agregar animal: ' + error.message);
        } finally {
            setUpdatingAnimal(null);
        }
    };

    const handleRemoveAnimal = async (animalId: string) => {
        setUpdatingAnimal(animalId);
        try {
            const { error } = await supabase
                .from('animales')
                .update({ id_potrerada: null })
                .eq('id', animalId);
            
            if (error) throw error;
            await fetchPotreradasData();
        } catch (error: any) {
            alert('Error al eliminar animal: ' + error.message);
        } finally {
            setUpdatingAnimal(null);
        }
    };

    const filteredAnimalesFinca = animalesFinca.filter(a => {
        const matchesSearch = a.numero_chapeta.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             a.nombre_propietario.toLowerCase().includes(searchTerm.toLowerCase());
        const isNotAlreadyInThisPot = a.id_potrerada !== managingPotrerada?.id;
        return matchesSearch && isNotAlreadyInThisPot;
    });

    const animalesEnEstaPotrerada = animalesFinca.filter(a => a.id_potrerada === managingPotrerada?.id);

    const handleOpenDetail = async (p: Potrerada) => {
        setSelectedDetailId(p.id);
        setDetailLoading(true);
        try {
            // 1. Obtener animales de esta potrerada y sus pesajes
            const { data: animals, error: animErr } = await supabase
                .from('animales')
                .select(`
                    id,
                    numero_chapeta,
                    nombre_propietario,
                    peso_ingreso,
                    fecha_ingreso,
                    id_potrero_actual,
                    potreros (nombre),
                    registros_pesaje (
                        peso,
                        fecha,
                        gdp_calculada
                    )
                `)
                .eq('id_potrerada', p.id)
                .eq('estado', 'activo');

            if (animErr) throw animErr;

            // 2. Obtener el potrero actual de la potrerada (del último movimiento o de los animales)
            const firstAnimal = animals && animals.length > 0 ? (animals[0] as any) : null;
            const potreroName = firstAnimal?.potreros?.nombre || 'Sin potrero asignado';

            // 3. Procesar animales y sus métricas
            const processedAnimals: AnimalPotrero[] = (animals || []).map((a: any) => {
                const registros = (a.registros_pesaje || []).sort((x: any, y: any) => 
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                const gdp = registros[0]?.gdp_calculada || 0;
                return {
                    id: a.id,
                    numero_chapeta: a.numero_chapeta,
                    nombre_propietario: a.nombre_propietario,
                    id_potrerada: p.id,
                    pesoActual: registros[0] ? registros[0].peso : a.peso_ingreso,
                    gdp: gdp,
                    gmp: gdp * 30
                };
            });

            const avgGmp = processedAnimals.length > 0 
                ? processedAnimals.reduce((acc, curr) => acc + (curr.gmp || 0), 0) / processedAnimals.length
                : 0;

            // 4. Preparar datos para las gráficas (agrupar pesajes por fecha)
            const allWeighings: { fecha: string; peso: number; gdp: number }[] = [];
            animals?.forEach(a => {
                a.registros_pesaje?.forEach((r: any) => {
                    allWeighings.push({ fecha: r.fecha, peso: Number(r.peso), gdp: Number(r.gdp_calculada || 0) });
                });
            });

            const groupedByDate: { [key: string]: { totalPeso: number; totalGdp: number; count: number } } = {};
            allWeighings.forEach(w => {
                if (!groupedByDate[w.fecha]) {
                    groupedByDate[w.fecha] = { totalPeso: 0, totalGdp: 0, count: 0 };
                }
                groupedByDate[w.fecha].totalPeso += w.peso;
                groupedByDate[w.fecha].totalGdp += w.gdp;
                groupedByDate[w.fecha].count += 1;
            });

            const history: ChartData[] = Object.keys(groupedByDate)
                .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
                .map(date => ({
                    fecha: format(new Date(date), 'dd MMM', { locale: es }),
                    pesoPromedio: Math.round(groupedByDate[date].totalPeso / groupedByDate[date].count),
                    gmpPromedio: Number(( (groupedByDate[date].totalGdp / groupedByDate[date].count) * 30).toFixed(2))
                }));

            setDetailData({
                potrerada: p,
                potreroActual: potreroName,
                animales: processedAnimals,
                gmpPromedioGrupo: avgGmp,
                history
            });

        } catch (error: any) {
            alert('Error al cargar detalle: ' + error.message);
        } finally {
            setDetailLoading(false);
        }
    };

    return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="title">Gestión de Potreradas</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Métricas y administración de grupos de animales.</p>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--primary)' }}>Cargando potreradas...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                    {potreradas.map(p => (
                        <div key={p.id} className="card" style={{ padding: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                <div onClick={() => handleOpenDetail(p)} style={{ cursor: 'pointer' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--primary-light)', textDecoration: 'underline' }}>{p.nombre}</h3>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{p.etapa}</span>
                                </div>
                                <button 
                                    onClick={() => handleEditClick(p)}
                                    style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                                >
                                    <Edit2 size={16} />
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        <Users size={14} /> Animales
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{p.animalCount}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        <Scale size={14} /> Peso Prom.
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{Math.round(p.pesoPromedio)} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>kg</span></div>
                                </div>
                                <div style={{ gridColumn: '1 / -1', background: 'rgba(255,152,0,0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,152,0,0.1)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)', fontSize: '0.85rem', marginBottom: '4px' }}>
                                        <Calendar size={14} /> Días desde último pesaje (prom.)
                                    </div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>{Math.round(p.diasPesajePromedio)} <span style={{ fontSize: '0.9rem' }}>días</span></div>
                                </div>
                            </div>

                            <button
                                onClick={() => setManagingPotrerada(p)}
                                style={{ 
                                    marginTop: '20px', 
                                    width: '100%', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    gap: '10px',
                                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                                    border: '1px solid rgba(52, 152, 219, 0.3)',
                                    color: '#3498db'
                                }}
                            >
                                <Users size={16} /> Gestionar Animales
                            </button>
                        </div>
                    ))}
                    {potreradas.length === 0 && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                            No hay potreradas registradas en esta finca.
                        </div>
                    )}
                </div>
            )}

            {editingPotrerada && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0 }}>Editar Nombre</h2>
                            <button onClick={() => setEditingPotrerada(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <div style={{ marginBottom: '24px' }}>
                            <label>Nombre de la Potrerada</label>
                            <input 
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="Ej: Lote 1 - Engorde"
                                autoFocus
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setEditingPotrerada(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: 'none' }}>
                                Cancelar
                            </button>
                            <button onClick={handleUpdateName} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <Save size={18} /> Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {managingPotrerada && (
                /* ... Modal existente ... */
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    {/* (Contenido del modal de gestión ya modificado arriba, se mantiene igual) */}
                    <div className="card" style={{ width: '100%', maxWidth: '800px', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        {/* Header */}
                        <div style={{ padding: '32px 32px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <h2 style={{ margin: 0, color: 'var(--primary-light)' }}>
                                    Gestionar Animales: {managingPotrerada.nombre}
                                </h2>
                                <button onClick={() => { setManagingPotrerada(null); setSearchTerm(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                                    <X size={24} />
                                </button>
                            </div>
                            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
                                Etapa: <span style={{ color: 'var(--primary-light)', fontWeight: 'bold' }}>{managingPotrerada.etapa.toUpperCase()}</span> | Animales: {animalesEnEstaPotrerada.length}
                            </p>
                        </div>

                        {/* Content Area */}
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            
                            {/* Current Animals Column */}
                            <div style={{ background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={18} color="var(--primary-light)" /> Miembros Actuales
                                </h3>
                                
                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {animalesEnEstaPotrerada.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.9rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                                            No hay animales en esta potrerada.
                                        </div>
                                    ) : (
                                        animalesEnEstaPotrerada.map(a => (
                                            <div key={a.id} className="glass-panel" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)' }}>
                                                <div>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.nombre_propietario}</div>
                                                </div>
                                                <button 
                                                    disabled={updatingAnimal === a.id}
                                                    onClick={() => handleRemoveAnimal(a.id)}
                                                    style={{ 
                                                        background: 'rgba(231, 76, 60, 0.1)', 
                                                        color: '#e74c3c', 
                                                        padding: '8px', 
                                                        border: '1px solid rgba(231, 76, 60, 0.2)',
                                                        width: 'auto',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    {updatingAnimal === a.id ? '...' : <Trash2 size={16} />}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Add Animals Column */}
                            <div style={{ background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Plus size={18} color="var(--success)" /> Agregar Otros Animales
                                </h3>

                                <div style={{ position: 'relative', marginBottom: '16px' }}>
                                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                                    <input 
                                        type="text"
                                        placeholder="Buscar por chapeta o dueño..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{ paddingLeft: '36px', fontSize: '0.9rem', marginBottom: 0 }}
                                    />
                                </div>
                                
                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {filteredAnimalesFinca.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No se encontraron otros animales.
                                        </div>
                                    ) : (
                                        filteredAnimalesFinca.map(a => (
                                            <div key={a.id} className="glass-panel" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 'bold' }}>#{a.numero_chapeta}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {a.nombre_propietario} {a.id_potrerada ? `(En otra potrerada)` : ''}
                                                    </div>
                                                </div>
                                                <button 
                                                    disabled={updatingAnimal === a.id}
                                                    onClick={() => handleAddAnimal(a.id)}
                                                    style={{ 
                                                        background: 'rgba(46, 204, 113, 0.1)', 
                                                        color: '#2ecc71', 
                                                        padding: '8px', 
                                                        border: '1px solid rgba(46, 204, 113, 0.2)',
                                                        width: 'auto',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                >
                                                    {updatingAnimal === a.id ? '...' : <Plus size={16} />}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>
                            <button onClick={() => { setManagingPotrerada(null); setSearchTerm(''); }} style={{ width: 'auto', padding: '10px 30px' }}>
                                Cerrar Ventana
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedDetailId && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
                    <div className="card" style={{ width: '100%', maxWidth: '900px', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        {detailLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--primary)' }}>
                                Cargando información detallada...
                            </div>
                        ) : detailData ? (
                            <>
                                {/* Header */}
                                <div style={{ padding: '32px 32px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <h2 style={{ margin: '0 0 8px 0', color: 'var(--primary-light)', fontSize: '1.8rem' }}>
                                                {detailData.potrerada.nombre}
                                            </h2>
                                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                    <MapPin size={16} color="var(--primary)" /> Potrero Actual: <strong style={{color: 'var(--text)'}}>{detailData.potreroActual}</strong>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                    <TrendingUp size={16} color="var(--success)" /> GMP Promedio: <strong style={{color: 'var(--success)'}}>{detailData.gmpPromedioGrupo.toFixed(1)} kg/mes</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => setSelectedDetailId(null)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}>
                                            <X size={24} />
                                        </button>
                                    </div>
                                </div>

                                {/* Main Content (Scrollable) */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                                    
                                    {/* Gráficas Section */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                                        <div className="glass-panel" style={{ padding: '20px', height: '350px' }}>
                                            <h4 style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio por Pesaje (kg)</h4>
                                            {detailData.history.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="85%">
                                                    <LineChart data={detailData.history}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="fecha" stroke="var(--text-muted)" fontSize={12} />
                                                        <YAxis stroke="var(--text-muted)" fontSize={12} />
                                                        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                                        <Line type="monotone" dataKey="pesoPromedio" name="Peso (kg)" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary)', r: 4 }} activeDot={{ r: 6 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin datos históricos suficientes</div>
                                            )}
                                        </div>

                                        <div className="glass-panel" style={{ padding: '20px', height: '350px' }}>
                                            <h4 style={{ margin: '0 0 20px 0', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>GMP Promedio por Pesaje (kg/mes)</h4>
                                            {detailData.history.length > 1 ? (
                                                <ResponsiveContainer width="100%" height="85%">
                                                    <LineChart data={detailData.history.filter((_, idx) => idx > 0)}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                        <XAxis dataKey="fecha" stroke="var(--text-muted)" fontSize={12} />
                                                        <YAxis stroke="var(--text-muted)" fontSize={12} />
                                                        <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                                                        <Line type="monotone" dataKey="gmpPromedio" name="GMP (kg/m)" stroke="var(--success)" strokeWidth={3} dot={{ fill: 'var(--success)', r: 4 }} activeDot={{ r: 6 }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            ) : (
                                                <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Sin datos históricos suficientes</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Lista de Animales */}
                                    <h4 style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Info size={16} /> Detalle por Animal
                                    </h4>
                                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>CHAPETA</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>PROPIETARIO</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>PESO ACTUAL</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>GMP (kg/mes)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {detailData.animales.map((a, idx) => (
                                                    <tr key={a.id} style={{ borderBottom: idx < detailData.animales.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                                        <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>#{a.numero_chapeta}</td>
                                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{a.nombre_propietario}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold' }}>{Math.round(a.pesoActual)} kg</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                            <span style={{ 
                                                                color: (a.gmp || 0) > 20 ? 'var(--success)' : (a.gmp || 0) > 10 ? 'var(--warning)' : 'var(--error)',
                                                                fontWeight: 'bold'
                                                            }}>
                                                                {(a.gmp || 0).toFixed(1)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {detailData.animales.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                            Esta potrerada no tiene animales activos.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div style={{ padding: '20px 32px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>
                                    <button onClick={() => setSelectedDetailId(null)} style={{ width: 'auto', padding: '10px 30px' }}>
                                        Cerrar Detalle
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div style={{ padding: '40px', textAlign: 'center' }}>No se pudo cargar la información.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
