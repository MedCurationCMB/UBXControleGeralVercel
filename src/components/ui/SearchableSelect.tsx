'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder: string
  disabled?: boolean
}

const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g')

const normalize = (s: string) =>
  s.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase()

export default function SearchableSelect({ value, onChange, options, placeholder, disabled }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = useMemo(() => {
    if (!query) return options
    const q = normalize(query)
    return options.filter(o => normalize(o).includes(q))
  }, [options, query])

  useEffect(() => { setHighlight(0) }, [query, open])

  const selectOption = (opt: string) => {
    onChange(opt)
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlight] !== undefined) selectOption(filtered[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      ;(e.target as HTMLInputElement).blur()
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <input
        className="input pr-8"
        placeholder={placeholder}
        value={open ? query : value}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onKeyDown={handleKeyDown}
      />
      {value && !open && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          onMouseDown={e => { e.preventDefault(); onChange('') }}
          tabIndex={-1}
        >
          <X size={14} />
        </button>
      )}
      {open && !disabled && (
        <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg text-sm">
          <li
            className={`px-3 py-2 cursor-pointer hover:bg-slate-50 ${value === '' ? 'text-primary-600 font-medium' : 'text-slate-500'}`}
            onMouseDown={e => { e.preventDefault(); selectOption('') }}
          >
            {placeholder}
          </li>
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-slate-400">Nenhum resultado</li>
          )}
          {filtered.map((opt, i) => (
            <li
              key={opt}
              className={`px-3 py-2 cursor-pointer ${i === highlight ? 'bg-primary-50' : 'hover:bg-slate-50'} ${opt === value ? 'font-medium text-slate-900' : 'text-slate-700'}`}
              onMouseDown={e => { e.preventDefault(); selectOption(opt) }}
              onMouseEnter={() => setHighlight(i)}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
