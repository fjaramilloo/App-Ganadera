import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, ShoppingCart, Calendar, Users, FileText, X, Info, TrendingUp } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import PurchaseReport from '../components/PurchaseReport';
import PurchaseReportSimple from '../components/PurchaseReportSimple';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface AnimalCompraParaReporte {
    numero_chapeta: string;
    peso_ingreso: string | number;
    propietario: string;
}

// Tipo enriquecido para la tarjeta de detalle de la compra
interface AnimalCompraDetalle {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    etapa: string;
    peso_ingreso: number;
    peso_compra?: number | null;
    fecha_ingreso: string;
    proveedor_compra: string;
    gmp: number;
    pesoActual: number;
    pesajesFiltrados: Record<string, number>;
    registros_pesaje: { peso: number; fecha: string; gdp_calculada: number }[];
}

interface CompraGrupo {
    id: string;
    titulo: string;
    fechaCompra: string;
    proveedor: string;
    animalesCount: number;
    pesoPromedioIngreso: number;
    pesoTotalCompra: number;
    pesoPromedioActual: number;
    gmpPromedio: number;
    animalesReporte: AnimalCompraParaReporte[];
    animalesDetalle: AnimalCompraDetalle[];
}

export default function HistorialCompras() {
    const { fincaId, userFincas } = useAuth();
    const [compras, setCompras] = useState<CompraGrupo[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);
    
    // Estado para abrir el reporte PDF completo
    const [selectedCompra, setSelectedCompra] = useState<CompraGrupo | null>(null);

    // Estado para abrir el reporte simple (chapeta + peso)
    const [selectedCompraSimple, setSelectedCompraSimple] = useState<CompraGrupo | null>(null);

    // Estado para abrir modal de detalle de compra
    const [detalleCompra, setDetalleCompra] = useState<CompraGrupo | null>(null);

    // Estado para tarjeta individual de un animal comprado
    const [selectedAnimalDetalle, setSelectedAnimalDetalle] = useState<AnimalCompraDetalle | null>(null);

    useEffect(() => {
        if (!fincaId) return;
        
        const fetchCompras = async () => {
            setLoading(true);
            const { data: config } = await supabase
                .from('configuracion_kpi')
                .select('umbral_alto_gmp, umbral_medio_gmp')
                .eq('id_finca', fincaId)
                .single();
            if (config) {
                setUmbralAlto(config.umbral_alto_gmp ?? 20);
                setUmbralMedio(config.umbral_medio_gmp ?? 10);
            }

            const { data, error } = await supabase
                .from('animales')
                .select(`
                    id, 
                    numero_chapeta, 
                    nombre_propietario,
                    potreros(nombre),
                    proveedor_compra,
                    fecha_ingreso,
                    peso_ingreso,
                    peso_compra,
                    etapa,
                    registros_pesaje (
                        peso,
                        fecha,
                        gdp_calculada
                    )
                `)
                .eq('id_finca', fincaId)
                .not('proveedor_compra', 'is', null)
                .order('fecha_ingreso', { ascending: false });

            if (data && !error) {
                const grouped = data.reduce((acc: any, animal: any) => {
                    const fecha = animal.fecha_ingreso || 'Sin fecha';
                    const proveedor = animal.proveedor_comp_extra || animal.proveedor_compra || 'Sin proveedor';
                    const key = `${fecha}-${proveedor}`;
                    
                    const registros = (animal.registros_pesaje || []).sort((x: any, y: any) => 
                        new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                    );
                    const ultimoP = registros[0];
                    const gdp = ultimoP?.gdp_calculada || 0;
                    const gmp = gdp > 0 ? gdp * 30 : 0;
                    const pesoActual = ultimoP?.peso || animal.peso_ingreso;

                    const animalRep: AnimalCompraParaReporte = {
                        numero_chapeta: animal.numero_chapeta,
                        peso_ingreso: animal.peso_ingreso || 0,
                        propietario: animal.nombre_propietario
                    };

                    // Datos enriquecidos para el modal de detalle
                    const registrosOrdenados = (animal.registros_pesaje || []).sort((x: any, y: any) =>
                        new Date(x.fecha).getTime() - new Date(y.fecha).getTime()
                    );
                    const pesajesMap: Record<string, number> = {};
                    registrosOrdenados.forEach((r: any) => {
                        pesajesMap[r.fecha] = r.peso;
                    });

                    const animalDet: AnimalCompraDetalle = {
                        id: animal.id,
                        numero_chapeta: animal.numero_chapeta,
                        nombre_propietario: animal.nombre_propietario,
                        etapa: animal.etapa,
                        peso_ingreso: (animal.peso_compra ?? animal.peso_ingreso) || 0,
                        peso_compra: animal.peso_compra,
                        fecha_ingreso: animal.fecha_ingreso,
                        proveedor_compra: proveedor,
                        gmp: gmp,
                        pesoActual: pesoActual,
                        pesajesFiltrados: pesajesMap,
                        registros_pesaje: registrosOrdenados.map((r: any) => ({
                            peso: r.peso,
                            fecha: r.fecha,
                            gdp_calculada: r.gdp_calculada || 0
                        }))
                    };

                    if (!acc[key]) {
                        acc[key] = {
                            id: key,
                            titulo: `Compra - ${fecha} - ${proveedor}`,
                            fechaCompra: fecha,
                            proveedor: proveedor,
                            animalesCount: 0,
                            pesoTotalIngreso: 0,
                            pesoTotalCompra: 0,
                            pesoTotalActual: 0,
                            gmpTotal: 0,
                            gmpCount: 0,
                            animalesReporte: [],
                            animalesDetalle: []
                        };
                    }
                    
                    acc[key].animalesCount++;
                    acc[key].pesoTotalIngreso += animal.peso_ingreso || 0;
                    acc[key].pesoTotalCompra += animal.peso_compra || 0;
                    acc[key].pesoTotalActual += pesoActual;
                    if (gmp > 0) {
                        acc[key].gmpTotal += gmp;
                        acc[key].gmpCount++;
                    }
                    acc[key].animalesReporte.push(animalRep);
                    acc[key].animalesDetalle.push(animalDet);
                    
                    return acc;
                }, {});

                const comprasList: CompraGrupo[] = Object.values(grouped).map((c: any) => ({
                    ...c,
                    pesoPromedioIngreso: c.animalesCount > 0 ? c.pesoTotalIngreso / c.animalesCount : 0,
                    pesoPromedioActual: c.animalesCount > 0 ? c.pesoTotalActual / c.animalesCount : 0,
                    gmpPromedio: c.gmpCount > 0 ? c.gmpTotal / c.gmpCount : 0
                }));
                
                // Ordenar por fecha descendente
                comprasList.sort((a, b) => new Date(b.fechaCompra).getTime() - new Date(a.fechaCompra).getTime());
                setCompras(comprasList);
            }
            setLoading(false);
        };
        fetchCompras();
    }, [fincaId]);

    const filteredCompras = compras.filter(c => 
        c.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.proveedor.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatFecha = (fechaStr: string) => {
        if (fechaStr === 'Sin fecha') return fechaStr;
        try {
            return format(new Date(fechaStr + 'T12:00:00'), 'dd MMM yyyy', { locale: es });
        } catch {
            return fechaStr;
        }
    };

    const getFechasColumnas = (animales: AnimalCompraDetalle[]) => {
        const fechasSet = new Set<string>();
        animales.forEach(a => {
            Object.keys(a.pesajesFiltrados).forEach(f => fechasSet.add(f));
        });
        return Array.from(fechasSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    };

    const resumenProveedores = useMemo(() => {
        const stats: Record<string, { totalPurchase: number, totalEntry: number, count: number, totalAnimals: number }> = {};
        
        compras.forEach(c => {
            if (!c.proveedor || c.proveedor === 'Sin proveedor') return;
            if (c.pesoTotalCompra <= 0) return;

            if (!stats[c.proveedor]) {
                stats[c.proveedor] = { totalPurchase: 0, totalEntry: 0, count: 0, totalAnimals: 0 };
            }
            stats[c.proveedor].totalPurchase += c.pesoTotalCompra;
            stats[c.proveedor].totalEntry += (c.animalesDetalle.reduce((acc, a) => acc + (a.peso_ingreso || 0), 0));
            stats[c.proveedor].count++;
            stats[c.proveedor].totalAnimals += c.animalesCount;
        });

        return Object.entries(stats)
            .map(([nombre, data]) => {
                const perdida = data.totalPurchase - data.totalEntry;
                const porcentaje = data.totalEntry > 0 ? (perdida / data.totalEntry * 100) : 0;
                return {
                    nombre,
                    porcentaje,
                    animales: data.totalAnimals,
                    compras: data.count
                };
            })
            .sort((a, b) => b.porcentaje - a.porcentaje);
    }, [compras]);

    return (
        <div className="page-container">
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <ShoppingCart size={32} /> Historial de Compras
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                Registro histórico de todas las compras realizadas en la finca. Haz clic en el ícono PDF para ver el informe detallado, o en "Ver Detalle" para inspeccionar los animales.
            </p>

            {/* Tabla de Resumen de Proveedores */}
            {!loading && resumenProveedores.length > 0 && (
                <div className="card" style={{ marginBottom: '32px', padding: '24px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingUp size={18} /> Rendimiento por Proveedor (% Promedio de Pérdida)
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)' }}>PROVEEDOR</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>COMPRAS</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>ANIMALES</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>% PÉRDIDA PROM.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resumenProveedores.map((p, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{p.nombre}</td>
                                        <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>{p.compras}</td>
                                        <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>{p.animales}</td>
                                        <td style={{ padding: '12px', textAlign: 'right' }}>
                                            <span style={{ 
                                                background: 'rgba(244, 67, 54, 0.1)', 
                                                color: 'var(--error)', 
                                                padding: '4px 10px', 
                                                borderRadius: '20px', 
                                                fontWeight: 'bold',
                                                fontSize: '0.9rem'
                                            }}>
                                                {p.porcentaje.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Buscar por proveedor o fecha..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ marginBottom: 0, paddingLeft: '40px' }}
                    />
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--primary-light)' }}>
                    Cargando historial de compras...
                </div>
            ) : filteredCompras.length === 0 ? (
                <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No hay compras registradas que coincidan con la búsqueda.
                </div>
            ) : (
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Compra / Fecha</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Proveedor</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Animales</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>Peso Prom.</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'center' }}>GMP Lote</th>
                                    <th style={{ padding: '16px 24px', color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCompras.map((compra, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s ease' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.01)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1rem' }}>{compra.fechaCompra}</div>
                                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Calendar size={12} /> {formatFecha(compra.fechaCompra)}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{compra.proveedor}</div>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <span style={{ fontWeight: 'bold', color: 'white' }}>{compra.animalesCount}</span>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <span style={{ fontWeight: 'bold', color: 'white' }}>{Math.round(compra.pesoPromedioIngreso)}</span>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '4px' }}>kg</span>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                                            <span style={{
                                                color: compra.gmpPromedio > umbralAlto ? 'var(--success)' : (compra.gmpPromedio > umbralMedio ? 'var(--warning)' : (compra.gmpPromedio > 0 ? 'var(--error)' : 'white')),
                                                fontWeight: 'bold'
                                            }}>
                                                {compra.gmpPromedio > 0 ? compra.gmpPromedio.toFixed(1) : '-'}
                                                {compra.gmpPromedio > 0 && <small style={{ fontSize: '0.7rem', opacity: 0.7, marginLeft: '2px' }}>kg/m</small>}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => setDetalleCompra(compra)}
                                                    style={{ 
                                                        background: 'rgba(76, 175, 80, 0.1)', 
                                                        border: '1px solid rgba(76, 175, 80, 0.3)', 
                                                        color: 'var(--success)', 
                                                        padding: '6px 12px', 
                                                        borderRadius: '6px', 
                                                        cursor: 'pointer', 
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                    title="Ver detalle de animales"
                                                >
                                                    <Info size={14} /> Detalle
                                                </button>
                                                <button
                                                    onClick={() => setSelectedCompraSimple(compra)}
                                                    style={{ 
                                                        background: 'rgba(33, 150, 243, 0.1)', 
                                                        border: '1px solid rgba(33, 150, 243, 0.3)', 
                                                        color: '#64b5f6', 
                                                        padding: '6px 12px', 
                                                        borderRadius: '6px', 
                                                        cursor: 'pointer', 
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                    title="Informe simple"
                                                >
                                                    <FileText size={14} /> Simple
                                                </button>
                                                <button
                                                    onClick={() => setSelectedCompra(compra)}
                                                    style={{ 
                                                        background: 'rgba(244, 67, 54, 0.1)', 
                                                        border: '1px solid rgba(244, 67, 54, 0.3)', 
                                                        color: 'var(--error)', 
                                                        padding: '6px 12px', 
                                                        borderRadius: '6px', 
                                                        cursor: 'pointer', 
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                    title="Informe PDF"
                                                >
                                                    <FileText size={14} /> PDF
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal PDF Report completo */}
            {selectedCompra && (
                <PurchaseReport
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaIngreso={selectedCompra.fechaCompra}
                    animales={selectedCompra.animalesReporte}
                    pesoCompraTotal={selectedCompra.pesoTotalCompra > 0 ? selectedCompra.pesoTotalCompra : undefined}
                    onClose={() => setSelectedCompra(null)}
                />
            )}

            {/* Modal Informe Simple */}
            {selectedCompraSimple && (
                <PurchaseReportSimple
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaCompra={selectedCompraSimple.fechaCompra}
                    animales={selectedCompraSimple.animalesReporte}
                    proveedor={selectedCompraSimple.proveedor}
                    pesoCompraTotal={selectedCompraSimple.pesoTotalCompra > 0 ? selectedCompraSimple.pesoTotalCompra : undefined}
                    onClose={() => setSelectedCompraSimple(null)}
                />
            )}

            {/* MODAL DETALLE DE COMPRA */}
            {detalleCompra && (() => {
                const fechasColumnas = getFechasColumnas(detalleCompra.animalesDetalle);
                return (
                    <div className="modal-overlay">
                        <div className="card modal-content" style={{ maxWidth: '960px' }}>
                            <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h2 style={{ margin: '0 0 8px 0', color: 'var(--primary-light)', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>
                                            {detalleCompra.titulo.toUpperCase()}
                                        </h2>
                                        <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <Calendar size={14} color="var(--primary)" />
                                                <span>Fecha compra:</span>
                                                <strong style={{ color: 'var(--text)' }}>{formatFecha(detalleCompra.fechaCompra)}</strong>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <Users size={14} color="var(--primary)" />
                                                <span>Proveedor:</span>
                                                <strong style={{ color: 'var(--text)' }}>{detalleCompra.proveedor}</strong>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <TrendingUp size={14} color="var(--success)" />
                                                <span>GMP Lote:</span>
                                                <strong style={{ color: 'var(--success)' }}>{detalleCompra.gmpPromedio.toFixed(1)} kg/m</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => setDetalleCompra(null)} className="btn-icon">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Info size={14} /> Detalle por Animal — clic en una fila para ver la tarjeta del animal
                                </h4>
                                <div className="table-container">
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>CHAPETA</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>PROPIETARIO</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>F. INGRESO</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>PESO INGRESO</th>
                                                {fechasColumnas.map(fecha => (
                                                    <th key={fecha} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        PESAJE {format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}
                                                    </th>
                                                ))}
                                                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>GMP</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalleCompra.animalesDetalle.map((a, idx) => (
                                                <tr
                                                    key={a.id}
                                                    className="table-row-hover"
                                                    style={{ borderBottom: idx < detalleCompra.animalesDetalle.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer' }}
                                                    onClick={() => setSelectedAnimalDetalle(a)}
                                                >
                                                    <td style={{ padding: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', color: 'var(--primary-light)' }}>#{a.numero_chapeta}</td>
                                                    <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>{a.nombre_propietario}</td>
                                                    <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                                                        {a.fecha_ingreso ? format(new Date(a.fecha_ingreso + 'T12:00:00'), 'dd/MM/yyyy') : '-'}
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                        {a.peso_ingreso ? `${Math.round(a.peso_ingreso)} kg` : '-'}
                                                    </td>
                                                    {fechasColumnas.map(fecha => (
                                                        <td key={fecha} style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                                            {a.pesajesFiltrados[fecha] ? `${Math.round(a.pesajesFiltrados[fecha])} kg` : '-'}
                                                        </td>
                                                    ))}
                                                    <td style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            color: (a.gmp || 0) > umbralAlto ? 'var(--success)' : (a.gmp || 0) > umbralMedio ? 'var(--warning)' : 'var(--error)',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {(a.gmp || 0).toFixed(1)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>
                                <button onClick={() => setDetalleCompra(null)} style={{ width: 'auto', padding: '8px 24px', fontSize: '0.9rem' }}>
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* TARJETA DE ANIMAL INDIVIDUAL */}
            {selectedAnimalDetalle && (() => {
                const a = selectedAnimalDetalle;
                const registrosOrdenados = [...a.registros_pesaje].sort((x, y) =>
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                const ultimoP = registrosOrdenados[0];
                const fechaU = ultimoP
                    ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es })
                    : format(new Date(a.fecha_ingreso), 'dd/MM/yyyy', { locale: es });

                const pesoBase = (a as any).peso_compra ?? a.peso_ingreso;
                const timeline = [
                    ...registrosOrdenados.map((p, i, arr) => {
                        const siguiente = arr[i + 1] || { peso: pesoBase, fecha: a.fecha_ingreso };
                        const d = differenceInDays(new Date(p.fecha), new Date(siguiente.fecha)) || 1;
                        const ganancia = p.peso - siguiente.peso;
                        const gmp = (ganancia / d) * 30;
                        return { fecha: p.fecha, peso: p.peso, gmp, gdp: p.gdp_calculada ?? (ganancia / d), esIngreso: false };
                    }),
                    { fecha: a.fecha_ingreso, peso: pesoBase, gmp: 0, gdp: 0, esIngreso: true }
                ];

                const chartData = [...timeline].reverse().map(item => ({
                    fechaStr: format(new Date(item.fecha), 'dd/MMM', { locale: es }),
                    peso: item.peso
                }));

                return (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '20px' }}>
                        <div className="card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', backgroundColor: 'var(--surface)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}>
                            <button
                                onClick={() => setSelectedAnimalDetalle(null)}
                                style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px' }}
                            >
                                <X size={24} />
                            </button>

                            <div style={{ paddingRight: '40px', marginBottom: '24px' }}>
                                <h2 style={{ color: 'white', margin: 0, fontSize: '1.8rem' }}>
                                    <span style={{ color: 'var(--primary)', marginRight: '8px' }}>#</span>
                                    {a.numero_chapeta}
                                </h2>
                                <p style={{ color: 'var(--text-muted)', margin: '4px 0 0 0', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.5px' }}>
                                    {a.etapa} • {a.nombre_propietario}
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso de Ingreso</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{(a as any).peso_compra ?? a.peso_ingreso} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', marginTop: '4px' }}>
                                        {format(new Date(a.fecha_ingreso + 'T12:00:00'), 'dd/MM/yyyy')}
                                    </div>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso Actual</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>{Math.round(a.pesoActual)} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Último: {fechaU}
                                    </div>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>GMP</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: (a.gmp || 0) > umbralAlto ? 'var(--success)' : (a.gmp || 0) > umbralMedio ? 'var(--warning)' : 'var(--error)' }}>
                                        {(a.gmp || 0).toFixed(1)} kg/m
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Ganancia mensual</div>
                                </div>
                            </div>

                            <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>Evolución de Peso</h3>
                            <div style={{ height: '220px', width: '100%', marginBottom: '32px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                                        <XAxis dataKey="fechaStr" stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                        <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                        <RechartsTooltip
                                            contentStyle={{ backgroundColor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                                            itemStyle={{ color: 'var(--primary-light)' }}
                                            labelStyle={{ color: 'var(--text-muted)', marginBottom: '4px' }}
                                        />
                                        <Line type="monotone" dataKey="peso" stroke="var(--primary)" strokeWidth={3} dot={{ fill: 'var(--primary-light)', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} name="Peso (kg)" />
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
                                                    <div style={{ fontWeight: '500' }}>{format(new Date(item.fecha + 'T12:00:00'), 'dd/MM/yyyy')}</div>
                                                    {item.esIngreso && <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: '2px', fontWeight: 'bold' }}>INGRESO</div>}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{item.peso}</td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    {item.esIngreso ? (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                                                    ) : (
                                                        <>
                                                            <div style={{ color: item.gmp > umbralAlto ? 'var(--success)' : (item.gmp > umbralMedio ? 'var(--warning)' : 'var(--error)'), fontWeight: 'bold' }}>
                                                                {item.gmp > 0 ? '+' : ''}{item.gmp.toFixed(1)} kg/mes
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>GDP: {item.gdp > 0 ? '+' : ''}{item.gdp.toFixed(3)} kg/día</div>
                                                        </>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ marginTop: '20px', textAlign: 'right' }}>
                                <button
                                    onClick={() => setSelectedAnimalDetalle(null)}
                                    style={{ width: 'auto', padding: '8px 24px', fontSize: '0.9rem' }}
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
