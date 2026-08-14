'use client'

import React from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  variant?: 'primary' | 'danger'
  isSubmitting?: boolean
}

export function ConfirmModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  confirmLabel = "Confirmar", 
  cancelLabel = "Cancelar", 
  onConfirm, 
  variant = 'primary',
  isSubmitting = false
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="mb-6 text-sm text-[var(--color-gris)] leading-relaxed">
        {message}
      </div>
      <div className="flex gap-3 mt-4 safe-bottom">
        <Button 
          variant="outline" 
          className="flex-1" 
          onClick={onClose}
          disabled={isSubmitting}
        >
          {cancelLabel}
        </Button>
        <Button 
          variant={variant} 
          className="flex-1" 
          onClick={() => {
            onConfirm();
          }}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Procesando..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
