import React, { useState, useEffect, useRef } from 'react';
import { Users as UsersIcon, Search, Plus, X, Receipt, Clock, CreditCard, Edit2, Trash2, Lock, AlertTriangle, Printer, DollarSign, Wallet } from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, where, orderBy, serverTimestamp, runTransaction } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { useReactToPrint } from 'react-to-print';
import { AestheticAlert } from '../components/Alert';

export interface Customer {
  id?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dni: string;
  cuit?: string;
  email?: string;
  phone: string;
  customerType: string;
  balance: number;
  saldoAFavor?: number;
  historialCredito?: any[];
  limiteCredito?: number;
  lastMovementDate?: any;
  oldestDebtDate?: any;
  createdAt?: any;
}

const initialFormStatus = {
  firstName: '', 
  lastName: '', 
  fullName: '',
  dni: '', 
  cuit: '', 
  email: '', 
  phone: '', 
  customerType: 'Abogado', 
  balance: 0, 
  limiteCredito: 0
};

export const Customers: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const getCustomerDisplayName = (c: Customer | undefined | null) => {
    if (!c) return 'Sin Nombre';
    const name = `${c.firstName || ''} ${c.lastName || ''}`.trim();
    return name || c.fullName || 'Cliente Sin Identificar';
  };
  
  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  
  // Forms
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<Omit<Customer, 'id' | 'createdAt'>>(initialFormStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deletion state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  
  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState({ 
    isOpen: false, 
    message: '', 
    type: 'error' as 'error' | 'success' | 'info' | 'warning' | 'confirm',
    onConfirm: undefined as (() => void) | undefined
  });

  // Print Logic
  const [reprintData, setReprintData] = useState<any>(null);
  const printReceiptRef = useRef<HTMLDivElement>(null);
  const handlePrintReceipt = useReactToPrint({ 
    contentRef: printReceiptRef, 
    documentTitle: 'Recibo_Pago_Toledo_Libros' 
  });

  const handleReprintPayment = (pay: any) => {
    const data = {
      customerName: getCustomerDisplayName(selectedCustomer),
      amount: pay.amount || 0,
      newBalance: pay.remainingBalance || 0,
      method: pay.paymentMethod || 'Efectivo',
      date: pay.paymentDate && typeof pay.paymentDate.toDate === 'function' 
        ? pay.paymentDate.toDate().toLocaleString('es-AR') 
        : 'Reciente',
      description: pay.description || 'Cobro de Cuenta Corriente'
    };
    setReprintData(data);
    // Pequeño delay para asegurar que el ref se actualice con el nuevo data antes de imprimir
    setTimeout(() => {
      handlePrintReceipt();
    }, 100);
  };
  
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('Efectivo');
  const [selectedInstallmentInfo, setSelectedInstallmentInfo] = useState<{saleId: string, number: number, amount: number, total: number} | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Crédito / Saldo a Favor
  const [creditAmount, setCreditAmount] = useState<string>('');
  const [creditReason, setCreditReason] = useState<string>('');
  const [isProcessingCredit, setIsProcessingCredit] = useState(false);
  
  // Historial
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [historialPagos, setHistorialPagos] = useState<any[]>([]);
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
      payments.sort((a, b) => (b.paymentDate?.toMillis() || 0) - (a.paymentDate?.toMillis() || 0));
      setCustomerPayments(payments);
    });
    
    // Sub-colección historial_pagos
    const histRef = collection(db, 'customers', selectedCustomer.id, 'historial_pagos');
    const qHist = query(histRef, orderBy('paymentDate', 'desc'));
    const unsubHist = onSnapshot(qHist, (snapshot) => {
      const hist: any[] = [];
      snapshot.forEach(d => hist.push({ id: d.id, ...d.data() }));
      setHistorialPagos(hist);
    });
    
    return () => { unsubSales(); unsubPay(); unsubHist(); };
  }, [selectedCustomer?.id]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleEditClick = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    setEditingCustomer(customer);
    setForm({
      firstName: customer.firstName,
      lastName: customer.lastName,
      fullName: customer.fullName,
      dni: customer.dni,
      cuit: customer.cuit || '',
      email: customer.email || '',
      phone: customer.phone,
      customerType: customer.customerType,
      balance: customer.balance,
      limiteCredito: customer.limiteCredito || 0
    });
    setIsModalOpen(true);
  };

  const handleOpenNewModal = () => {
    setEditingCustomer(null);
    setForm(initialFormStatus);
    setIsModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.dni || !form.phone) {
      setAlertConfig({ isOpen: true, message: "Por favor completa los campos obligatorios (*) marcados en rojo.", type: 'warning', onConfirm: undefined });
      return;
    }

    setIsSubmitting(true);
    try {
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`;
      
      if (editingCustomer?.id) {
        // Modo Edición
        await updateDoc(doc(db, 'customers', editingCustomer.id), {
          ...form,
          fullName
        });
      } else {
        // Modo Nuevo
        await addDoc(collection(db, 'customers'), {
          ...form,
          fullName,
          balance: 0,
          createdAt: serverTimestamp(),
        });
      }
      
      setForm(initialFormStatus);
      setEditingCustomer(null);
      setIsModalOpen(false);
      window.location.reload();
    } catch (error) {
      console.error("Error guardando cliente: ", error);
      setAlertConfig({ isOpen: true, message: "Error al guardar los cambios.", type: 'error', onConfirm: undefined });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    if (customer.balance > 0) {
      setAlertConfig({ 
        isOpen: true, 
        message: `No se puede eliminar a ${getCustomerDisplayName(customer)} porque tiene una deuda pendiente de $${customer.balance.toFixed(2)}. Primero debe saldar la cuenta.`, 
        type: 'warning',
        onConfirm: undefined
      });
      return;
    }
    setCustomerToDelete(customer);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerToDelete?.id) return;

    setIsDeleting(true);
    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("Usuario no autenticado");

      // Re-autenticación
      const credential = EmailAuthProvider.credential(user.email, confirmPassword);
      await reauthenticateWithCredential(user, credential);

      // Borrado en Firestore
      await deleteDoc(doc(db, 'customers', customerToDelete.id));

      setIsDeleteModalOpen(false);
      setConfirmPassword('');
      setCustomerToDelete(null);
      if (selectedCustomer?.id === customerToDelete.id) setSelectedCustomer(null);
      window.location.reload();

    } catch (error: any) {
      console.error(error);
      setAlertConfig({ isOpen: true, message: "Error de seguridad: La contraseña no es válida o hubo un problema con la autenticación.", type: 'error', onConfirm: undefined });
    } finally {
      setIsDeleting(false);
    }
  };

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
      await runTransaction(db, async (transaction) => {
        // --- 1. LECTURAS (READS) - DEBEN IR PRIMERO ---
        const custRef = doc(db, 'customers', selectedCustomer.id!);
        const custSnap = await transaction.get(custRef);
        if (!custSnap.exists()) throw new Error("El cliente no existe.");
        
        // Pre-lectura de todas las ventas involucradas
        const salesToUpdate: { ref: any, snap: any }[] = [];
        
        if (selectedInstallmentInfo) {
          const sRef = doc(db, 'sales', selectedInstallmentInfo.saleId);
          const sSnap = await transaction.get(sRef);
          if (sSnap.exists()) salesToUpdate.push({ ref: sRef, snap: sSnap });
        }
        
        const financedSales = customerSales
          .filter(s => s.isFinanced && s.installments?.some((i:any) => i.status !== 'Pagada'))
          .sort((a, b) => (a.saleDate?.toMillis() || 0) - (b.saleDate?.toMillis() || 0));

        for (const s of financedSales) {
          if (salesToUpdate.some(item => item.ref.id === s.id)) continue;
          const sRef = doc(db, 'sales', s.id);
          const sSnap = await transaction.get(sRef);
          if (sSnap.exists()) salesToUpdate.push({ ref: sRef, snap: sSnap });
        }

        // --- 2. ESCRITURAS (WRITES) - DESPUÉS DE TODAS LAS LECTURAS ---
        const currentBalance = custSnap.data().balance || 0;
        const newBalance = currentBalance - amount;

        // Registrar Pago en colección global
        const payRef = doc(collection(db, 'payments'));
        transaction.set(payRef, {
          customerId: selectedCustomer.id,
          customerName: getCustomerDisplayName(selectedCustomer),
          amount: amount,
          paymentMethod: paymentMethod,
          paymentDate: serverTimestamp(),
        });

        // Registrar en historial_pagos
        const histRef = doc(collection(db, 'customers', selectedCustomer.id!, 'historial_pagos'));
        let paymentDescription = 'Cobro de Cuenta Corriente';
        if (selectedInstallmentInfo) {
          paymentDescription = `Pago Cuota ${selectedInstallmentInfo.number}/${selectedInstallmentInfo.total} - Venta #${selectedInstallmentInfo.saleId.slice(-6).toUpperCase()}`;
        }

        transaction.set(histRef, {
          amount: amount,
          paymentMethod: paymentMethod,
          paymentDate: serverTimestamp(),
          remainingBalance: newBalance,
          description: paymentDescription
        });

        // Actualizar Saldo en documento de cliente
        transaction.update(custRef, { balance: newBalance });

        // Saldo de Cuotas
        let remainingToDistribute = amount;
        
        // A. Primero la cuota específica si existe
        if (selectedInstallmentInfo) {
          const target = salesToUpdate.find(item => item.ref.id === selectedInstallmentInfo.saleId);
          if (target) {
            const upInst = [...(target.snap.data().installments || [])];
            const idx = upInst.findIndex((i: any) => i.number === selectedInstallmentInfo.number);
            if (idx !== -1) {
              const inst = upInst[idx];
              const alreadyPaid = Number(inst.paidAmount || 0);
              const toPay = Math.min(remainingToDistribute, inst.amount - alreadyPaid);
              
              const newPaid = alreadyPaid + toPay;
              upInst[idx] = {
                ...inst,
                paidAmount: newPaid,
                status: newPaid >= inst.amount ? 'Pagada' : 'Parcial'
              };
              remainingToDistribute -= toPay;
              transaction.update(target.ref, { installments: upInst });
            }
          }
        }
        
        // B. Luego el resto cronológicamente
        if (remainingToDistribute > 0) {
          for (const target of salesToUpdate) {
            if (remainingToDistribute <= 0) break;

            const updatedInstallments = [...(target.snap.data().installments || [])];
            let saleChanged = false;

            for (let i = 0; i < updatedInstallments.length; i++) {
              const inst = updatedInstallments[i];
              if (inst.status === 'Pagada') continue;
              if (remainingToDistribute <= 0) break;

              const pendingInInst = inst.amount - (inst.paidAmount || 0);
              const paymentForInst = Math.min(remainingToDistribute, pendingInInst);

              updatedInstallments[i] = {
                ...inst,
                paidAmount: (inst.paidAmount || 0) + paymentForInst,
                status: ((inst.paidAmount || 0) + paymentForInst) >= inst.amount ? 'Pagada' : 'Parcial'
              };

              remainingToDistribute -= paymentForInst;
              saleChanged = true;
            }

            if (saleChanged) {
              transaction.update(target.ref, { installments: updatedInstallments });
            }
          }
        }
      });
      
      setPaymentAmount('');
      setPaymentMethod('Efectivo');
      setSelectedInstallmentInfo(null);
      setIsPaymentModalOpen(false);
      window.location.reload();
    } catch (error: any) {
      setAlertConfig({ isOpen: true, message: `Error procesando el pago: ${error.message}`, type: 'error', onConfirm: undefined });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleManageCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedCustomer.id) return;
    
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount === 0) {
      setAlertConfig({ isOpen: true, message: "Ingresa un monto válido.", type: 'warning', onConfirm: undefined });
      return;
    }
    if (!creditReason.trim()) {
      setAlertConfig({ isOpen: true, message: "Debes ingresar un motivo para el movimiento.", type: 'warning', onConfirm: undefined });
      return;
    }

    setIsProcessingCredit(true);
    try {
      await runTransaction(db, async (transaction) => {
        const custRef = doc(db, 'customers', selectedCustomer.id!);
        const custSnap = await transaction.get(custRef);
        if (!custSnap.exists()) throw new Error("Cliente no encontrado.");
        
        const currentCredit = custSnap.data().saldoAFavor || 0;
        const newCredit = currentCredit + amount;
        
        if (newCredit < 0) throw new Error("El saldo a favor no puede ser negativo.");

        const historyItem = {
          date: new Date(),
          amount: amount,
          reason: creditReason.trim(),
          previousBalance: currentCredit,
          newBalance: newCredit,
          type: amount > 0 ? 'CARGA' : 'USO'
        };

        const existingHistory = custSnap.data().historialCredito || [];
        
        transaction.update(custRef, {
          saldoAFavor: newCredit,
          historialCredito: [historyItem, ...existingHistory].slice(0, 50) // Mantener últimos 50
        });
      });

      setAlertConfig({ isOpen: true, message: "Saldo actualizado correctamente.", type: 'success', onConfirm: undefined });
      setIsCreditModalOpen(false);
      setCreditAmount('');
      setCreditReason('');
      window.location.reload();
    } catch (error: any) {
      setAlertConfig({ isOpen: true, message: error.message, type: 'error', onConfirm: undefined });
    } finally {
      setIsProcessingCredit(false);
    }
  };

  const filteredCustomers = customers.filter(c => 
    getCustomerDisplayName(c).toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.dni.includes(searchTerm) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
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
          onClick={handleOpenNewModal}
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
                  <th className="py-3 px-4 font-semibold">Cliente</th>
                  <th className="py-3 px-4 font-semibold">Contacto</th>
                  <th className="py-3 px-4 font-semibold">Categoría</th>
                  <th className="py-3 px-4 font-semibold text-right">Saldo Deudor</th>
                  <th className="py-3 px-4 font-semibold text-right">Saldo a Favor</th>
                  <th className="py-3 px-4 font-semibold text-center">Acciones</th>
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
                          {getCustomerDisplayName(customer)}
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
                      <td className="py-3 px-4 text-right font-medium">
                        <span className={customer.balance > 0 ? 'text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-100' : 'text-gray-500'}>
                          ${(customer.balance || 0) > 0 ? customer.balance.toFixed(2) : '0.00'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        <span className={(customer.saldoAFavor || 0) > 0 ? 'text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-100' : 'text-gray-500'}>
                          ${(customer.saldoAFavor || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-center">
                        <div className="flex items-center justify-center gap-3">
                          <button 
                            className="text-navy-600 hover:text-navy-800 text-sm font-medium flex items-center gap-1"
                            onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); }}
                          >
                            <Receipt size={14} /> Cta. Cte.
                          </button>
                          <button 
                            className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-all"
                            onClick={(e) => { e.stopPropagation(); setSelectedCustomer(customer); setIsCreditModalOpen(true); }}
                            title="Gestionar Billetera / Crédito"
                          >
                            <Wallet size={16} />
                          </button>
                          <button 
                            className="p-1.5 text-navy-400 hover:text-navy-700 hover:bg-navy-50 rounded transition-all"
                            onClick={(e) => handleEditClick(e, customer)}
                            title="Editar Cliente"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            className="p-1.5 text-red-400 hover:text-red-700 hover:bg-red-50 rounded transition-all"
                            onClick={(e) => handleDeleteClick(e, customer)}
                            title="Eliminar Cliente"
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
          <div className="w-1/3 flex flex-col bg-white">
            <div className="p-4 bg-navy-900 text-white flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-sm uppercase tracking-wider text-navy-200">Estado de Cuenta</h3>
                <p className="font-medium text-lg leading-tight mt-0.5">{getCustomerDisplayName(selectedCustomer)}</p>
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

            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
              <div className="mb-6">
                <h4 className="text-[10px] font-bold text-navy-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Clock size={14}/> Últimos Cobros Registrados
                </h4>
                <div className="space-y-2">
                  {historialPagos.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-lg">
                      <p className="text-xs text-gray-400">Sin pagos registrados en historial.</p>
                    </div>
                  ) : (
                    historialPagos.map((p) => (
                      <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex justify-between items-center group hover:border-navy-200 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                            <Receipt size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-900 leading-none">Pago Recibido</p>
                            <p className="text-[10px] text-gray-500 mt-1">
                              {p.paymentDate?.toDate().toLocaleDateString('es-AR')} • {p.paymentMethod}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <div>
                            <p className="text-sm font-black text-navy-900 leading-none">-${p.amount.toFixed(2)}</p>
                            <p className="text-[9px] text-gray-400 font-bold uppercase mt-1">Restante: ${p.remainingBalance.toFixed(2)}</p>
                          </div>
                          <button 
                            className="text-gray-300 hover:text-navy-600 transition-colors p-1" 
                            title="Re-imprimir Recibo"
                            onClick={(e) => { e.stopPropagation(); handleReprintPayment(p); }}
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-[10px] font-bold text-navy-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <DollarSign size={14}/> Planes de Financiación Activos
                </h4>
                <div className="space-y-3">
                  {customerSales.filter(s => s.isFinanced).length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-lg">
                      <p className="text-xs text-gray-400">Sin planes de pago activos.</p>
                    </div>
                  ) : (
                    customerSales.filter(s => s.isFinanced).map((sale) => (
                      <div key={sale.id} className="bg-navy-900 text-white rounded-xl p-4 shadow-lg overflow-hidden relative">
                         <div className="absolute right-0 top-0 p-4 opacity-10">
                           <Receipt size={60} />
                         </div>
                         <div className="relative z-10">
                           <div className="flex justify-between items-start mb-3">
                             <div>
                               <p className="text-[10px] font-bold text-navy-300 uppercase tracking-tighter">Plan de Cuotas</p>
                               <h5 className="text-sm font-black">Venta #{sale.id.slice(-6).toUpperCase()}</h5>
                             </div>
                             <div className="text-right">
                               <p className="text-[10px] font-bold text-navy-300 uppercase tracking-tighter">Total Financiado</p>
                               <p className="text-sm font-black text-emerald-400">${(sale.paymentBreakdown?.['A Cuenta'] || 0).toFixed(2)}</p>
                             </div>
                           </div>
                           
                           <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                             {sale.installments?.map((inst: any) => (
                               <div key={inst.number} className="flex justify-between items-center bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/5">
                                 <div className="flex items-center gap-2">
                                   <div className={`w-2 h-2 rounded-full ${inst.status === 'Pagada' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-400'}`}></div>
                                   <span className="text-[10px] font-bold uppercase tracking-tight">Cuota {inst.number} de {sale.installments.length}</span>
                                 </div>
                                 <div className="text-right">
                                   <span className="text-[10px] font-black">${inst.amount.toFixed(2)}</span>
                                   <span className={`block text-[8px] font-bold uppercase ${inst.status === 'Pagada' ? 'text-emerald-400' : 'text-rose-300'}`}>
                                     {inst.status} {inst.paidAmount > 0 && inst.status !== 'Pagada' ? `($${inst.paidAmount} cobrados)` : ''}
                                   </span>
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Historial de Movimientos</h4>
              
              {isLoadingHistory ? (
                <div className="text-center py-10 text-gray-400 text-sm">Cargando registros...</div>
              ) : (
                <div className="space-y-4">
                  {/* Combina Pagos y Ventas */}
                  {[...customerSales, ...customerPayments].sort((a, b) => {
                      const tA = a.saleDate || a.paymentDate;
                      const tB = b.saleDate || b.paymentDate;
                      const getMillis = (ts: any) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);
                      return getMillis(tB) - getMillis(tA);
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
                                {dateObj && typeof dateObj.toDate === 'function' 
                                  ? dateObj.toDate().toLocaleString('es-AR') 
                                  : 'Reciente'}
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

                  {/* Historial de Billetera Virtual (Manual Movements) */}
                  {selectedCustomer.historialCredito && selectedCustomer.historialCredito.length > 0 && (
                    <div className="mb-6 bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                      <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Wallet size={14}/> Movimientos de Billetera
                      </h4>
                      <div className="space-y-3">
                        {selectedCustomer.historialCredito.map((mov, idx) => (
                          <div key={idx} className="bg-white border border-emerald-100 rounded-lg p-3 shadow-sm flex justify-between items-center text-[11px]">
                            <div>
                              <p className="font-bold text-gray-800">{mov.reason}</p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {mov.date && typeof mov.date.toDate === 'function' ? mov.date.toDate().toLocaleDateString('es-AR') : new Date(mov.date?.seconds * 1000 || Date.now()).toLocaleDateString('es-AR')} • <span className="uppercase font-bold">{mov.type}</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`font-black ${mov.amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {mov.amount > 0 ? '+' : ''}{mov.amount.toFixed(2)}
                              </p>
                              <p className="text-[9px] text-gray-400 font-bold uppercase">Saldo: ${mov.newBalance.toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {customerSales.length === 0 && customerPayments.length === 0 && (!selectedCustomer.historialCredito || selectedCustomer.historialCredito.length === 0) && (
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
                <h2 className="text-lg font-medium">{editingCustomer ? 'Editar Cliente' : 'Registrar Cliente'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-navy-300 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <form id="customer-form" onSubmit={handleSaveCustomer} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Nombre <span className="text-red-500">*</span></label>
                      <input required type="text" name="firstName" value={form.firstName} onChange={handleInputChange} className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 focus:outline-none focus:border-navy-600 transition-colors sm:text-sm font-semibold" placeholder="Ej: Juan" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Apellido <span className="text-red-500">*</span></label>
                      <input required type="text" name="lastName" value={form.lastName} onChange={handleInputChange} className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 focus:outline-none focus:border-navy-600 transition-colors sm:text-sm font-semibold" placeholder="Ej: Pérez" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">DNI <span className="text-red-500">*</span></label>
                      <input required type="text" name="dni" value={form.dni} onChange={handleInputChange} className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 focus:outline-none focus:border-navy-600 transition-colors sm:text-sm font-semibold" placeholder="Sin puntos" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Teléfono <span className="text-red-500">*</span></label>
                      <input required type="text" name="phone" value={form.phone} onChange={handleInputChange} className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 focus:outline-none focus:border-navy-600 transition-colors sm:text-sm font-semibold" placeholder="Cod. área + número" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">CUIT (Opcional)</label>
                      <input type="text" name="cuit" value={form.cuit} onChange={handleInputChange} className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 focus:outline-none focus:border-navy-600 transition-colors sm:text-sm font-medium text-gray-600" placeholder="00-00000000-0" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">Email (Opcional)</label>
                      <input type="email" name="email" value={form.email} onChange={handleInputChange} className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 focus:outline-none focus:border-navy-600 transition-colors sm:text-sm font-medium text-gray-600" placeholder="ejemplo@mail.com" />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Categoría Jurídica</label>
                    <select required name="customerType" value={form.customerType} onChange={handleInputChange} className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 focus:outline-none focus:border-navy-600 transition-colors sm:text-sm bg-white font-semibold">
                      <option value="Abogado">Abogado / Profesional</option>
                      <option value="Estudiante">Estudiante Universitario</option>
                      <option value="Particular">Público / Particular</option>
                      <option value="Institución">Institución / Juzgado</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 px-1">Crédito Máximo Autorizado ($)</label>
                    <input type="number" name="limiteCredito" value={form.limiteCredito} onChange={handleInputChange} min="0" step="1000" className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 focus:outline-none focus:border-navy-600 transition-colors sm:text-sm font-bold text-navy-800" placeholder="Ej: 50000" />
                  </div>
                </form>
              </div>

              <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancelar</button>
                <button type="submit" form="customer-form" disabled={isSubmitting} className="px-6 py-2 text-sm text-white bg-navy-800 rounded-md hover:bg-navy-700 disabled:opacity-70 font-medium">
                  {isSubmitting ? 'Guardando...' : editingCustomer ? 'Guardar Cambios' : 'Guardar Cliente'}
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
                <p className="font-bold text-gray-900">{getCustomerDisplayName(selectedCustomer)}</p>
                <p className="text-2xl font-black text-red-600 mt-2">${selectedCustomer.balance.toFixed(2)}</p>
              </div>

              {customerSales.filter(s => s.isFinanced && s.installments?.some((i:any) => i.status !== 'Pagada')).length > 0 && (
                <div className="mb-6 bg-navy-50 p-3 rounded-lg border border-navy-100">
                  <label className="block text-[10px] font-black text-navy-400 uppercase tracking-widest mb-2 px-1 text-center">Seleccionar Cuota Específica</label>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                    {customerSales.filter(s => s.isFinanced).flatMap(sale => 
                      (sale.installments || []).filter((inst:any) => inst.status !== 'Pagada').map((inst:any) => (
                        <button
                          key={`${sale.id}-${inst.number}`}
                          type="button"
                          onClick={() => {
                            const pending = inst.amount - (inst.paidAmount || 0);
                            setPaymentAmount(pending.toFixed(2));
                            setSelectedInstallmentInfo({
                              saleId: sale.id,
                              number: inst.number,
                              amount: inst.amount,
                              total: sale.installments.length
                            });
                          }}
                          className={`w-full text-left p-2 rounded border transition-all flex justify-between items-center ${
                            selectedInstallmentInfo?.saleId === sale.id && selectedInstallmentInfo?.number === inst.number
                            ? 'bg-navy-800 text-white border-navy-800 shadow-md transform scale-[1.02]'
                            : 'bg-white text-navy-900 border-navy-200 hover:border-navy-400 hover:bg-navy-50'
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black uppercase tracking-tighter opacity-70">Venta #{sale.id.slice(-4).toUpperCase()}</span>
                            <span className="text-xs font-bold leading-none">Cuota {inst.number}/{sale.installments.length}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black block leading-none">${(inst.amount - (inst.paidAmount || 0)).toFixed(2)}</span>
                            <span className="text-[7px] font-black uppercase opacity-60 tracking-tighter">Pendiente</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  {selectedInstallmentInfo && (
                    <button 
                      type="button" 
                      onClick={() => { setSelectedInstallmentInfo(null); setPaymentAmount(''); }}
                      className="mt-3 text-[8px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-700 w-full text-center py-1 border border-rose-100 rounded bg-rose-50"
                    >
                      (Quitar selección de cuota)
                    </button>
                  )}
                </div>
              )}
              
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2 text-center">Monto a abonar</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                  <input 
                    type="number" 
                    min="1" 
                    step="0.01"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border-2 border-gray-300 rounded-lg py-3 pl-8 pr-4 text-center text-lg font-bold text-navy-900 focus:outline-none focus:border-navy-600 focus:ring-1 focus:ring-navy-600"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Método de Cobro</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Efectivo', 'Transferencia', 'Mercado Pago', 'Cheque'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 text-[10px] font-bold uppercase rounded-md border transition-all ${
                        paymentMethod === m ? 'bg-navy-900 text-white border-navy-900 shadow-md scale-105' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
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
      {/* Modal: Eliminación Segura */}
      {isDeleteModalOpen && customerToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={() => { setIsDeleteModalOpen(false); setConfirmPassword(''); }}></div>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden z-20">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-red-50 text-red-700">
              <h3 className="font-bold flex items-center gap-2 uppercase tracking-tighter"><AlertTriangle size={18}/> Protocolo de Seguridad</h3>
              <button onClick={() => { setIsDeleteModalOpen(false); setConfirmPassword(''); }} className="text-red-400 hover:text-red-600"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleConfirmDelete} className="p-6">
              <div className="mb-6 text-center">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={32} />
                </div>
                <h4 className="text-lg font-black text-gray-900 leading-tight">¿Eliminar Cliente?</h4>
                <p className="text-xs text-gray-500 mt-2 px-4 uppercase font-bold tracking-widest leading-relaxed">
                  Esta acción es irreversible. Se borrarán permanentemente los datos y el historial de <span className="text-red-600">{getCustomerDisplayName(customerToDelete)}</span>.
                </p>
              </div>

              <div className="mb-6">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 text-center">Validación de Identidad</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input 
                    type="password" 
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-lg py-3 pl-10 pr-4 text-center font-bold text-gray-800 focus:outline-none focus:border-red-500 transition-all placeholder:text-gray-300"
                    placeholder="Ingrese su contraseña"
                  />
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
      {/* Modal: Gestionar Crédito / Saldo a Favor */}
      {isCreditModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" onClick={() => setIsCreditModalOpen(false)}></div>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden z-20">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-emerald-50 text-emerald-700 font-bold">
              <h3 className="flex items-center gap-2 uppercase tracking-tighter">
                <Wallet size={18}/> Gestionar Billetera Virtual
              </h3>
              <button onClick={() => setIsCreditModalOpen(false)} className="text-emerald-400 hover:text-emerald-600">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleManageCredit} className="p-6">
              <div className="mb-6 text-center">
                <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Saldo a Favor Actual</p>
                <p className="text-4xl font-black text-emerald-600">${(selectedCustomer.saldoAFavor || 0).toFixed(2)}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Monto a Ajustar</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      className="w-full border-2 border-gray-100 rounded-lg py-3 pl-8 pr-4 text-lg font-bold text-gray-800 focus:outline-none focus:border-emerald-500 transition-all placeholder:text-gray-200"
                      placeholder="Ej: 5000 o -2000"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1 italic">Usa valores positivos para CARGAR saldo y negativos para RESTAR.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Motivo / Concepto</label>
                  <input 
                    type="text" 
                    required
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    className="w-full border-2 border-gray-100 rounded-lg py-2.5 px-3 text-sm font-semibold text-gray-700 focus:outline-none focus:border-emerald-500 transition-all"
                    placeholder="Ej: Devolución libro, Seña, Pago adelantado"
                  />
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsCreditModalOpen(false)}
                  className="flex-1 py-3 bg-gray-50 text-gray-500 font-bold rounded-lg text-xs transition-colors uppercase border border-gray-100"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isProcessingCredit || !creditAmount || !creditReason}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black rounded-lg text-xs transition-all uppercase shadow-lg shadow-emerald-100"
                >
                  {isProcessingCredit ? 'Procesando...' : 'Confirmar Ajuste'}
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

      {/* Hidden Print Layer for Receipts */}
      <div style={{ display: 'none' }}>
        <div ref={printReceiptRef} className="p-8 bg-white text-black w-80" style={{ fontFamily: 'monospace' }}>
          {reprintData && (
            <div className="flex flex-col items-center">
              <div className="text-center mb-6 border-b border-dashed border-gray-400 pb-4 w-full">
                <h1 className="text-lg font-bold uppercase tracking-widest text-[#1e3a8a]">TOLEDO</h1>
                <p className="text-[10px] font-semibold tracking-widest mt-0.5">LIBROS JURÍDICOS</p>
                <p className="mt-2 text-[10px] text-gray-500 uppercase tracking-[0.2em] font-black">Comprobante de Caja</p>
                <p className="text-[10px] text-gray-400 mt-1">{reprintData.date}</p>
              </div>

              <div className="w-full text-[11px] space-y-1.5 mb-5 border-l-2 border-[#1e3a8a] pl-3 py-1">
                <p><span className="font-bold text-gray-400 text-[9px] uppercase block leading-none mb-1">Cliente</span> {reprintData.customerName}</p>
                <p><span className="font-bold text-gray-400 text-[9px] uppercase block leading-none mb-1">Concepto</span> {reprintData.description}</p>
                <p><span className="font-bold text-gray-400 text-[9px] uppercase block leading-none mb-1">Medio</span> {reprintData.method?.toUpperCase()}</p>
              </div>

              <div className="w-full border-y border-gray-200 py-4 mb-4 text-center bg-gray-50 rounded-lg">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Monto Cobrado</p>
                <p className="text-3xl font-black text-navy-900">${reprintData.amount?.toFixed(2)}</p>
              </div>

              <div className="w-full text-center border-b border-dashed border-gray-300 pb-4 mb-6">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Saldo Resultante</p>
                <p className="text-lg font-black text-[#1e3a8a]">${Math.abs(reprintData.newBalance || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</p>
              </div>

              <p className="text-[8px] text-gray-400 font-bold italic text-center leading-tight uppercase tracking-tighter">
                Arturo M. Bas 50 · Córdoba · Argentina<br/>
                Cel: 351 322-1995<br/>
                Operador: {auth.currentUser?.email || 'Sistema'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
