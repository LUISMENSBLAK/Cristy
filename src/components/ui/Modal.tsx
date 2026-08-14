import { ReactNode } from 'react';
import { Button } from './Button';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[var(--color-gris)]/20 flex justify-between items-center bg-[var(--color-crema)]">
          <h2 className="font-serif font-bold text-xl text-[var(--color-bronce)]">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-[var(--color-gris)] hover:text-red-600">
            <X size={20} />
          </Button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
