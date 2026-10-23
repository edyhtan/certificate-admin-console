import { useEffect, useRef, useState } from 'react'

export const SEARCH_DEBOUNCE_MS = 300

export interface SearchBoxProps {
  /** The applied search (from the URL). The box follows it when it changes elsewhere, e.g. Back. */
  value: string
  /** Called once typing pauses for 300 ms, with the trimmed text. */
  onSearch: (value: string) => void
  label: string
  placeholder?: string
  maxLength?: number
}

/** A search input that reports what was typed after a short pause, not on every key. */
export function SearchBox({ value, onSearch, label, placeholder, maxLength }: SearchBoxProps) {
  const [text, setText] = useState(value)
  const [shownValue, setShownValue] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ value, onSearch })

  // Follow outside changes (Back button, "clear search"): adjust state while rendering
  if (value !== shownValue) {
    setShownValue(value)
    setText(value)
  }

  useEffect(() => {
    latest.current = { value, onSearch }
  })

  useEffect(() => () => clearTimeout(timer.current), [])

  function change(next: string) {
    setText(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const trimmed = next.trim()
      if (trimmed !== latest.current.value) latest.current.onSearch(trimmed)
    }, SEARCH_DEBOUNCE_MS)
  }

  return (
    <input
      type="search"
      className="search-box"
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      value={text}
      onChange={(event) => change(event.target.value)}
    />
  )
}
