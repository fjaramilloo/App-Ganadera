import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer,
    LineChart, Line, CartesianGrid, Legend, BarChart, Bar
} from 'recharts';
import { Timer, TrendingUp, Activity, Scale, Home, MapPin } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface DashboardStats {
    totalAnimales: number;
    promedioLevanteMeses: number;
    gmpLevante: number; 
    promedioCebaMeses: number;
    gmpCeba: number;
    gmpTotal: number;
    totalMuertosAno: number;
    produccionCarneHaAno: number;
    cargaAnimal: number;
    pesoPromedioEntrada: number;
    pesoPromedioSalida: number;
}

interface EvolucionItem {
    numero: number;
    label: string;
    gmpLevante?: number;
    gmpCeba?: number;
}

interface GmpDetailItem {
    id_animal: string;
    chapeta: string;
    propietario: string;
    fechaAnterior: string;
    pesoAnterior: number;
    fechaActual: string;
    pesoActual: number;
    gmp: number;
}

interface LluviaItem {
    fecha: string;
    mm: number;
}

export default function Dashboard() {
    const { fincaId } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [muertesModalVisible, setMuertesModalVisible] = useState(false);
    const [muertesData, setMuertesData] = useState<any[]>([]);
    const [loadingMuertes, setLoadingMuertes] = useState(false);

    const [stats, setStats] = useState<DashboardStats>({
        totalAnimales: 0,
        promedioLevanteMeses: 0,
        gmpLevante: 0,
        promedioCebaMeses: 0,
        gmpCeba: 0,
        gmpTotal: 0,
        totalMuertosAno: 0,
        produccionCarneHaAno: 0,
        cargaAnimal: 0,
        pesoPromedioEntrada: 360,
        pesoPromedioSalida: 540
    });
    const [fincaInfo, setFincaInfo] = useState({
        nombre: '',
        proposito: '',
        area_aprovechable: 0,
        ubicacion: ''
    });
    const [evolucionGmp, setEvolucionGmp] = useState<EvolucionItem[]>([]);
    const [evolucionLluvia, setEvolucionLluvia] = useState<LluviaItem[]>([]);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [selectedDetail, setSelectedDetail] = useState<{
        label: string,
        etapa: string,
        items: GmpDetailItem[]
    } | null>(null);
    const [detallesGmpAgrupados, setDetallesGmpAgrupados] = useState<{
        levante: Record<number, GmpDetailItem[]>,
        ceba: Record<number, GmpDetailItem[]>
    }>({ levante: {}, ceba: {} });
    const [sortCol, setSortCol] = useState<'propietario' | 'gmp'>('gmp');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleOpenMuertes = async () => {
        setMuertesModalVisible(true);
        if (muertesData.length === 0) {
            setLoadingMuertes(true);
            const { data } = await supabase
                .from('animales')
                .select('chapeta, fecha_muerte, observacion')
                .eq('id_finca', fincaId)
                .eq('estado', 'muerto')
                .order('fecha_muerte', { ascending: false });
            if (data) setMuertesData(data);
            setLoadingMuertes(false);
        }
    };

    const muertesByYear = muertesData.reduce((acc, animal) => {
        const year = animal.fecha_muerte ? animal.fecha_muerte.substring(0, 4) : 'Desconocido';
        if (!acc[year]) acc[year] = [];
        acc[year].push(animal);
        return acc;
    }, {} as Record<string, any[]>);

    useEffect(() => {
        async function fetchDashboardData() {
            if (!fincaId) return;
            setLoading(true);

            // 1. Total de Animales
            const { count: totalAnimales } = await supabase
                .from('animales')
                .select('*', { count: 'exact', head: true })
                .eq('id_finca', fincaId)
                .eq('estado', 'activo');

            // 2. Traer todos los animales activos para calcular los KPIs
            const { data: animales } = await supabase
                .from('animales')
                .select('id, etapa, fecha_ingreso, peso_ingreso')
                .eq('id_finca', fincaId)
                .eq('estado', 'activo');

            // 2b. Traer TODOS los animales para la evolución histórica
            const { data: todosAnimales } = await supabase
                .from('animales')
                .select('id, numero_chapeta, etapa, fecha_ingreso, peso_ingreso, nombre_propietario')
                .eq('id_finca', fincaId);

            // 3. Traer los últimos pesajes para evolucion
            const animalIds = todosAnimales?.map(a => a.id) || [];
            const { data: pesajes } = await supabase
                .from('registros_pesaje')
                .select('id_animal, peso, fecha, etapa, gdp_calculada')
                .in('id_animal', animalIds)
                .order('fecha', { ascending: true });

            // 3b. Traer registros de lluvia
            const { data: lluvias } = await supabase
                .from('registros_lluvia')
                .select('fecha, milimetros')
                .eq('id_finca', fincaId)
                .order('fecha', { ascending: true });

            // 4. Animales fallecidos este año
            const anioActual = new Date().getFullYear();
            const fechaInicioAnio = `${anioActual}-01-01`;
            const { count: muertosAnio } = await supabase
                .from('animales')
                .select('*', { count: 'exact', head: true })
                .eq('id_finca', fincaId)
                .eq('estado', 'muerto')
                .gte('fecha_muerte', fechaInicioAnio);

            // 5. Información de la Finca
            const { data: finca } = await supabase
                .from('fincas')
                .select('nombre, proposito, area_aprovechable, ubicacion')
                .eq('id', fincaId)
                .single();

            if (finca) {
                setFincaInfo({
                    nombre: finca.nombre,
                    proposito: finca.proposito || 'No Definido',
                    area_aprovechable: finca.area_aprovechable || 0,
                    ubicacion: finca.ubicacion || 'Sin ubicación'
                });
            }

            if (animales && animales.length > 0) {
                let totalDiasLevante = 0;
                let countLevante = 0;
                let gdpSumaLevante = 0;
                let countGdpLevante = 0;
                
                let totalDiasCeba = 0;
                let countCeba = 0;
                let gdpSumaCeba = 0;
                let countGdpCeba = 0;
                
                let gdpSumaTotal = 0;
                let countGdpTotal = 0;

                animales.forEach((animal: any) => {
                    // KPI: Promedio de Permanencia
                    if (animal.etapa === 'levante') {
                        const diffHoy = differenceInDays(new Date(), new Date(animal.fecha_ingreso));
                        totalDiasLevante += diffHoy;
                        countLevante++;
                    } else if (animal.etapa === 'ceba') {
                        const diffHoy = differenceInDays(new Date(), new Date(animal.fecha_ingreso));
                        totalDiasCeba += diffHoy;
                        countCeba++;
                    }

                    // KPI: Ganancia Mensual Promedio (GMP)
                    const misPesajes = pesajes?.filter((p: any) => p.id_animal === animal.id) || [];

                    if (misPesajes.length > 0) {
                        const ultimoPesaje = misPesajes[misPesajes.length - 1];
                        const diffDiasTotal = differenceInDays(new Date(ultimoPesaje.fecha), new Date(animal.fecha_ingreso));

                        if (diffDiasTotal > 0) {
                            const gananciaTotal = ultimoPesaje.peso - animal.peso_ingreso;
                            const gdpTotal = gananciaTotal / diffDiasTotal;

                            gdpSumaTotal += gdpTotal;
                            countGdpTotal++;

                            if (animal.etapa === 'levante') {
                                gdpSumaLevante += gdpTotal;
                                countGdpLevante++;
                            } else if (animal.etapa === 'ceba') {
                                gdpSumaCeba += gdpTotal;
                                countGdpCeba++;
                            }
                        }
                    }
                });

                // KPI Peso Promedio Entrada (Lógica: >200 animales activos -> real, sino 360)
                let pesoEntradaFinal = 360;
                if (animales.length > 200) {
                    const sumaEntrada = animales.reduce((acc: number, a: any) => acc + (parseFloat(a.peso_ingreso) || 0), 0);
                    pesoEntradaFinal = sumaEntrada / animales.length;
                }

                // KPI Peso Promedio Salida (Animales vendidos)
                const { data: vendidos } = await supabase
                    .from('animales')
                    .select('id, peso_ingreso')
                    .eq('id_finca', fincaId)
                    .eq('estado', 'vendido');
                
                let pesoSalidaFinal = 540;
                if (vendidos && vendidos.length > 0) {
                    const idsVendidos = vendidos.map(v => v.id);
                    const { data: pesajesVendidos } = await supabase
                        .from('registros_pesaje')
                        .select('id_animal, peso')
                        .in('id_animal', idsVendidos)
                        .order('fecha', { ascending: false });
                    
                    if (pesajesVendidos && pesajesVendidos.length > 0) {
                        const ultimosPesajesVenta: Record<string, number> = {};
                        pesajesVendidos.forEach(p => {
                            if (!ultimosPesajesVenta[p.id_animal]) ultimosPesajesVenta[p.id_animal] = p.peso;
                        });
                        const pesosVenta = Object.values(ultimosPesajesVenta);
                        pesoSalidaFinal = pesosVenta.reduce((a, b) => a + b, 0) / pesosVenta.length;
                    }
                }

                const gmpTotalCiclo = countGdpTotal > 0 ? (gdpSumaTotal / countGdpTotal) * 30 : 0;
                const carneHaAno = (finca?.area_aprovechable && finca.area_aprovechable > 0)
                    ? ((totalAnimales || 0) * gmpTotalCiclo * 12) / finca.area_aprovechable
                    : 0;

                setStats({
                    totalAnimales: totalAnimales || 0,
                    promedioLevanteMeses: countLevante > 0 ? (totalDiasLevante / countLevante) / 30 : 0,
                    gmpLevante: countGdpLevante > 0 ? (gdpSumaLevante / countGdpLevante) * 30 : 0,
                    promedioCebaMeses: countCeba > 0 ? (totalDiasCeba / countCeba) / 30 : 0,
                    gmpCeba: countGdpCeba > 0 ? (gdpSumaCeba / countGdpCeba) * 30 : 0,
                    gmpTotal: gmpTotalCiclo,
                    totalMuertosAno: muertosAnio || 0,
                    produccionCarneHaAno: carneHaAno,
                    cargaAnimal: (finca?.area_aprovechable && finca.area_aprovechable > 0)
                        ? (totalAnimales || 0) / finca.area_aprovechable
                        : 0,
                    pesoPromedioEntrada: pesoEntradaFinal,
                    pesoPromedioSalida: pesoSalidaFinal
                });

                // Agrupar pesajes por animal para calcular evolución por Nro de Pesaje
                const pesajesPorAnimal: Record<string, any[]> = {};
                (pesajes || []).forEach((p: any) => {
                    if (!pesajesPorAnimal[p.id_animal]) {
                        pesajesPorAnimal[p.id_animal] = [];
                    }
                    pesajesPorAnimal[p.id_animal].push(p);
                });

                const gmpLevanteAgrupado: Record<number, { sum: number, count: number }> = {};
                const gmpCebaAgrupado: Record<number, { sum: number, count: number }> = {};
                const gmpLevanteDetalles: Record<number, GmpDetailItem[]> = {};
                const gmpCebaDetalles: Record<number, GmpDetailItem[]> = {};

                Object.keys(pesajesPorAnimal).forEach(idAnimal => {
                    const animal = todosAnimales?.find(a => a.id === idAnimal);
                    if (!animal) return;

                    // Ordenar pesajes cronológicamente
                    const misPesajes = pesajesPorAnimal[idAnimal].sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
                    
                    let prevWeight = parseFloat(animal.peso_ingreso);
                    let prevDate = new Date(animal.fecha_ingreso);
                    let levanteIndex = 0;
                    let cebaIndex = 0;
                    
                    misPesajes.forEach((p: any) => {
                        const currentWeight = parseFloat(p.peso);
                        const currentDate = new Date(p.fecha);
                        const diffDias = differenceInDays(currentDate, prevDate);
                        
                        if (diffDias > 0) {
                            const ganancia = currentWeight - prevWeight;
                            const gmpVal = (ganancia / diffDias) * 30;
                            
                            const detail: GmpDetailItem = {
                                id_animal: idAnimal,
                                chapeta: animal.numero_chapeta || 'N/A',
                                propietario: animal.nombre_propietario || 'Sin Propietario',
                                fechaAnterior: format(prevDate, 'dd/MM/yyyy'),
                                pesoAnterior: prevWeight,
                                fechaActual: format(currentDate, 'dd/MM/yyyy'),
                                pesoActual: currentWeight,
                                gmp: parseFloat(gmpVal.toFixed(1))
                            };

                            if (p.etapa === 'levante') {
                                levanteIndex++;
                                if (!gmpLevanteAgrupado[levanteIndex]) gmpLevanteAgrupado[levanteIndex] = { sum: 0, count: 0 };
                                gmpLevanteAgrupado[levanteIndex].sum += gmpVal;
                                gmpLevanteAgrupado[levanteIndex].count++;
                                if (!gmpLevanteDetalles[levanteIndex]) gmpLevanteDetalles[levanteIndex] = [];
                                gmpLevanteDetalles[levanteIndex].push(detail);
                            } else {
                                cebaIndex++;
                                if (!gmpCebaAgrupado[cebaIndex]) gmpCebaAgrupado[cebaIndex] = { sum: 0, count: 0 };
                                gmpCebaAgrupado[cebaIndex].sum += gmpVal;
                                gmpCebaAgrupado[cebaIndex].count++;
                                if (!gmpCebaDetalles[cebaIndex]) gmpCebaDetalles[cebaIndex] = [];
                                gmpCebaDetalles[cebaIndex].push(detail);
                            }
                        }
                        
                        prevWeight = currentWeight;
                        prevDate = currentDate;
                    });
                });

                setDetallesGmpAgrupados({ levante: gmpLevanteDetalles, ceba: gmpCebaDetalles });

                const maxIdx = Math.max(
                    ...Object.keys(gmpLevanteAgrupado).map(Number),
                    ...Object.keys(gmpCebaAgrupado).map(Number),
                    0
                );

                if (maxIdx > 0) {
                    const dataEvolucion: EvolucionItem[] = [];
                    for (let i = 1; i <= Math.min(maxIdx, 15); i++) {
                        const item: EvolucionItem = { numero: i, label: `Medición ${i}` };
                        if (gmpLevanteAgrupado[i]) item.gmpLevante = parseFloat((gmpLevanteAgrupado[i].sum / gmpLevanteAgrupado[i].count).toFixed(1));
                        if (gmpCebaAgrupado[i]) item.gmpCeba = parseFloat((gmpCebaAgrupado[i].sum / gmpCebaAgrupado[i].count).toFixed(1));
                        dataEvolucion.push(item);
                    }
                    setEvolucionGmp(dataEvolucion);
                } else {
                    setEvolucionGmp([
                        { numero: 1, label: 'Medición 1', gmpLevante: 12.5, gmpCeba: 14.2 },
                        { numero: 2, label: 'Medición 2', gmpLevante: 13.2, gmpCeba: 15.1 },
                        { numero: 3, label: 'Medición 3', gmpLevante: 14.8, gmpCeba: 14.5 },
                        { numero: 4, label: 'Medición 4', gmpLevante: 15.1, gmpCeba: 16.0 },
                        { numero: 5, label: 'Medición 5', gmpLevante: 14.5, gmpCeba: 15.8 }
                    ]);
                }
            } else {
                setEvolucionGmp([
                    { numero: 1, label: 'Medición 1', gmpLevante: 12.5, gmpCeba: 14.2 },
                    { numero: 2, label: 'Medición 2', gmpLevante: 13.2, gmpCeba: 15.1 },
                    { numero: 3, label: 'Medición 3', gmpLevante: 14.8, gmpCeba: 14.5 },
                    { numero: 4, label: 'Medición 4', gmpLevante: 15.1, gmpCeba: 16.0 },
                    { numero: 5, label: 'Medición 5', gmpLevante: 14.5, gmpCeba: 15.8 }
                ]);
            }

            // Agrupar lluvias por mes
            const gruposLluvia: Record<string, number> = {};
            (lluvias || []).forEach((r: any) => {
                const mes = r.fecha.substring(0, 7);
                gruposLluvia[mes] = (gruposLluvia[mes] || 0) + r.milimetros;
            });

            if (Object.keys(gruposLluvia).length > 0) {
                const lt: LluviaItem[] = Object.keys(gruposLluvia)
                    .sort()
                    .map(key => {
                        const [anio, mes] = key.split('-');
                        return {
                            fecha: format(new Date(parseInt(anio), parseInt(mes) - 1), 'MMM', { locale: es }),
                            mm: parseFloat(gruposLluvia[key].toFixed(1))
                        };
                    });
                setEvolucionLluvia(lt);
            } else {
                setEvolucionLluvia([
                    { fecha: 'Ene', mm: 120 }, { fecha: 'Feb', mm: 150 }, { fecha: 'Mar', mm: 80 }, { fecha: 'Abr', mm: 200 }, { fecha: 'May', mm: 250 }
                ]);
            }
            setLoading(false);
        }
        fetchDashboardData();
    }, [fincaId]);

    return (
        <div className="page-container" style={{ paddingBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <h1 className="title" style={{ margin: 0, textAlign: 'left' }}>Indicadores de Finca</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Resumen del ciclo de ceba y levante.</p>
                </div>

            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--primary)' }}>Cargando métricas...</div>
            ) : (
                <>
                    {/* Widget Información de Finca */}
                    <div className="card" style={{
                        marginBottom: '32px',
                        padding: '32px',
                        background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(25, 25, 25, 0.5) 100%)',
                        border: '1px solid rgba(76, 175, 80, 0.2)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '32px',
                        alignItems: 'center'
                    }}>
                        <div style={{
                            padding: '24px',
                            borderRadius: '20px',
                            background: 'rgba(76, 175, 80, 0.2)',
                            color: 'var(--primary-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Home size={48} />
                        </div>
                        <div style={{ flex: 1, minWidth: '250px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.8rem', color: 'white', marginBottom: '8px' }}>{fincaInfo.nombre}</h2>
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                    <MapPin size={18} /> {fincaInfo.ubicacion}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                                    <Activity size={18} /> <span style={{ color: 'white', fontWeight: 'bold' }}>{fincaInfo.proposito}</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div 
                                onClick={() => navigate('/inventario')}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    padding: '20px 32px',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    textAlign: 'center',
                                    minWidth: '150px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            >
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Inventario Actual</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>
                                    {stats.totalAnimales} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Cabezas</span>
                                </div>
                            </div>
                            <div 
                                onClick={handleOpenMuertes}
                                style={{
                                    background: 'rgba(255,100,100,0.05)',
                                    padding: '20px 32px',
                                    borderRadius: '16px',
                                    border: '1px solid rgba(255,100,100,0.1)',
                                    textAlign: 'center',
                                    minWidth: '150px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,100,100,0.15)'}
                                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,100,100,0.05)'}
                            >
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Muertes Año</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--error)' }}>
                                    {stats.totalMuertosAno}
                                </div>
                            </div>
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                padding: '20px 32px',
                                borderRadius: '16px',
                                border: '1px solid rgba(255,255,255,0.05)',
                                textAlign: 'center',
                                minWidth: '150px'
                            }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Área de Ganado</div>
                                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>
                                    {fincaInfo.area_aprovechable} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Ha</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* KPI Widgets */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: '24px',
                        marginBottom: '32px'
                    }}>
                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(255, 152, 0, 0.15)', color: 'var(--warning)' }}>
                                <Timer size={32} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>Levante</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tiempo Promedio</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{stats.promedioLevanteMeses.toFixed(1)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>meses</span></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>GMP Lote</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--success)' }}>{stats.gmpLevante.toFixed(1)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>kg</span></span>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(76, 175, 80, 0.15)', color: 'var(--success)' }}>
                                <TrendingUp size={32} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>Ceba</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Tiempo Promedio</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{stats.promedioCebaMeses.toFixed(1)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>meses</span></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>GMP Lote</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--success)' }}>{stats.gmpCeba.toFixed(1)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>kg</span></span>
                                </div>
                            </div>
                        </div>


                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(156, 39, 176, 0.15)', color: '#BA68C8' }}>
                                <MapPin size={32} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>Rendimiento Ha</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Kg / Ha / Año</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{Math.round(stats.produccionCarneHaAno)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>kg</span></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carga Animal Actual</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{stats.cargaAnimal.toFixed(2)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>UG/Ha</span></span>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <div style={{ padding: '16px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.05)', color: 'white' }}>
                                <Scale size={32} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>Pesos Promedio</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Entrada</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>{Math.round(stats.pesoPromedioEntrada)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>kg</span></span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Salida / Venta</span>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', whiteSpace: 'nowrap' }}>{Math.round(stats.pesoPromedioSalida)} <span style={{ fontSize: '0.8rem', fontWeight: 'normal' }}>kg</span></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Gráficas */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
                        <div className="card" style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>Desempeño de GMP por Medición</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Evolución del promedio de ganancia por cada toma de peso (Levante vs Ceba)</p>
                            </div>
                            <div style={{ width: '100%', height: '350px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={evolucionGmp} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="label"
                                            stroke="var(--text-muted)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                        />
                                        <YAxis
                                            stroke="var(--text-muted)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                            unit=" kg"
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                                            itemStyle={{ fontSize: '0.9rem' }}
                                        />
                                        <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                        <Line
                                            type="monotone"
                                            name="GMP Levante"
                                            dataKey="gmpLevante"
                                            stroke="var(--warning)"
                                            strokeWidth={4}
                                            dot={{ r: 6, fill: '#ff9800', stroke: 'white', strokeWidth: 2, cursor: 'pointer' }}
                                            activeDot={{ 
                                                r: 8, 
                                                onClick: (_e: any, payload: any) => {
                                                    const num = payload.payload.numero;
                                                    setSelectedDetail({
                                                        label: payload.payload.label,
                                                        etapa: 'Levante',
                                                        items: detallesGmpAgrupados.levante[num] || []
                                                    });
                                                    setDetailModalVisible(true);
                                                    setSortCol('gmp');
                                                    setSortOrder('asc');
                                                }
                                            }}
                                            connectNulls
                                        />
                                        <Line
                                            type="monotone"
                                            name="GMP Ceba"
                                            dataKey="gmpCeba"
                                            stroke="var(--success)"
                                            strokeWidth={4}
                                            dot={{ r: 6, fill: '#4caf50', stroke: 'white', strokeWidth: 2, cursor: 'pointer' }}
                                            activeDot={{ 
                                                r: 8, 
                                                onClick: (_e: any, payload: any) => {
                                                    const num = payload.payload.numero;
                                                    setSelectedDetail({
                                                        label: payload.payload.label,
                                                        etapa: 'Ceba',
                                                        items: detallesGmpAgrupados.ceba[num] || []
                                                    });
                                                    setDetailModalVisible(true);
                                                    setSortCol('gmp');
                                                    setSortOrder('asc');
                                                }
                                            }}
                                            connectNulls
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '24px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>Histórico de Lluvias (Pluviosidad)</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Milímetros de agua registrados mensualmente</p>
                            </div>
                            <div style={{ width: '100%', height: '350px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={evolucionLluvia} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="fecha"
                                            stroke="var(--text-muted)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                        />
                                        <YAxis
                                            stroke="var(--text-muted)"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                                            unit=" mm"
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(33, 150, 243, 0.1)' }}
                                            contentStyle={{ backgroundColor: '#1A1A1A', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }}
                                            itemStyle={{ color: '#64B5F6' }}
                                        />
                                        <Bar
                                            name="Lluvia (mm)"
                                            dataKey="mm"
                                            fill="#2196F3"
                                            radius={[6, 6, 0, 0]}
                                            barSize={40}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Modal de Muertes */}
                    {muertesModalVisible && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            zIndex: 1000, padding: '20px'
                        }} onClick={() => setMuertesModalVisible(false)}>
                            <div style={{
                                background: 'var(--bg-card)',
                                padding: '32px',
                                borderRadius: '16px',
                                width: '100%',
                                maxWidth: '600px',
                                maxHeight: '80vh',
                                display: 'flex', flexDirection: 'column',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                            }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <h2 style={{ margin: 0, color: 'white' }}>Registro Histórico de Muertes</h2>
                                    <button onClick={() => setMuertesModalVisible(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem', padding: '0 8px' }}>&times;</button>
                                </div>
                                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
                                    {loadingMuertes ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--primary-light)' }}>Cargando registros...</div>
                                    ) : muertesData.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No hay muertes registradas.</div>
                                    ) : (
                                        Object.keys(muertesByYear).sort((a,b) => b.localeCompare(a)).map(year => (
                                            <div key={year} style={{ marginBottom: '24px' }}>
                                                <h3 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', color: 'var(--error)', marginTop: 0 }}>
                                                    {year} <span style={{fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal'}}>({muertesByYear[year].length} animales)</span>
                                                </h3>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {muertesByYear[year].map((m: any, idx: number) => (
                                                        <div key={idx} style={{ 
                                                            background: 'rgba(255,255,255,0.03)', 
                                                            padding: '16px', 
                                                            borderRadius: '12px', 
                                                            border: '1px solid rgba(255,255,255,0.05)',
                                                            display: 'flex', 
                                                            justifyContent: 'space-between', 
                                                            alignItems: 'flex-start',
                                                            gap: '16px'
                                                        }}>
                                                            <div>
                                                                <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'white' }}>Chapeta: {m.chapeta || 'N/A'}</div>
                                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                                    {m.fecha_muerte ? format(new Date(m.fecha_muerte), "d 'de' MMMM", { locale: es }) : 'Sin fecha'}
                                                                </div>
                                                            </div>
                                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '50%', textAlign: 'right', fontStyle: 'italic', wordBreak: 'break-word' }}>
                                                                {m.observacion || 'Sin observaciones detalladas'}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Modal de Detalle de Animales (GMP por punto) */}
                    {detailModalVisible && selectedDetail && (
                        <div className="modal-overlay" onClick={() => setDetailModalVisible(false)}>
                            <div className="modal-content" style={{ maxWidth: '900px', height: 'auto', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
                                <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h2 style={{ margin: 0, color: 'white' }}>Detalle de Pesajes: {selectedDetail.label}</h2>
                                        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Etapa: <strong style={{color: selectedDetail.etapa === 'Levante' ? 'var(--warning)' : 'var(--success)'}}>{selectedDetail.etapa}</strong> | {selectedDetail.items.length} animales aportando.</p>
                                    </div>
                                    <button onClick={() => setDetailModalVisible(false)} className="btn-icon" style={{fontSize: '1.5rem'}}>&times;</button>
                                </div>
                                <div style={{ padding: '24px', overflowY: 'auto' }}>
                                    <div className="table-container">
                                        <table style={{ minWidth: '800px' }}>
                                            <thead>
                                                <tr>
                                                    <th>Chapeta</th>
                                                    <th 
                                                        onClick={() => {
                                                            if (sortCol === 'propietario') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                            else { setSortCol('propietario'); setSortOrder('asc'); }
                                                        }}
                                                        style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        Propietario {sortCol === 'propietario' && (sortOrder === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th>Fecha Ant.</th>
                                                    <th>Peso Ant.</th>
                                                    <th>Fecha Actual</th>
                                                    <th>Peso Actual</th>
                                                    <th 
                                                        onClick={() => {
                                                            if (sortCol === 'gmp') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                                            else { setSortCol('gmp'); setSortOrder('asc'); }
                                                        }}
                                                        style={{ textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                    >
                                                        GMP (kg/mes) {sortCol === 'gmp' && (sortOrder === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...selectedDetail.items]
                                                    .sort((a, b) => {
                                                        if (sortCol === 'propietario') {
                                                            const valA = a.propietario.toLowerCase();
                                                            const valB = b.propietario.toLowerCase();
                                                            return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
                                                        } else {
                                                            return sortOrder === 'asc' ? a.gmp - b.gmp : b.gmp - a.gmp;
                                                        }
                                                    })
                                                    .map((item, idx) => (
                                                    <tr key={idx} className="table-row-hover">
                                                        <td style={{ fontWeight: 'bold', color: 'var(--primary-light)' }}>#{item.chapeta}</td>
                                                        <td style={{ fontSize: '0.85rem' }}>{item.propietario}</td>
                                                        <td>{item.fechaAnterior}</td>
                                                        <td>{item.pesoAnterior} kg</td>
                                                        <td>{item.fechaActual}</td>
                                                        <td style={{ fontWeight: 'bold', color: 'white' }}>{item.pesoActual} kg</td>
                                                        <td style={{ 
                                                            textAlign: 'right', 
                                                            fontWeight: 'bold', 
                                                            color: item.gmp < 10 ? 'var(--error)' : 'var(--success)' 
                                                        }}>
                                                            {item.gmp}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {selectedDetail.items.length === 0 && (
                                                    <tr>
                                                        <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                                            No hay datos detallados para este punto (Datos de ejemplo o históricos insuficientes).
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div style={{ padding: '20px 24px', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>
                                    <button onClick={() => setDetailModalVisible(false)} style={{ width: 'auto', padding: '10px 24px' }}>Cerrar</button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
