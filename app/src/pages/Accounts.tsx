import React, { useState, useEffect, useRef } from 'react';
import { Search, CreditCard, Clock, Receipt, Banknote, X, AlertTriangle, Printer, Edit2, ShieldCheck, CheckCircle } from 'lucide-react';
import { collection, onSnapshot, query, where, runTransaction, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useReactToPrint } from 'react-to-print';
import type { Customer } from './Customers';

export const Accounts: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals / Selected
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
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

  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  // Print Logic
  const printStatementRef = useRef<HTMLDivElement>(null);
  const handlePrintStatement = useReactToPrint({ contentRef: printStatementRef, documentTitle: 'Estado_Cuenta_Toledo_Libros' });

  const printReceiptRef = useRef<HTMLDivElement>(null);
  const handlePrintReceipt = useReactToPrint({ contentRef: printReceiptRef, documentTitle: 'Recibo_Pago_Toledo_Libros' });

  // Cargar Clientes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const data: Customer[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(data);
      
      setCustomerSales(curr => {
        if (selectedCustomer) {
           const updated = data.find(c => c.id === selectedCustomer.id);
           if (updated) setSelectedCustomer(updated);
        }
        return curr;
      });
    });
    return () => unsub();
  }, [selectedCustomer]);

  // Historial Cliente
  useEffect(() => {
    if (!selectedCustomer?.id) {
      setCustomerSales([]);
      setCustomerPayments([]);
      return;
    }
    setIsLoadingHistory(true);
    
    const salesQuery = query(collection(db, 'sales'), where('customerId', '==', selectedCustomer.id), where('paymentMethod', '==', 'A Cuenta'));
    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const sales: any[] = [];
      snapshot.forEach(d => sales.push({ id: d.id, ...d.data() }));
      sales.sort((a, b) => (b.saleDate?.toMillis() || 0) - (a.saleDate?.toMillis() || 0));
      setCustomerSales(sales);
      setIsLoadingHistory(false);
    });

    const payQuery = query(collection(db, 'payments'), where('customerId', '==', selectedCustomer.id));
    const unsubPay = onSnapshot(payQuery, (snapshot) => {
      const payments: any[] = [];
      snapshot.forEach(d => payments.push({ id: d.id, ...d.data() }));
      payments.sort((a, b) => (b.paymentDate?.toMillis() || 0) - (a.paymentDate?.toMillis() || 0));
      setCustomerPayments(payments);
    });
    
    return () => { unsubSales(); unsubPay(); };
  }, [selectedCustomer?.id]);

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedCustomer.id) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert("Por favor, ingresa un monto válido mayor a 0.");
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
          customerName: selectedCustomer.fullName,
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
          customerName: selectedCustomer.fullName,
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
    } catch(err: any) {
      alert("Error al actualizar límite: " + err.message);
    } finally {
      setIsProcessingLimit(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDebtStatus = (balance: number, oldestDate: any) => {
    if (balance < 0) return { label: 'Crédito a Favor', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    if (balance === 0) return { label: 'Al Día', color: 'bg-blue-100 text-blue-800 border-blue-200' };
    if (!oldestDate) return { label: 'Deuda Reciente', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    
    const diff = Date.now() - oldestDate.toDate().getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days >= 30) {
      return { label: `Vencida (+${days}d)`, color: 'bg-red-100 text-red-800 border-red-200 font-bold animate-pulse' };
    }
    return { label: `Pendiente (${days}d)`, color: 'bg-amber-100 text-amber-800 border-amber-200' };
  };

  // Mixed History Array for Pro Details
  const fullHistory = [...customerSales, ...customerPayments].sort((a,b) => {
    const tA = a.saleDate || a.paymentDate;
    const tB = b.saleDate || b.paymentDate;
    return (tB?.toMillis() || 0) - (tA?.toMillis() || 0);
  });

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
                  <th className="py-3 px-4 font-semibold">Cliente</th>
                  <th className="py-3 px-4 font-semibold">Estado de Deuda</th>
                  <th className="py-3 px-4 font-semibold">Límite Crédito</th>
                  <th className="py-3 px-4 font-semibold text-right">Saldo Deudor</th>
                  <th className="py-3 px-4 text-center font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500">
                      No se encontraron resultados.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => {
                    const isExceeded = customer.limiteCredito && customer.balance > customer.limiteCredito;
                    const status = getDebtStatus(customer.balance, customer.oldestDebtDate);
                    return (
                    <tr 
                      key={customer.id} 
                      className={`transition-colors group hover:bg-gray-50 ${selectedCustomer?.id === customer.id ? 'bg-navy-50' : 'bg-white'}`}
                    >
                      <td className="py-3 px-4">
                        <p className={`font-bold transition-colors ${selectedCustomer?.id === customer.id ? 'text-navy-900' : 'text-gray-900'}`}>
                          {customer.fullName}
                        </p>
                        <p className="text-xs text-gray-400">{customer.customerType}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-medium border ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {customer.limiteCredito ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded inline-flex w-max">
                              TOPE: ${customer.limiteCredito.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-gray-400 mt-1">Cierra: Día {customer.diaCierre}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No configurado</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className={`font-black text-lg ${customer.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            ${customer.balance > 0 ? customer.balance.toFixed(2) : customer.balance < 0 ? `+${Math.abs(customer.balance).toFixed(2)}` : '0.00'}
                          </span>
                          {customer.balance < 0 && (
                            <span className="text-[9px] text-emerald-600 font-bold mt-0.5 tracking-wider bg-emerald-50 px-1 rounded border border-emerald-100">SALDO A FAVOR</span>
                          )}
                          {isExceeded && (
                            <span className="text-[10px] text-red-600 font-bold animate-pulse mt-0.5"><AlertTriangle size={10} className="inline mr-1" /> EXCEDIDO</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button 
                          onClick={() => setSelectedCustomer(customer)}
                          className="px-3 py-1.5 bg-navy-800 hover:bg-navy-700 text-white rounded font-medium text-xs transition-colors"
                        >
                          Auditar
                        </button>
                      </td>
                    </tr>
                    );
                  })
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
                <h3 className="font-semibold text-xs tracking-wider text-navy-200 uppercase">Ficha Financiera</h3>
                <p className="font-bold leading-tight mt-1">{selectedCustomer.fullName}</p>
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
            
            <div className={`p-5 border-b border-gray-100 flex flex-col gap-4 ${selectedCustomer.balance < 0 ? 'bg-emerald-50' : 'bg-gray-50'}`}>
              <div className="flex justify-between items-end">
                <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                  {selectedCustomer.balance > 0 ? 'Deuda Vigente' : selectedCustomer.balance < 0 ? 'Saldo A Favor (Crédito)' : 'Balance'}
                </span>
                <span className={`text-4xl font-black ${selectedCustomer.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ${Math.abs(selectedCustomer.balance).toFixed(2)}
                </span>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-md flex items-center justify-center gap-2 shadow-sm transition-colors uppercase tracking-wide text-xs"
                >
                  <Banknote size={16} /> Cargar Saldo / Abonar
                </button>
                <button 
                  onClick={handlePrintStatement}
                  className="flex-1 bg-white hover:bg-gray-100 border border-navy-200 text-navy-800 font-bold py-2.5 rounded-md flex items-center justify-center gap-2 shadow-sm transition-colors uppercase tracking-wide text-xs"
                >
                  <Printer size={16} /> PDF Extracto
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Registro Histórico de Auditoría</h4>
              
              {isLoadingHistory ? (
                <div className="text-center py-10 text-gray-400 text-sm">Cargando registros...</div>
              ) : (
                <div className="space-y-4">
                  {fullHistory.map((record, i) => {
                      const isPayment = record.amount !== undefined;
                      const dateObj = record.saleDate || record.paymentDate;
                      
                      return (
                        <div key={i} className="bg-white border border-gray-200 rounded-md p-3 shadow-sm relative overflow-hidden">
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${isPayment ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                          <div className="flex justify-between items-start pl-2">
                            <div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                                <Clock size={12} />
                                {dateObj ? new Date(dateObj.toDate()).toLocaleString('es-AR') : 'Reciente'}
                              </div>
                              <span className={`text-sm font-bold ${isPayment ? 'text-emerald-700' : 'text-gray-800'}`}>
                                {isPayment ? `Abono/Saldo (${record.method})` : 'Cargo (Venta A Cuenta)'}
                              </span>
                            </div>
                            <span className={`font-black ${isPayment ? 'text-emerald-600' : 'text-red-600'}`}>
                              {isPayment ? '-' : '+'}${(record.amount || record.totalAmount)?.toFixed(2)}
                            </span>
                          </div>
                          
                          {/* Detalles del pago (Auditoria) */}
                          {isPayment && (
                            <div className="text-[10px] space-y-0.5 text-gray-500 pl-2 mt-2 border-t border-gray-50 pt-2 bg-gray-50 p-2 rounded">
                              <p className="flex items-center gap-1"><ShieldCheck size={10} /> Operador: <span className="font-semibold">{record.sellerEmail}</span></p>
                              {record.reference && <p className="flex items-center gap-1"><Receipt size={10} /> Ref: {record.reference}</p>}
                            </div>
                          )}

                          {/* Detalles de la venta */}
                          {!isPayment && record.items && (
                            <ul className="text-[11px] space-y-0.5 text-gray-500 pl-2 mt-2 border-t border-gray-50 pt-2">
                              {record.items.map((it:any, idx:number) => (
                                <li key={idx} className="truncate">
                                  {it.quantity}x {it.title} (${it.subtotal.toFixed(2)})
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                  })}

                  {fullHistory.length === 0 && (
                    <div className="text-center py-10 text-gray-400 flex flex-col items-center">
                      <Receipt size={32} className="mb-2 text-gray-300" />
                      <p className="text-sm">Sin movimientos.</p>
                    </div>
                  )}
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

       {/* MODAL RECIBO DE PAGO O SALDO (Desplegado post-pago) */}
       {completedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm transition-opacity" onClick={() => setCompletedPayment(null)}></div>
           <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden z-30 flex flex-col">
             <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
               <div className="flex items-center gap-2">
                 <CheckCircle size={20} />
                 <h3 className="font-bold">Abono Registrado</h3>
               </div>
               <button onClick={() => setCompletedPayment(null)} className="text-emerald-100 hover:text-white"><X size={20} /></button>
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
               <button onClick={() => setCompletedPayment(null)} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded transition-colors">Cerrar</button>
               <button onClick={handlePrintReceipt} className="flex-1 py-2 bg-navy-800 hover:bg-navy-900 text-white font-medium rounded transition-colors flex justify-center items-center gap-2">
                 <Printer size={16} /> Imprimir Recibo
               </button>
             </div>
           </div>
        </div>
      )}

      {/* REACT TO PRINT HIDDEN PDF LAYER - STATEMENT */}
      {selectedCustomer && (
        <div style={{ display: 'none' }}>
           <div ref={printStatementRef} className="p-10 bg-white text-black" style={{ fontFamily: 'monospace', minHeight: '100vh' }}>
              <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-widest text-black flex items-center gap-2">
                    TOLEDO LIBROS JURÍDICOS
                  </h1>
                  <p className="text-sm font-semibold tracking-widest mt-1">ESTADO DE CUENTA CORPORATIVO</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-bold">FECHA DE EMISIÓN</p>
                  <p>{new Date().toLocaleDateString('es-AR')} {new Date().toLocaleTimeString('es-AR')}</p>
                </div>
              </div>

              <div className="mb-6 p-4 border border-gray-300 bg-gray-50">
                <p className="font-bold text-lg mb-1">{selectedCustomer.fullName}</p>
                <p className="text-xs uppercase"><span className="font-semibold">EMAIL:</span> {selectedCustomer.email}</p>
                <p className="text-xs uppercase"><span className="font-semibold">TEL:</span> {selectedCustomer.phone}</p>
                <p className="text-xs uppercase"><span className="font-semibold">CATEGORÍA:</span> {selectedCustomer.customerType}</p>
              </div>

              <div className="mb-6 flex gap-8">
                <div>
                  <p className="text-xs font-bold uppercase">Límite Aprobado</p>
                  <p className="text-lg">${selectedCustomer.limiteCredito?.toFixed(2) || '0.00'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase">Saldo Histórico</p>
                  <p className="text-lg font-black">{selectedCustomer.balance <= 0 ? 'A favor: $' + Math.abs(selectedCustomer.balance).toFixed(2) : 'Deudor: $' + selectedCustomer.balance.toFixed(2)}</p>
                </div>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-black">
                    <th className="py-2 font-bold w-1/6">FECHA</th>
                    <th className="py-2 font-bold w-1/3">CONCEPTO / REF</th>
                    <th className="py-2 font-bold text-right">CARGO (DEBE)</th>
                    <th className="py-2 font-bold text-right">ABONO (HABER)</th>
                  </tr>
                </thead>
                <tbody>
                  {fullHistory.map((record, i) => {
                    const isPayment = record.amount !== undefined;
                    const d = record.saleDate || record.paymentDate;
                    return (
                      <tr key={i} className="border-b border-dashed border-gray-300">
                        <td className="py-3 pr-2">{d ? new Date(d.toDate()).toLocaleDateString('es-AR') : ''}</td>
                        <td className="py-3 pr-2 uppercase">
                          <span className="font-bold">{isPayment ? `ABONO - ${record.method}` : 'VENTA A CUENTA'}</span>
                          {record.reference && <span className="block text-[10px] text-gray-500">Ref: {record.reference}</span>}
                        </td>
                        <td className="py-3 text-right">{!isPayment ? `$${record.totalAmount.toFixed(2)}` : ''}</td>
                        <td className="py-3 text-right">{isPayment ? `$${record.amount.toFixed(2)}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-16 text-center text-xs text-gray-500 italic border-t border-gray-300 pt-4">
                Documento generado automáticamente a través de la plataforma Toledo ERP.<br/>
                Para consultas o aclaraciones sobre su saldo, por favor contáctenos.
              </div>
           </div>
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
                  <p><span className="font-bold">CLIENTE:</span> {completedPayment.customerName}</p>
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

    </div>
  );
};
