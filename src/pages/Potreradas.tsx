import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Edit2, Calendar, Save, X, Plus, Trash2, Search, MapPin, TrendingUp, Info } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Potrerada {
    id: string;
    nombre: string;
    etapa: string;
    animalCount: number;
    pesoPromedio: number;
    gmpPromedio: number;
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
    const { fincaId, role } = useAuth();
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
                        fecha,
                        gdp_calculada,
                        gmp_calculada
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
                let totalGmp = 0;
                let totalDiasPesaje = 0;
                let validWeightCount = 0;
                let validGmpCount = 0;
                let validDateCount = 0;

                groupAnimals.forEach((a: any) => {
                    const registros = (a.registros_pesaje || []).sort((x: any, y: any) => 
                        new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                    );
                    const lastP = registros[0];
                    
                    const pesoActual = lastP ? lastP.peso : a.peso_ingreso;
                    totalPeso += Number(pesoActual);
                    validWeightCount++;

                    // Usar gmp_calculada si existe, sino intentar con gdp_calculada * 30
                    if (lastP) {
                        const gmp = lastP.gmp_calculada || (lastP.gdp_calculada ? lastP.gdp_calculada * 30 : 0);
                        if (gmp !== 0) {
                            totalGmp += Number(gmp);
                            validGmpCount++;
                        }

                        const fechaRef = new Date(lastP.fecha);
                        fechaRef.setHours(0,0,0,0);
                        const diff = differenceInDays(hoy, fechaRef);
                        totalDiasPesaje += diff;
                        validDateCount++;
                    } else {
                        const fechaRef = new Date(a.fecha_ingreso);
                        fechaRef.setHours(0,0,0,0);
                        const diff = differenceInDays(hoy, fechaRef);
                        totalDiasPesaje += diff;
                        validDateCount++;
                    }
                });

                return {
                    id: p.id,
                    nombre: p.nombre,
                    etapa: p.etapa,
                    animalCount: groupAnimals.length,
                    pesoPromedio: validWeightCount > 0 ? totalPeso / validWeightCount : 0,
                    gmpPromedio: validGmpCount > 0 ? totalGmp / validGmpCount : 0,
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
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nombre Potrerada</th>
                                <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Animales</th>
                                <th className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio</th>
                                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>GMP Promedio</th>
                                <th className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Días Pesaje</th>
                                {role === 'administrador' && <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {potreradas.map((p, idx) => (
                                <tr key={p.id} className="table-row-hover" style={{ borderBottom: idx < potreradas.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div onClick={() => handleOpenDetail(p)} style={{ cursor: 'pointer' }}>
                                            <div style={{ fontWeight: 'bold', color: 'var(--primary-light)', fontSize: '1.1rem' }}>{p.nombre}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{p.etapa}</div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <Users size={14} className="mobile-hide" />
                                            <span>{p.animalCount}</span>
                                        </div>
                                    </td>
                                    <td className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'right' }}>
                                        <span style={{ fontWeight: 'bold' }}>{Math.round(p.pesoPromedio)}</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>kg</span>
                                    </td>
                                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                        <span style={{ 
                                            color: p.gmpPromedio > 20 ? 'var(--success)' : p.gmpPromedio > 10 ? 'var(--warning)' : 'var(--error)',
                                            fontWeight: 'bold'
                                        }}>
                                            {p.gmpPromedio.toFixed(1)}
                                        </span>
                                        <span className="mobile-hide" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>kg/m</span>
                                    </td>
                                    <td className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'center' }}>
                                        <div style={{ 
                                            padding: '4px 10px', 
                                            borderRadius: '20px', 
                                            background: p.diasPesajePromedio > 60 ? 'rgba(255,152,0,0.1)' : 'rgba(255,255,255,0.05)',
                                            color: p.diasPesajePromedio > 60 ? 'var(--warning)' : 'var(--text)',
                                            fontSize: '0.85rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <Calendar size={12} />
                                            {Math.round(p.diasPesajePromedio)} d
                                        </div>
                                    </td>
                                    {role === 'administrador' && (
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button 
                                                    onClick={() => setManagingPotrerada(p)}
                                                    className="btn-icon"
                                                    title="Gestionar Animales"
                                                    style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db', border: 'none', padding: '8px', borderRadius: '8px' }}
                                                >
                                                    <Users size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleEditClick(p)}
                                                    className="btn-icon"
                                                    title="Editar Nombre"
                                                    style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: 'none', padding: '8px', borderRadius: '8px' }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {potreradas.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                            No hay potreradas registradas en esta finca.
                        </div>
                    )}
                </div>
            )}

            {editingPotrerada && (
                <div className="modal-overlay">
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
                <div className="modal-overlay">
                    <div className="card modal-content" style={{ maxWidth: '800px' }}>
                        {/* Header */}
                        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <h2 style={{ margin: 0, color: 'var(--primary-light)', fontSize: '1.4rem' }}>
                                    Gestionar: {managingPotrerada.nombre}
                                </h2>
                                <button onClick={() => { setManagingPotrerada(null); setSearchTerm(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem' }}>
                                {managingPotrerada.etapa.toUpperCase()} | {animalesEnEstaPotrerada.length} animales
                            </p>
                        </div>

                        {/* Content Area */}
                        <div className="responsive-grid" style={{ flex: 1, gap: '1px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            
                            {/* Current Animals Column */}
                            <div style={{ background: 'var(--bg-dark-paper)', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={16} color="var(--primary-light)" /> En este lote
                                </h3>
                                
                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {animalesEnEstaPotrerada.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '0.8rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                                            Vacío
                                        </div>
                                    ) : (
                                        animalesEnEstaPotrerada.map(a => (
                                            <div key={a.id} className="glass-panel" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                                                <div>
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>#{a.numero_chapeta}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{a.nombre_propietario}</div>
                                                </div>
                                                <button 
                                                    disabled={updatingAnimal === a.id}
                                                    onClick={() => handleRemoveAnimal(a.id)}
                                                    className="btn-icon"
                                                    style={{ color: '#e74c3c', padding: '6px' }}
                                                >
                                                    {updatingAnimal === a.id ? '...' : <Trash2 size={16} />}
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Add Animals Column */}
                            <div style={{ background: 'var(--bg-dark-paper)', padding: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <h3 style={{ fontSize: '0.9rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Plus size={16} color="var(--success)" /> Agregar Otros
                                </h3>

                                <div style={{ position: 'relative', marginBottom: '12px' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input 
                                        type="text"
                                        placeholder="Buscar..."
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        style={{ padding: '8px 8px 8px 32px', fontSize: '0.85rem', marginBottom: 0 }}
                                    />
                                </div>
                                
                                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {filteredAnimalesFinca.map(a => (
                                        <div key={a.id} className="glass-panel" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>#{a.numero_chapeta}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {a.nombre_propietario}
                                                </div>
                                            </div>
                                            <button 
                                                disabled={updatingAnimal === a.id}
                                                onClick={() => handleAddAnimal(a.id)}
                                                className="btn-icon"
                                                style={{ color: '#2ecc71', padding: '6px' }}
                                            >
                                                {updatingAnimal === a.id ? '...' : <Plus size={16} />}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>
                            <button onClick={() => { setManagingPotrerada(null); setSearchTerm(''); }} style={{ width: 'auto', padding: '8px 24px', fontSize: '0.9rem' }}>
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedDetailId && (
                <div className="modal-overlay">
                    <div className="card modal-content" style={{ maxWidth: '900px' }}>
                        {detailLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--primary)' }}>
                                Cargando información...
                            </div>
                        ) : detailData ? (
                            <>
                                {/* Header */}
                                <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <h2 style={{ margin: '0 0 8px 0', color: 'var(--primary-light)', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>
                                                {detailData.potrerada.nombre}
                                            </h2>
                                            <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    <MapPin size={14} color="var(--primary)" /> <span className="mobile-hide">Potrero:</span> <strong style={{color: 'var(--text)'}}>{detailData.potreroActual}</strong>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    <TrendingUp size={14} color="var(--success)" /> <span className="mobile-hide">GMP:</span> <strong style={{color: 'var(--success)'}}>{detailData.gmpPromedioGrupo.toFixed(1)}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => setSelectedDetailId(null)} className="btn-icon">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>

                                {/* Main Content Scrollable */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                    
                                    {/* Gráficas Responsive */}
                                    <div className="responsive-grid" style={{ marginBottom: '24px' }}>
                                        <div className="glass-panel" style={{ padding: '16px', height: '280px' }}>
                                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio</h4>
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

                                        <div className="glass-panel" style={{ padding: '16px', height: '280px' }}>
                                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>GMP Promedio</h4>
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
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Info size={14} /> Detalle por Animal
                                    </h4>
                                    <div className="table-container">
                                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '450px' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)' }}>CHAPETA</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PROPIETARIO</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PESO</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)' }}>GMP</th>
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
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>
                            <button onClick={() => setSelectedDetailId(null)} style={{ width: 'auto', padding: '8px 24px', fontSize: '0.9rem' }}>
                                Cerrar
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
