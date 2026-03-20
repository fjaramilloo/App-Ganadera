import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Skull, Calendar, AlertCircle, ArrowUpDown, X } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface Pesaje {
    peso: number;
    fecha: string;
    gdp_calculada: number;
    potreros?: { nombre: string } | null;
}

interface Animal {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    especie: string;
    sexo: string;
    etapa: string;
    peso_ingreso: number;
    peso_compra?: number | null;
    fecha_ingreso: string;
    fecha_ingreso_ceba?: string | null;
    peso_ingreso_ceba?: number | null;
    estado: string;
    id_potrerada?: string | null;
    potreros?: { nombre: string } | null;
    potreradas?: { nombre: string } | null;
    potreroNombre?: string;
    potreradaNombre?: string;
    diasDesdeUltimoPesaje?: number;
    registros_pesaje: Pesaje[];
}

export default function Inventory() {
    const { fincaId, role } = useAuth();
    const [animales, setAnimales] = useState<Animal[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterEtapa, setFilterEtapa] = useState('');
    const [filterPotrero, setFilterPotrero] = useState('');
    const [filterPotrerada, setFilterPotrerada] = useState('');
    const [filterPropietario, setFilterPropietario] = useState('');
    
    // sorting states
    const [sortBy, setSortBy] = useState('dias_pesaje');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [umbralAltoGmp, setUmbralAltoGmp] = useState(20);
    const [umbralMedioGmp, setUmbralMedioGmp] = useState(10);

    // Estados para Muerte
    const [showMuerteModal, setShowMuerteModal] = useState(false);
    const [chapetaMuerte, setChapetaMuerte] = useState('');
    const [fechaMuerte, setFechaMuerte] = useState(new Date().toISOString().split('T')[0]);
    const [msjErrorMuerte, setMsjErrorMuerte] = useState('');

    // Modal Historial Animal
    const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);

    const fetchAnimales = async () => {
        if (!fincaId) return;
        setLoading(true);

        const { data: config } = await supabase
            .from('configuracion_kpi')
            .select('umbral_alto_gmp, umbral_medio_gmp')
            .eq('id_finca', fincaId)
            .single();
        if (config) {
            setUmbralAltoGmp(config.umbral_alto_gmp ?? 20);
            setUmbralMedioGmp(config.umbral_medio_gmp ?? 10);
        }

        const { data, error } = await supabase
            .from('animales')
            .select(`
                *,
                potreradas ( nombre ),
                potreros ( nombre ),
                registros_pesaje (
                    peso,
                    fecha,
                    gdp_calculada,
                    potreros ( nombre )
                )
            `)
            .eq('id_finca', fincaId)
            .eq('estado', 'activo')
            .order('creado_en', { ascending: false });

        if (!error && data) {
            const dataProcesada = data.map((a: any) => {
                let registros = (a.registros_pesaje || []).sort((x: any, y: any) =>
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );

                const unique = new Set();
                registros = registros.filter((p: any) => {
                    const dateOnly = p.fecha.split('T')[0];
                    if (unique.has(dateOnly)) return false;
                    unique.add(dateOnly);
                    return true;
                });

                const ultimoP = registros[0];
                const fechaReferencia = ultimoP ? new Date(ultimoP.fecha) : new Date(a.fecha_ingreso);
                
                // Truncar fechas al inicio del día para cálculo correcto de la diferencia
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                const refTruncada = new Date(fechaReferencia);
                refTruncada.setHours(0, 0, 0, 0);
                const diasDesdeUltimoPesaje = differenceInDays(hoy, refTruncada);
                const potreroActual = a.potreros?.nombre || 'Sin potrero';

                return {
                    ...a,
                    registros_pesaje: registros,
                    potreroNombre: potreroActual,
                    potreradaNombre: a.potreradas?.nombre || 'Sin potrerada',
                    diasDesdeUltimoPesaje
                };
            });
            setAnimales(dataProcesada);

            // 3. Traer los umbrales de la configuración
            const { data: configData } = await supabase
                .from('configuracion_kpi')
                .select('umbral_medio_gmp, umbral_alto_gmp')
                .eq('id_finca', fincaId)
                .single();
            
            if (configData) {
                if (configData.umbral_alto_gmp) setUmbralAltoGmp(configData.umbral_alto_gmp);
                if (configData.umbral_medio_gmp) setUmbralMedioGmp(configData.umbral_medio_gmp);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAnimales();
    }, [fincaId]);

    const handleReportarMuerte = async () => {
        if (!fincaId || !chapetaMuerte.trim()) return;
        setLoading(true);
        setMsjErrorMuerte('');

        try {
            // 1. Validar que el animal existe y está activo
            const { data: animal, error: searchError } = await supabase
                .from('animales')
                .select('id')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', chapetaMuerte.trim())
                .eq('estado', 'activo')
                .single();

            if (searchError || !animal) {
                throw new Error("Animal no encontrado o no está activo en esta finca.");
            }

            // 2. Marcar como muerto
            const { error: updateError } = await supabase
                .from('animales')
                .update({
                    estado: 'muerto',
                    fecha_muerte: fechaMuerte
                })
                .eq('id', animal.id);

            if (updateError) throw updateError;

            // 3. Opcional: Podríamos guardar la fecha de muerte en algún lado, 
            // pero el esquema actual solo tiene 'estado'. 
            // Por ahora solo inactivamos.

            setShowMuerteModal(false);
            setChapetaMuerte('');
            fetchAnimales();
            alert(`Se ha registrado el fallecimiento del animal #${chapetaMuerte}`);
        } catch (err: any) {
            setMsjErrorMuerte(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSort = (field: string) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder(field === 'dias_pesaje' ? 'desc' : 'asc');
        }
    };

    const sortedAndFilteredAnimals = useMemo(() => {
        return animales
            .filter(a => {
                const matchesSearch = a.numero_chapeta.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    a.nombre_propietario.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (a.potreradaNombre || '').toLowerCase().includes(searchTerm.toLowerCase());
                const matchesEtapa = filterEtapa ? a.etapa === filterEtapa : true;
                const matchesPotrero = filterPotrero ? a.potreroNombre === filterPotrero : true;
                const matchesPotrerada = filterPotrerada ? a.potreradaNombre === filterPotrerada : true;
                const matchesPropietario = filterPropietario ? a.nombre_propietario === filterPropietario : true;
                return matchesSearch && matchesEtapa && matchesPotrero && matchesPotrerada && matchesPropietario;
            })
            .sort((a, b) => {
                let res = 0;
                if (sortBy === 'chapeta') {
                    res = a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true });
                } else if (sortBy === 'propietario') {
                    res = a.nombre_propietario.localeCompare(b.nombre_propietario);
                } else if (sortBy === 'dias_pesaje') {
                    res = (a.diasDesdeUltimoPesaje || 0) - (b.diasDesdeUltimoPesaje || 0);
                } else if (sortBy === 'potrerada') {
                    res = (a.potreradaNombre || '').localeCompare(b.potreradaNombre || '');
                }
                return sortOrder === 'asc' ? res : -res;
            });
    }, [animales, searchTerm, filterEtapa, filterPotrero, filterPotrerada, filterPropietario, sortBy, sortOrder]);

    const { uniquePotreros, uniquePotreradas, uniquePropietarios } = useMemo(() => {
        const potreros = new Set<string>();
        const potreradas = new Set<string>();
        const propietarios = new Set<string>();
        animales.forEach(a => {
            if (a.potreroNombre && a.potreroNombre !== 'Sin potrero') potreros.add(a.potreroNombre);
            if (a.potreradaNombre && a.potreradaNombre !== 'Sin potrerada') potreradas.add(a.potreradaNombre);
            if (a.nombre_propietario) propietarios.add(a.nombre_propietario);
        });
        return {
            uniquePotreros: Array.from(potreros),
            uniquePotreradas: Array.from(potreradas),
            uniquePropietarios: Array.from(propietarios)
        };
    }, [animales]);

    // Calcular GDP Promedio de todos los animales para la estimación de peso de hoy
    const gdpPromedioFinca = useMemo(() => {
        const gdpsTotales = animales.map(a => {
            const u = a.registros_pesaje?.[0];
            const pesoBase = a.peso_compra ?? a.peso_ingreso;
            const gain = (u?.peso ?? pesoBase) - pesoBase;
            const ref = u ? new Date(u.fecha) : new Date();
            const days = differenceInDays(ref, new Date(a.fecha_ingreso)) || 1;
            return u?.gdp_calculada ?? (gain / days);
        }).filter(v => v > 0 && isFinite(v));
        return gdpsTotales.length > 0 ? (gdpsTotales.reduce((acc, curr) => acc + curr, 0) / gdpsTotales.length) : 0.45;
    }, [animales]);

    return (
        <div className="page-container">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
                <h1 className="title" style={{ margin: 0 }}>Animales de la Finca</h1>

                {role !== 'observador' && (
                    <button
                        onClick={() => setShowMuerteModal(true)}
                        style={{ width: 'auto', backgroundColor: 'var(--error)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Skull size={18} /> Reportar muerte
                    </button>
                )}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(46, 125, 50, 0.1)', border: '1px solid rgba(46, 125, 50, 0.2)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Animales</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>{animales.length}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(255, 179, 0, 0.05)', border: '1px solid rgba(255, 179, 0, 0.1)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Potreradas</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--secondary)' }}>{uniquePotreradas.length}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Potreros en Uso</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{uniquePotreros.length}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center', background: 'rgba(244, 67, 54, 0.05)', border: '1px solid rgba(244, 67, 54, 0.1)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Alertas (GDP Bajo)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--error)' }}>
                        {animales.filter(a => {
                            const pesoBase = a.peso_compra ?? a.peso_ingreso;
                            return (a.registros_pesaje?.length || 0) > 1 && ((a.registros_pesaje[0].peso - pesoBase) / (differenceInDays(new Date(a.registros_pesaje[0].fecha), new Date(a.fecha_ingreso)) || 1) * 30) <= umbralMedioGmp;
                        }).length}
                    </div>
                </div>
            </div>

            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: '2 1 300px', position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Buscar por chapeta, propietario o potrerada..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ marginBottom: 0, paddingLeft: '40px' }}
                    />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                    <select
                        value={filterEtapa}
                        onChange={(e) => setFilterEtapa(e.target.value)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="">-- Etapa --</option>
                        <option value="cria">Cría</option>
                        <option value="levante">Levante</option>
                        <option value="ceba">Ceba</option>
                    </select>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                    <select
                        value={filterPotrerada}
                        onChange={(e) => setFilterPotrerada(e.target.value)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="">-- Potrerada --</option>
                        {uniquePotreradas.map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                    </select>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                    <select
                        value={filterPotrero}
                        onChange={(e) => setFilterPotrero(e.target.value)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="">-- Potrero --</option>
                        {uniquePotreros.map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                    </select>
                </div>
                <div style={{ flex: '1 1 140px' }}>
                    <select
                        value={filterPropietario}
                        onChange={(e) => setFilterPropietario(e.target.value)}
                        style={{ marginBottom: 0 }}
                    >
                        <option value="">-- Propietario --</option>
                        {uniquePropietarios.map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
                    </select>
                </div>
                {(searchTerm || filterEtapa || filterPotrero || filterPotrerada || filterPropietario) && (
                    <button 
                        onClick={() => {
                            setSearchTerm('');
                            setFilterEtapa('');
                            setFilterPotrero('');
                            setFilterPotrerada('');
                            setFilterPropietario('');
                        }}
                        style={{ width: 'auto', background: 'transparent', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px' }}
                    >
                        Limpiar
                    </button>
                )}
            </div>

            <div className="table-container" style={{ padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '16px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('chapeta')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Chapeta <ArrowUpDown size={14} opacity={sortBy === 'chapeta' ? 1 : 0.3} /></div>
                            </th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('propietario')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Propietario / Etapa <ArrowUpDown size={14} opacity={sortBy === 'propietario' ? 1 : 0.3} /></div>
                            </th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('dias_pesaje')}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Último Pesaje <ArrowUpDown size={14} opacity={sortBy === 'dias_pesaje' ? 1 : 0.3} /></div>
                            </th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Último Peso</th>
                            <th style={{ padding: '16px', color: 'var(--text-muted)' }}>GMP Promedio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ padding: '44px', textAlign: 'center', color: 'var(--primary)' }}>Cargando datos del hato...</td></tr>
                        ) : sortedAndFilteredAnimals.length === 0 ? (
                            <tr><td colSpan={5} style={{ padding: '44px', textAlign: 'center' }}>No hay animales registrados.</td></tr>
                        ) : (
                            sortedAndFilteredAnimals.map((animal) => {
                                const pesoBase = animal.peso_compra ?? animal.peso_ingreso;
                                const ultimoP = animal.registros_pesaje?.[0];
                                const fechaU = ultimoP ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es }) : 'Sin pesajes';
                                const pesoU = ultimoP ? `${ultimoP.peso} kg` : `${pesoBase} kg*`;

                                const fechaReferencia = ultimoP ? new Date(ultimoP.fecha) : new Date();
                                const pesoReferencia = ultimoP ? ultimoP.peso : pesoBase;
                                const dias = differenceInDays(fechaReferencia, new Date(animal.fecha_ingreso)) || 1;
                                const gananciaTotal = pesoReferencia - pesoBase;
                                const gmpPromedio = (gananciaTotal / dias) * 30;

                                const isAlerta = (animal.registros_pesaje?.length || 0) > 1 && gmpPromedio <= umbralMedioGmp;
                                const hasRecords = (animal.registros_pesaje?.length || 0) > 1;
                                const gmpColor = !hasRecords ? 'var(--text-muted)' : (
                                    gmpPromedio > umbralAltoGmp ? 'var(--success)' : (
                                        gmpPromedio > umbralMedioGmp ? 'var(--warning)' : 'var(--error)'
                                    )
                                );

                                return (
                                    <tr key={animal.id} 
                                        onClick={() => setSelectedAnimal(animal)}
                                        className="table-row-hover"
                                        style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        backgroundColor: isAlerta ? 'rgba(244, 67, 54, 0.05)' : 'transparent',
                                        transition: 'background 0.2s',
                                        cursor: 'pointer'
                                    }}>
                                        <td style={{ padding: '16px', fontWeight: 'bold', fontSize: '1.1rem' }}>
                                            <span style={{ color: 'var(--primary-light)' }}>#</span>{animal.numero_chapeta}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: '500' }}>{animal.nombre_propietario}</div>
                                             <div style={{ fontSize: '0.8rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {animal.etapa} • <span style={{ color: 'var(--primary-light)', fontStyle: 'italic', textTransform: 'capitalize' }}>{animal.potreradaNombre}</span>
                                                <span style={{ marginLeft: '8px', opacity: 0.8 }}>({animal.potreroNombre})</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ 
                                                fontWeight: 'bold', 
                                                fontSize: '1.05rem', 
                                                color: (animal.diasDesdeUltimoPesaje || 0) > 90 ? 'var(--error)' : 'white' 
                                            }}>
                                                Hace {animal.diasDesdeUltimoPesaje} {animal.diasDesdeUltimoPesaje === 1 ? 'día' : 'días'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ultimoP ? fechaU : 'Ingreso: ' + format(new Date(animal.fecha_ingreso), 'dd/MM/yyyy')}</div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{pesoU}</div>
                                            {(animal.registros_pesaje?.length || 0) > 1 && ultimoP && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+{(ultimoP.peso - (animal.peso_compra ?? animal.peso_ingreso)).toFixed(1)} kg ganados</div>}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {hasRecords ? (
                                                <>
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        color: gmpColor,
                                                        fontWeight: 'bold'
                                                    }}>
                                                        {gmpPromedio.toFixed(1)} kg/mes
                                                        {isAlerta && <span title="Bajo el umbral configurado">⚠️</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Promedio histórico</div>
                                                </>
                                            ) : (
                                                <div style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>NA</div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {/* Modal Reporte de Muerte */}
            {showMuerteModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '450px', width: '100%', border: '1px solid var(--error)' }}>
                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                            <Skull size={48} color="var(--error)" style={{ marginBottom: '16px' }} />
                            <h2 style={{ color: 'white' }}>Reportar Fallecimiento</h2>
                            <p style={{ color: 'var(--text-muted)' }}>Esta acción inactivará al animal permanentemente.</p>
                        </div>

                        {msjErrorMuerte && (
                            <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.1)', color: 'var(--error)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.9rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <AlertCircle size={16} /> {msjErrorMuerte}
                            </div>
                        )}

                        <div style={{ marginBottom: '20px' }}>
                            <label>Número de Chapeta</label>
                            <input
                                type="text"
                                placeholder="Ej: 1234"
                                value={chapetaMuerte}
                                onChange={e => setChapetaMuerte(e.target.value)}
                                style={{ fontSize: '1.2rem' }}
                            />
                        </div>

                        <div style={{ marginBottom: '32px' }}>
                            <label>Fecha de Fallecimiento</label>
                            <div style={{ position: 'relative' }}>
                                <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                                <input
                                    type="date"
                                    value={fechaMuerte}
                                    onChange={e => setFechaMuerte(e.target.value)}
                                    style={{ paddingLeft: '40px' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button
                                onClick={() => { setShowMuerteModal(false); setMsjErrorMuerte(''); }}
                                style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleReportarMuerte}
                                style={{ backgroundColor: 'var(--error)' }}
                                disabled={loading || !chapetaMuerte}
                            >
                                {loading ? 'Procesando...' : 'Confirmar Fallecimiento'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal Historial de Animal */}
            {selectedAnimal && (() => {
                const pesoBaseModal = selectedAnimal.peso_compra ?? selectedAnimal.peso_ingreso;
                const ultimoP = selectedAnimal.registros_pesaje?.[0];
                const fechaU = ultimoP ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es }) : format(new Date(selectedAnimal.fecha_ingreso), 'dd/MM/yyyy');
                const pesoU = ultimoP ? ultimoP.peso : pesoBaseModal;

                const refDate = ultimoP ? new Date(ultimoP.fecha) : new Date(selectedAnimal.fecha_ingreso);
                const diasHoy = differenceInDays(new Date(), refDate) || 0;
                const estimadoHoy = pesoU + (diasHoy * gdpPromedioFinca);

                const timeline = [
                    ...(selectedAnimal.registros_pesaje || []).map((p, i, arr) => {
                        const ant = arr[i + 1] || { peso: pesoBaseModal, fecha: selectedAnimal.fecha_ingreso };
                        const d = differenceInDays(new Date(p.fecha), new Date(ant.fecha)) || 1;
                        const ganancia = p.peso - ant.peso;
                        const gmp = (ganancia / d) * 30;
                        let gdp = (p.gdp_calculada !== null && p.gdp_calculada !== undefined) ? Number(p.gdp_calculada) : (ganancia / d);
                        if (gdp === 0 && ganancia !== 0) {
                            gdp = ganancia / d;
                        }

                        return {
                            id: p.fecha,
                            fecha: p.fecha,
                            peso: p.peso,
                            gmp: gmp,
                            gdp: gdp,
                            esIngreso: false
                        };
                    }),
                    {
                        id: selectedAnimal.fecha_ingreso,
                        fecha: selectedAnimal.fecha_ingreso,
                        peso: pesoBaseModal,
                        gmp: 0,
                        gdp: 0,
                        esIngreso: true
                    }
                ];

                const chartData = [...timeline].reverse().map(item => ({
                    fechaStr: format(new Date(item.fecha), 'dd/MMM', { locale: es }),
                    peso: item.peso
                }));

                return (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                        <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                            <button 
                                onClick={() => setSelectedAnimal(null)}
                                style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }}
                            >
                                <X size={24} />
                            </button>

                            <div style={{ paddingRight: '40px', marginBottom: '24px' }}>
                                <h2 style={{ color: 'white', margin: 0, fontSize: '1.8rem' }}>
                                    <span style={{ color: 'var(--primary)', marginRight: '8px' }}>#</span>
                                    {selectedAnimal.numero_chapeta}
                                </h2>
                                 <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
                                    {selectedAnimal.etapa} • {selectedAnimal.potreradaNombre} • {selectedAnimal.nombre_propietario}
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Último Pesaje</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{pesoU} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', marginTop: '4px' }}>{ultimoP ? 'Pesaje: ' : 'Ingreso: '} {fechaU}</div>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso Estimado (Hoy)</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>
                                        {estimadoHoy.toFixed(1)} kg
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        GDP Finca: {gdpPromedioFinca.toFixed(3)} kg/día
                                    </div>
                                </div>
                            </div>

                            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Evolución de Peso</h3>
                            <div style={{ height: '240px', width: '100%', marginBottom: '32px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                        <XAxis dataKey="fechaStr" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                        <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                                            itemStyle={{ color: 'var(--primary-light)' }}
                                            labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                        />
                                        <Line type="monotone" dataKey="peso" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary-light)', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: 'var(--primary)', stroke: 'white', strokeWidth: 2 }} name="Peso (kg)" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Historial de Registros</h3>
                            <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                                        <tr>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fecha</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Peso (kg)</th>
                                            <th style={{ padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ganancia Mensual</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {timeline.map((item, index) => (
                                            <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ fontWeight: '500' }}>{format(new Date(item.fecha), 'dd/MM/yyyy')}</div>
                                                    {item.esIngreso && <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px', fontWeight: 'bold' }}>INGRESO</div>}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>
                                                    {item.peso}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    {item.esIngreso ? (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                                                    ) : (
                                                        <>
                                                            <div style={{ color: item.gmp > umbralAltoGmp ? 'var(--success)' : (item.gmp > umbralMedioGmp ? 'var(--warning)' : 'var(--error)'), fontWeight: 'bold' }}>{item.gmp > 0 ? '+' : ''}{item.gmp.toFixed(1)} kg/mes</div>
                                                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>GDP: {item.gdp > 0 ? '+' : ''}{item.gdp.toFixed(3)} kg/día</div>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Modales */}
        </div>
    );
}
