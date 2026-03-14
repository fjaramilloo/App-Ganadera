import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';

interface AnimalReport {
    numero_chapeta: string;
    peso_salida: string | number;
    propietario: string;
    gmp?: number;
    potreroNombre?: string;
    fecha_ingreso?: string;
    fecha_inicio_ceba?: string | null;
}

interface SalesReportProps {
    fincaNombre: string;
    fechaVenta: string;
    animales: AnimalReport[];
    comprador: string;
    onClose: () => void;
}

export default function SalesReport({ fincaNombre, fechaVenta, animales, comprador, onClose }: SalesReportProps) {
    // Cálculos
    const totalKilos = animales.reduce((sum, a) => sum + parseFloat(a.peso_salida.toString()), 0);
    const totalAnimales = animales.length;
    
    // Promedio GMP (excluyendo los que sean 0 o undefined)
    const animalesConGMP = animales.filter(a => a.gmp && a.gmp > 0);
    const promedioGMP = animalesConGMP.length > 0 
        ? animalesConGMP.reduce((sum: number, a) => sum + (a.gmp || 0), 0) / animalesConGMP.length
        : 0;

    // Tiempos promedio
    const calcularDias = (inicio: string, fin: string) => {
        const d1 = new Date(inicio);
        const d2 = new Date(fin);
        return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
    };

    const diasFincaTotal = animales.reduce((sum, a) => sum + (a.fecha_ingreso ? calcularDias(a.fecha_ingreso, fechaVenta) : 0), 0);
    const promedioDiasFinca = Math.round(diasFincaTotal / totalAnimales);

    const animalesEnCeba = animales.filter(a => a.fecha_inicio_ceba);
    const diasCebaTotal = animalesEnCeba.reduce((sum, a) => sum + (a.fecha_inicio_ceba ? calcularDias(a.fecha_inicio_ceba, fechaVenta) : 0), 0);
    const promedioDiasCeba = animalesEnCeba.length > 0 ? Math.round(diasCebaTotal / animalesEnCeba.length) : 0;

    // Agrupación por propietario (Marca)
    const porMarca = animales.reduce((acc: any, a) => {
        const marca = a.propietario || 'No definida';
        if (!acc[marca]) {
            acc[marca] = { count: 0, kilos: 0, gmpSum: 0, gmpCount: 0 };
        }
        acc[marca].count += 1;
        acc[marca].kilos += parseFloat(a.peso_salida.toString());
        if (a.gmp && a.gmp > 0) {
            acc[marca].gmpSum += a.gmp;
            acc[marca].gmpCount += 1;
        }
        return acc;
    }, {});

    const resumenMarcas = Object.keys(porMarca).map(marca => ({
        marca,
        count: porMarca[marca].count,
        kilos: porMarca[marca].kilos,
        promedio: porMarca[marca].count > 0 ? porMarca[marca].kilos / porMarca[marca].count : 0,
        promedioGMP: porMarca[marca].gmpCount > 0 ? porMarca[marca].gmpSum / porMarca[marca].gmpCount : 0
    }));

    // Dividir animales para tabla de 2 columnas (solo en desktop)

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="report-modal-overlay">
            <style>
                {`
                @media print {
                    @page { margin: 1cm; }
                    body * { visibility: hidden; }
                    .report-container, .report-container * { visibility: visible; }
                    .report-container { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%; 
                        padding: 0;
                        background: white !important;
                        color: black !important;
                        box-shadow: none !important;
                    }
                    .no-print { display: none !important; }
                    .report-tables-wrapper {
                        display: flex !important;
                    }
                    .report-table {
                        width: 50% !important;
                    }
                }
                .report-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85);
                    backdrop-filter: blur(8px);
                    z-index: 2000;
                    display: flex;
                    justify-content: center;
                    padding: 20px;
                    overflow-y: auto;
                }
                .report-container {
                    background: white;
                    color: #333;
                    width: 100%;
                    max-width: 850px;
                    padding: 40px;
                    border-radius: 12px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
                    height: fit-content;
                    font-family: 'Inter', sans-serif;
                    position: relative;
                }
                .report-header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #f0f0f0;
                    padding-bottom: 20px;
                }
                .report-title {
                    font-size: 26px;
                    font-weight: 800;
                    margin-bottom: 8px;
                    color: black;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .report-subtitle {
                    font-size: 15px;
                    line-height: 1.6;
                    color: #666;
                }
                .report-tables-wrapper {
                    display: block;
                    width: 100%;
                    border: 1px solid #ddd;
                    margin-bottom: 20px;
                    overflow-x: auto;
                }
                .report-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                .report-table th, .report-table td {
                    border: 1px solid #ddd;
                    padding: 6px 10px;
                    text-align: center;
                }
                .report-table th {
                    background-color: #f8f9fa;
                    font-weight: 700;
                    color: #444;
                }
                .report-table tr:nth-child(even) {
                    background-color: #fafafa;
                }
                .report-summary-box {
                    margin-top: 30px;
                    display: flex;
                    width: 100%;
                    background: #f8f9fa;
                    border-radius: 8px;
                    overflow: hidden;
                    border: 1px solid #eee;
                }
                .summary-item {
                    flex: 1;
                    padding: 15px 20px;
                    text-align: center;
                    border-right: 1px solid #eee;
                }
                .summary-item:last-child { border-right: none !important; }
                .summary-label { 
                    display: block;
                    font-size: 11px;
                    color: #888;
                    text-transform: uppercase;
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                .summary-value {
                    font-size: 18px;
                    font-weight: 800;
                    color: #222;
                }
                .report-footer-table {
                    width: 100%;
                    margin-top: 25px;
                    border-collapse: collapse;
                    font-size: 12px;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .report-footer-table th, .report-footer-table td {
                    border: 1px solid #eee;
                    padding: 10px;
                    text-align: center;
                }
                .report-footer-table th {
                    background-color: #444;
                    color: white;
                    font-weight: 600;
                }

                /* Responsive Adjustments */
                @media (max-width: 650px) {
                    .report-container {
                        padding: 20px;
                    }
                    .report-tables-wrapper {
                        flex-direction: column;
                        border: none;
                    }
                    .report-table {
                        width: 100% !important;
                        margin-bottom: 20px;
                        border: 1px solid #eee;
                    }
                    .report-table:last-child {
                        margin-bottom: 0;
                    }
                    .report-summary-box {
                        flex-direction: column;
                    }
                    .summary-item {
                        border-right: none;
                        border-bottom: 1px solid #eee;
                    }
                    .summary-item:last-child {
                        border-bottom: none;
                    }
                }
                `}
            </style>

            <div className="report-container">
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '25px' }}>
                    <button 
                        onClick={handlePrint} 
                        className="btn btn-primary" 
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            padding: '12px 24px',
                            background: 'var(--primary)',
                            border: 'none',
                            borderRadius: '8px',
                            color: 'white',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(76, 175, 80, 0.2)'
                        }}
                    >
                        <Printer size={18} /> Imprimir / PDF
                    </button>
                    <button 
                        onClick={onClose} 
                        style={{ 
                            background: '#f5f5f5', 
                            color: '#666', 
                            border: 'none', 
                            borderRadius: '8px', 
                            cursor: 'pointer', 
                            padding: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="report-header">
                    <div className="report-title">Salida ganado {fincaNombre}</div>
                    <div className="report-subtitle">
                        <strong>Fecha de venta:</strong> {format(new Date(fechaVenta + 'T12:00:00'), 'dd/MM/yyyy')} <br/>
                        <strong>Comprador:</strong> {comprador}
                    </div>
                </div>

                <div className="report-tables-wrapper">
                    <table className="report-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Chapeta</th>
                                <th>Peso</th>
                                <th>GMP</th>
                                <th>Marca</th>
                                <th>Potrero</th>
                                <th>Meses Finca</th>
                                <th>Meses Ceba</th>
                            </tr>
                        </thead>
                        <tbody>
                            {animales.map((a, i) => {
                                const diasFinca = a.fecha_ingreso ? calcularDias(a.fecha_ingreso, fechaVenta) : null;
                                const diasCeba = a.fecha_inicio_ceba ? calcularDias(a.fecha_inicio_ceba, fechaVenta) : null;
                                
                                const mesesFinca = diasFinca !== null ? (diasFinca / 30).toFixed(1) : '-';
                                const mesesCeba = diasCeba !== null ? (diasCeba / 30).toFixed(1) : '-';
                                
                                return (
                                    <tr key={i}>
                                        <td style={{ color: '#888', fontSize: '10px' }}>{i + 1}</td>
                                        <td style={{ fontWeight: '600' }}>{a.numero_chapeta}</td>
                                        <td style={{ fontWeight: '700' }}>{a.peso_salida} kg</td>
                                        <td style={{ color: (a.gmp || 0) > 0 ? 'var(--success)' : '#888' }}>
                                            {a.gmp && a.gmp > 0 ? `${a.gmp.toFixed(1)} kg` : '-'}
                                        </td>
                                        <td style={{ color: '#666' }}>{a.propietario}</td>
                                        <td style={{ color: '#666' }}>{a.potreroNombre || '-'}</td>
                                        <td>{mesesFinca} m</td>
                                        <td>{mesesCeba !== '-' ? `${mesesCeba} m` : '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="report-summary-box">
                    <div className="summary-item">
                        <span className="summary-label">Total Animales</span>
                        <div className="summary-value">{totalAnimales}</div>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Peso Promedio</span>
                        <div className="summary-value">{Math.round(totalKilos / totalAnimales)} kg</div>
                    </div>
                    <div className="summary-item" style={{ background: 'rgba(76, 175, 80, 0.05)' }}>
                        <span className="summary-label">Promedio GMP Lote</span>
                        <div className="summary-value" style={{ color: 'var(--success)' }}>{promedioGMP.toFixed(2)} kg</div>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Meses Finca (Prom.)</span>
                        <div className="summary-value">{(promedioDiasFinca / 30).toFixed(1)} m</div>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Meses Ceba (Prom.)</span>
                        <div className="summary-value">{promedioDiasCeba ? (promedioDiasCeba / 30).toFixed(1) + ' m' : '-'}</div>
                    </div>
                    <div className="summary-item" style={{ borderRight: 'none' }}>
                        <span className="summary-label">Peso Total</span>
                        <div className="summary-value">{totalKilos.toLocaleString()} kg</div>
                    </div>
                </div>

                <div style={{ marginTop: '30px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase' }}>
                        Resumen por Marca / Propietario
                    </div>
                    <table className="report-footer-table">
                        <thead>
                            <tr>
                                <th>Marca</th>
                                <th>Cant.</th>
                                <th>Kilos Totales</th>
                                <th>Peso Prom.</th>
                                <th>GMP Prom.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resumenMarcas.map((r, i) => (
                                <tr key={i}>
                                    <td style={{ textAlign: 'left', fontWeight: '600' }}>{r.marca}</td>
                                    <td>{r.count}</td>
                                    <td style={{ fontWeight: '700' }}>{r.kilos.toLocaleString()} kg</td>
                                    <td>{Math.round(r.promedio)} kg</td>
                                    <td style={{ fontWeight: '600', color: r.promedioGMP > 0 ? 'var(--success)' : '#888' }}>
                                        {r.promedioGMP > 0 ? `${r.promedioGMP.toFixed(2)} kg` : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
