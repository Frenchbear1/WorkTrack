import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

type ModalProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/35 px-3 pb-3 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            className="absolute inset-0 cursor-default"
            type="button"
            aria-label="Close"
            onClick={onClose}
          />
          <motion.section
            className="relative max-h-[92svh] w-full max-w-[430px] overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl"
            initial={{ y: 36, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            <header className="flex items-center justify-between border-b border-stone-200/70 px-5 py-4">
              <h2 className="text-base font-semibold text-stone-950">{title}</h2>
              <button
                className="grid size-10 place-items-center rounded-full bg-stone-100 text-stone-700 transition hover:bg-stone-200"
                type="button"
                onClick={onClose}
                title="Close"
              >
                <X size={19} />
              </button>
            </header>
            <div className="max-h-[70svh] overflow-x-hidden overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer ? (
              <footer className="border-t border-stone-200/70 px-5 py-4">
                {footer}
              </footer>
            ) : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
