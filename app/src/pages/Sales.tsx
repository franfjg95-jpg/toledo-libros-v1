import React, { useState, useEffect, useRef } from 'react';
import { Search, ShoppingCart, Plus, Minus, Trash2, Banknote, CreditCard, Smartphone, CheckCircle, Receipt, History, Printer, X, BookOpen, Truck, UserPlus, User, ChevronRight, Info, Wallet } from 'lucide-react';
import { collection, onSnapshot, doc, runTransaction, serverTimestamp, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useReactToPrint } from 'react-to-print';
import type { Book } from './Inventory';
import type { Customer } from './Customers';
import { AestheticAlert } from '../components/Alert';

interface CartItem {
  book: Book;
  quantity: number;
}

export const Sales: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pos' | 'history'>('pos');

  // --- ESTADO POS ---
  const [books, setBooks] = useState<Book[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState({ 
    isOpen: false, 
    message: '', 
    type: 'error' as 'error' | 'success' | 'info' | 'warning' | 'confirm',
    onConfirm: undefined as (() => void) | undefined
  });
  const [splitPayments, setSplitPayments] = useState<{[key: string]: number}>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  // Detalle de Venta - Stepper
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    firstName: '', lastName: '', dni: '', phone: '', email: '', customerType: 'Particular', limiteCredito: 0
  });
  
  // Financiación
  const [isFinanced, setIsFinanced] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState<number>(3);

  // Envíos
  const [requiresShipping, setRequiresShipping] = useState(false);
  const [shippingData, setShippingData] = useState({
    address: '', locality: '', province: '', cost: '0', method: 'Correo Argentino'
  });
  
  // Modal de Ticket
  const [completedSale, setCompletedSale] = useState<any>(null);
  const [isReprint, setIsReprint] = useState(false);
  
  // Returns (Notas de Crédito)
  const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
  const [returnSearch, setReturnSearch] = useState('');
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<{[key: string]: number}>({}); // { bookId: quantity }
  const [refundMethod, setRefundMethod] = useState<string>('Efectivo');
  const [useCreditAmount, setUseCreditAmount] = useState<number>(0);

  const printContentRef = useRef<HTMLDivElement>(null);
  
  // Imprimir usando react-to-print
  const handlePrint = useReactToPrint({
    contentRef: printContentRef,
    documentTitle: 'Ticket_Toledo_Libros',
  });

  // Reprimir Venta desde Historial
  const handleReprintSale = (sale: any) => {
    const receiptData = {
      customer: sale.customerName || 'Consumidor Final',
      items: (sale.items || []).map((it: any) => ({
        book: { 
          title: it.title || 'Obra Desconocida', 
          price: it.unitPrice || 0 
        },
        quantity: it.quantity || 0
      })),
      date: sale.saleDate && typeof sale.saleDate.toDate === 'function' 
        ? sale.saleDate.toDate().toLocaleString('es-AR') 
        : 'Registro Histórico',
      method: sale.paymentMethod || 'Efectivo',
      isShipping: sale.isShipping || false,
      shippingInfo: sale.shippingInfo || null,
      total: sale.totalAmount || 0,
      paymentBreakdown: sale.paymentBreakdown || null,
      numeroOperacion: sale.numeroOperacion || null
    };
    setIsReprint(true);
    setCompletedSale(receiptData);
  };
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState({ startDate: '', endDate: '', search: '' });

  const setPresetDate = (preset: 'hoy' | 'ayer' | 'mes') => {
    const today = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    
    if (preset === 'hoy') {
      const todayStr = toDateStr(today);
      setHistoryFilter(prev => ({ ...prev, startDate: todayStr, endDate: todayStr }));
    } else if (preset === 'ayer') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = toDateStr(yesterday);
      setHistoryFilter(prev => ({ ...prev, startDate: yStr, endDate: yStr }));
    } else if (preset === 'mes') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setHistoryFilter(prev => ({ ...prev, startDate: toDateStr(firstDay), endDate: toDateStr(lastDay) }));
    }
  };

  // Cargar Inventario
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'books'), (snapshot) => {
      const booksData: Book[] = [];
      snapshot.forEach((doc) => {
        booksData.push({ id: doc.id, ...doc.data() } as Book);
      });
      setBooks(booksData);
    });
    return () => unsubscribe();
  }, []);

  // Cargar Clientes
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const customersData: Customer[] = [];
      snapshot.forEach((doc) => {
        customersData.push({ id: doc.id, ...doc.data() } as Customer);
      });
      setCustomers(customersData);
    });
    return () => unsubscribe();
  }, []);

  // Cargar Historial de Ventas
  useEffect(() => {
    const q = query(collection(db, 'sales'), orderBy('saleDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sales: any[] = [];
      snapshot.forEach(doc => sales.push({ id: doc.id, ...doc.data() }));
      setSalesHistory(sales);
    });
    return () => unsubscribe();
  }, []);

  // --- LÓGICAS DEL PUNTO DE VENTA ---
  const filteredBooks = searchTerm.trim().length >= 1 
    ? books.filter(book => 
        (book.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
         book.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
         book.isbn.includes(searchTerm)) &&
        book.stock > 0
      )
    : [];

  const getCustomerDisplayName = (c: any) => {
    if (!c) return 'Consumidor Final';
    try {
      const f = typeof c.firstName === 'string' ? c.firstName.trim() : '';
      const l = typeof c.lastName === 'string' ? c.lastName.trim() : '';
      const full = typeof c.fullName === 'string' ? c.fullName.trim() : '';
      const name = `${f} ${l}`.trim();
      return name || full || 'Cliente Sin Nombre';
    } catch (e) {
      console.warn("Error rendering customer name", e);
      return 'Error en Datos';
    }
  };

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerId);

  const addToCart = (book: Book) => {
    setCart(prev => {
      const existing = prev.find(item => item.book.id === book.id);
      if (existing) {
        if (existing.quantity >= book.stock) return prev;
        return prev.map(item => item.book.id === book.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { book, quantity: 1 }];
    });
  };

  const updateQuantity = (bookId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.book.id === bookId) {
        const newQ = item.quantity + delta;
        if (newQ > 0 && newQ <= item.book.stock) return { ...item, quantity: newQ };
        return item;
      }
      return item;
    }));
  };

  const removeFromCart = (bookId: string) => {
    setCart(prev => prev.filter(item => item.book.id !== bookId));
  };

  const booksTotal = cart.reduce((acc, item) => acc + (Number(item.book.price || 0) * item.quantity), 0);
  const shippingCost = requiresShipping ? Number(shippingData.cost) || 0 : 0;
  const totalAmount = Number((booksTotal + shippingCost).toFixed(2));

  const totalPaid = Object.values(splitPayments).reduce((a, b) => a + b, 0);
  const totalWithCredit = totalPaid + useCreditAmount;
  const isPaymentComplete = Math.abs(totalWithCredit - totalAmount) < 0.01;

  const handlePaymentMethodToggle = (methodId: string) => {
    if (methodId === 'Tarjeta') {
      setSplitPayments({ 'Tarjeta': totalAmount });
      return;
    }

    const newPayments = { ...splitPayments };
    if (newPayments['Tarjeta']) {
      setSplitPayments({ [methodId]: totalAmount });
      return;
    }

    if (newPayments[methodId] !== undefined) {
      delete newPayments[methodId];
      setSplitPayments(newPayments); // Update state immediately after deletion
    } else {
      const alreadyPaid = Object.values(splitPayments).reduce((a, b) => a + b, 0);
      const remaining = Math.max(0, (totalAmount - useCreditAmount) - alreadyPaid);
      setSplitPayments({ 
        ...splitPayments, 
        [methodId]: remaining
      });
    }
  };

  const updatePartialAmount = (method: string, amount: number) => {
    setSplitPayments(prev => ({
      ...prev,
      [method]: amount
    }));
  };

  // Limite de Crédito Check (Super Hardened)
  const currentCreditLimit = Number(selectedCustomerObj?.limiteCredito) || 0;
  const aCuentaPart = Number(splitPayments['A Cuenta']) || 0;
  const currentBalance = Number(selectedCustomerObj?.balance) || 0;
  
  const isCreditExceeded = !!(
    selectedCustomerObj && 
    aCuentaPart > 0 && 
    currentCreditLimit > 0 && 
    (currentBalance + aCuentaPart) > currentCreditLimit
  );

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    let opNumber = '';

    try {
      await runTransaction(db, async (transaction) => {
        // --- 1. LECTURAS (READS) ---
        const bookSnaps = [];
        for (const item of cart) {
          const bookRef = doc(db, 'books', item.book.id!);
          const snap = await transaction.get(bookRef);
          if (!snap.exists()) {
            throw new Error(`El libro ${item.book.title} ya no existe en la BD.`);
          }
          bookSnaps.push({ ref: bookRef, snap, quantity: item.quantity });
        }
        
        let custRef = null;
        let custSnap = null;
        if (selectedCustomerId) {
          custRef = doc(db, 'customers', selectedCustomerId);
          custSnap = await transaction.get(custRef);
          if (!custSnap.exists()) {
            throw new Error("El cliente seleccionado ya no existe.");
          }
        }

        // --- 0. GENERAR NÚMERO DE OPERACIÓN (CORRELATIVO) ---
        const counterRef = doc(db, 'metadata', 'counters');
        const counterSnap = await transaction.get(counterRef);
        let currentCount = 0;
        if (counterSnap.exists()) {
          currentCount = counterSnap.data().sales_count || 0;
        }
        const nextCount = currentCount + 1;
        opNumber = `TOL-${nextCount.toString().padStart(6, '0')}`;
        transaction.set(counterRef, { sales_count: nextCount }, { merge: true });

        // --- 2. VALIDACIONES ---
        for (const bb of bookSnaps) {
          const currentStock = bb.snap.data().stock;
          if (currentStock < bb.quantity) {
            throw new Error(`Stock insuficiente para la obra. Disponible: ${currentStock}`);
          }
        }
        
        if (isCreditExceeded) {
          throw new Error(`Esta venta excede el límite de crédito del cliente ($${currentCreditLimit}).`);
        }

        // --- 3. ESCRITURAS (WRITES) ---
        // 3.1 Crear Venta
        const saleRef = doc(collection(db, 'sales'));
        const saleItems = cart.map(item => ({
          bookId: item.book.id,
          title: item.book.title,
          quantity: item.quantity,
          unitPrice: item.book.price,
          subtotal: item.book.price * item.quantity
        }));

        // Resumen de medios de pago para el historial
        const paymentSummary = Object.entries(splitPayments)
          .filter(([_, amt]) => amt > 0)
          .map(([method, amt]) => `${method}: $${amt.toFixed(0)}`)
          .join(' / ');

        // --- PREPARAR CUOTAS (Si aplica) ---
        let saleInstallments: any[] = [];
        let finalACuenta = splitPayments['A Cuenta'] || 0;
        if (isFinanced && finalACuenta > 0) {
          const quotaAmount = Number((finalACuenta / installmentsCount).toFixed(2));
          for (let i = 1; i <= installmentsCount; i++) {
            saleInstallments.push({
              number: i,
              amount: i === installmentsCount ? Number((finalACuenta - (quotaAmount * (installmentsCount - 1))).toFixed(2)) : quotaAmount,
              paidAmount: 0,
              status: 'Pendiente',
              dueDate: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000) // 30 días escalonados
            });
          }
        }

        const saleData = {
          totalAmount,
          booksTotal,
          paymentMethod: paymentSummary,
          paymentBreakdown: { 
            ...splitPayments, 
            ...(useCreditAmount > 0 ? { 'Saldo a Favor': useCreditAmount } : {}) 
          },
          status: splitPayments['A Cuenta'] ? 'pending_payment' : 'paid',
          items: saleItems,
          saleDate: serverTimestamp(),
          customerId: selectedCustomerObj ? selectedCustomerObj.id : null,
          customerName: getCustomerDisplayName(selectedCustomerObj),
          isShipping: requiresShipping,
          isFinanced,
          installments: saleInstallments.length > 0 ? saleInstallments : null,
          numeroOperacion: opNumber
        };

        transaction.set(saleRef, saleData);

        // 3.2 Guardar el saleRef.id para crear 'shipment' luego de la transaccion
        if (requiresShipping) {
          Object.assign(saleRef, { _pendingShipSaleId: saleRef.id });
        }

        // 3.2 Actualizar Stock
        for (const bb of bookSnaps) {
          const newStock = bb.snap.data().stock - bb.quantity;
          transaction.update(bb.ref, { stock: newStock });
        }

        // 3.3 Actualizar Saldo de Cliente si hay parte "A Cuenta"
        finalACuenta = splitPayments['A Cuenta'] || 0;
        if (custRef && custSnap && finalACuenta > 0) {
          const custData = custSnap.data();
          const currentBalance = custData.balance || 0;
          
          const updates: any = { 
            balance: currentBalance + finalACuenta,
            lastMovementDate: serverTimestamp()
          };

          // Iniciar antigüedad de deuda si no la tenía
          if (currentBalance <= 0) {
            updates.oldestDebtDate = serverTimestamp();
          }

          transaction.update(custRef, updates);
        }

        // 3.4 DESCONTAR SALDO A FAVOR (Si aplica)
        if (useCreditAmount > 0 && custRef && custSnap) {
          const currentCredit = custSnap.data()?.saldoAFavor || 0;
          const newCredit = currentCredit - useCreditAmount;
          
          if (newCredit < 0) throw new Error("Saldo a favor insuficiente.");

          const creditMovement = {
            date: new Date(),
            amount: -useCreditAmount,
            reason: `Pago Venta N° ${opNumber}`,
            previousBalance: currentCredit,
            newBalance: newCredit,
            type: 'USO'
          };
          
          const existingHistory = custSnap.data()?.historialCredito || [];
          transaction.update(custRef, {
            saldoAFavor: newCredit,
            historialCredito: [creditMovement, ...existingHistory].slice(0, 50)
          });
        }
      });

      // POST-TRANSACTION: Si hay envío, crear documento separado en 'shipments'
      if (requiresShipping) {
        await addDoc(collection(db, 'shipments'), {
          customerName: getCustomerDisplayName(selectedCustomerObj),
          customerId: selectedCustomerObj ? selectedCustomerObj.id : null,
          items: cart.map(item => ({ title: item.book.title, quantity: item.quantity })),
          address: shippingData.address,
          locality: shippingData.locality,
          province: shippingData.province,
          method: shippingData.method,
          cost: shippingCost,
          status: 'Pendiente de Empaque',
          tracking: '',
          shippingDate: serverTimestamp(),
          totalOrderAmount: totalAmount,
        });
      }

      // Éxito: Guardar datos estáticos para el ticket impreso
      const receiptData = {
        customer: selectedCustomerId ? getCustomerDisplayName(selectedCustomerObj) : 'Consumidor Final',
        items: [...cart],
        total: totalAmount,
        method: Object.keys(splitPayments).join(', '),
        date: new Date().toLocaleString('es-AR'),
        isShipping: requiresShipping,
        shippingInfo: requiresShipping ? shippingData : null,
        isFinanced,
        installmentsCount,
        numeroOperacion: opNumber
      };

      setCompletedSale(receiptData);
      setCart([]);
      setSelectedCustomerId('');
      setSplitPayments({});
      setUseCreditAmount(0);
      setRequiresShipping(false);
      setShippingData({ address: '', locality: '', province: '', cost: '0', method: 'Correo Argentino' });
      
    } catch (error: any) {
      setAlertConfig({ isOpen: true, message: `La transacción falló: ${error.message}`, type: 'error', onConfirm: undefined });
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };


  const handleSaveNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.firstName || !customerForm.lastName || !customerForm.dni || !customerForm.phone) {
      setAlertConfig({ isOpen: true, message: "Completar campos obligatorios.", type: 'warning', onConfirm: undefined }); 
      return;
    }
    setIsProcessing(true);
    try {
      const fullName = `${customerForm.firstName} ${customerForm.lastName}`;
      const docRef = await addDoc(collection(db, 'customers'), {
        ...customerForm,
        fullName,
        balance: 0,
        createdAt: serverTimestamp()
      });
      setSelectedCustomerId(docRef.id);
      setIsCustomerModalOpen(false);
      setCustomerForm({ firstName: '', lastName: '', dni: '', phone: '', email: '', customerType: 'Particular', limiteCredito: 0 });
      setCurrentStep(2);
    } catch (e) {
      console.error(e);
      setAlertConfig({ isOpen: true, message: "Error al crear cliente.", type: 'error', onConfirm: undefined });
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredCustomers = customerSearch.trim() 
    ? customers.filter(c => 
        c.fullName.toLowerCase().includes(customerSearch.toLowerCase()) || 
        c.dni.includes(customerSearch)
      )
    : [];

  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    setCurrentStep(2);
  };

  // --- LÓGICAS DE HISTORIAL ---
  const filteredHistory = salesHistory.filter(sale => {
    if (!sale.saleDate) return true; // Mantener recientes temporales

    // 1. Filtro por Búsqueda (Cliente, Libro o ISBN)
    if (historyFilter.search) {
      const q = historyFilter.search.toLowerCase();
      const matchCustomer = sale.customerName?.toLowerCase().includes(q);
      
      const matchBook = Array.isArray(sale.items) ? sale.items.some((item: any) => {
        if (!item) return false;
        const titleMatch = String(item.title || '').toLowerCase().includes(q);
        const bookObj = books.find(b => b.id === item.bookId);
         const isbnMatch = String(bookObj?.isbn || '').toLowerCase().includes(q);
        const matchOp = String(sale.numeroOperacion || '').toLowerCase().includes(q);
        return titleMatch || isbnMatch || matchOp;
      }) : false;

      const matchOpDirect = String(sale.numeroOperacion || '').toLowerCase().includes(q);

      if (!matchCustomer && !matchBook && !matchOpDirect) return false;
    }

    // 2. Filtro por Fechas
    // Harden: Ensure saleDate exists and has toDate()
    if (!sale.saleDate || typeof sale.saleDate.toDate !== 'function') return true;
    
    const saleD = sale.saleDate && typeof sale.saleDate.toDate === 'function' 
      ? sale.saleDate.toDate() 
      : new Date();
    
    if (historyFilter.startDate) {
      try {
        const startD = new Date(historyFilter.startDate + 'T00:00:00');
        if (saleD < startD) return false;
      } catch (e) { console.error("Error parsing start date", e); }
    }
    
    if (historyFilter.endDate) {
      try {
        const endD = new Date(historyFilter.endDate + 'T23:59:59');
        if (saleD > endD) return false;
      } catch (e) { console.error("Error parsing end date", e); }
    }

    return true;
  });

  const handleDeleteSale = (sale: any) => {
    setAlertConfig({
      isOpen: true,
      type: 'confirm',
      message: `¿Desea eliminar esta operación de prueba?\nCliente: ${sale.customerName}\nTotal: $${sale.totalAmount.toFixed(2)}`,
      onConfirm: () => executeDeleteSale(sale)
    });
  };

  const executeDeleteSale = async (sale: any) => {
    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        // --- 1. LECTURAS (READS) ---
        const saleRef = doc(db, 'sales', sale.id);
        const saleSnap = await transaction.get(saleRef);
        if (!saleSnap.exists()) throw new Error("La venta no existe.");
        const saleData = saleSnap.data();

        // Leer todos los libros involucrados
        const bookSnaps: { ref: any, snap: any, quantity: number }[] = [];
        if (saleData.items && Array.isArray(saleData.items)) {
          for (const item of saleData.items) {
            if (item.bookId) {
              const bRef = doc(db, 'books', item.bookId);
              const bSnap = await transaction.get(bRef);
              bookSnaps.push({ ref: bRef, snap: bSnap, quantity: Number(item.quantity || 0) });
            }
          }
        }

        // Leer cliente si es A Cuenta
        let custRef = null;
        let custSnap = null;
        const pMethod = String(saleData.paymentMethod || '');
        if (pMethod.includes('A Cuenta') && saleData.customerId) {
          custRef = doc(db, 'customers', saleData.customerId);
          custSnap = await transaction.get(custRef);
        }

        // --- 2. ESCRITURAS (WRITES) ---
        // Actualizar Stock
        for (const bs of bookSnaps) {
          if (bs.snap.exists()) {
            const currentStock = bs.snap.data().stock || 0;
            transaction.update(bs.ref, { stock: currentStock + bs.quantity });
          }
        }

        // Actualizar Saldo de Cliente
        if (custRef && custSnap && custSnap.exists()) {
          const currentBalance = Number(custSnap.data().balance || 0);
          const amountToRestore = Number(saleData.paymentBreakdown?.['A Cuenta'] || saleData.totalAmount || 0);
          transaction.update(custRef, { balance: Math.max(0, currentBalance - amountToRestore) });
        }

        // Eliminar Venta
        transaction.delete(saleRef);
      });
      window.location.reload();
    } catch (error: any) {
      console.error("Error al eliminar operación:", error);
      setAlertConfig({ isOpen: true, message: `Error: No se pudo eliminar la operación. Motivo: ${error.message || 'Firestore Sequence Error'}`, type: 'error', onConfirm: undefined });
    } finally {
      setIsProcessing(false);
    }
  };

  // --- LÓGICAS DE DEVOLUCIONES ---
  const handleProcessReturn = async () => {
    if (!selectedSaleForReturn) return;
    
    // Validar que hay algo para devolver
    const hasItemsToReturn = Object.values(returnItems).some(q => q > 0);
    if (!hasItemsToReturn) {
      setAlertConfig({ isOpen: true, message: "Debe seleccionar al menos un ítem para devolver.", type: 'warning', onConfirm: undefined });
      return;
    }

    setIsProcessing(true);
    let opNumber = '';
    try {
      await runTransaction(db, async (transaction) => {
        // 1. LECTURAS
        const saleRef = doc(db, 'sales', selectedSaleForReturn.id);
        const saleSnap = await transaction.get(saleRef);
        if (!saleSnap.exists()) throw new Error("La venta original ya no existe.");
        const saleData = saleSnap.data();

        // 1.1 Leer Cliente
        let custRef = null;
        let custSnap = null;
        if (saleData.customerId || refundMethod === 'Saldo a Favor') {
          if (saleData.customerId) {
            custRef = doc(db, 'customers', saleData.customerId);
            custSnap = await transaction.get(custRef);
          }
        }

        // 1.2 Leer Libros
        const bookRefs: any[] = [];
        for (const bookId in returnItems) {
          if (returnItems[bookId] > 0) {
            const bRef = doc(db, 'books', bookId);
            const bSnap = await transaction.get(bRef);
            bookRefs.push({ ref: bRef, snap: bSnap, quantity: returnItems[bookId] });
          }
        }

        // 1.3 Leer Contador de Operaciones
        const counterRef = doc(db, 'metadata', 'counters');
        const counterSnap = await transaction.get(counterRef);
        let currentCount = 0;
        if (counterSnap.exists()) {
          currentCount = counterSnap.data().sales_count || 0;
        }

        // 2. GENERAR NÚMERO DE OPERACIÓN (WRITE)
        const nextCount = currentCount + 1;
        opNumber = `TOL-${nextCount.toString().padStart(6, '0')}`;
        transaction.set(counterRef, { sales_count: nextCount }, { merge: true });

        // 2. VALIDACIONES
        // (La UI ya debería limitar, pero re-validamos)
        for (const br of bookRefs) {
          const originalItem = saleData.items.find((it: any) => it.bookId === br.ref.id);
          const alreadyReturned = originalItem.returnedQuantity || 0;
          if (br.quantity > (originalItem.quantity - alreadyReturned)) {
            throw new Error(`No se puede devolver más de lo comprado para: ${originalItem.title}`);
          }
        }

        // 3. ESCRITURAS
        let refundTotal = 0;
        const updatedSaleItems = [...saleData.items];
        const returnOpItems = [];

        for (const br of bookRefs) {
          const itemIdx = updatedSaleItems.findIndex((it: any) => it.bookId === br.ref.id);
          const item = updatedSaleItems[itemIdx];
          
          updatedSaleItems[itemIdx] = {
            ...item,
            returnedQuantity: (item.returnedQuantity || 0) + br.quantity
          };

          const unitPrice = item.unitPrice || 0;
          refundTotal += unitPrice * br.quantity;

          returnOpItems.push({
            bookId: br.ref.id,
            title: item.title,
            quantity: br.quantity,
            unitPrice: unitPrice,
            subtotal: unitPrice * br.quantity
          });

          // Incrementar stock
          transaction.update(br.ref, { stock: (br.snap.data().stock || 0) + br.quantity });
        }

        // Actualizar venta original (marcar devoluciones)
        transaction.update(saleRef, { items: updatedSaleItems });

        // Actualizar Saldo de Cliente (si aplica)
        if (custRef && custSnap && custSnap.exists()) {
          if (refundMethod === 'Saldo a Favor') {
            const currentCredit = custSnap.data().saldoAFavor || 0;
            const newCredit = currentCredit + refundTotal;
            
            const historyItem = {
              date: new Date(),
              amount: refundTotal,
              reason: `Devolución Venta N° ${selectedSaleForReturn.numeroOperacion || 'S/N'}`,
              previousBalance: currentCredit,
              newBalance: newCredit,
              type: 'CARGA'
            };
            
            const existingHistory = custSnap.data().historialCredito || [];
            transaction.update(custRef, {
              saldoAFavor: newCredit,
              historialCredito: [historyItem, ...existingHistory].slice(0, 50)
            });
          } else if (refundMethod === 'Solo Devolución') {
            const currentBalance = custSnap.data().balance || 0;
            transaction.update(custRef, { balance: Math.max(0, currentBalance - refundTotal) });
          }
        }

        // Crear Operación de Devolución (Nota de Crédito) en el historial de ventas
        const returnOpRef = doc(collection(db, 'sales'));
        transaction.set(returnOpRef, {
          type: 'credit_note',
          totalAmount: -refundTotal, // Negativo para indicar salida/crédito
          booksTotal: -refundTotal,
          paymentMethod: refundMethod === 'Saldo a Favor' ? 'Crédito en Cuenta' : 
                         refundMethod === 'Solo Devolución' ? 'Reducción de Deuda' : `Reintegro: ${refundMethod}`,
          saleDate: serverTimestamp(),
          customerId: saleData.customerId || null,
          customerName: saleData.customerName || 'Consumidor Final',
          items: returnOpItems,
           originalSaleId: selectedSaleForReturn.id,
          status: 'returned',
          numeroOperacion: opNumber
        });
      });

      setAlertConfig({ isOpen: true, message: "Devolución procesada con éxito. El inventario y saldos han sido actualizados.", type: 'success', onConfirm: undefined });
      setIsReturnsModalOpen(false);
      setSelectedSaleForReturn(null);
      setReturnItems({});
      
      // Forzamos recarga para ver el historial actualizado (opcional, onSnapshot debería bastar pero recargar limpia estados)
      setTimeout(() => window.location.reload(), 1500);

    } catch (error: any) {
      console.error(error);
      setAlertConfig({ isOpen: true, message: `Error al procesar devolución: ${error.message}`, type: 'error', onConfirm: undefined });
    } finally {
      setIsProcessing(false);
    }
  };

  const salesToReturnOptions = returnSearch.trim() 
    ? salesHistory.filter(s => 
        s.id.toLowerCase().includes(returnSearch.toLowerCase()) || 
      s.customerName.toLowerCase().includes(returnSearch.toLowerCase()) ||
      String(s.numeroOperacion || '').toLowerCase().includes(returnSearch.toLowerCase())
    ).slice(0, 5)
    : [];

  return (
    <div className="h-full flex flex-col relative">
      
      {/* TABS HEADER */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('pos')}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'pos' ? 'border-navy-600 text-navy-800 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-lg'}`}
        >
          <ShoppingCart size={18} /> Punto de Venta
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'history' ? 'border-navy-600 text-navy-800 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-lg'}`}
        >
          <History size={18} /> Historial de Operaciones
        </button>
        <button 
          onClick={() => setIsReturnsModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 font-black text-rose-600 text-sm transition-all hover:bg-rose-50 rounded-t-lg bg-white border-b-2 border-transparent"
        >
          <X size={18} className="rotate-45" /> DEVOLUCIONES
        </button>
      </div>

      {activeTab === 'pos' && (
        <div className="flex gap-6 flex-1 min-h-0">
          {/* LADO IZQUIERDO: CATÁLOGO */}
          <div className="w-2/3 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="text" 
                  placeholder="Escriba Título, Autor o ISBN para buscar..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setSearchTerm('')}
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent text-sm bg-white shadow-sm"
                  autoFocus
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-navy-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBooks.map(book => (
                  <div key={book.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow flex flex-col justify-between group">
                    <div className="flex gap-3 mb-2">
                      {book.imageUrl ? (
                         <img src={book.imageUrl} alt={book.title} className="w-12 h-16 object-cover rounded shadow-sm border border-gray-100 flex-shrink-0" />
                      ) : (
                         <div className="w-12 h-16 bg-gray-50 rounded border border-gray-100 flex items-center justify-center text-gray-300 flex-shrink-0">
                            <BookOpen size={16} />
                         </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 group-hover:text-navy-700 line-clamp-1 leading-tight text-sm">{book.title}</h3>
                        <p className="text-[10px] text-gray-500 mb-1 truncate">{book.author}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="font-bold text-navy-800 text-base">${book.price.toFixed(2)}</span>
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Stock: {book.stock}</span>
                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => addToCart(book)}
                      disabled={cart.find(i => i.book.id === book.id)?.quantity === book.stock}
                      className="w-full bg-navy-800 hover:bg-navy-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white py-1.5 rounded flex items-center justify-center gap-1 text-xs font-bold transition-colors mt-1"
                    >
                      <Plus size={14} /> Seleccionar
                    </button>
                  </div>
                ))}
                {searchTerm.trim().length > 0 && filteredBooks.length === 0 && (
                  <div className="col-span-full py-12 text-center text-gray-500">
                    <p>No se encontraron obras con stock.</p>
                  </div>
                )}
                {searchTerm.trim().length === 0 && (
                  <div className="col-span-full py-20 text-center text-gray-400">
                    <Search size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="text-lg font-medium">Buscador de Obras</p>
                    <p className="text-sm">Escriba para empezar a filtrar el catálogo...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* LADO DERECHO: CARRITO Y CHECKOUT (STEPPER) */}
          <div className="w-1/3 flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {/* STEPPER HEADER */}
            <div className="flex border-b border-gray-200">
              {[1, 2, 3].map((step) => (
                <button
                  key={step}
                  disabled={
                    (step === 2 && !selectedCustomerId && selectedCustomerId !== '') || 
                    (step === 3 && cart.length === 0)
                  }
                  onClick={() => setCurrentStep(step as 1 | 2 | 3)}
                  className={`flex-1 py-3 text-center transition-all relative ${
                    currentStep === step ? 'bg-navy-50 text-navy-900 font-bold' : 'bg-white text-gray-400'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center gap-1">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      currentStep === step ? 'bg-navy-900 text-white' : 'bg-gray-200 text-gray-500'
                    }`}>
                      {step}
                    </span>
                    <span className="text-[9px] uppercase tracking-tighter">
                      {step === 1 ? 'Cliente' : step === 2 ? 'Pedido' : 'Pago'}
                    </span>
                  </div>
                  {currentStep === step && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-navy-900"></div>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
              {/* STEP 1: DATOS DEL CLIENTE */}
              {currentStep === 1 && (
                <div className="p-4 space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-navy-900 uppercase">Identificar Cliente</h3>
                      <button 
                        onClick={() => { setSelectedCustomerId(''); setCurrentStep(2); }}
                        className="text-[10px] font-bold text-gray-400 hover:text-navy-600 uppercase border border-gray-200 px-2 py-1 rounded bg-white transition-colors"
                      >
                        Consumidor Final
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input 
                        type="text" 
                        placeholder="Buscar por Nombre o DNI..." 
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-600 outline-none"
                      />
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {filteredCustomers.map(c => (
                        <button 
                          key={c.id} 
                          onClick={() => handleSelectCustomer(c.id!)}
                          className="w-full text-left p-3 bg-white border border-gray-200 rounded-lg hover:border-navy-600 transition-all group"
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-xs font-bold text-gray-900 group-hover:text-navy-700">{getCustomerDisplayName(c)}</p>
                              <p className="text-[10px] text-gray-500">DNI: {c.dni}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-[10px] font-bold ${c.balance > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                ${c.balance.toFixed(2)}
                              </p>
                              <ChevronRight size={14} className="ml-auto text-gray-300 group-hover:text-navy-400" />
                            </div>
                          </div>
                        </button>
                      ))}
                      {customerSearch && filteredCustomers.length === 0 && (
                        <p className="text-center py-4 text-xs text-gray-400">No se encontraron clientes.</p>
                      )}
                    </div>

                    <button 
                      onClick={() => setIsCustomerModalOpen(true)}
                      className="w-full py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-navy-600 hover:text-navy-600 transition-all flex items-center justify-center gap-2 text-xs font-bold"
                    >
                      <UserPlus size={16} /> Nuevo Cliente
                    </button>
                  </div>

                  {selectedCustomerObj && (
                    <div className="p-4 bg-navy-900 text-white rounded-xl shadow-lg animate-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                          <User size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Cliente Seleccionado</p>
                          <h4 className="font-bold text-lg leading-none">{getCustomerDisplayName(selectedCustomerObj)}</h4>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/10">
                        <div className="bg-white/5 p-2 rounded-lg">
                          <p className="text-[8px] uppercase text-white/40 font-black">Documento</p>
                          <p className="text-sm font-bold">{selectedCustomerObj.dni}</p>
                        </div>
                        <div className="bg-white/5 p-2 rounded-lg">
                          <p className="text-[8px] uppercase text-white/40 font-black">Saldo Actual</p>
                          <p className={`text-sm font-bold ${selectedCustomerObj.balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            ${selectedCustomerObj.balance.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setCurrentStep(2)}
                        className="w-full mt-4 bg-white text-navy-900 font-bold py-2 rounded-lg flex items-center justify-center gap-2 text-sm hover:bg-white/90 transition-colors shadow-xl"
                      >
                        Continuar al Pedido <ChevronRight size={18} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: OBRAS Y CANTIDADES */}
              {currentStep === 2 && (
                <div className="flex-1 flex flex-col p-4 space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-navy-900 uppercase">Detalle del Pedido</h3>
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full uppercase">
                        {cart.length} items
                      </span>
                    </div>

                    {/* Buscador de Obras Integrado */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input 
                        type="text" 
                        placeholder="Buscar libros para agregar..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-navy-600 outline-none bg-white shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px]">
                    {cart.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10">
                        <ShoppingCart size={40} className="mb-2 opacity-20" />
                        <p className="text-xs uppercase font-bold tracking-widest text-center px-4">Agregue libros del catálogo de la izquierda</p>
                      </div>
                    ) : (
                      cart.map(item => (
                        <div key={item.book.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm group hover:shadow-md transition-all">
                          <div className="flex justify-between items-start gap-2">
                             <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-xs text-navy-900 truncate">{item.book.title}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] font-medium text-gray-400">${item.book.price.toFixed(2)} c/u</span>
                                </div>
                             </div>
                             <button onClick={() => removeFromCart(item.book.id!)} className="text-gray-300 hover:text-rose-500 transition-colors">
                               <Trash2 size={16} />
                             </button>
                          </div>
                          
                          <div className="flex items-center justify-between mt-3 border-t border-gray-50 pt-3">
                            <div className="flex items-center bg-gray-100 rounded-lg p-1">
                               <button onClick={() => updateQuantity(item.book.id!, -1)} className="p-1 hover:bg-white rounded shadow-sm text-navy-900 transition-all"><Minus size={14}/></button>
                               <span className="w-8 text-center text-xs font-black text-navy-900">{item.quantity}</span>
                               <button onClick={() => updateQuantity(item.book.id!, 1)} className="p-1 hover:bg-white rounded shadow-sm text-navy-900 transition-all"><Plus size={14}/></button>
                            </div>
                            <span className="font-black text-navy-900 text-sm tracking-tight">${(item.book.price * item.quantity).toFixed(2)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {cart.length > 0 && (
                    <div className="pt-4 border-t border-gray-200 space-y-3">
                      <div className="flex justify-between items-center text-navy-900">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Subtotal</span>
                        <span className="text-xl font-black">${booksTotal.toFixed(2)}</span>
                      </div>
                      <button 
                        onClick={() => setCurrentStep(3)}
                        className="w-full bg-navy-900 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-navy-800 transition-all shadow-lg"
                      >
                        Ir al Pago <CreditCard size={18} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: PAGO Y CIERRE */}
              {currentStep === 3 && (
                <div className="p-4 space-y-5 animate-in fade-in slide-in-from-right-2 duration-300 flex flex-col h-full">
                  <div className="bg-navy-900 text-white p-6 rounded-2xl shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-1">Total Operación</p>
                        <h2 className="text-3xl font-black leading-none">${totalAmount.toFixed(2)}</h2>
                      </div>
                      {useCreditAmount > 0 && (
                        <div className="text-right">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 mb-1">Crédito Aplicado</p>
                          <h2 className="text-2xl font-black leading-none">-${useCreditAmount.toFixed(2)}</h2>
                        </div>
                      )}
                    </div>
                    {useCreditAmount > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Restante a Pagar</p>
                        <h2 className="text-4xl font-black leading-none text-emerald-400">
                          ${(totalAmount - useCreditAmount).toFixed(2)}
                        </h2>
                      </div>
                    )}
                  </div>

                  {/* BILLETERA VIRTUAL (Saldo a Favor) */}
                  {selectedCustomerObj && (selectedCustomerObj.saldoAFavor || 0) > 0 && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                           <div className="p-2 bg-emerald-600 text-white rounded-lg"><Wallet size={16} /></div>
                           <div>
                             <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Billetera Virtual</p>
                             <p className="text-sm font-black text-emerald-900">${selectedCustomerObj.saldoAFavor!.toFixed(2)} DISPONIBLE</p>
                           </div>
                        </div>
                        <button 
                          onClick={() => {
                            if (useCreditAmount > 0) {
                              setUseCreditAmount(0);
                              setSplitPayments({}); // Limpiar para re-seleccionar
                            } else {
                              const canUse = Math.min(selectedCustomerObj.saldoAFavor!, totalAmount);
                              setUseCreditAmount(canUse);
                              if (canUse === totalAmount) {
                                setSplitPayments({}); // Pago cubierto totalmente
                              }
                            }
                          }}
                          className={`px-4 py-2 rounded-lg text-xs font-black transition-all shadow-sm flex items-center gap-2 ${
                            useCreditAmount > 0 
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                              : 'bg-white text-emerald-600 hover:bg-emerald-50 border border-emerald-100'
                          }`}
                        >
                          {useCreditAmount > 0 ? <CheckCircle size={14}/> : <Plus size={14}/>}
                          {useCreditAmount > 0 ? 'USANDO CRÉDITO' : 'USAR SALDO'}
                        </button>
                      </div>
                      
                      {useCreditAmount > 0 && (
                        <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700 bg-white/50 p-2 rounded-lg border border-emerald-100/50">
                          <span>Monto Aplicado:</span>
                          <span className="text-sm font-black text-emerald-900">-${useCreditAmount.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Métodos de Pago</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'Efectivo', icon: Banknote },
                          { id: 'Transferencia', icon: Smartphone },
                          { id: 'Mercado Pago', icon: Smartphone },
                          { id: 'A Cuenta', icon: Receipt },
                          { id: 'Tarjeta', icon: CreditCard },
                        ].map(method => (
                          <button
                            key={method.id}
                            disabled={method.id === 'A Cuenta' && !selectedCustomerId}
                            onClick={() => handlePaymentMethodToggle(method.id)}
                            className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                              splitPayments[method.id] !== undefined
                                ? 'border-navy-900 bg-white text-navy-900 shadow-md ring-4 ring-navy-50' 
                                : 'border-gray-200 bg-white text-gray-400 hover:border-navy-200 disabled:opacity-30'
                            }`}
                          >
                            <method.icon size={20} />
                            <span className="text-[10px] font-bold uppercase tracking-tight">{method.id}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {Object.entries(splitPayments).map(([method, amount]) => (
                        <div key={method} className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-100 shadow-sm animate-in slide-in-from-left-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center text-navy-900">
                               {method === 'Efectivo' ? <Banknote size={16}/> : method === 'Tarjeta' ? <CreditCard size={16}/> : <Smartphone size={16}/>}
                            </div>
                            <span className="text-[10px] font-black text-gray-700 uppercase tracking-tighter">{method}</span>
                          </div>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">$</span>
                            <input 
                              type="number"
                              value={amount || ''}
                              onChange={(e) => updatePartialAmount(method, Number(e.target.value))}
                              disabled={method === 'Tarjeta'}
                              className="w-28 text-right pr-3 py-2 border-2 border-gray-100 rounded-lg text-sm font-black text-navy-900 focus:border-navy-600 outline-none transition-all"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {splitPayments['A Cuenta'] !== undefined && (
                      <div className="p-4 bg-navy-50 rounded-xl space-y-3 animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              id="financeToggle"
                              checked={isFinanced}
                              onChange={(e) => setIsFinanced(e.target.checked)}
                              className="w-4 h-4 rounded border-navy-300 text-navy-600 focus:ring-navy-600"
                            />
                            <label htmlFor="financeToggle" className="text-[10px] font-black text-navy-900 uppercase tracking-widest cursor-pointer">
                              Financiar en Cuotas
                            </label>
                          </div>
                          {isFinanced && (
                            <span className="text-[10px] font-bold text-navy-500 bg-white px-2 py-0.5 rounded-full border border-navy-100">
                              {installmentsCount} {installmentsCount === 1 ? 'cuota' : 'cuotas'}
                            </span>
                          )}
                        </div>

                        {isFinanced && (
                          <div className="space-y-3 pt-2 border-t border-navy-100">
                             <div>
                               <div className="flex justify-between items-center mb-1">
                                 <label className="text-[9px] font-black text-navy-400 uppercase tracking-widest">Cantidad (Máx 6)</label>
                                 <span className="text-[9px] font-bold text-navy-400 italic">Hasta 6 cuotas</span>
                               </div>
                               <input 
                                 type="number" 
                                 min="1" 
                                 max="6" 
                                 value={installmentsCount}
                                 onChange={(e) => {
                                   let val = parseInt(e.target.value);
                                   if (val > 6) val = 6;
                                   if (val < 1) val = 1;
                                   setInstallmentsCount(val);
                                 }}
                                 className="w-full p-2 bg-white border border-navy-200 rounded-lg text-sm font-bold text-navy-900 focus:ring-2 focus:ring-navy-600 outline-none"
                               />
                             </div>
                             <div className="p-2 bg-white/50 rounded-lg flex justify-between items-center border border-navy-100 border-dashed">
                               <span className="text-[9px] font-bold text-navy-400 uppercase">Valor Cuota</span>
                               <span className="text-xs font-black text-navy-900">${((splitPayments['A Cuenta'] || 0) / installmentsCount).toFixed(2)}</span>
                             </div>
                          </div>
                        )}
                      </div>
                    )}

                    {Object.keys(splitPayments).length > 0 && (
                      <div className="p-4 bg-gray-100 rounded-xl space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Ingresado</span>
                          <span className="text-sm font-black text-navy-900">${totalPaid.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Faltante</span>
                          <span className={`text-sm font-black ${isPaymentComplete ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {isPaymentComplete ? 'TOTAL COMPLETADO' : `$${(totalAmount - totalPaid).toFixed(2)}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-4 border-t border-gray-200">
                    <button 
                      onClick={handleCheckout}
                      disabled={cart.length === 0 || isProcessing || !isPaymentComplete || (splitPayments['A Cuenta'] !== undefined && (!selectedCustomerId || !!isCreditExceeded))}
                      className="w-full bg-navy-900 hover:bg-navy-800 text-white font-black py-4 rounded-2xl shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
                    >
                      {isProcessing ? (
                        <>Procesando...</>
                      ) : (
                        <>
                          <CheckCircle size={20} /> Finalizar Venta
                        </>
                      )}
                    </button>
                    
                    {requiresShipping && (
                      <div className="mt-3 flex items-center justify-center gap-2 text-blue-600 bg-blue-50 py-2 rounded-lg">
                        <Truck size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Envío Programado: ${shippingCost}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

      {/* MODAL NUEVO CLIENTE */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-navy-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-navy-900 text-white flex justify-between items-center">
               <div>
                  <h3 className="text-lg font-bold">Nuevo Cliente</h3>
                  <p className="text-[10px] text-white/50 uppercase tracking-widest leading-none mt-1">Alta de usuario en sistema</p>
               </div>
               <button onClick={() => setIsCustomerModalOpen(false)} className="text-white/50 hover:text-white transition-colors">
                 <X size={24} />
               </button>
            </div>
            
            <form onSubmit={handleSaveNewCustomer} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Nombre *</label>
                  <input required value={customerForm.firstName} onChange={e => setCustomerForm({...customerForm, firstName: e.target.value})} className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-navy-900 outline-none font-bold text-sm bg-gray-50/50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Apellido *</label>
                  <input required value={customerForm.lastName} onChange={e => setCustomerForm({...customerForm, lastName: e.target.value})} className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-navy-900 outline-none font-bold text-sm bg-gray-50/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">DNI *</label>
                  <input required value={customerForm.dni} onChange={e => setCustomerForm({...customerForm, dni: e.target.value})} className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-navy-900 outline-none font-bold text-sm bg-gray-50/50" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Teléfono *</label>
                  <input required value={customerForm.phone} onChange={e => setCustomerForm({...customerForm, phone: e.target.value})} className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-navy-900 outline-none font-bold text-sm bg-gray-50/50" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Tipo de Cliente</label>
                <select value={customerForm.customerType} onChange={e => setCustomerForm({...customerForm, customerType: e.target.value})} className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-navy-900 outline-none font-bold text-sm bg-gray-50/50">
                  <option value="Abogado">Abogado</option>
                  <option value="Estudiante">Estudiante</option>
                  <option value="Particular">Particular</option>
                </select>
              </div>

              <button disabled={isProcessing} className="w-full py-4 bg-navy-900 text-white rounded-xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-navy-800 transition-all disabled:opacity-50 mt-4">
                {isProcessing ? 'Guardando...' : 'Registrar y Seleccionar'}
              </button>
            </form>
          </div>
        </div>
      )}
        </div>
      )}

      {/* TABS VIEW: HISTORIAL */}
      {activeTab === 'history' && (
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px] relative">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Buscar (Cliente, Libro o ISBN)</label>
              <Search className="absolute left-3 top-8 -translate-y-1 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Introduzca término..." 
                value={historyFilter.search}
                onChange={(e) => setHistoryFilter({...historyFilter, search: e.target.value})}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-navy-500 focus:border-navy-500 text-sm"
              />
            </div>
            
            <div className="flex gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Desde</label>
                <input 
                  type="date" 
                  value={historyFilter.startDate}
                  onChange={(e) => setHistoryFilter({...historyFilter, startDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-navy-500 focus:border-navy-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Hasta</label>
                <input 
                  type="date" 
                  value={historyFilter.endDate}
                  onChange={(e) => setHistoryFilter({...historyFilter, endDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-navy-500 focus:border-navy-500 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2 mb-0.5">
              <button onClick={() => setPresetDate('hoy')} className="px-3 py-1.5 text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 rounded-md hover:bg-navy-100 transition-colors">Hoy</button>
              <button onClick={() => setPresetDate('ayer')} className="px-3 py-1.5 text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 rounded-md hover:bg-navy-100 transition-colors">Ayer</button>
              <button onClick={() => setPresetDate('mes')} className="px-3 py-1.5 text-xs font-medium text-navy-700 bg-navy-50 border border-navy-200 rounded-md hover:bg-navy-100 transition-colors">Este Mes</button>
              
              <button 
                onClick={() => setHistoryFilter({ startDate: '', endDate: '', search: '' })}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors ml-2"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-white text-navy-800 text-xs uppercase border-b border-gray-200">
                <tr>
                  <th className="py-3 px-6 font-semibold">N° Operación</th>
                  <th className="py-3 px-6 font-semibold">Fecha y Hora</th>
                  <th className="py-3 px-6 font-semibold">Cliente</th>
                  <th className="py-3 px-6 font-semibold">Resumen de Items</th>
                  <th className="py-3 px-6 font-semibold">Método Pago</th>
                  <th className="py-3 px-6 font-semibold text-right">Monto Total</th>
                  <th className="py-3 px-6 font-semibold text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      No hay registros de ventas que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map(sale => (
                    <tr key={sale.id} className={`hover:bg-gray-50 transition-colors ${sale.type === 'credit_note' ? 'bg-rose-50/30' : ''}`}>
                      <td className="py-3 px-6 text-[10px] font-black text-navy-900 whitespace-nowrap">
                        {sale.numeroOperacion || `DOC-${sale.id.slice(-6).toUpperCase()}`}
                      </td>
                      <td className="py-3 px-6 text-sm text-gray-600 font-medium whitespace-nowrap">
                        {sale.saleDate && typeof sale.saleDate.toDate === 'function' 
                          ? sale.saleDate.toDate().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) 
                          : 'Reciente'}
                      </td>
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{sale.customerName}</span>
                          {sale.type === 'credit_note' && (
                            <span className="text-[9px] font-black bg-rose-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Nota de Crédito</span>
                          )}
                        </div>
                        {sale.isShipping && (
                          <div className="flex gap-1 mt-1">
                            <Truck size={12} className="text-blue-500" />
                            <span className="text-[10px] uppercase text-blue-600 font-bold tracking-wider">Envío</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-6">
                        <div className="flex flex-col gap-0.5 max-w-xs">
                          {sale.items?.map((item: any, idx: number) => (
                            <span key={idx} className="text-xs text-gray-500 truncate" title={item.title}>
                              {item.quantity}x • {item.title}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-6">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          (sale.paymentBreakdown?.['A Cuenta'] || sale.paymentMethod?.includes('A Cuenta')) ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {sale.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-6 text-right font-bold text-navy-900">
                        ${sale.totalAmount?.toFixed(2)}
                      </td>
                      <td className="py-3 px-6 text-center">
                        <div className="flex justify-center gap-1">
                          <button 
                            onClick={() => handleReprintSale(sale)}
                            className="text-navy-400 hover:text-navy-600 transition-colors p-2 hover:bg-navy-50 rounded-full"
                            title="Re-imprimir Ticket"
                          >
                            <Printer size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteSale(sale)}
                            disabled={isProcessing}
                            className="text-red-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-full"
                            title="Eliminar operación de prueba"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="bg-gray-50 border-t border-gray-200 p-4 flex justify-end">
            <div className="text-right">
              <span className="text-sm text-gray-500 uppercase font-semibold tracking-wider">Total Filtrado: </span>
              <span className="text-xl font-black text-navy-900 ml-2">
                ${filteredHistory.reduce((acc, sale) => acc + (sale.totalAmount || 0), 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}


      {/* MODAL TICKET DE VENTA (REACT-TO-PRINT) */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]">
            
            <div className={`${isReprint ? 'bg-navy-700' : 'bg-emerald-600'} p-4 flex justify-between items-center text-white`}>
              <div className="flex items-center gap-2">
                {isReprint ? <Printer size={20} /> : <CheckCircle size={20} />}
                <span className="font-semibold">{isReprint ? 'Comprobante de Venta' : 'Venta Exitosa'}</span>
              </div>
              <button 
                onClick={() => {
                  if (isReprint) {
                    setCompletedSale(null);
                    setIsReprint(false);
                  } else {
                    window.location.reload();
                  }
                }} 
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto w-full bg-gray-100 p-6 flex justify-center">
              {/* COMPONENTE A IMPRIMIR */}
              <div 
                ref={printContentRef} 
                className="bg-white shadow p-6 w-full text-black"
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              >
                <div className="text-center mb-6 border-b border-dashed border-gray-400 pb-4">
                  <h1 className="text-lg font-bold uppercase tracking-widest text-[#1e3a8a] flex items-center justify-center gap-2">
                    <BookOpen size={20} className="text-[#1e3a8a]"/> TOLEDO
                  </h1>
                  <p className="text-[10px] font-semibold tracking-widest mt-0.5">LIBROS JURÍDICOS</p>
                   <p className="mt-2 text-[10px] text-gray-500">TICKET DE COMPRA NO FISCAL</p>
                  <p className="text-[10px] font-black text-navy-900 mt-1">N° DE OPERACIÓN: {completedSale.numeroOperacion}</p>
                  <p className="text-[10px] text-gray-500">{completedSale.date}</p>
                </div>

                <div className="mb-4 text-[11px] leading-relaxed">
                  <p><span className="font-bold">CLIENTE:</span> {completedSale.customer}</p>
                  <p><span className="font-bold">MÉTODO PAGO:</span> {completedSale.method.toUpperCase()}</p>
                  {completedSale.isShipping && (
                    <div className="mt-2 p-2 border border-gray-400 bg-gray-50 uppercase text-[10px]">
                      <p className="font-bold mb-1">=== DESTINO Y LOGÍSTICA ===</p>
                      <p>DIR: {completedSale.shippingInfo.address}</p>
                      <p>LOC: {completedSale.shippingInfo.locality}, {completedSale.shippingInfo.province}</p>
                      <p>TIPO: {completedSale.shippingInfo.method}</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-b border-gray-800 py-2 mb-4">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr>
                        <th className="pb-2 font-bold w-8">CANT</th>
                        <th className="pb-2 font-bold w-full">DESCRIPCIÓN</th>
                        <th className="pb-2 font-bold text-right">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedSale.items.map((item: any, idx: number) => (
                        <tr key={idx} className="border-t border-dashed border-gray-200">
                          <td className="py-2 text-center align-top">{item.quantity}</td>
                          <td className="py-2 pr-2 leading-tight uppercase leading-tight">{item.book.title}</td>
                          <td className="py-2 text-right align-top">${(item.quantity * item.book.price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-end mt-4">
                  <span className="font-bold tracking-widest">TOTAL</span>
                  <span className="text-lg font-black">${completedSale.total.toFixed(2)}</span>
                </div>

                {completedSale.isFinanced && (
                  <div className="mt-4 py-2 border-t border-dashed border-gray-400 text-[10px] uppercase font-bold text-navy-800">
                    <p>*** DETALLE DE FINANCIACIÓN ***</p>
                    <p>PLAN DE {completedSale.installmentsCount} {completedSale.installmentsCount === 1 ? 'CUOTA' : 'CUOTAS'}</p>
                    <p>VALOR CUOTA: ${((completedSale.total - (completedSale.shippingInfo?.cost || 0)) / completedSale.installmentsCount).toFixed(2)}</p>
                  </div>
                )}
                
                <div className="text-center mt-8 text-[9px] text-gray-400 italic">
                  Gracias por tu confianza en Toledo Libros Jurídicos.<br/>
                  La editorial jurídica por excelencia.
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => {
                  if (isReprint) {
                    setCompletedSale(null);
                    setIsReprint(false);
                  } else {
                    window.location.reload();
                  }
                }} 
                className="flex-1 px-4 py-3 bg-gray-100 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-200 font-bold text-[10px] uppercase tracking-widest transition-colors"
              >
                {isReprint ? 'Cerrar' : 'Finalizar (Sin Ticket)'}
              </button>
              <button 
                onClick={() => { 
                  handlePrint(); 
                  if (!isReprint) {
                    setTimeout(() => window.location.reload(), 3000); 
                  }
                }} 
                className="flex-1 px-4 py-3 bg-[#1e3a8a] hover:bg-navy-900 text-white rounded-lg font-black text-[10px] uppercase tracking-widest transition-all flex justify-center items-center gap-2 shadow-lg shadow-navy-100"
              >
                <Printer size={16} />
                {isReprint ? 'Re-Imprimir' : 'Confirmar e Imprimir'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE DEVOLUCIONES (NOTAS DE CRÉDITO) */}
      {isReturnsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-navy-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200 border-t-8 border-rose-500">
            <div className="px-8 py-6 bg-gray-50 flex justify-between items-center border-b border-gray-100">
              <div>
                <h3 className="text-xl font-black text-navy-900 uppercase tracking-tighter">Asistente de Devoluciones</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mt-1">Emisión de Notas de Crédito y Reintegros</p>
              </div>
              <button onClick={() => { setIsReturnsModalOpen(false); setSelectedSaleForReturn(null); }} className="text-gray-300 hover:text-navy-900 transition-colors">
                <X size={28} />
              </button>
            </div>

            <div className="p-8 flex gap-8">
              {/* LADO IZQ: Búsqueda y Selección */}
              <div className="w-1/2 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">1. Localizar Venta Original</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input 
                      type="text"
                      placeholder="N° Ticket o Nombre Cliente..."
                      value={returnSearch}
                      onChange={e => setReturnSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-3 border-2 border-gray-100 rounded-xl text-sm focus:border-navy-900 outline-none font-bold transition-all"
                    />
                  </div>
                  
                  {returnSearch && !selectedSaleForReturn && (
                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y overflow-hidden">
                      {salesToReturnOptions.map(s => (
                        <button 
                          key={s.id}
                          onClick={() => {
                            setSelectedSaleForReturn(s);
                            const initialItems: any = {};
                            s.items.forEach((it: any) => initialItems[it.bookId] = 0);
                            setReturnItems(initialItems);
                            setReturnSearch('');
                          }}
                          className="w-full p-3 text-left hover:bg-white transition-colors flex justify-between items-center group"
                        >
                          <div>
                            <p className="text-xs font-black text-navy-900 leading-tight">Venta #{s.id.slice(-6).toUpperCase()}</p>
                            <p className="text-[10px] text-gray-500 font-bold">{s.customerName}</p>
                          </div>
                          <ChevronRight size={16} className="text-gray-300 group-hover:text-navy-900" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedSaleForReturn && (
                  <div className="p-5 bg-navy-50 rounded-2xl border-2 border-navy-100 animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                         <p className="text-[8px] font-black text-navy-400 uppercase tracking-[0.2em]">Venta Seleccionada</p>
                         <h4 className="text-sm font-black text-navy-900">#{selectedSaleForReturn.id.slice(-6).toUpperCase()}</h4>
                         <p className="text-xs font-bold text-navy-600">{selectedSaleForReturn.customerName}</p>
                       </div>
                       <button onClick={() => setSelectedSaleForReturn(null)} className="text-navy-300 hover:text-rose-500 transition-colors">
                         <Trash2 size={16} />
                       </button>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                      {selectedSaleForReturn.items.map((item: any) => {
                        const maxReturnable = item.quantity - (item.returnedQuantity || 0);
                        return (
                          <div key={item.bookId} className="bg-white p-3 rounded-xl shadow-sm border border-navy-100 flex flex-col gap-2">
                            <p className="text-[10px] font-bold text-navy-900 leading-tight truncate">{item.title}</p>
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-bold text-gray-400 uppercase italic">Disp. {maxReturnable} u.</span>
                              <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg">
                                <button 
                                  onClick={() => setReturnItems(prev => ({ ...prev, [item.bookId]: Math.max(0, (prev[item.bookId] || 0) - 1) }))}
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-navy-900 hover:bg-rose-50 hover:text-rose-600 transition-all font-black"
                                >-</button>
                                <span className="w-6 text-center text-xs font-black text-navy-900">{returnItems[item.bookId] || 0}</span>
                                <button 
                                  onClick={() => setReturnItems(prev => ({ ...prev, [item.bookId]: Math.min(maxReturnable, (prev[item.bookId] || 0) + 1) }))}
                                  className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-navy-900 hover:bg-emerald-50 hover:text-emerald-600 transition-all font-black"
                                >+</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* LADO DER: Resumen y Acción */}
              <div className="w-1/2 flex flex-col justify-between">
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3">2. Método de Reintegro</label>
                    <div className="grid grid-cols-2 gap-2">
                       {['Efectivo', 'Transferencia', 'Tarjeta', 'Saldo a Favor', 'Solo Devolución'].map(m => (
                         <button 
                           key={m}
                           onClick={() => setRefundMethod(m)}
                           className={`py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-tighter transition-all ${
                             refundMethod === m ? 'bg-navy-900 text-white border-navy-900 shadow-xl scale-105' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200'
                           }`}
                         >
                           {m}
                         </button>
                       ))}
                    </div>
                    {refundMethod === 'Saldo a Favor' && (
                      <p className="mt-2 text-[9px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                        <Info size={12} /> Se cargará como crédito para futuras compras.
                      </p>
                    )}
                    {refundMethod === 'Solo Devolución' && (
                      <p className="mt-2 text-[9px] font-bold text-blue-600 flex items-center gap-1 bg-blue-50 p-2 rounded-lg border border-blue-100">
                        <Info size={12} /> Se descontará directamente de la deuda actual (Cta. Cte.).
                      </p>
                    )}
                  </div>

                  <div className="p-6 bg-rose-50 rounded-2xl border-2 border-rose-100 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black text-rose-900 uppercase tracking-widest">Total a Reintegrar</span>
                      <span className="text-2xl font-black text-rose-600">
                        ${selectedSaleForReturn ? 
                          Object.entries(returnItems).reduce((acc, [id, q]) => {
                            const item = selectedSaleForReturn.items.find((it: any) => it.bookId === id);
                            return acc + (item ? item.unitPrice * q : 0);
                          }, 0).toFixed(2)
                          : '0.00'
                        }
                      </span>
                    </div>
                    <div className="pt-4 border-t border-rose-200/50">
                       <p className="text-[10px] text-rose-800 leading-relaxed font-medium italic">
                         Esta acción incrementará el stock de los productos seleccionados y generará una Nota de Crédito en el historial.
                       </p>
                    </div>
                  </div>
                </div>

                <button 
                  disabled={isProcessing || !selectedSaleForReturn || Object.values(returnItems).every(v => v === 0)}
                  onClick={handleProcessReturn}
                  className="w-full py-5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-8 flex items-center justify-center gap-3 active:scale-95"
                >
                  {isProcessing ? 'PROCESANDO...' : (
                    <>
                      <Trash2 size={20} className="rotate-180" /> CONFIRMAR DEVOLUCIÓN
                    </>
                  )}
                </button>
              </div>
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
