import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Search, Tag, Calendar, Users, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import SalesReport from '../components/SalesReport';

interface AnimalVentaParaReporte {
    numero_chapeta: string;
    peso_salida: string | number;
    propietario: string;
    gmp?: number;
    potreroNombre?: string;
    fecha_ingreso?: string;
    fecha_inicio_ceba?: string | null;
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
}

export default function HistorialVentas() {
    const { fincaId, userFincas } = useAuth();
    const [ventas, setVentas] = useState<VentaGrupo[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Estado para abrir el reporte
    const [selectedVenta, setSelectedVenta] = useState<VentaGrupo | null>(null);

    useEffect(() => {
        if (!fincaId) return;
        
        const fetchVentas = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('animales')
                .select(`
                    id, 
                    numero_chapeta, 
                    nombre_propietario,
                    comprador_venta,
                    fecha_venta,
                    peso_venta,
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
                            animalesReporte: []
                        };
                    }
                    
                    acc[key].animalesCount++;
                    acc[key].pesoTotal += parseFloat(animalRep.peso_salida.toString());
                    if (gmp > 0) {
                        acc[key].gmpTotal += gmp;
                        acc[key].gmpCount++;
                    }
                    acc[key].animalesReporte.push(animalRep);
                    
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

    return (
        <div className="page-container">
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Tag size={32} /> Historial de Ventas
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                Registro histórico de todas las ventas realizadas en la finca. Selecciona una venta para ver el informe detallado.
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
                            className="card card-hover" 
                            style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', height: '100%' }}
                            onClick={() => setSelectedVenta(venta)}
                        >
                            <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
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
                                    <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: venta.gmpPromedio > 0 ? 'var(--success)' : 'white' }}>{venta.gmpPromedio > 0 ? venta.gmpPromedio.toFixed(1) : '-'}<span style={{ fontSize: '0.8rem', opacity: 0.6 }}>kg</span></div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {selectedVenta && (
                <SalesReport
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaVenta={selectedVenta.fechaVenta}
                    animales={selectedVenta.animalesReporte}
                    comprador={selectedVenta.comprador}
                    onClose={() => setSelectedVenta(null)}
                />
            )}
        </div>
    );
}
