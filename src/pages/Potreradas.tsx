import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Users, Edit2, Calendar, Save, X, Plus, Trash2, Search, MapPin, TrendingUp, Info, Scale } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { differenceInDays, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Potrerada {
    id: string;
    nombre: string;
    etapa: string;
    animalCount: number;
    pesoPromedio: number;
    pesoEstimadoPromedio: number;
    gmpPromedio: number;
    gmpAcumulado: number;
    diasPesajePromedio: number;
    marcas: string[];
    id_rotacion: string | null;
}

interface AnimalPotrero {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    id_potrerada: string | null;
    pesoActual: number;
    gdp?: number;
    gmp?: number;
    fechaIngresoEtapa?: string | null;
    pesoIngresoEtapa?: number | null;
    pesajesFiltrados?: { [fecha: string]: number };
    hasCalculatedGmp?: boolean;
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
    
    // Estado para nueva potrerada
    const [showAddModal, setShowAddModal] = useState(false);
    const [nuevaPotreradaNombre, setNuevaPotreradaNombre] = useState('');
    const [nuevaPotreradaEtapa, setNuevaPotreradaEtapa] = useState('levante');
    const [nuevaPotreradaRotacion, setNuevaPotreradaRotacion] = useState('');
    const [rotaciones, setRotaciones] = useState<{id: string, nombre: string}[]>([]);
    const [editRotacion, setEditRotacion] = useState<string | null>(null);
    
    // Umbrales GMP
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);
    
    // Estados para búsqueda y gestión
    const [potreradaSearch, setPotreradaSearch] = useState('');
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
        fechasColumnas: string[];
        gmpPromedioGrupo: number;
        history: ChartData[];
    } | null>(null);

    // Estado para ordenamiento en el detalle
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'numero_chapeta', direction: 'asc' });

    // Estado para el formulario de pesaje grupal
    const [weighingData, setWeighingData] = useState<{ [animalId: string]: string }>({});
    const [savingWeighings, setSavingWeighings] = useState(false);
    const [showWeighingForm, setShowWeighingForm] = useState(false);

    const fetchPotreradasData = async () => {
        if (!fincaId) return;
        setLoading(true);

        try {
            const { data: config } = await supabase
                .from('configuracion_kpi')
                .select('umbral_alto_gmp, umbral_medio_gmp')
                .eq('id_finca', fincaId)
                .single();
                
            if (config) {
                setUmbralAlto(config.umbral_alto_gmp ?? 20);
                setUmbralMedio(config.umbral_medio_gmp ?? 10);
            }

            // 1. Obtener todas las potreradas de la finca
            const { data: pots, error: potsErr } = await supabase
                .from('potreradas')
                .select('*')
                .eq('id_finca', fincaId)
                .order('nombre', { ascending: true });

            if (potsErr) throw potsErr;

            // 1.5 Obtener rotaciones para los selectores
            const { data: rotsData } = await supabase
                .from('rotaciones')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre', { ascending: true });
            setRotaciones(rotsData || []);

            const { data: animals, error: animErr } = await supabase
                .from('animales')
                .select(`
                    id, 
                    numero_chapeta,
                    nombre_propietario,
                    id_potrerada,
                    peso_ingreso,
                    peso_compra,
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

            // Calcular GDP Promedio de la finca para la estimación (como en Inventory.tsx)
            const gdpsTotales = (animals || []).map((a: any) => {
                const registros = (a.registros_pesaje || []).sort((x: any, y: any) => 
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                const u = registros[0];
                const pesoBase = a.peso_compra ?? a.peso_ingreso;
                const gain = (u?.peso ?? pesoBase) - pesoBase;
                const ref = u ? new Date(u.fecha) : new Date(a.fecha_ingreso);
                const days = differenceInDays(new Date(ref), new Date(a.fecha_ingreso)) || 1;
                return u?.gdp_calculada ?? (gain / days);
            }).filter(v => v > 0 && isFinite(v));
            const gdpPromedioFinca = gdpsTotales.length > 0 ? (gdpsTotales.reduce((acc, curr) => acc + curr, 0) / gdpsTotales.length) : 0.45;

            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0);

            const processedPots = pots.map((p: any) => {
                const groupAnimals = animals?.filter((a: any) => a.id_potrerada === p.id) || [];
                
                let totalPeso = 0;
                let totalPesoEstimado = 0;
                let totalGmpLast = 0;
                let totalGmpAcc = 0;
                let totalDiasPesaje = 0;
                let validWeightCount = 0;
                let validGmpLastCount = 0;
                let validGmpAccCount = 0;
                let validDateCount = 0;

                groupAnimals.forEach((a: any) => {
                    let registros = (a.registros_pesaje || []).sort((x: any, y: any) => 
                        new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                    );

                    // Omite duplicados la misma fecha
                    const unique = new Set();
                    registros = registros.filter((p: any) => {
                        const dateOnly = p.fecha.split('T')[0];
                        if (unique.has(dateOnly)) return false;
                        unique.add(dateOnly);
                        return true;
                    });

                    const lastP = registros[0];
                    const pesoBase = a.peso_compra ?? a.peso_ingreso;
                    
                    const pesoActual = lastP ? lastP.peso : pesoBase;
                    totalPeso += Number(pesoActual);
                    validWeightCount++;

                    // 1. GMP Último Periodo (lo que viene del trigger)
                    if (lastP) {
                        const hasGmp = lastP.gmp_calculada !== null && lastP.gmp_calculada !== undefined;
                        const gmpLast = hasGmp ? Number(lastP.gmp_calculada) : (lastP.gdp_calculada ? lastP.gdp_calculada * 30 : 0);
                        
                        if (hasGmp || registros.length > 1) {
                            totalGmpLast += Number(gmpLast);
                            validGmpLastCount++;
                        }

                        // 2. GMP Acumulado (Primer pesaje vs Último pesaje)
                        const earliestP = registros[registros.length - 1]; // El más antiguo registrado
                        // Si solo hay un registro, comparamos contra el ingreso a la finca
                        const startWeight = registros.length > 1 ? earliestP.peso : pesoBase;
                        const startDate = registros.length > 1 ? new Date(earliestP.fecha) : new Date(a.fecha_ingreso);
                        const endDate = new Date(lastP.fecha);
                        
                        const totalGain = lastP.peso - startWeight;
                        const totalDays = differenceInDays(endDate, startDate) || 1;
                        
                        if (totalDays > 0 || registros.length > 1) {
                            const gmpAcc = (totalGain / totalDays) * 30;
                            totalGmpAcc += gmpAcc;
                            validGmpAccCount++;
                        }
                    }

                    const fechaRef = new Date(lastP ? lastP.fecha : a.fecha_ingreso);
                    fechaRef.setHours(0,0,0,0);
                    const diff = differenceInDays(hoy, fechaRef);
                    
                    totalPesoEstimado += pesoActual + (diff * gdpPromedioFinca);
                    totalDiasPesaje += diff;
                    validDateCount++;
                });

                return {
                    id: p.id,
                    nombre: p.nombre,
                    etapa: p.etapa,
                    animalCount: groupAnimals.length,
                    pesoPromedio: validWeightCount > 0 ? totalPeso / validWeightCount : 0,
                    pesoEstimadoPromedio: validWeightCount > 0 ? totalPesoEstimado / validWeightCount : 0,
                    gmpPromedio: validGmpLastCount > 0 ? totalGmpLast / validGmpLastCount : 0,
                    gmpAcumulado: validGmpAccCount > 0 ? totalGmpAcc / validGmpAccCount : 0,
                    diasPesajePromedio: validDateCount > 0 ? totalDiasPesaje / validDateCount : 0,
                    marcas: Array.from(new Set(groupAnimals.map((a: any) => a.nombre_propietario).filter(Boolean))).sort() as string[],
                    id_rotacion: p.id_rotacion
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

    const handleAddPotrerada = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fincaId || !nuevaPotreradaNombre.trim()) return;

        setLoading(true);
        try {
            const { error } = await supabase
                .from('potreradas')
                .insert({ 
                    id_finca: fincaId, 
                    nombre: nuevaPotreradaNombre.trim(), 
                    etapa: nuevaPotreradaEtapa,
                    id_rotacion: nuevaPotreradaRotacion || null
                });

            if (error) throw error;

            setNuevaPotreradaNombre('');
            setShowAddModal(false);
            fetchPotreradasData();
        } catch (err: any) {
            alert('Error al agregar potrerada: ' + (err.code === '23505' ? 'Ya existe una potrerada con ese nombre.' : err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (p: Potrerada) => {
        setEditingPotrerada(p);
        setNewName(p.nombre);
        setEditRotacion(p.id_rotacion);
    };

    const handleUpdateName = async () => {
        if (!editingPotrerada || !newName.trim()) return;

        try {
            const { error } = await supabase
                .from('potreradas')
                .update({ 
                    nombre: newName.trim(),
                    id_rotacion: editRotacion
                })
                .eq('id', editingPotrerada.id);

            if (error) throw error;

            setEditingPotrerada(null);
            fetchPotreradasData();
        } catch (error: any) {
            alert('Error al actualizar: ' + error.message);
        }
    };

    const removePotrerada = async (id: string) => {
        if (!confirm('¿Está seguro de eliminar esta potrerada? Tenga en cuenta que los animales perderán su referencia a la misma.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('potreradas').delete().eq('id', id);
            if (error) throw error;
            fetchPotreradasData();
        } catch (err: any) {
            alert('Error al eliminar potrerada: ' + err.message);
        } finally {
            setLoading(false);
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
                    peso_compra,
                    fecha_ingreso,
                    etapa,
                    fecha_ingreso_ceba,
                    peso_ingreso_ceba,
                    id_potrero_actual,
                    potreros (nombre),
                    registros_pesaje (
                        peso,
                        fecha,
                        etapa,
                        gdp_calculada,
                        gmp_calculada
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

                const registrosEtapa = (a.registros_pesaje || [])
                    .filter((r: any) => r.etapa?.toLowerCase() === p.etapa.toLowerCase())
                    .sort((x: any, y: any) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime());

                let fechaIngresoEtapa = null;
                let pesoIngresoEtapa = null;

                const pesoBase = a.peso_compra ?? a.peso_ingreso;

                if (p.etapa === 'ceba') {
                    fechaIngresoEtapa = a.fecha_ingreso_ceba || (registrosEtapa[0]?.fecha || (a.etapa === 'ceba' ? a.fecha_ingreso : null));
                    pesoIngresoEtapa = a.peso_ingreso_ceba || (registrosEtapa[0]?.peso || (a.etapa === 'ceba' ? pesoBase : null));
                } else {
                    if (registrosEtapa.length > 0) {
                        fechaIngresoEtapa = registrosEtapa[0].fecha;
                        pesoIngresoEtapa = registrosEtapa[0].peso;
                    } else if (a.etapa?.toLowerCase() === p.etapa.toLowerCase()) {
                        fechaIngresoEtapa = a.fecha_ingreso;
                        pesoIngresoEtapa = pesoBase;
                    }
                }

                const pesajesMap: Record<string, number> = {};
                registrosEtapa.forEach((r: any) => {
                    pesajesMap[r.fecha] = r.peso;
                });

                const lastP = registros[0];
                const hasGmp = lastP?.gmp_calculada !== null && lastP?.gmp_calculada !== undefined;
                const gdp = lastP?.gdp_calculada || 0;
                const gmp = hasGmp ? Number(lastP.gmp_calculada) : (gdp ? gdp * 30 : 0);

                return {
                    id: a.id,
                    numero_chapeta: a.numero_chapeta,
                    nombre_propietario: a.nombre_propietario,
                    id_potrerada: p.id,
                    pesoActual: lastP ? lastP.peso : pesoBase,
                    gdp: gdp,
                    gmp: gmp,
                    fechaIngresoEtapa: fechaIngresoEtapa,
                    pesoIngresoEtapa: pesoIngresoEtapa,
                    pesajesFiltrados: pesajesMap,
                    hasCalculatedGmp: hasGmp || registros.length > 1
                };
            });

            const validGmpAnimals = processedAnimals.filter(a => a.hasCalculatedGmp);
            const avgGmp = validGmpAnimals.length > 0 
                ? validGmpAnimals.reduce((acc, curr) => acc + (curr.gmp || 0), 0) / validGmpAnimals.length
                : 0;

            const fechasRegistradasSet = new Set<string>();
            processedAnimals.forEach(a => {
                if (a.pesajesFiltrados) {
                    Object.keys(a.pesajesFiltrados).forEach(f => fechasRegistradasSet.add(f));
                }
            });
            const fechasColumnas = Array.from(fechasRegistradasSet).sort((a,b) => new Date(a).getTime() - new Date(b).getTime());

            // 4. Preparar datos para las gráficas (agrupar pesajes por fecha)
            const allWeighings: { fecha: string; peso: number; gdp: number }[] = [];
            animals?.forEach(a => {
                const registrosEtapa = (a.registros_pesaje || []).filter((r: any) => 
                    r.etapa?.toLowerCase() === p.etapa.toLowerCase()
                );
                registrosEtapa.forEach((r: any) => {
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
                fechasColumnas: fechasColumnas,
                gmpPromedioGrupo: avgGmp,
                history
            });

        } catch (error: any) {
            alert('Error al cargar detalle: ' + error.message);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedAnimals = useMemo(() => {
        if (!detailData?.animales) return [];
        
        return [...detailData.animales].sort((a: any, b: any) => {
            if (!sortConfig) return 0;
            const { key, direction } = sortConfig;
            
            let valA = a[key];
            let valB = b[key];

            // Manejo especial para chapeta (alfanumérico)
            if (key === 'numero_chapeta') {
                return direction === 'asc' 
                    ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
                    : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [detailData?.animales, sortConfig]);

    const handleOpenWeighingForm = () => {
        if (!detailData) return;
        // Precargar con chapeta de cada animal, peso en blanco
        const initial: { [id: string]: string } = {};
        detailData.animales.forEach(a => { initial[a.id] = ''; });
        setWeighingData(initial);
        setShowWeighingForm(true);
    };

    const handleSaveWeighings = async () => {
        if (!detailData) return;
        const today = new Date().toISOString().split('T')[0]; // 2026-03-14
        const etapa = detailData.potrerada.etapa;

        // Filtrar solo los que tienen peso ingresado
        const registros = detailData.animales
            .filter(a => {
                const val = weighingData[a.id];
                return val && val.trim() !== '' && !isNaN(Number(val)) && Number(val) > 0;
            })
            .map(a => ({
                id_animal: a.id,
                peso: Number(weighingData[a.id]),
                fecha: today,
                etapa: etapa,
                id_potrero: null
            }));

        if (registros.length === 0) {
            alert('Ingresa al menos un peso para guardar.');
            return;
        }

        setSavingWeighings(true);
        try {
            const { error } = await supabase
                .from('registros_pesaje')
                .insert(registros);

            if (error) throw error;

            alert(`✅ ${registros.length} pesaje(s) guardado(s) correctamente.`);
            setShowWeighingForm(false);
            setWeighingData({});
            // Refrescar la tarjeta de detalle
            await handleOpenDetail(detailData.potrerada);
        } catch (err: any) {
            alert('Error al guardar pesajes: ' + err.message);
        } finally {
            setSavingWeighings(false);
        }
    };

    return (
        <div className="page-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 className="title">Gestión de Potreradas</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Métricas y administración de grupos de animales.</p>
                </div>
                {role !== 'observador' && (
                    <button 
                        onClick={() => setShowAddModal(true)}
                        style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px' }}
                    >
                        <Plus size={20} /> Nueva Potrerada
                    </button>
                )}
            </div>

            <div style={{ marginBottom: '24px', position: 'relative', maxWidth: '400px' }}>
                <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                    type="text" 
                    placeholder="Buscar por nombre o marca..." 
                    value={potreradaSearch}
                    onChange={(e) => setPotreradaSearch(e.target.value)}
                    style={{ paddingLeft: '48px', marginBottom: 0 }}
                />
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--primary)' }}>Cargando potreradas...</div>
            ) : (
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nombre Potrerada</th>
                                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Marcas</th>
                                <th style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Animales</th>
                                <th className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio</th>
                                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ganancias (GMP)</th>
                                <th className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Días Pesaje</th>
                                {role === 'administrador' && <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Acciones</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {potreradas
                                .filter(p => 
                                    p.nombre.toLowerCase().includes(potreradaSearch.toLowerCase()) || 
                                    p.marcas.some(m => m.toLowerCase().includes(potreradaSearch.toLowerCase()))
                                )
                                .map((p, idx) => (
                                <tr key={p.id} className="table-row-hover" style={{ borderBottom: idx < potreradas.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div onClick={() => handleOpenDetail(p)} style={{ cursor: 'pointer' }}>
                                            <div style={{ fontWeight: 'bold', color: 'var(--primary-light)', fontSize: '1.1rem' }}>{p.nombre}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{p.etapa}</div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 24px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {p.marcas.length > 0 ? (
                                                p.marcas.map((m, i) => (
                                                    <span key={i} style={{ 
                                                        fontSize: '0.7rem', 
                                                        background: 'rgba(255,255,255,0.05)', 
                                                        padding: '2px 8px', 
                                                        borderRadius: '4px',
                                                        color: 'var(--text-muted)',
                                                        border: '1px solid rgba(255,255,255,0.1)'
                                                    }}>
                                                        {m}
                                                    </span>
                                                ))
                                            ) : (
                                                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>-</span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <Users size={14} className="mobile-hide" />
                                            <span>{p.animalCount}</span>
                                        </div>
                                    </td>
                                    <td className="mobile-hide" style={{ padding: '16px 24px', textAlign: 'right' }}>
                                        <div style={{ fontWeight: 'bold' }}>{Math.round(p.pesoEstimadoPromedio)} <span style={{ fontSize: '0.8rem', color: 'var(--primary-light)' }}>est.</span></div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Real: {Math.round(p.pesoPromedio)} kg</div>
                                    </td>
                                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Últ:</span>
                                                <span style={{ 
                                                    color: p.gmpPromedio > umbralAlto ? 'var(--success)' : p.gmpPromedio > umbralMedio ? 'var(--warning)' : 'var(--error)',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {p.gmpPromedio.toFixed(1)}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Acum:</span>
                                                <span style={{ 
                                                    color: p.gmpAcumulado > umbralAlto ? 'var(--success)' : p.gmpAcumulado > umbralMedio ? 'var(--warning)' : 'var(--error)',
                                                    fontWeight: '500'
                                                }}>
                                                    {p.gmpAcumulado.toFixed(1)}
                                                </span>
                                            </div>
                                        </div>
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
                                                <button 
                                                    onClick={() => removePotrerada(p.id)}
                                                    className="btn-icon"
                                                    title="Eliminar Potrerada"
                                                    style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c', border: 'none', padding: '8px', borderRadius: '8px' }}
                                                >
                                                    <Trash2 size={16} />
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
                <div className="modal-overlay" onClick={() => setEditingPotrerada(null)}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '32px' }} onClick={e => e.stopPropagation()}>
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
                <div className="modal-overlay" onClick={() => setManagingPotrerada(null)}>
                    <div className="card modal-content" style={{ maxWidth: '800px' }} onClick={e => e.stopPropagation()}>
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
                <div className="modal-overlay" onClick={() => setSelectedDetailId(null)}>
                    <div className="card modal-content" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {role !== 'observador' && (
                                                <button
                                                    onClick={handleOpenWeighingForm}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '6px',
                                                        background: 'rgba(46, 204, 113, 0.12)',
                                                        color: 'var(--success)',
                                                        border: '1px solid rgba(46, 204, 113, 0.3)',
                                                        borderRadius: '8px', padding: '7px 14px',
                                                        fontSize: '0.82rem', fontWeight: '600', cursor: 'pointer'
                                                    }}
                                                >
                                                    <Scale size={15} />
                                                    Nuevo Pesaje
                                                </button>
                                            )}
                                            <button onClick={() => setSelectedDetailId(null)} className="btn-icon">
                                                <X size={20} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Main Content Scrollable */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                    
                                    {/* Gráficas Responsive */}
                                    <div className="responsive-grid" style={{ marginBottom: '24px' }}>
                                        <div className="glass-panel" style={{ padding: '16px', height: '280px' }}>
                                            <h4 style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peso Promedio</h4>
                                            {detailData.history.length > 1 ? (
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
                                                <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0 20px' }}>Información insuficiente para generar la gráfica</div>
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
                                                <div style={{ height: '85%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0 20px' }}>Información insuficiente para generar la gráfica</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Lista de Animales */}
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Info size={14} /> Detalle por Animal
                                    </h4>
                                    <div className="table-container">
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                    <th 
                                                        onClick={() => handleSort('numero_chapeta')}
                                                        style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            CHAPETA
                                                            {sortConfig?.key === 'numero_chapeta' && (
                                                                <span style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                            )}
                                                        </div>
                                                    </th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PROPIETARIO</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>INGRESO {detailData.potrerada.etapa.toUpperCase()}</th>
                                                    <th 
                                                        onClick={() => handleSort('pesoActual')}
                                                        style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                            PESO ACTUAL
                                                            {sortConfig?.key === 'pesoActual' && (
                                                                <span style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                            )}
                                                        </div>
                                                    </th>
                                                    {detailData.fechasColumnas.map(fecha => (
                                                        <th key={fecha} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>PESAJE {format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}</th>
                                                    ))}
                                                    <th 
                                                        onClick={() => handleSort('gmp')}
                                                        style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer' }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                            GMP
                                                            {sortConfig?.key === 'gmp' && (
                                                                <span style={{ fontSize: '0.6rem' }}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                            )}
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedAnimals.map((a, idx) => (
                                                    <tr key={a.id} style={{ borderBottom: idx < sortedAnimals.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                                        <td style={{ padding: '12px 16px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>#{a.numero_chapeta}</td>
                                                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{a.nombre_propietario}</td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                            {a.fechaIngresoEtapa ? format(new Date(a.fechaIngresoEtapa + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            {a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-'}
                                                        </td>
                                                        {detailData.fechasColumnas.map(fecha => (
                                                            <td key={fecha} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                                                                {a.pesajesFiltrados?.[fecha] ? `${Math.round(a.pesajesFiltrados[fecha])} kg` : '-'}
                                                            </td>
                                                        ))}
                                                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                            <span style={{ 
                                                                color: (a.gmp || 0) > umbralAlto ? 'var(--success)' : (a.gmp || 0) > umbralMedio ? 'var(--warning)' : 'var(--error)',
                                                                fontWeight: 'bold'
                                                            }}>
                                                                {(a.gmp || 0).toFixed(1)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {sortedAnimals.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4 + detailData.fechasColumnas.length + 1} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                            Esta potrerada no tiene animales activos.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                            {detailData.animales.length > 0 && (() => {
                                                const totalKilos = detailData.animales.reduce((sum, a) => sum + (a.pesoActual || 0), 0);
                                                const pesoPromedio = totalKilos / detailData.animales.length;
                                                return (
                                                    <tfoot>
                                                        <tr style={{ borderTop: '2px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}>
                                                            <td colSpan={4 + detailData.fechasColumnas.length - 1} style={{ padding: '14px 16px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                {detailData.animales.length} animales &nbsp;|&nbsp; Total Kilos:
                                                            </td>
                                                            <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap', color: 'var(--primary-light)', fontSize: '1rem' }}>
                                                                {Math.round(totalKilos).toLocaleString('es-CO')} kg
                                                            </td>
                                                            <td style={{ padding: '14px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '2px', textTransform: 'uppercase' }}>Prom. Lote</div>
                                                                <span style={{ fontWeight: 'bold', color: 'var(--primary-light)', fontSize: '1rem' }}>
                                                                    {Math.round(pesoPromedio)} kg
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                );
                                            })()}
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

            {/* Modal: Formulario de Pesaje Grupal */}
            {showWeighingForm && detailData && (
                <div className="modal-overlay" onClick={() => { setShowWeighingForm(false); setWeighingData({}); }}>
                    <div className="card modal-content" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 4px 0', color: 'var(--primary-light)', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Scale size={20} /> Nuevo Pesaje
                                    </h2>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                        {detailData.potrerada.nombre} &nbsp;·&nbsp; Fecha: <strong style={{ color: 'var(--text)' }}>{new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>
                                    </p>
                                </div>
                                <button onClick={() => { setShowWeighingForm(false); setWeighingData({}); }} className="btn-icon">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '12px' }}>
                                Ingresa el nuevo peso de cada animal. Puedes dejar en blanco los que no se pesaron.
                            </p>
                            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '40%' }}>Chapeta</th>
                                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '30%' }}>Peso Actual</th>
                                            <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', width: '30%' }}>Nuevo Peso (kg)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detailData.animales
                                            .slice()
                                            .sort((a, b) => a.numero_chapeta.localeCompare(b.numero_chapeta, undefined, { numeric: true, sensitivity: 'base' }))
                                            .map((a, idx) => {
                                                const newVal = weighingData[a.id] ?? '';
                                                const hasWeight = newVal !== '' && Number(newVal) > 0;
                                                return (
                                                    <tr key={a.id} style={{
                                                        borderBottom: idx < detailData.animales.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                                        background: hasWeight ? 'rgba(46,204,113,0.04)' : 'transparent'
                                                    }}>
                                                        <td style={{ padding: '10px 16px', fontWeight: 'bold', fontSize: '0.95rem' }}>#{a.numero_chapeta}</td>
                                                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                            {a.pesoActual ? `${Math.round(a.pesoActual)} kg` : '-'}
                                                        </td>
                                                        <td style={{ padding: '8px 12px' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.5"
                                                                placeholder="ej: 320"
                                                                value={newVal}
                                                                onChange={e => setWeighingData(prev => ({ ...prev, [a.id]: e.target.value }))}
                                                                style={{
                                                                    width: '100%', padding: '7px 10px', fontSize: '0.9rem',
                                                                    marginBottom: 0,
                                                                    background: hasWeight ? 'rgba(46,204,113,0.08)' : 'rgba(255,255,255,0.05)',
                                                                    border: hasWeight ? '1px solid rgba(46,204,113,0.4)' : '1px solid rgba(255,255,255,0.1)',
                                                                    borderRadius: '8px', color: 'var(--text)'
                                                                }}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        }
                                    </tbody>
                                </table>
                            </div>

                            {/* Summary bar */}
                            {(() => {
                                const filled = Object.values(weighingData).filter(v => v !== '' && Number(v) > 0).length;
                                return filled > 0 ? (
                                    <div style={{ marginTop: '12px', padding: '10px 16px', background: 'rgba(46,204,113,0.08)', border: '1px solid rgba(46,204,113,0.2)', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--success)' }}>
                                        ✅ {filled} de {detailData.animales.length} animales con peso ingresado.
                                    </div>
                                ) : null;
                            })()}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button
                                onClick={() => { setShowWeighingForm(false); setWeighingData({}); }}
                                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', padding: '9px 20px', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-muted)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveWeighings}
                                disabled={savingWeighings}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 24px' }}
                            >
                                {savingWeighings ? 'Guardando...' : <><Save size={16} /> Guardar Pesajes</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Plus size={24} color="var(--primary)" /> Nueva Potrerada / Lote
                            </h2>
                            <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleAddPotrerada}>
                            <div style={{ marginBottom: '20px' }}>
                                <label>Nombre de la Potrerada</label>
                                <input 
                                    type="text" 
                                    placeholder="Ej: Lote 1 - Engorde" 
                                    value={nuevaPotreradaNombre} 
                                    onChange={e => setNuevaPotreradaNombre(e.target.value)} 
                                    autoFocus
                                    required
                                />
                            </div>
                            
                            <div style={{ marginBottom: '20px' }}>
                                <label>Etapa del Ganado</label>
                                <select 
                                    value={nuevaPotreradaEtapa} 
                                    onChange={e => setNuevaPotreradaEtapa(e.target.value)}
                                    required
                                >
                                    <option value="cria">Cría</option>
                                    <option value="levante">Levante</option>
                                    <option value="ceba">Ceba</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '32px' }}>
                                <label>Rotación Asignada (Opcional)</label>
                                <select 
                                    value={nuevaPotreradaRotacion} 
                                    onChange={e => setNuevaPotreradaRotacion(e.target.value)}
                                >
                                    <option value="">-- Sin Rotación Asignada --</option>
                                    {rotaciones.map(r => (
                                        <option key={r.id} value={r.id}>{r.nombre}</option>
                                    ))}
                                </select>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Vincula permanentemente este grupo a un conjunto de potreros.</p>
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setShowAddModal(false)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: 'none' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={loading} style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    {loading ? 'Creando...' : 'Crear Potrerada'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingPotrerada && (
                <div className="modal-overlay" onClick={() => setEditingPotrerada(null)}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '32px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Edit2 size={24} color="var(--primary)" /> Editar Potrerada
                            </h2>
                            <button onClick={() => setEditingPotrerada(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form onSubmit={e => { e.preventDefault(); handleUpdateName(); }}>
                            <div style={{ marginBottom: '20px' }}>
                                <label>Nuevo Nombre</label>
                                <input 
                                    type="text" 
                                    value={newName} 
                                    onChange={e => setNewName(e.target.value)} 
                                    autoFocus
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label>Rotación Asignada</label>
                                <select 
                                    value={editRotacion || ''} 
                                    onChange={e => setEditRotacion(e.target.value || null)}
                                >
                                    <option value="">-- Sin Rotación --</option>
                                    {rotaciones.map(r => (
                                        <option key={r.id} value={r.id}>{r.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button type="button" onClick={() => setEditingPotrerada(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: 'none' }}>
                                    Cancelar
                                </button>
                                <button type="submit" style={{ flex: 2 }}>
                                    Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
