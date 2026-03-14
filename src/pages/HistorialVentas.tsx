import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Tag, Calendar, Users, FileText, X, Info, TrendingUp } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import SalesReport from '../components/SalesReport';
import SalesReportSimple from '../components/SalesReportSimple';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface AnimalVentaParaReporte {
    numero_chapeta: string;
    peso_salida: string | number;
    propietario: string;
    gmp?: number;
    potreroNombre?: string;
    fecha_ingreso?: string;
    fecha_inicio_ceba?: string | null;
}

// Tipo enriquecido para la tarjeta de detalle de la venta
interface AnimalVentaDetalle {
    id: string;
    numero_chapeta: string;
    nombre_propietario: string;
    etapa: string;
    peso_ingreso: number;
    fecha_ingreso: string;
    peso_venta: number;
    gmp: number;
    pesajesFiltrados: Record<string, number>;
    registros_pesaje: { peso: number; fecha: string; gdp_calculada: number }[];
}

interface VentaGrupo {
    id: string;
    titulo: string;
    fechaVenta: string;
    comprador: string;
    animalesCount: number;
    pesoPromedio: number;
    gmpPromedio: number;
    animalesReporte: AnimalVentaParaReporte[];
    animalesDetalle: AnimalVentaDetalle[];
}

export default function HistorialVentas() {
    const { fincaId, userFincas } = useAuth();
    const [ventas, setVentas] = useState<VentaGrupo[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [umbralAlto, setUmbralAlto] = useState(20);
    const [umbralMedio, setUmbralMedio] = useState(10);
    
    // Estado para abrir el reporte PDF completo
    const [selectedVenta, setSelectedVenta] = useState<VentaGrupo | null>(null);

    // Estado para abrir el reporte simple (solo chapeta + peso)
    const [selectedVentaSimple, setSelectedVentaSimple] = useState<VentaGrupo | null>(null);

    // Estado para abrir modal de detalle de venta (estilo Potreradas)
    const [detalleVenta, setDetalleVenta] = useState<VentaGrupo | null>(null);

    // Estado para tarjeta individual de un animal vendido
    const [selectedAnimalDetalle, setSelectedAnimalDetalle] = useState<AnimalVentaDetalle | null>(null);

    useEffect(() => {
        if (!fincaId) return;
        
        const fetchVentas = async () => {
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
                    comprador_venta,
                    fecha_venta,
                    peso_venta,
                    peso_ingreso,
                    fecha_ingreso,
                    etapa,
                    potreros (nombre),
                    registros_pesaje (
                        peso,
                        fecha,
                        etapa,
                        gdp_calculada
                    )
                `)
                .eq('id_finca', fincaId)
                .eq('estado', 'vendido')
                .order('fecha_venta', { ascending: false });

            if (data && !error) {
                const grouped = data.reduce((acc: any, animal: any) => {
                    const fecha = animal.fecha_venta || 'Sin fecha';
                    const comprador = animal.comprador_venta || 'Desconocido';
                    const key = `${fecha}-${comprador}`;
                    
                    const registros = (animal.registros_pesaje || []).sort((x: any, y: any) => 
                        new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                    );
                    const ultimoP = registros[0];
                    const gdp = ultimoP?.gdp_calculada || 0;
                    const gmp = gdp > 0 ? gdp * 30 : 0;

                    const potreroObj = animal.potreros as any;
                    const potreroNombre = Array.isArray(potreroObj) ? potreroObj[0]?.nombre : potreroObj?.nombre || 'Sin potrero';

                    const registroCeba = (animal.registros_pesaje || [])
                        .filter((r: any) => r.etapa === 'ceba')
                        .sort((x: any, y: any) => new Date(x.fecha).getTime() - new Date(y.fecha).getTime())[0];
                    const fechaInicioCeba = registroCeba ? registroCeba.fecha : (animal.etapa === 'ceba' ? animal.fecha_ingreso : null);

                    const animalRep: AnimalVentaParaReporte = {
                        numero_chapeta: animal.numero_chapeta,
                        peso_salida: animal.peso_venta || ultimoP?.peso || 0,
                        propietario: animal.nombre_propietario,
                        gmp: gmp,
                        potreroNombre: potreroNombre,
                        fecha_ingreso: animal.fecha_ingreso,
                        fecha_inicio_ceba: fechaInicioCeba
                    };

                    // Datos enriquecidos para el modal de detalle
                    const registrosOrdenados = (animal.registros_pesaje || []).sort((x: any, y: any) =>
                        new Date(x.fecha).getTime() - new Date(y.fecha).getTime()
                    );
                    const pesajesMap: Record<string, number> = {};
                    registrosOrdenados.forEach((r: any) => {
                        pesajesMap[r.fecha] = r.peso;
                    });

                    const animalDet: AnimalVentaDetalle = {
                        id: animal.id,
                        numero_chapeta: animal.numero_chapeta,
                        nombre_propietario: animal.nombre_propietario,
                        etapa: animal.etapa,
                        peso_ingreso: animal.peso_ingreso,
                        fecha_ingreso: animal.fecha_ingreso,
                        peso_venta: animal.peso_venta || ultimoP?.peso || 0,
                        gmp: gmp,
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
                            titulo: `Venta - ${fecha} - ${comprador}`,
                            fechaVenta: fecha,
                            comprador: comprador,
                            animalesCount: 0,
                            pesoTotal: 0,
                            gmpTotal: 0,
                            gmpCount: 0,
                            animalesReporte: [],
                            animalesDetalle: []
                        };
                    }
                    
                    acc[key].animalesCount++;
                    acc[key].pesoTotal += parseFloat(animalRep.peso_salida.toString());
                    if (gmp > 0) {
                        acc[key].gmpTotal += gmp;
                        acc[key].gmpCount++;
                    }
                    acc[key].animalesReporte.push(animalRep);
                    acc[key].animalesDetalle.push(animalDet);
                    
                    return acc;
                }, {});

                const ventasList: VentaGrupo[] = Object.values(grouped).map((v: any) => ({
                    ...v,
                    pesoPromedio: v.animalesCount > 0 ? v.pesoTotal / v.animalesCount : 0,
                    gmpPromedio: v.gmpCount > 0 ? v.gmpTotal / v.gmpCount : 0
                }));
                
                // Ordenar por fecha descendente
                ventasList.sort((a, b) => new Date(b.fechaVenta).getTime() - new Date(a.fechaVenta).getTime());
                setVentas(ventasList);
            }
            setLoading(false);
        };
        fetchVentas();
    }, [fincaId]);

    const filteredVentas = ventas.filter(v => 
        v.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || 
        v.comprador.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatFecha = (fechaStr: string) => {
        if (fechaStr === 'Sin fecha') return fechaStr;
        try {
            return format(new Date(fechaStr + 'T12:00:00'), 'dd MMM yyyy', { locale: es });
        } catch {
            return fechaStr;
        }
    };

    // Calcular columnas de fechas para el modal de detalle
    const getFechasColumnas = (animales: AnimalVentaDetalle[]) => {
        const fechasSet = new Set<string>();
        animales.forEach(a => {
            Object.keys(a.pesajesFiltrados).forEach(f => fechasSet.add(f));
        });
        return Array.from(fechasSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    };

    return (
        <div className="page-container">
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Tag size={32} /> Historial de Ventas
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                Registro histórico de todas las ventas realizadas en la finca. Haz clic en el ícono PDF para ver el informe, o en "Ver Detalle" para inspeccionar los animales.
            </p>

            <div className="glass-panel" style={{ marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Buscar por comprador o fecha..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ marginBottom: 0, paddingLeft: '40px' }}
                    />
                </div>
            </div>

            <div className="grid-responsive">
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--primary)', gridColumn: '1 / -1' }}>
                        Cargando historial de ventas...
                    </div>
                ) : filteredVentas.length === 0 ? (
                    <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                        No hay ventas registradas que coincidan con la búsqueda.
                    </div>
                ) : (
                    filteredVentas.map((venta, idx) => (
                        <div 
                            key={idx} 
                            className="card" 
                            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                        >
                            <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <FileText size={20} color="var(--primary-light)" />
                                    {venta.titulo.toUpperCase()}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    <Calendar size={14} /> Fecha de salida: {formatFecha(venta.fechaVenta)}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                                    <Users size={14} /> Comprador: {venta.comprador}
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '20px', gap: '16px', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Animales</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'white' }}>{venta.animalesCount}</div>
                                </div>
                                <div style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>Peso Prom.</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'white' }}>{Math.round(venta.pesoPromedio)}<span style={{ fontSize: '0.8rem', opacity: 0.6 }}>kg</span></div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '4px' }}>GMP Lote</div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: venta.gmpPromedio > umbralAlto ? 'var(--success)' : (venta.gmpPromedio > umbralMedio ? 'var(--warning)' : (venta.gmpPromedio > 0 ? 'var(--error)' : 'white')) }}>{venta.gmpPromedio > 0 ? venta.gmpPromedio.toFixed(1) : '-'}<span style={{ fontSize: '0.8rem', opacity: 0.6 }}>kg</span></div>
                                </div>
                            </div>
                            {/* Botones de acción */}
                            <div style={{ padding: '12px 20px', display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <button
                                    onClick={() => setDetalleVenta(venta)}
                                    style={{ 
                                        flex: '1 1 120px',
                                        background: 'rgba(76, 175, 80, 0.1)', 
                                        border: '1px solid rgba(76, 175, 80, 0.3)', 
                                        color: 'var(--success)', 
                                        padding: '8px 10px', 
                                        borderRadius: '8px', 
                                        cursor: 'pointer', 
                                        fontWeight: '600', 
                                        fontSize: '0.8rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '5px',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(76, 175, 80, 0.2)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(76, 175, 80, 0.1)'; }}
                                >
                                    <Info size={14} /> Ver Detalle
                                </button>
                                <button
                                    onClick={() => setSelectedVentaSimple(venta)}
                                    style={{ 
                                        flex: '1 1 100px',
                                        padding: '8px 10px', 
                                        background: 'rgba(33, 150, 243, 0.1)', 
                                        border: '1px solid rgba(33, 150, 243, 0.3)', 
                                        color: '#64b5f6', 
                                        borderRadius: '8px', 
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '5px',
                                        fontSize: '0.8rem',
                                        fontWeight: '600',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(33, 150, 243, 0.2)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(33, 150, 243, 0.1)'; }}
                                    title="Informe simple: chapeta y peso"
                                >
                                    <FileText size={14} /> Simple
                                </button>
                                <button
                                    onClick={() => setSelectedVenta(venta)}
                                    style={{ 
                                        flex: '1 1 80px',
                                        padding: '8px 10px', 
                                        background: 'rgba(244, 67, 54, 0.1)', 
                                        border: '1px solid rgba(244, 67, 54, 0.3)', 
                                        color: 'var(--error)', 
                                        borderRadius: '8px', 
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '5px',
                                        fontSize: '0.8rem',
                                        fontWeight: '600',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(244, 67, 54, 0.2)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(244, 67, 54, 0.1)'; }}
                                    title="Informe completo PDF"
                                >
                                    <FileText size={14} /> PDF
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal PDF Report completo */}
            {selectedVenta && (
                <SalesReport
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaVenta={selectedVenta.fechaVenta}
                    animales={selectedVenta.animalesReporte}
                    comprador={selectedVenta.comprador}
                    umbralAlto={umbralAlto}
                    umbralMedio={umbralMedio}
                    onClose={() => setSelectedVenta(null)}
                />
            )}

            {/* Modal Informe Simple */}
            {selectedVentaSimple && (
                <SalesReportSimple
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaVenta={selectedVentaSimple.fechaVenta}
                    animales={selectedVentaSimple.animalesReporte}
                    comprador={selectedVentaSimple.comprador}
                    onClose={() => setSelectedVentaSimple(null)}
                />
            )}

            {/* ================================================================
                MODAL DETALLE DE VENTA - Estilo Potreradas
            ================================================================ */}
            {detalleVenta && (() => {
                const fechasColumnas = getFechasColumnas(detalleVenta.animalesDetalle);
                return (
                    <div className="modal-overlay">
                        <div className="card modal-content" style={{ maxWidth: '960px' }}>
                            {/* Header */}
                            <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h2 style={{ margin: '0 0 8px 0', color: 'var(--primary-light)', fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>
                                            {detalleVenta.titulo.toUpperCase()}
                                        </h2>
                                        <div style={{ display: 'flex', gap: '8px 16px', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <Calendar size={14} color="var(--primary)" />
                                                <span>Fecha salida:</span>
                                                <strong style={{ color: 'var(--text)' }}>{formatFecha(detalleVenta.fechaVenta)}</strong>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <Users size={14} color="var(--primary)" />
                                                <span>Comprador:</span>
                                                <strong style={{ color: 'var(--text)' }}>{detalleVenta.comprador}</strong>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                <TrendingUp size={14} color="var(--success)" />
                                                <span>GMP Lote:</span>
                                                <strong style={{ color: 'var(--success)' }}>{detalleVenta.gmpPromedio.toFixed(1)} kg/m</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => setDetalleVenta(null)} className="btn-icon">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Contenido con scroll */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                                <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Info size={14} /> Detalle por Animal — clic en una fila para ver la tarjeta del animal
                                </h4>
                                <div className="table-container">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>CHAPETA</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>PROPIETARIO</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>F. ENTRADA FINCA</th>
                                                <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>PESO ENTRADA</th>
                                                {fechasColumnas.map(fecha => (
                                                    <th key={fecha} style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        PESAJE {format(new Date(fecha + 'T12:00:00'), 'dd/MM/yy')}
                                                    </th>
                                                ))}
                                                <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>GMP</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detalleVenta.animalesDetalle.map((a, idx) => (
                                                <tr
                                                    key={a.id}
                                                    className="table-row-hover"
                                                    style={{ borderBottom: idx < detalleVenta.animalesDetalle.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer' }}
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
                                            {detalleVenta.animalesDetalle.length === 0 && (
                                                <tr>
                                                    <td colSpan={4 + fechasColumnas.length + 1} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                        No hay datos disponibles para esta venta.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', textAlign: 'right' }}>
                                <button onClick={() => setDetalleVenta(null)} style={{ width: 'auto', padding: '8px 24px', fontSize: '0.9rem' }}>
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ================================================================
                TARJETA DE ANIMAL INDIVIDUAL (estilo Inventario)
            ================================================================ */}
            {selectedAnimalDetalle && (() => {
                const a = selectedAnimalDetalle;
                const registrosOrdenados = [...a.registros_pesaje].sort((x, y) =>
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                const ultimoP = registrosOrdenados[0];
                const fechaU = ultimoP
                    ? format(new Date(ultimoP.fecha), 'dd/MM/yyyy', { locale: es })
                    : format(new Date(a.fecha_ingreso), 'dd/MM/yyyy', { locale: es });

                // Timeline: ingreso + todos los pesajes (de más nuevo a más viejo para la tabla)
                const timeline = [
                    ...registrosOrdenados.map((p, i, arr) => {
                        const siguiente = arr[i + 1] || { peso: a.peso_ingreso, fecha: a.fecha_ingreso };
                        const d = differenceInDays(new Date(p.fecha), new Date(siguiente.fecha)) || 1;
                        const ganancia = p.peso - siguiente.peso;
                        const gmp = (ganancia / d) * 30;
                        return { fecha: p.fecha, peso: p.peso, gmp, gdp: p.gdp_calculada ?? (ganancia / d), esIngreso: false };
                    }),
                    { fecha: a.fecha_ingreso, peso: a.peso_ingreso, gmp: 0, gdp: 0, esIngreso: true }
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
                                    <span style={{ marginLeft: '8px', color: 'var(--error)', fontSize: '0.75rem', background: 'rgba(244,67,54,0.1)', padding: '2px 8px', borderRadius: '20px', textTransform: 'none' }}>VENDIDO</span>
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso Entrada Finca</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{a.peso_ingreso} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', marginTop: '4px' }}>
                                        {format(new Date(a.fecha_ingreso + 'T12:00:00'), 'dd/MM/yyyy')}
                                    </div>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '4px' }}>Peso Venta</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: 'var(--primary-light)' }}>{a.peso_venta} kg</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        Último pesaje: {fechaU}
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
                                                    <div style={{ fontWeight: '500' }}>{format(new Date(item.fecha), 'dd/MM/yyyy')}</div>
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
