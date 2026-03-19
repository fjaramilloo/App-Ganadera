import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Download, Loader2, FileSpreadsheet, FileText } from 'lucide-react';
import { differenceInDays, format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
// @ts-ignore
import autoTable from 'jspdf-autotable';

interface Props {
  onClose: () => void;
}

export default function ReporteInventarioExcel({ onClose }: Props) {
  const { fincaId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<any[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [fincaNombre, setFincaNombre] = useState('');
  const [umbralAltoGmp, setUmbralAltoGmp] = useState(20);
  const [umbralMedioGmp, setUmbralMedioGmp] = useState(10);

  useEffect(() => {
    async function fetchData() {
      if (!fincaId) return;
      try {
        setLoading(true);
        setErrorMsg('');

        // Nombre de la finca y umbrales KPI del admin
        const [{ data: fincaData }, { data: kpiData }] = await Promise.all([
          supabase.from('fincas').select('nombre').eq('id', fincaId).single(),
          supabase.from('configuracion_kpi').select('umbral_alto_gmp, umbral_medio_gmp').eq('id_finca', fincaId).single()
        ]);
        if (fincaData) setFincaNombre(fincaData.nombre);
        if (kpiData) {
          setUmbralAltoGmp(Number(kpiData.umbral_alto_gmp) || 20);
          setUmbralMedioGmp(Number(kpiData.umbral_medio_gmp) || 10);
        }

        // 1. Obtener animales activos CON su potrero y la rotación del potrero
        const { data: animalesData, error: anErr } = await supabase
          .from('animales')
          .select(`
            id, numero_chapeta, nombre_propietario, peso_ingreso, fecha_ingreso, etapa, id_potrero_actual,
            potreros ( nombre, id_rotacion, rotaciones ( nombre ) ),
            registros_pesaje ( peso, fecha, gdp_calculada )
          `)
          .eq('estado', 'activo')
          .eq('id_finca', fincaId);

        if (anErr) {
          console.error('Error fetching animales:', anErr);
          throw anErr;
        }

        if (!animalesData || animalesData.length === 0) {
          setErrorMsg('No se encontraron animales activos en la finca.');
          setLoading(false);
          return;
        }

        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        // Lógica de agrupamiento: Rotación -> Potrero -> Animal(es)
        const group: Record<string, Record<string, any>> = {};
        const marcasSet = new Set<string>();
        const gdpsTotales: number[] = [];

        animalesData.forEach((a: any) => {
          // Deduplicar pesajes del mismo día
          let registros = (a.registros_pesaje || []).sort((x: any, y: any) =>
              new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
          );
          const uniqueDates = new Set();
          registros = registros.filter((p: any) => {
              const dateOnly = (p.fecha || '').split('T')[0];
              if (uniqueDates.has(dateOnly)) return false;
              uniqueDates.add(dateOnly);
              return true;
          });

          const ultimoP = registros[0];
          const potreroObj = a.potreros;
          const potreroName = potreroObj?.nombre || 'Sin Potrero';
          const rotacionObj = potreroObj?.rotaciones;
          const rotacionName = rotacionObj?.nombre || 'Sin Rotación';

          const marca = a.nombre_propietario ? a.nombre_propietario.trim() : 'ND';
          marcasSet.add(marca);

          // GDP para estimado
          if (registros.length > 1) {
              const ant = registros[1];
              const d = differenceInDays(new Date(ultimoP.fecha), new Date(ant.fecha)) || 1;
              const gan = ultimoP.peso - ant.peso;
              let gdpV = (ultimoP.gdp_calculada !== null && ultimoP.gdp_calculada !== undefined) ? Number(ultimoP.gdp_calculada) : (gan/d);
              if (gdpV === 0 && gan !== 0) gdpV = gan/d;
              gdpsTotales.push(gdpV);
          } else if (registros.length === 1) {
              const d = differenceInDays(new Date(ultimoP.fecha), new Date(a.fecha_ingreso)) || 1;
              const gan = ultimoP.peso - a.peso_ingreso;
              gdpsTotales.push(gan/d);
          }

          // GMP Total del animal: entre primer y último pesaje (o ingreso y último pesaje)
          let gmpTotalAnimal = 0;
          if (ultimoP) {
              const primerRegistro = registros[registros.length - 1]; // el más antiguo
              const startWeight = registros.length > 1 ? primerRegistro.peso : a.peso_ingreso;
              const startDate = registros.length > 1 ? new Date(primerRegistro.fecha) : new Date(a.fecha_ingreso);
              const endDate = new Date(ultimoP.fecha);
              const totalDays = differenceInDays(endDate, startDate);
              if (totalDays > 0) {
                  const totalGain = ultimoP.peso - startWeight;
                  gmpTotalAnimal = (totalGain / totalDays) * 30;
              }
          }

          if (!group[rotacionName]) group[rotacionName] = {};
          if (!group[rotacionName][potreroName]) {
              group[rotacionName][potreroName] = { 
                  rotacion: rotacionName, 
                  potrero: potreroName, 
                  animales: [],
                  marcasCounts: {} as Record<string, number>,
                  gmpSum: 0,
                  gmpCount: 0
              };
          }

          if (!group[rotacionName][potreroName].marcasCounts[marca]) {
              group[rotacionName][potreroName].marcasCounts[marca] = 0;
          }
          group[rotacionName][potreroName].marcasCounts[marca] += 1;

          if (gmpTotalAnimal !== 0) {
              group[rotacionName][potreroName].gmpSum += gmpTotalAnimal;
              group[rotacionName][potreroName].gmpCount += 1;
          }

          group[rotacionName][potreroName].animales.push({
              ...a,
              ultimo_peso: ultimoP ? ultimoP.peso : a.peso_ingreso,
              fecha_ultimo_pesaje: ultimoP ? ultimoP.fecha : a.fecha_ingreso
          });
        });

        const gdpPromedioFinca = gdpsTotales.length > 0 ? (gdpsTotales.reduce((acc, curr) => acc + curr, 0) / gdpsTotales.length) : 0.45;

        // Transformar en filas de reporte
        const rowsOutput: any[] = [];
        const allMarcas = Array.from(marcasSet).sort();

        let granTotalGanado = 0;
        let granTotalPesoReal = 0;
        let granTotalPesoEst = 0;
        let granGmpSum = 0;
        let granGmpCount = 0;

        Object.keys(group).sort().forEach(rotName => {
            Object.keys(group[rotName]).sort().forEach(potName => {
                const pData = group[rotName][potName];
                let sumPesoReal = 0;
                let sumPesoE = 0;
                const dates: Date[] = [];

                pData.animales.forEach((anim: any) => {
                    sumPesoReal += Number(anim.ultimo_peso);
                    const refDate = new Date(anim.fecha_ultimo_pesaje);
                    refDate.setHours(0,0,0,0);
                    const diff = differenceInDays(hoy, refDate) || 0;
                    sumPesoE += Number(anim.ultimo_peso) + (diff * gdpPromedioFinca);
                    dates.push(refDate);
                });

                const maxDate = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
                const count = pData.animales.length;

                const gmpProm = pData.gmpCount > 0 ? pData.gmpSum / pData.gmpCount : 0;

                const row: any = {
                    'Rotación': rotName,
                    'Potrero': pData.potrero,
                };
                allMarcas.forEach(m => {
                    row[m] = pData.marcasCounts[m] || 0;
                });
                row['Total Ganado'] = count;
                row['GMP Total'] = Number(gmpProm.toFixed(1));
                row['Último Pesaje'] = maxDate ? format(maxDate, 'dd/MM/yyyy') : 'N/A';
                row['Peso Promedio'] = count > 0 ? Number((sumPesoReal / count).toFixed(1)) : 0;
                row['Peso Estimado Hoy'] = count > 0 ? Number((sumPesoE / count).toFixed(1)) : 0;

                granTotalGanado += count;
                granTotalPesoReal += sumPesoReal;
                granTotalPesoEst += sumPesoE;
                granGmpSum += pData.gmpSum;
                granGmpCount += pData.gmpCount;

                rowsOutput.push(row);
            });
        });

        // Fila de totales
        if (rowsOutput.length > 0) {
            const totalRow: any = {
                'Rotación': 'TOTAL',
                'Potrero': '',
            };
            allMarcas.forEach(m => {
                totalRow[m] = rowsOutput.reduce((sum: number, r: any) => sum + (r[m] || 0), 0);
            });
            totalRow['Total Ganado'] = granTotalGanado;
            totalRow['GMP Total'] = granGmpCount > 0 ? Number((granGmpSum / granGmpCount).toFixed(1)) : 0;
            totalRow['Último Pesaje'] = '';
            totalRow['Peso Promedio'] = granTotalGanado > 0 ? Number((granTotalPesoReal / granTotalGanado).toFixed(1)) : 0;
            totalRow['Peso Estimado Hoy'] = granTotalGanado > 0 ? Number((granTotalPesoEst / granTotalGanado).toFixed(1)) : 0;
            rowsOutput.push(totalRow);
        }

        setMarcas(allMarcas);
        setReportData(rowsOutput);
      } catch (err: any) {
        console.error("Error al generar reporte:", err);
        setErrorMsg(err?.message || 'Error desconocido al procesar el informe.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [fincaId]);

  const descargarExcel = () => {
    if (!reportData || reportData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(reportData);
    const cols = Object.keys(reportData[0]).map(key => ({ wch: Math.max(key.length + 2, 14) }));
    ws['!cols'] = cols;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario Rotaciones");
    const stamp = format(new Date(), "yyyy-MM-dd");
    XLSX.writeFile(wb, `Inventario_Rotaciones_${stamp}.xlsx`);
  };

  const descargarPDF = () => {
    if (!reportData || reportData.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

    // Encabezado
    doc.setFontSize(16);
    doc.setTextColor(46, 125, 50);
    doc.text(fincaNombre || 'Finca', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text('Informe de Inventario por Rotaciones', 14, 25);
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 31);

    // Columnas
    const columns = ['Rotación', 'Potrero', ...marcas, 'Total', 'GMP Total', 'Últ. Pesaje', 'Peso Prom.', 'Estimado Hoy'];

    // Filas
    const rows = reportData.map(row => {
      return [
        row['Rotación'],
        row['Potrero'],
        ...marcas.map(m => row[m] || '-'),
        row['Total Ganado'],
        row['GMP Total'],
        row['Último Pesaje'],
        `${row['Peso Promedio']} kg`,
        `${row['Peso Estimado Hoy']} kg`
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [columns],
      body: rows,
      theme: 'grid',
      headStyles: {
        fillColor: [46, 125, 50],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [40, 40, 40]
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold' },
        1: { halign: 'left' }
      },
      // Resaltar fila TOTAL
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.row.index === rows.length - 1) {
          data.cell.styles.fillColor = [230, 245, 230];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [30, 90, 30];
        }
      },
      margin: { top: 36, left: 14, right: 14 },
    });

    // Pie de página
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(`Agrogestión • Página ${i} de ${pageCount}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
    }

    const stamp = format(new Date(), "yyyy-MM-dd");
    doc.save(`Inventario_Rotaciones_${stamp}.pdf`);
  };

  const isTotal = (row: any) => row['Rotación'] === 'TOTAL';
  const getGmpColor = (val: number) => {
    if (val >= umbralAltoGmp) return 'var(--success, #4CAF50)';
    if (val >= umbralMedioGmp) return 'var(--warning, #FFA726)';
    if (val > 0) return 'var(--error, #EF5350)';
    return 'var(--text-muted)';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '1100px', width: '95%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={24} color="var(--secondary)" />
            <h2 style={{ margin: 0 }}>Informe de Inventario por Rotaciones</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-color)', cursor: 'pointer', padding: '4px' }}>
            <X size={24} />
          </button>
        </div>

        {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', flexDirection: 'column', gap: '16px' }}>
                <Loader2 className="animate-spin" size={36} color="var(--primary)" />
                <span style={{ color: 'var(--text-muted)' }}>Procesando datos de la finca...</span>
            </div>
        ) : errorMsg ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--error)' }}>
                <p>{errorMsg}</p>
                <button className="btn-secondary" onClick={onClose} style={{ marginTop: '16px' }}>Cerrar</button>
            </div>
        ) : (
            <>
                <div style={{ 
                    overflowX: 'auto', 
                    background: 'rgba(0,0,0,0.2)', 
                    borderRadius: '12px', 
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    <table style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid rgba(76, 175, 80, 0.3)' }}>
                            <th style={{ textAlign: 'left', padding: '12px 10px', color: 'var(--primary-light)', fontWeight: 700 }}>Rotación</th>
                            <th style={{ textAlign: 'left', padding: '12px 10px', fontWeight: 700 }}>Potrero</th>
                            {marcas.map(m => (
                                <th key={m} style={{ textAlign: 'center', padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{m}</th>
                            ))}
                            <th style={{ textAlign: 'center', padding: '12px 10px', color: 'var(--secondary)', fontWeight: 700 }}>Total</th>
                            <th style={{ textAlign: 'center', padding: '12px 10px', fontWeight: 700 }}>GMP Total</th>
                            <th style={{ textAlign: 'center', padding: '12px 10px' }}>Últ. Pesaje</th>
                            <th style={{ textAlign: 'right', padding: '12px 10px' }}>Peso Prom.</th>
                            <th style={{ textAlign: 'right', padding: '12px 10px', color: 'var(--warning)' }}>Estimado Hoy</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reportData.map((row, idx) => (
                            <tr key={idx} style={{ 
                                borderBottom: '1px solid rgba(255,255,255,0.05)', 
                                background: isTotal(row) ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
                                fontWeight: isTotal(row) ? 700 : 400
                            }}>
                                <td style={{ padding: '10px', color: isTotal(row) ? 'var(--primary-light)' : 'inherit' }}>{row['Rotación']}</td>
                                <td style={{ padding: '10px' }}>{row['Potrero']}</td>
                                {marcas.map(m => (
                                    <td key={m} style={{ textAlign: 'center', padding: '10px', color: row[m] > 0 ? 'white' : 'rgba(255,255,255,0.2)' }}>
                                        {row[m] || '-'}
                                    </td>
                                ))}
                                <td style={{ textAlign: 'center', padding: '10px', fontWeight: 'bold', color: 'var(--secondary)' }}>{row['Total Ganado']}</td>
                                <td style={{ 
                                    textAlign: 'center', 
                                    padding: '10px', 
                                    fontWeight: 'bold', 
                                    color: isTotal(row) ? 'var(--primary-light)' : getGmpColor(row['GMP Total'])
                                }}>
                                    {row['GMP Total'] > 0 ? '+' : ''}{row['GMP Total']} <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>kg/mes</span>
                                </td>
                                <td style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)' }}>{row['Último Pesaje']}</td>
                                <td style={{ textAlign: 'right', padding: '10px' }}>{row['Peso Promedio']} kg</td>
                                <td style={{ textAlign: 'right', padding: '10px', fontWeight: 'bold' }}>{row['Peso Estimado Hoy']} kg</td>
                            </tr>
                        ))}
                    </tbody>
                    </table>
                </div>

                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {reportData.length > 0 ? `${reportData.length - 1} potreros • Generado ${format(new Date(), 'dd/MM/yyyy HH:mm')}` : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button className="btn-secondary" onClick={onClose}>Cerrar</button>
                        <button 
                            onClick={descargarPDF} 
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '10px 20px', borderRadius: '10px', cursor: 'pointer',
                                background: 'rgba(239, 83, 80, 0.15)', 
                                border: '1px solid rgba(239, 83, 80, 0.3)', 
                                color: '#EF5350', fontWeight: 600, fontSize: '0.9rem'
                            }}
                        >
                            <FileText size={18} /> Descargar PDF
                        </button>
                        <button className="btn-primary" onClick={descargarExcel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Download size={18} /> Descargar Excel
                        </button>
                    </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
}
