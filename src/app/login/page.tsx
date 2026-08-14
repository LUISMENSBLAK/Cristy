'use client'

import { useState, useTransition, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { loginWithPin, loginWithEmail } from './actions'
import { Lock, UserCircle, Delete } from 'lucide-react'

export default function LoginPage() {
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleKeypad = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num)
    }
  }

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1))
  }

  const submitPin = () => {
    if (pin.length !== 4) return
    setError(null)
    startTransition(async () => {
      const res = await loginWithPin(pin)
      if (res?.error) {
        setError(res.error)
        setPin('')
      }
    })
  }

  const submitEmail = async (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const res = await loginWithEmail(formData)
      if (res?.error) setError(res.error)
    })
  }

  // Auto submit when PIN reaches 4 digits — MUST be in useEffect, not render body
  useEffect(() => {
    if (pin.length === 4 && !isPending && !error) {
      submitPin()
    }
  }, [pin])

  return (
    <div className="min-h-screen flex flex-col p-4 bg-[#EDE0CC]">
      <div className="w-full max-w-md m-auto bg-white rounded-xl overflow-hidden shadow-[0_12px_32px_rgba(58,42,22,0.18),0_2px_8px_rgba(58,42,22,0.10)]">

        {/* Header */}
        <div className="bg-[var(--color-crema)] py-2 px-4 text-center border-b border-[var(--color-bronce)]/20 flex justify-center">
          <img src="/LogoCristisCofre.png" alt="Cristi's Logo" className="w-[78%] max-w-[220px] h-auto object-contain bg-transparent" />
        </div>

        {/* Content */}
        <div className="p-8">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm text-center mb-6 border border-red-200">
              {error}
            </div>
          )}

          {!isAdminMode ? (
            <div className="flex flex-col items-center">
              <div className="flex justify-center gap-4 mb-8">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full transition-colors duration-200 ${i < pin.length ? 'bg-[var(--color-bronce)]' : 'bg-[var(--color-gris)]/30'
                      }`}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-4 w-full max-w-[280px]">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <Button
                    key={num}
                    variant="ghost"
                    size="lg"
                    className="h-16 text-2xl font-normal bg-black/5 hover:bg-black/10 rounded-2xl"
                    onClick={() => handleKeypad(num.toString())}
                    disabled={isPending}
                  >
                    {num}
                  </Button>
                ))}
                <div /> {/* Empty slot for alignment */}
                <Button
                  variant="ghost"
                  size="lg"
                  className="h-16 text-2xl font-normal bg-black/5 hover:bg-black/10 rounded-2xl"
                  onClick={() => handleKeypad('0')}
                  disabled={isPending}
                >
                  0
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="h-16 text-[var(--color-gris)] bg-black/5 hover:bg-black/10 hover:text-red-600 rounded-2xl"
                  onClick={handleDelete}
                  disabled={isPending || pin.length === 0}
                >
                  <Delete size={24} />
                </Button>
              </div>
            </div>
          ) : (
            <form action={submitEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-bold tracking-widest text-[var(--color-gris)] uppercase mb-2">
                  Correo
                </label>
                <Input name="email" type="email" placeholder="admin@abaroa.local" required disabled={isPending} />
              </div>
              <div>
                <label className="block text-xs font-bold tracking-widest text-[var(--color-gris)] uppercase mb-2">
                  Contraseña
                </label>
                <Input name="password" type="password" required disabled={isPending} />
              </div>
              <Button type="submit" className="w-full mt-4" disabled={isPending}>
                {isPending ? 'Iniciando...' : 'Iniciar Sesión'}
              </Button>
            </form>
          )}
        </div>

        {/* Footer Toggle */}
        <div className="p-4 bg-black/5 text-center">
          <button
            type="button"
            onClick={() => {
              setIsAdminMode(!isAdminMode)
              setPin('')
              setError(null)
            }}
            className="text-xs font-bold tracking-widest text-[var(--color-gris)] hover:text-[var(--color-bronce)] uppercase transition-colors inline-flex items-center gap-2"
          >
            {isAdminMode ? (
              <><Lock size={14} /> Entrar con PIN</>
            ) : (
              <><UserCircle size={14} /> Acceso Administrador</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
