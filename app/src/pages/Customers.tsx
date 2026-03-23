import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, Search, Plus, X, Receipt, Clock, CreditCard } from 'lucide-react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, where, runTransaction, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Customer {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  customerType: string;
  balance: number; // Deuda > 0
  limiteCredito?: number;
  diaCierre?: number;
  lastMovementDate?: any;
  oldestDebtDate?: any;
  createdAt?: any;
}

const initialFormStatus = {
  fullName: '', email: '', phone: '', customerType: 'Abogado', balance: 0, limiteCredito: 0, diaCierre: 1
};

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  
  // Forms
  const [form, setForm] = useState<Omit<Customer, 'id' | 'createdAt'>>(initialFormStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Historial
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 1. Cargar clientes
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const data: Customer[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(data);
      
      // Actualizar cliente seleccionado si cambia su balance
      setCustomerSales(currSales => {
        if (selectedCustomer) {
           const updated = data.find(c => c.id === selectedCustomer.id);
           if (updated) setSelectedCustomer(updated);
        }
        return currSales;
      });
    });
    return () => unsub();
  }, [selectedCustomer]);

  // 2. Cargar historial y pagos del cliente seleccionado
  useEffect(() => {
    if (!selectedCustomer?.id) {
      setCustomerSales([]);
      setCustomerPayments([]);
      return;
    }
    setIsLoadingHistory(true);
    
    const salesQuery = query(collection(db, 'sales'), where('customerId', '==', selectedCustomer.id));
    const unsubSales = onSnapshot(salesQuery, (snapshot) => {
      const sales: any[] = [];
      snapshot.forEach(d => sales.push({ id: d.id, ...d.data() }));
      sales.sort((a, b) => b.saleDate?.toMillis() - a.saleDate?.toMillis());
      setCustomerSales(sales);
      setIsLoadingHistory(false);
    });

    const payQuery = query(collection(db, 'payments'), where('customerId', '==', selectedCustomer.id));
    const unsubPay = onSnapshot(payQuery, (snapshot) => {
      const payments: any[] = [];
      snapshot.forEach(d => payments.push({ id: d.id, ...d.data() }));
      payments.sort((a, b) => b.paymentDate?.toMillis() - a.paymentDate?.toMillis());
      setCustomerPayments(payments);
    });
    
    return () => { unsubSales(); unsubPay(); };
  }, [selectedCustomer?.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'customers'), {
        ...form,
        balance: 0,
        createdAt: serverTimestamp(),
      });
      setForm(initialFormStatus);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error agregando cliente: ", error);
    } finally {
      setIsSubmitting(false);
    }
  };

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
      await runTransaction(db, async (transaction) => {
        const custRef = doc(db, 'customers', selectedCustomer.id!);
        const custSnap = await transaction.get(custRef);
        
        if (!custSnap.exists()) throw new Error("El cliente no existe.");
        
        const currentBalance = custSnap.data().balance || 0;
        
        // Registrar el pago
        const payRef = doc(collection(db, 'payments'));
        transaction.set(payRef, {
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.fullName,
          amount: amount,
          paymentDate: serverTimestamp(),
        });

        // Restar deuda
        transaction.update(custRef, { balance: currentBalance - amount });
      });
      
      setPaymentAmount('');
      setIsPaymentModalOpen(false);
    } catch (error: any) {
      alert(`Error procesando el pago: ${error.message}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6 flex flex-col h-full relative">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Cuentas y Clientes</h2>
          <p className="text-gray-500 text-sm mt-1">Directorio y control de deudas por cuenta corriente</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-navy-800 hover:bg-navy-700 text-white px-5 py-2.5 rounded-md flex items-center gap-2 transition-colors font-medium shadow-sm"
        >
          <Plus size={20} />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex-1 min-h-[500px]">
        
        {/* LADO IZQUIERDO: Directorio */}
        <div className={`flex flex-col ${selectedCustomer ? 'w-2/3 border-r border-gray-200' : 'w-full'}`}>
          <div className="p-4 border-b border-gray-100 flex gap-4 bg-gray-50">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Buscar por Nombre, Email o Teléfono..." 
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
                  <th className="py-3 px-6 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <UsersIcon className="w-10 h-10 text-gray-300 mb-3" />
                        <p className="font-medium text-gray-600">No hay clientes registrados o encontrados.</p>
                      </div>
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
                          {customer.fullName}
                        </p>
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
                        <span className={customer.balance > 0 ? 'text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-100' : customer.balance < 0 ? 'text-emerald-600' : 'text-gray-500'}>
                          ${customer.balance > 0 ? customer.balance.toFixed(2) : customer.balance < 0 ? `+${Math.abs(customer.balance).toFixed(2)}` : '0.00'}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-center">
                        <button className="text-navy-600 hover:text-navy-800 text-sm font-medium">Cta. Corriente</button>
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
          <div className="w-1/3 flex flex-col bg-white">
            <div className="p-4 bg-navy-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-navy-200">Estado de Cuenta</h3>
                <p className="font-medium text-lg leading-tight mt-0.5">{selectedCustomer.fullName}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-navy-200 hover:text-white transition-colors bg-navy-800 p-1.5 rounded-full">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 border-b border-gray-100 bg-gray-50">
              <div className="flex justify-between items-end mb-4">
                <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Deuda Vigente</span>
                <span className={`text-3xl font-black ${selectedCustomer.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  ${selectedCustomer.balance.toFixed(2)}
                </span>
              </div>
              
              <button 
                onClick={() => setIsPaymentModalOpen(true)}
                disabled={selectedCustomer.balance <= 0}
                className="w-full bg-navy-800 hover:bg-navy-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <CreditCard size={18} /> Registrar Pago / Entrega
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Historial de Movimientos</h4>
              
              {isLoadingHistory ? (
                <div className="text-center py-10 text-gray-400 text-sm">Cargando registros...</div>
              ) : (
                <div className="space-y-4">
                  {/* Combina Pagos y Ventas */}
                  {[...customerSales, ...customerPayments]
                    .sort((a,b) => {
                      const tA = a.saleDate || a.paymentDate;
                      const tB = b.saleDate || b.paymentDate;
                      return (tB?.toMillis() || 0) - (tA?.toMillis() || 0);
                    })
                    .map((record, i) => {
                      const isPayment = record.amount !== undefined; // pagos tienen 'amount', ventas 'totalAmount'
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
                              <span className={`text-sm font-semibold ${isPayment ? 'text-emerald-700' : 'text-gray-800'}`}>
                                {isPayment ? 'Entrega Registrada' : 'Venta de Productos'}
                              </span>
                              {!isPayment && record.paymentMethod === 'A Cuenta' && (
                                <span className="ml-2 text-[10px] font-bold text-red-600 bg-red-50 px-1 py-0.5 rounded uppercase">Fiado</span>
                              )}
                            </div>
                            <span className={`font-bold ${isPayment ? 'text-emerald-600' : 'text-gray-900'}`}>
                              {isPayment ? '-' : '+'}${(record.amount || record.totalAmount)?.toFixed(2)}
                            </span>
                          </div>
                          
                          {!isPayment && record.items && (
                            <ul className="text-[11px] space-y-0.5 text-gray-500 pl-2 mt-2 border-t border-gray-50 pt-2">
                              {record.items.map((it:any, idx:number) => (
                                <li key={idx} className="truncate">
                                  {it.quantity}x {it.title}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                  })}

                  {customerSales.length === 0 && customerPayments.length === 0 && (
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

      {/* Modal: Nuevo Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)}></div>
          <div className="fixed inset-y-0 right-0 max-w-md w-full flex">
            <div className="w-full h-full bg-white shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-navy-900 text-white">
                <h2 className="text-lg font-medium">Registrar Cliente</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-navy-300 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <form id="new-customer-form" onSubmit={handleAddCustomer} className="space-y-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label><input required type="text" name="fullName" value={form.fullName} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input required type="email" name="email" value={form.email} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label><input required type="text" name="phone" value={form.phone} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" /></div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoría Jurídica</label>
                    <select required name="customerType" value={form.customerType} onChange={handleInputChange} className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm bg-white">
                      <option value="Abogado">Abogado / Profesional</option>
                      <option value="Estudiante">Estudiante Universitario</option>
                      <option value="Particular">Público / Particular</option>
                      <option value="Institución">Institución / Juzgado</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Límite de Crédito ($)</label>
                      <input type="number" name="limiteCredito" value={form.limiteCredito} onChange={handleInputChange} min="0" step="1000" className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Día de Cierre (1-31)</label>
                      <input type="number" name="diaCierre" value={form.diaCierre} onChange={handleInputChange} min="1" max="31" className="w-full border border-gray-300 rounded-md py-2 px-3 focus:ring-navy-500 focus:border-navy-500 sm:text-sm" />
                    </div>
                  </div>
                </form>
              </div>

              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancelar</button>
                <button type="submit" form="new-customer-form" disabled={isSubmitting} className="px-6 py-2 text-sm text-white bg-navy-800 rounded-md hover:bg-navy-700 disabled:opacity-70 font-medium">
                  {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ingresar Pago */}
      {isPaymentModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" onClick={() => setIsPaymentModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden z-10">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2"><CreditCard size={18} className="text-navy-600"/> Registrar Pago</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleProcessPayment} className="p-6">
              <div className="mb-4 text-center">
                <p className="text-sm text-gray-500 mb-1">Deuda pendiente de</p>
                <p className="font-bold text-gray-900">{selectedCustomer.fullName}</p>
                <p className="text-2xl font-black text-red-600 mt-2">${selectedCustomer.balance.toFixed(2)}</p>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2 text-center">Monto a abonar</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input 
                    type="number" 
                    min="1" 
                    step="0.01"
                    max={selectedCustomer.balance}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border-2 border-gray-300 rounded-lg py-3 pl-8 pr-4 text-center text-lg font-bold text-navy-900 focus:outline-none focus:border-navy-600 focus:ring-1 focus:ring-navy-600"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isProcessingPayment}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-colors"
              >
                {isProcessingPayment ? 'Procesando...' : 'Confirmar Recepción de Pago'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
