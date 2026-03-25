import React from 'react';
import { X, AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';

interface AlertProps {
  isOpen: boolean;
  message: string;
  type?: 'error' | 'success' | 'info' | 'warning' | 'confirm';
  onClose: () => void;
  onConfirm?: () => void;
}

export const AestheticAlert: React.FC<AlertProps> = ({ isOpen, message, type = 'error', onClose, onConfirm }) => {
  if (!isOpen) return null;

  const config = {
    error: { 
      bg: 'bg-rose-50', 
      border: 'border-rose-200', 
      text: 'text-rose-800', 
      icon: <AlertCircle className="text-rose-500" size={28} />, 
      button: 'bg-rose-600 hover:bg-rose-700 shadow-rose-200',
      title: 'Error en Operación'
    },
    success: { 
      bg: 'bg-emerald-50', 
      border: 'border-emerald-200', 
      text: 'text-emerald-800', 
      icon: <CheckCircle2 className="text-emerald-500" size={28} />, 
      button: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200',
      title: 'Éxito Total'
    },
    info: { 
      bg: 'bg-blue-50', 
      border: 'border-blue-200', 
      text: 'text-blue-800', 
      icon: <Info className="text-blue-500" size={28} />, 
      button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-200',
      title: 'Información'
    },
    warning: { 
      bg: 'bg-amber-50', 
      border: 'border-amber-200', 
      text: 'text-amber-800', 
      icon: <TriangleAlert className="text-amber-500" size={28} />, 
      button: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200',
      title: 'Advertencia'
    },
    confirm: { 
      bg: 'bg-navy-50', 
      border: 'border-navy-200', 
      text: 'text-navy-900', 
      icon: <TriangleAlert className="text-navy-600" size={28} />, 
      button: 'bg-navy-900 hover:bg-navy-800 shadow-navy-200',
      title: 'Confirmación Requerida'
    },
  };

  const c = config[type];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 min-h-screen">
      <div className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-300" onClick={onClose}></div>
      <div className={`relative ${c.bg} ${c.border} border-2 rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden transform transition-all scale-100 p-8 animate-in zoom-in-95 duration-200 flex flex-col items-center text-center`}>
        <div className="mb-5 p-4 bg-white rounded-full shadow-lg border border-gray-50 flex items-center justify-center">
          {c.icon}
        </div>
        
        <h4 className={`text-[11px] font-black uppercase tracking-[0.25em] ${c.text} opacity-50 mb-3`}>
          {c.title}
        </h4>
        
        <p className={`text-lg font-black leading-tight mb-2 ${c.text}`}>
          {message}
        </p>
        
        <div className={`mt-8 w-full flex ${type === 'confirm' ? 'gap-3' : ''}`}>
          {type === 'confirm' && (
            <button 
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-600 font-black py-4 rounded-2xl transition-all uppercase text-[10px] tracking-[0.2em] hover:bg-gray-300"
            >
              Cancelar
            </button>
          )}
          <button 
            onClick={() => {
              if (type === 'confirm' && onConfirm) onConfirm();
              onClose();
            }}
            className={`${type === 'confirm' ? 'flex-1' : 'w-full'} ${c.button} text-white font-black py-4 rounded-2xl transition-all uppercase text-[10px] tracking-[0.2em] shadow-xl hover:scale-[1.02] active:scale-95`}
          >
            {type === 'confirm' ? 'Confirmar' : 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  );
};
