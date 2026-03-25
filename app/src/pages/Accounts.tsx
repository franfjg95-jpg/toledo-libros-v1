import React, { useState, useEffect, useRef } from 'react';
import { Search, Banknote, X, AlertTriangle, Edit2, CreditCard, ShieldCheck, CheckCircle, Trash2, Lock, Printer, Eye, EyeOff, Wallet } from 'lucide-react';
import { collection, onSnapshot, runTransaction, doc, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useReactToPrint } from 'react-to-print';
import type { Customer } from './Customers';
import { AestheticAlert } from '../components/Alert';

export const Accounts: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const getCustomerDisplayName = (c: Customer | undefined | null) => {
    if (!c) return 'Sin Nombre';
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    return name || c.fullName || 'Cliente Sin Identificar';
  };
  
  // Modals / Selected
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState({ 
    isOpen: false, 
    message: '', 
    type: 'error' as 'error' | 'success' | 'info' | 'warning' | 'confirm',
    onConfirm: undefined as (() => void) | undefined
  });
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isLimitModalOpen, setIsLimitModalOpen] = useState(false);
  const [completedPayment, setCompletedPayment] = useState<any>(null);
  
  // Forms
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo');
  const [paymentRefText, setPaymentRefText] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  const [newLimit, setNewLimit] = useState<string>('');
  const [isProcessingLimit, setIsProcessingLimit] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [isReprint, setIsReprint] = useState(false);
  
  // Print Logic
  const printReceiptRef = useRef<HTMLDivElement>(null);
  const handlePrintReceipt = useReactToPrint({ contentRef: printReceiptRef, documentTitle: 'Recibo_Pago_Toledo_Libros' });

  // Cargar Clientes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const data: Customer[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(data);
      
      if (selectedCustomer) {
         const updated = data.find(c => c.id === selectedCustomer.id);
         if (updated) setSelectedCustomer(updated);
      }
    });
    return () => unsub();
  }, [selectedCustomer]);

  // Cargar pagos recientes cuando cambia el cliente
  useEffect(() => {
    if (!selectedCustomer?.id) {
      setRecentPayments([]);
      return;
    }

    const q = collection(db, 'payments');
    // Filtramos manualmente o por consulta si tenemos índices. 
    // Por simplicidad y evitar errores de índice en este momento, usaremos onSnapshot directo del cliente.
    const unsubscribe = onSnapshot(q, (snap) => {
      const p = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((pay: any) => pay.customerId === selectedCustomer.id)
        .sort((a: any, b: any) => {
          const tA = a.paymentDate?.toMillis() || 0;
          const tB = b.paymentDate?.toMillis() || 0;
          return tB - tA;
        })
        .slice(0, 5);
      setRecentPayments(p);
    });

    return () => unsubscribe();
  }, [selectedCustomer]);

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedCustomer.id) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setAlertConfig({ isOpen: true, message: "Por favor, ingresa un monto válido mayor a 0.", type: 'warning', onConfirm: undefined });
      return;
    }
    
    setIsProcessingPayment(true);
    try {
      const receiptData = await runTransaction(db, async (transaction) => {
        const custRef = doc(db, 'customers', selectedCustomer.id!);
        const custSnap = await transaction.get(custRef);
        
        if (!custSnap.exists()) throw new Error("El cliente no existe.");
        
        const currentBalance = custSnap.data().balance || 0;
        
        // Registrar el pago
        const payRef = doc(collection(db, 'payments'));
        const payData = {
          customerId: selectedCustomer.id,
          customerName: getCustomerDisplayName(selectedCustomer),
          amount: amount,
          method: paymentMethod,
          reference: paymentRefText,
          sellerEmail: auth.currentUser?.email || 'Vendedor Desconocido',
          paymentDate: serverTimestamp(),
        };
        transaction.set(payRef, payData);

        const newBalance = currentBalance - amount;
        const updates: any = { 
          balance: newBalance,
          lastMovementDate: serverTimestamp() 
        };
        
        if (newBalance <= 0) {
          updates.oldestDebtDate = null;
        }

        transaction.update(custRef, updates);

        return {
          customerName: getCustomerDisplayName(selectedCustomer),
          amount,
          newBalance,
          method: paymentMethod,
          reference: paymentRefText,
          date: new Date().toLocaleString('es-AR')
        };
      });
      
      setPaymentAmount('');
      setPaymentRefText('');
      setPaymentMethod('Efectivo');
      setIsPaymentModalOpen(false);
      setCompletedPayment(receiptData);

    } catch (error: any) {
      alert(`Error procesando el pago: ${error.message}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleReprintPayment = (pay: any) => {
    const receiptData = {
      customerName: pay.customerName || getCustomerDisplayName(selectedCustomer),
      amount: pay.amount || 0,
      newBalance: pay.newBalance || 0, // Nota: si no se guardó el saldo en el pago histórico, puede ser impreciso
      method: pay.method || 'Efectivo',
      reference: pay.reference || '',
      date: pay.paymentDate && typeof pay.paymentDate.toDate === 'function' 
        ? pay.paymentDate.toDate().toLocaleString('es-AR') 
        : 'Registro Histórico'
    };
    setIsReprint(true);
    setCompletedPayment(receiptData);
  };

  const handleEditLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    setIsProcessingLimit(true);
    try {
      await updateDoc(doc(db, 'customers', selectedCustomer.id), {
        limiteCredito: Number(newLimit)
      });
      setIsLimitModalOpen(false);
      setNewLimit('');
      window.location.reload();
    } catch(err: any) {
      setAlertConfig({ isOpen: true, message: "Error al actualizar límite: " + err.message, type: 'error', onConfirm: undefined });
    } finally {
      setIsProcessingLimit(false);
    }
  };

  const handleFinalizePayment = () => {
    setCompletedPayment(null);
    setSelectedCustomer(null);
    setSearchTerm(''); 
    window.location.reload(); // Refresco total solicitado por el usuario
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer?.id) return;
    
    setIsDeleting(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("Usuario no autenticado");

      const credential = EmailAuthProvider.credential(user.email, confirmPassword);
      await reauthenticateWithCredential(user, credential);

      await deleteDoc(doc(db, 'customers', selectedCustomer.id));
      
      setIsDeleteModalOpen(false);
      setSelectedCustomer(null);
      setConfirmPassword('');
      window.location.reload();
    } catch (error: any) {
      console.error(error);
      setAlertConfig({ isOpen: true, message: "Error de seguridad: La contraseña no es válida o no tiene permisos.", type: 'error', onConfirm: undefined });
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCustomers = customers.filter(c => {
    // 1. Filtro Estructural: Solo deudores (> 0)
    const balance = Number(c.balance) || 0;
    if (balance <= 0) return false;

    // 2. Filtro de Búsqueda (Copia exacta de Clientes)
    const search = searchTerm.toLowerCase();
    return (
      getCustomerDisplayName(c).toLowerCase().includes(search) ||
      (c.dni || '').includes(search) ||
      (c.phone || '').includes(search) ||
      (c.email?.toLowerCase() || '').includes(search)
    );
  });

  // Se elimina lógica de fullHistory por riesgo de WSOD

  return (
    <div className="space-y-6 flex flex-col h-full relative">
      <div>
        <h2 className="text-2xl font-semibold text-gray-800 tracking-tight">Cuentas Corrientes & Auditoría</h2>
        <p className="text-gray-500 text-sm mt-1">Gestión corporativa de límites de crédito, extractos y cobros controlados.</p>
      </div>

      <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 min-h-[500px]">
        
        {/* LADO IZQUIERDO: Directorio Financiero */}
        <div className={`flex flex-col ${selectedCustomer ? 'w-full lg:w-3/5 border-r border-gray-200' : 'w-full'}`}>
           <div className="p-4 border-b border-gray-100 flex gap-4 bg-gray-50 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Buscar cliente..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-navy-600 sm:text-sm"
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-0">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white text-navy-800 text-xs uppercase tracking-wider border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                  <th className="py-3 px-6 font-semibold">Cliente</th>
                  <th className="py-3 px-6 font-semibold">Contacto</th>
                  <th className="py-3 px-6 font-semibold">Categoría</th>
                  <th className="py-3 px-6 font-semibold text-right">Saldo Deudor</th>
                  <th className="py-3 px-6 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500 font-medium">
                      No hay clientes con deuda pendiente que coincidan con tu búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr 
                      key={customer.id} 
                      className={`hover:bg-gray-50 transition-colors group cursor-pointer ${selectedCustomer?.id === customer.id ? 'bg-navy-50' : ''}`}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="py-3 px-6">
                        <p className={`font-semibold transition-colors ${selectedCustomer?.id === customer.id ? 'text-navy-900' : 'text-gray-900 group-hover:text-navy-700'}`}>
                          {getCustomerDisplayName(customer)}
                        </p>
                        {customer.dni && <p className="text-[10px] text-navy-600 font-bold">DNI: {customer.dni}</p>}
                      </td>
                      <td className="py-3 px-6">
                        <p className="text-sm text-gray-800">{customer.email}</p>
                        <p className="text-xs text-gray-500">{customer.phone}</p>
                      </td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                          customer.customerType === 'Abogado' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          customer.customerType === 'Estudiante' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                          'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {customer.customerType}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right font-medium">
                        <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-100">
                          ${(Number(customer.balance) || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); }}
                            className="px-4 py-1.5 bg-navy-800 hover:bg-navy-700 text-white rounded font-bold text-[10px] uppercase tracking-wider transition-colors"
                          >
                            Gestionar
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); setIsDeleteModalOpen(true); }}
                            className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded transition-all"
                            title="Eliminar Cuenta"
                          >
                            <Trash2 size={16} />
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

        {/* PANEL DERECHO: ESTADO DE CUENTA */}
        {selectedCustomer && (
          <div className="w-full lg:w-2/5 flex flex-col bg-white">
            <div className="p-4 bg-navy-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-xs tracking-wider text-navy-200 uppercase">Gestión de Cobro</h3>
                <p className="font-bold leading-tight mt-1">{getCustomerDisplayName(selectedCustomer)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setNewLimit(selectedCustomer.limiteCredito?.toString() || ''); setIsLimitModalOpen(true); }} className="text-navy-200 hover:text-white transition-colors bg-navy-800 p-1.5 rounded-full" title="Editar Límite">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => setSelectedCustomer(null)} className="text-navy-200 hover:text-white transition-colors bg-navy-800 p-1.5 rounded-full" title="Cerrar">
                  <X size={16} />
                </button>
              </div>
            </div>
            
            <div className="p-5 border-b border-gray-100 bg-gray-50 flex flex-col gap-3">
              <div className="flex justify-between items-center group">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Deuda Acumulada</span>
                <span className={`text-2xl font-black transition-colors ${(selectedCustomer?.balance || 0) > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                  ${(selectedCustomer?.balance || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                <div className="flex items-center gap-2">
                  <Wallet size={16} className="text-emerald-600" />
                  <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Saldo a Favor</span>
                </div>
                <span className={`text-2xl font-black ${(selectedCustomer?.saldoAFavor || 0) > 0 ? 'text-emerald-600' : 'text-emerald-800/20'}`}>
                  ${(selectedCustomer?.saldoAFavor || 0).toFixed(2)}
                </span>
              </div>
            </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-md flex items-center justify-center gap-2 shadow-sm transition-colors uppercase tracking-wide text-xs"
                >
                  <Banknote size={16} /> Registrar Pago (Abonar)
                </button>
              </div>

              <div className="flex-1 p-4 bg-gray-50 overflow-y-auto">
              {recentPayments.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Últimos Cobros Registrados</h4>
                  {recentPayments.map((pay) => (
                    <div key={pay.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex justify-between items-center transition-all hover:border-navy-200">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <CheckCircle size={12} className="text-emerald-500" />
                          <span className="text-xs font-bold text-gray-800">${pay.amount.toFixed(2)}</span>
                          <span className="text-[10px] text-gray-400 font-medium">• {pay.method}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-medium italic">
                          {pay.paymentDate && typeof pay.paymentDate.toDate === 'function' 
                            ? pay.paymentDate.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) 
                            : 'Reciente'}
                        </p>
                      </div>
                      <button 
                        onClick={() => handleReprintPayment(pay)}
                        className="p-2 text-navy-400 hover:text-navy-600 hover:bg-navy-50 rounded-full transition-all"
                        title="Reimprimir Ticket"
                      >
                        <Printer size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-center opacity-40">
                  <ShieldCheck size={48} className="mb-4" />
                  <p className="text-sm font-medium">Historial de Cobros</p>
                  <p className="text-[10px] uppercase tracking-widest mt-1">No hay pagos recientes registrados</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Ingresar Entrega (Permitir cargar Saldo a Favor) */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" onClick={() => setIsPaymentModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden z-20">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2"><CreditCard size={18} className="text-navy-600"/> Cargar Saldo / Abonar</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleProcessPayment} className="p-6">
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-500 mb-1">
                  {selectedCustomer.balance > 0 ? 'Deuda pendiente operativa' : 'Saldo a Favor actual'}
                </p>
                <p className="text-3xl font-black text-navy-900 mt-1">${Math.abs(selectedCustomer.balance).toFixed(2)}</p>
              </div>
              
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">MONTO ENTREGADO</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input 
                    type="number" 
                    min="1" 
                    step="0.01"
                    // NOTA: No existe restricción max, la diferencia pasa a saldo a favor.
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border-2 border-gray-300 rounded-lg py-2.5 pl-8 pr-4 text-lg font-bold text-navy-900 focus:outline-none focus:border-navy-600"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Medio</label>
                  <select 
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-navy-500 focus:border-navy-500"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Mercado Pago">Mercado Pago</option>
                    <option value="Tarjeta">Tarjeta Déb. / Créd.</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Referencia</label>
                  <input 
                    type="text" 
                    value={paymentRefText}
                    onChange={(e) => setPaymentRefText(e.target.value)}
                    maxLength={50}
                    className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-navy-500 focus:border-navy-500"
                    placeholder="N° Comp o CBU"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isProcessingPayment}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-colors uppercase text-sm tracking-wide"
              >
                {isProcessingPayment ? 'Auditando...' : 'Aplicar Abono / Saldo'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Límite */}
      {isLimitModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" onClick={() => setIsLimitModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden z-20 p-6">
            <h3 className="font-bold text-lg mb-4 text-center">Modificar Límite de Crédito</h3>
            <form onSubmit={handleEditLimit}>
              <label className="block text-xs text-gray-500 uppercase font-semibold mb-2">Nuevo Límite ($)</label>
              <input 
                type="number" min="0" step="1000" 
                value={newLimit} onChange={e => setNewLimit(e.target.value)}
                className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-600 focus:border-navy-600 mb-4 font-bold text-center text-lg"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsLimitModalOpen(false)} className="flex-1 py-2 bg-gray-100 font-medium rounded text-gray-600">Cancelar</button>
                <button type="submit" disabled={isProcessingLimit} className="flex-1 py-2 bg-navy-800 text-white font-medium rounded">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

       {completedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm transition-opacity" onClick={() => setCompletedPayment(null)}></div>
           <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden z-30 flex flex-col">
              <div className={`p-4 ${isReprint ? 'bg-navy-700' : 'bg-emerald-600'} text-white flex justify-between items-center transition-colors`}>
                <div className="flex items-center gap-2">
                  {isReprint ? <Printer size={20} /> : <CheckCircle size={20} />}
                  <h3 className="font-bold">{isReprint ? 'Comprobante de Cobro' : 'Abono Registrado'}</h3>
                </div>
                <button onClick={() => { setCompletedPayment(null); setIsReprint(false); }} className="text-white hover:text-navy-100 transition-colors"><X size={20} /></button>
              </div>

             <div className="p-6 text-center border-b border-gray-100 bg-gray-50">
               <p className="text-sm text-gray-500 uppercase font-semibold">RECIBO DE CAJA</p>
               <h1 className="text-3xl font-black text-emerald-600 mt-2">${completedPayment.amount.toFixed(2)}</h1>
               <div className="mt-4 p-3 bg-white border border-gray-200 rounded text-sm font-medium">
                  Resultante: 
                  <span className={completedPayment.newBalance <= 0 ? "text-emerald-600 font-bold ml-1" : "text-red-600 font-bold ml-1"}>
                    {completedPayment.newBalance <= 0 ? 'Saldo a Favor: $' + Math.abs(completedPayment.newBalance).toFixed(2) : 'Deuda Restante: $' + completedPayment.newBalance.toFixed(2)}
                  </span>
               </div>
             </div>

             <div className="p-4 bg-white flex gap-3">
                 <button 
                   onClick={() => { setCompletedPayment(null); setIsReprint(false); }} 
                   className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors uppercase text-[10px] tracking-widest border border-gray-200"
                 >
                   Cerrar
                 </button>
                 <button 
                   onClick={() => { handlePrintReceipt(); if(!isReprint) setTimeout(handleFinalizePayment, 2500); }} 
                   className="flex-1 py-3 px-4 bg-[#1e3a8a] hover:bg-navy-900 text-white font-black rounded-lg transition-all flex justify-center items-center gap-2 uppercase text-[10px] tracking-widest shadow-lg shadow-navy-100"
                 >
                   <Printer size={16} /> {isReprint ? 'Re-Imprimir' : 'Confirmar e Imprimir'}
                 </button>
              </div>
           </div>  {/* Se elimina el extracto en PDF para evitar dependencias de fecha */}
        </div>
      )}

      {/* REACT TO PRINT HIDDEN PDF LAYER - RECEIPT OF PAYMENT */}
      {completedPayment && (
        <div style={{ display: 'none' }}>
           <div ref={printReceiptRef} className="p-8 bg-white text-black w-80" style={{ fontFamily: 'monospace' }}>
              <div className="text-center mb-6 border-b border-dashed border-gray-400 pb-4">
                  <h1 className="text-lg font-bold uppercase tracking-widest text-[#1e3a8a] flex items-center justify-center gap-2">
                    TOLEDO
                  </h1>
                  <p className="text-[10px] font-semibold tracking-widest mt-0.5">LIBROS JURÍDICOS</p>
                  <p className="mt-2 text-[10px] text-gray-500">COMPROBANTE DE CAJA</p>
                  <p className="text-[10px] text-gray-500">{completedPayment.date}</p>
              </div>

              <div className="mb-4 text-[11px] leading-relaxed">
                  <p><span className="font-bold">CLIENTE:</span> {getCustomerDisplayName(selectedCustomer)}</p>
                  <p><span className="font-bold">MÉTODO:</span> {completedPayment.method.toUpperCase()}</p>
                  {completedPayment.reference && <p><span className="font-bold">REF:</span> {completedPayment.reference}</p>}
              </div>

              <div className="border-t border-b border-gray-800 py-4 mb-4 text-center">
                  <p className="text-[10px] font-bold">MONTO RECIBIDO</p>
                  <p className="text-2xl font-black">${completedPayment.amount.toFixed(2)}</p>
              </div>

              <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
                  <p className="text-[10px] font-bold">{completedPayment.newBalance <= 0 ? 'SALDO A FAVOR' : 'DEUDA RESTANTE'}</p>
                  <p className="text-lg font-bold">${Math.abs(completedPayment.newBalance).toFixed(2)}</p>
              </div>

              <div className="text-center mt-8 text-[9px] text-gray-400 italic">
                  Operador: {auth.currentUser?.email || 'Sistema'}<br/>
                  La editorial jurídica por excelencia.
              </div>
           </div>
        </div>
      )}

       {/* Modal: Eliminar Cuenta Corriente (Seguridad) */}
       {isDeleteModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => { setIsDeleteModalOpen(false); setConfirmPassword(''); }}></div>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden z-20">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-red-50 text-red-700">
              <h3 className="font-bold flex items-center gap-2 uppercase tracking-tighter"><AlertTriangle size={18}/> Protocolo de Seguridad</h3>
              <button onClick={() => { setIsDeleteModalOpen(false); setConfirmPassword(''); }} className="text-red-400 hover:text-red-600"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleDeleteAccount} className="p-6">
              <div className="mb-6 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={32} />
                </div>
                <h4 className="text-lg font-black text-gray-900 leading-tight">¿Eliminar Cuenta Corriente?</h4>
                <p className="text-xs text-gray-500 mt-2 px-4 uppercase font-bold tracking-widest leading-relaxed">
                  Esta acción es irreversible. Se perderán todos los registros de deuda de <span className="text-red-600">{getCustomerDisplayName(selectedCustomer)}</span>.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 text-center">Validación de Identidad</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type={showConfirmPassword ? 'text' : 'password'} 
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-lg py-3 pl-10 pr-12 text-center font-bold text-gray-800 focus:outline-none focus:border-red-500 transition-all placeholder:text-gray-300"
                    placeholder="Ingrese su contraseña"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition-colors p-1"
                    title={showConfirmPassword ? "Ocultar" : "Mostrar"}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => { setIsDeleteModalOpen(false); setConfirmPassword(''); }}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-lg text-sm transition-colors uppercase"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isDeleting || !confirmPassword}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 text-white font-black rounded-lg text-sm transition-all uppercase shadow-lg shadow-red-100"
                >
                  {isDeleting ? 'Borrando...' : 'Confirmar'}
                </button>
              </div>
            </form>
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
