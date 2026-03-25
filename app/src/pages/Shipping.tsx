import React, { useState, useEffect, useRef } from 'react';
import { Truck, Search, MapPin, Package, Clock, Edit, Printer, X, CheckSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useReactToPrint } from 'react-to-print';
import { AestheticAlert } from '../components/Alert';

interface Shipment {
  id: string;
  customerName: string;
  customerId?: string;
  items: { title: string; quantity: number }[];
  address: string;
  locality: string;
  province: string;
  method: string;
  cost: number;
  status: string;
  tracking: string;
  shippingDate?: any;
  totalOrderAmount?: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'Pendiente de Empaque': {
    label: 'Pendiente de Empaque',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Clock size={12} />,
  },
  'Despachado': {
    label: 'Despachado / En Viaje',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: <Truck size={12} />,
  },
  'Entregado': {
    label: 'Entregado',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <CheckCircle2 size={12} />,
  },
};

export const Shipping: React.FC = () => {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Status Edit Modal
  const [editingShip, setEditingShip] = useState<Shipment | null>(null);
  const [formStatus, setFormStatus] = useState('');
  const [formTracking, setFormTracking] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState({ 
    isOpen: false, 
    message: '', 
    type: 'error' as 'error' | 'success' | 'info' | 'warning' | 'confirm',
    onConfirm: undefined as (() => void) | undefined
  });

  // Print Label Modal
  const [printingLabel, setPrintingLabel] = useState<Shipment | null>(null);
  const printLabelRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printLabelRef,
    documentTitle: 'Etiqueta_Despacho_Toledo',
  });

  // Query the dedicated 'shipments' collection
  useEffect(() => {
    const q = query(collection(db, 'shipments'), orderBy('shippingDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Shipment[] = [];
      snapshot.forEach(docSnap => data.push({ id: docSnap.id, ...docSnap.data() } as Shipment));
      setShipments(data);
    }, (error) => {
      console.error("Error cargando envíos:", error);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenEdit = (s: Shipment) => {
    setEditingShip(s);
    setFormStatus(s.status || 'Pendiente de Empaque');
    setFormTracking(s.tracking || '');
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShip) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'shipments', editingShip.id), {
        status: formStatus,
        tracking: formTracking,
      });
      setEditingShip(null);
      window.location.reload();
    } catch (err) {
      console.error(err);
      setAlertConfig({ isOpen: true, message: 'Error al actualizar el estado del envío.', type: 'error', onConfirm: undefined });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredShipments = shipments.filter(s =>
    s.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.locality?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.tracking?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.method?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pending = shipments.filter(s => s.status === 'Pendiente de Empaque').length;
  const dispatched = shipments.filter(s => s.status === 'Despachado').length;

  const renderStatus = (status: string) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-50 text-gray-600 border-gray-200', icon: <AlertCircle size={12} /> };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${cfg.color}`}>
        {cfg.icon} {cfg.label}
      </span>
    );
  };

  return (
    <div className="space-y-6 relative h-full flex flex-col">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Centro de Logística y Envíos</h2>
          <p className="text-gray-500 text-sm mt-1">Gestione el despacho y empaque de ventas remitas.</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white border border-amber-200 shadow-sm px-5 py-2.5 rounded-lg text-center">
            <span className="block text-2xl font-black text-amber-600">{pending}</span>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Para Empacar</span>
          </div>
          <div className="bg-white border border-blue-200 shadow-sm px-5 py-2.5 rounded-lg text-center">
            <span className="block text-2xl font-black text-blue-600">{dispatched}</span>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">En Camino</span>
          </div>
        </div>
      </div>

      {/* TABLE PANEL */}
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por Cliente, Localidad, Guía o Transporte..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-white text-navy-800 text-xs border-b border-gray-200 uppercase tracking-wider">
              <tr>
                <th className="py-4 px-6 font-semibold">Fecha</th>
                <th className="py-4 px-6 font-semibold">Cliente y Libros</th>
                <th className="py-4 px-6 font-semibold">Destino</th>
                <th className="py-4 px-6 font-semibold">Transporte / Guía</th>
                <th className="py-4 px-6 font-semibold text-center">Estado</th>
                <th className="py-4 px-6 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shipments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center">
                      <Package className="w-12 h-12 text-gray-300 mb-3" />
                      <p className="text-lg font-medium text-gray-700">No hay envíos registrados todavía.</p>
                      <p className="text-sm text-gray-400 mt-1">Al confirmar una venta con "Gestionar Envío" activado,<br/>aparecerá aquí automáticamente.</p>
                    </div>
                  </td>
                </tr>
              ) : filteredShipments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">No se encontraron coincidencias.</td>
                </tr>
              ) : (
                filteredShipments.map((ship) => (
                  <tr key={ship.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="py-4 px-6 text-sm text-gray-700 font-medium align-top whitespace-nowrap">
                      {ship.shippingDate && typeof ship.shippingDate.toDate === 'function' 
                        ? ship.shippingDate.toDate().toLocaleDateString('es-AR') 
                        : '—'}
                    </td>

                    <td className="py-4 px-6 align-top">
                      <p className="font-bold text-gray-900 group-hover:text-navy-700">{ship.customerName}</p>
                      <div className="mt-1 flex flex-col gap-0.5">
                        {ship.items?.map((item, idx) => (
                          <span key={idx} className="text-xs text-gray-500">{item.quantity}× {item.title}</span>
                        ))}
                      </div>
                    </td>

                    <td className="py-4 px-6 align-top">
                      <div className="flex items-start gap-1.5">
                        <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-gray-800 leading-snug">{ship.address}</p>
                          <p className="text-xs text-gray-500">{ship.locality}, {ship.province}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6 align-top">
                      <p className="text-sm font-bold text-navy-800 flex items-center gap-1.5">
                        <Truck size={14} /> {ship.method}
                      </p>
                      {ship.tracking ? (
                        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200 break-all mt-1 block">
                          {ship.tracking}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Sin guía aún</span>
                      )}
                    </td>

                    <td className="py-4 px-6 text-center align-top">
                      {renderStatus(ship.status)}
                    </td>

                    <td className="py-4 px-6 text-center align-top">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleOpenEdit(ship)}
                          title="Actualizar Estado / Guía"
                          className="p-1.5 bg-navy-50 text-navy-700 hover:bg-navy-100 rounded-md transition-colors"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => setPrintingLabel(ship)}
                          title="Imprimir Etiqueta"
                          className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors"
                        >
                          <Printer size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* === MODAL: ACTUALIZAR ESTADO === */}
      {editingShip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-navy-900 px-5 py-4 flex justify-between items-center text-white">
              <h3 className="font-semibold flex items-center gap-2"><Truck size={18} /> Actualizar Despacho</h3>
              <button onClick={() => setEditingShip(null)} className="text-navy-200 hover:text-white"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveStatus} className="p-5 space-y-4">
              <div>
                <p className="text-sm font-bold text-gray-700 mb-1">{editingShip.customerName}</p>
                <p className="text-xs text-gray-400">{editingShip.address}, {editingShip.locality}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Estado del Paquete</label>
                <div className="flex flex-col gap-2">
                  {['Pendiente de Empaque', 'Despachado', 'Entregado'].map(s => (
                    <label key={s} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${formStatus === s ? 'border-navy-500 bg-navy-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="status" value={s} checked={formStatus === s} onChange={() => setFormStatus(s)} className="accent-navy-700" />
                      <span className="text-sm font-medium text-gray-800">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">N° de Guía / Comisionista</label>
                <textarea
                  rows={2}
                  value={formTracking}
                  onChange={(e) => setFormTracking(e.target.value)}
                  placeholder="Ej: Andreani 3901SXS, Juan García..."
                  className="w-full border-gray-300 rounded p-2 text-sm font-mono focus:ring-navy-500 focus:border-navy-500 border"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setEditingShip(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-md font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={isSaving} className="flex-1 px-4 py-2 bg-navy-800 text-white rounded-md font-semibold hover:bg-navy-700 flex justify-center items-center gap-1 disabled:opacity-70">
                  <CheckSquare size={16} /> {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === MODAL: ETIQUETA DE DESPACHO === */}
      {printingLabel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="bg-gray-100 px-5 py-3 flex justify-between items-center border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Previsualización de Etiqueta de Despacho</h3>
              <button onClick={() => setPrintingLabel(null)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>

            <div className="p-8 bg-gray-100 flex justify-center overflow-auto max-h-[60vh]">
              <div
                ref={printLabelRef}
                className="bg-white p-8 shadow-lg text-black"
                style={{ fontFamily: 'sans-serif', width: '10cm', minHeight: '15cm' }}
              >
                {/* REMITENTE */}
                <div className="border-b-2 border-black pb-4 mb-6">
                  <p className="text-[9px] font-bold uppercase text-gray-400 tracking-widest mb-1">REMITENTE</p>
                  <h2 className="text-2xl font-black uppercase tracking-tight leading-none">TOLEDO</h2>
                  <p className="text-sm font-bold tracking-widest text-gray-600">LIBROS JURÍDICOS</p>
                  <p className="text-xs text-gray-500 mt-2">Arturo M. Bas 50 · Córdoba Capital<br />Cel: 351 322-1995</p>
                </div>

                {/* DESTINATARIO */}
                <div className="mb-6">
                  <p className="text-[9px] font-bold uppercase text-gray-400 tracking-widest mb-2">DESTINATARIO</p>
                  <p className="text-sm font-semibold text-gray-500 mb-0.5">Para:</p>
                  <h1 className="text-4xl font-black uppercase leading-none break-words">{printingLabel.customerName}</h1>
                </div>

                {/* DIRECCIÓN */}
                <div className="bg-gray-50 border-2 border-gray-300 p-4 rounded-lg mb-6">
                  <p className="text-[9px] font-bold uppercase text-gray-400 tracking-widest mb-2">DIRECCIÓN DE ENTREGA</p>
                  <p className="text-xl font-bold leading-tight">{printingLabel.address}</p>
                  <p className="text-lg font-medium mt-1">{printingLabel.locality}</p>
                  <p className="text-xl font-black uppercase">{printingLabel.province}</p>
                </div>

                {/* FOOTER */}
                <div className="flex justify-between items-end pt-4 border-t-2 border-black">
                  <div className="text-xs text-gray-500 font-bold">
                    {printingLabel.items?.length} ítem/s<br />
                    Declarado: Libros<br />
                    Costo Envío: ${printingLabel.cost?.toFixed(2)}
                  </div>
                  <div className="text-base font-black uppercase border-2 border-black px-3 py-1.5 bg-black text-white rounded">
                    {printingLabel.method}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 bg-white border-t border-gray-200 flex gap-3">
              <button onClick={() => setPrintingLabel(null)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold">Cerrar</button>
              <button onClick={handlePrint} className="flex-1 px-4 py-2.5 bg-navy-800 text-white rounded-lg hover:bg-navy-900 font-bold shadow flex justify-center items-center gap-2">
                <Printer size={18} /> Imprimir Etiqueta
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Custom Alert Overlay */}
      <AestheticAlert 
        isOpen={alertConfig.isOpen} 
        message={alertConfig.message} 
        type={alertConfig.type} 
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false, onConfirm: undefined })} 
        onConfirm={alertConfig.onConfirm}
      />
    </div>
  );
};
