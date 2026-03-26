'use client'

import React, { useRef, useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'dot-connectors-data'
const DOT_PADDING = 20
const GRAVITY_AMOUNT = 0.12
const BRAND = '#0260f7'
const DOT_BG = '#0a0f1e'

const DOT_COLORS = [
  { label: 'Navy', value: '#0a0f1e' },
  { label: 'Slate', value: '#1e293b' },
  { label: 'Charcoal', value: '#1c1c2e' },
  { label: 'Forest', value: '#0d1f16' },
  { label: 'Plum', value: '#1a0a2e' },
  { label: 'Crimson', value: '#1f0a0a' },
  { label: 'Teal', value: '#042020' },
  { label: 'Midnight', value: '#080820' },
]

function getDotRadius(label) {
  if (!label) return 40
  const lines = label.split('\n')
  const maxLineLen = Math.max(...lines.map(l => l.length))
  const numLines = lines.length
  const baseR = 40
  const byWidth = Math.max(0, maxLineLen - 10) * 3
  const byHeight = Math.max(0, numLines - 2) * 10
  return Math.min(Math.max(baseR + byWidth + byHeight, 40), 110)
}

function getCurvedPath(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy)
  const sag = dist * GRAVITY_AMOUNT
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2 + sag
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`
}

let idCounter = Date.now()
function genId() { return `dot_${idCounter++}` }

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { dots: [], connections: [] }
}
function saveData(dots, connections) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dots, connections }))
  } catch {}
}

export default function DotConnectors() {
  const containerRef = useRef(null)
  const textareaRef = useRef(null)
  const editTextareaRef = useRef(null)

  const [dots, setDots] = useState([])
  const [connections, setConnections] = useState([])
  const [inputText, setInputText] = useState('')
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })

  const draggingDot = useRef(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOrigin = useRef({ x: 0, y: 0 })
  const connectingFrom = useRef(null)
  const [ghostLine, setGhostLine] = useState(null)
  const [selectedDot, setSelectedDot] = useState(null)
  const [selectedConnection, setSelectedConnection] = useState(null)
  const [tooltip, setTooltip] = useState(null)
  const [isConnectingMode, setIsConnectingMode] = useState(false)
  const [editingDot, setEditingDot] = useState(null) // { id, label, color }
  const [editText, setEditText] = useState('')
  const [editColor, setEditColor] = useState(DOT_BG)
  const transformRef = useRef(transform)
  const dotsRef = useRef(dots)

  useEffect(() => { transformRef.current = transform }, [transform])
  useEffect(() => { dotsRef.current = dots }, [dots])

  useEffect(() => {
    const { dots: d, connections: c } = loadData()
    if (d.length) setDots(d)
    if (c.length) setConnections(c)
  }, [])

  useEffect(() => { saveData(dots, connections) }, [dots, connections])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [inputText])

  // Focus edit textarea when editing
  useEffect(() => {
    if (editingDot && editTextareaRef.current) {
      editTextareaRef.current.focus()
      editTextareaRef.current.select()
    }
  }, [editingDot])

  const toCanvas = useCallback((sx, sy) => {
    const { x, y, scale } = transformRef.current
    return { x: (sx - x) / scale, y: (sy - y) / scale }
  }, [])

  const hitDot = useCallback((cx, cy) => {
    return dotsRef.current.find(d => {
      const r = getDotRadius(d.label) + 8
      const dx = d.x - cx, dy = d.y - cy
      return Math.sqrt(dx * dx + dy * dy) <= r
    })
  }, [])

  const addDot = useCallback(() => {
    const text = inputText.trim()
    if (!text) return
    const rect = containerRef.current.getBoundingClientRect()
    const { x, y, scale } = transformRef.current
    const cx = (rect.width / 2 - x) / scale
    const cy = (rect.height / 2 - y) / scale
    const spread = 120
    const newDot = {
      id: genId(),
      label: text,
      color: DOT_BG,
      x: cx + (Math.random() - 0.5) * spread,
      y: cy + (Math.random() - 0.5) * spread,
    }
    setDots(prev => [...prev, newDot])
    setInputText('')
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [inputText])

  const deleteDot = useCallback((id) => {
    setDots(prev => prev.filter(d => d.id !== id))
    setConnections(prev => prev.filter(c => c.from !== id && c.to !== id))
    setSelectedDot(null)
    setEditingDot(null)
  }, [])

  const openEditDot = useCallback((dot) => {
    setEditingDot(dot)
    setEditText(dot.label)
    setEditColor(dot.color || DOT_BG)
  }, [])

  const saveEditDot = useCallback(() => {
    if (!editingDot) return
    const trimmed = editText.trim()
    if (!trimmed) return
    setDots(prev => prev.map(d =>
      d.id === editingDot.id ? { ...d, label: trimmed, color: editColor } : d
    ))
    setEditingDot(null)
  }, [editingDot, editText, editColor])

  const cancelEdit = useCallback(() => {
    setEditingDot(null)
  }, [])

  const onPointerDown = useCallback((e) => {
    if (editingDot) return // block canvas interaction while editing

    const rect = containerRef.current.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: cx, y: cy } = toCanvas(sx, sy)
    const hit = hitDot(cx, cy)

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY }
      panOrigin.current = { x: transformRef.current.x, y: transformRef.current.y }
      e.preventDefault()
      return
    }

    if (hit) {
      if (isConnectingMode) {
        if (connectingFrom.current === null) {
          connectingFrom.current = hit
          setGhostLine({ x1: hit.x, y1: hit.y, x2: cx, y2: cy })
          setTooltip({ id: 'connecting', label: `Connecting from "${hit.label.split('\n')[0]}" — click another dot`, sx, sy })
          e.currentTarget.setPointerCapture(e.pointerId)
        }
      } else {
        draggingDot.current = hit.id
        dragOffset.current = { x: cx - hit.x, y: cy - hit.y }
        setSelectedDot(hit.id)
        setSelectedConnection(null)
        e.currentTarget.setPointerCapture(e.pointerId)
      }
    } else {
      if (isConnectingMode && connectingFrom.current) {
        connectingFrom.current = null
        setGhostLine(null)
        setTooltip(null)
      }
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY }
      panOrigin.current = { x: transformRef.current.x, y: transformRef.current.y }
      setSelectedDot(null)
      setSelectedConnection(null)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }, [hitDot, toCanvas, isConnectingMode, editingDot])

  const onPointerMove = useCallback((e) => {
    const rect = containerRef.current.getBoundingClientRect()

    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      setTransform(prev => ({
        ...prev,
        x: panOrigin.current.x + dx,
        y: panOrigin.current.y + dy,
      }))
      return
    }

    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: cx, y: cy } = toCanvas(sx, sy)

    if (draggingDot.current) {
      setDots(prev => prev.map(d =>
        d.id === draggingDot.current
          ? { ...d, x: cx - dragOffset.current.x, y: cy - dragOffset.current.y }
          : d
      ))
    }

    if (connectingFrom.current && ghostLine) {
      setGhostLine(prev => ({ ...prev, x2: cx, y2: cy }))
      const hit = hitDot(cx, cy)
      if (hit && hit.id !== connectingFrom.current.id) {
        setTooltip({ id: 'hover', label: `Connect to "${hit.label.split('\n')[0]}"`, sx, sy })
      } else {
        setTooltip(null)
      }
    } else {
      const hit = hitDot(cx, cy)
      if (hit && !isConnectingMode) {
        setTooltip({ id: hit.id, label: hit.label.split('\n')[0], sx, sy })
      } else {
        setTooltip(null)
      }
    }
  }, [toCanvas, hitDot, ghostLine, isConnectingMode])

  const connectionsRef = useRef(connections)
  useEffect(() => { connectionsRef.current = connections }, [connections])

  const onPointerUp = useCallback((e) => {
    isPanning.current = false
    draggingDot.current = null

    if (connectingFrom.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const { x: cx, y: cy } = toCanvas(sx, sy)
      const hit = hitDot(cx, cy)

      if (hit && hit.id !== connectingFrom.current.id) {
        const from = connectingFrom.current.id
        const to = hit.id
        const exists = connectionsRef.current.some(
          c => (c.from === from && c.to === to) || (c.from === to && c.to === from)
        )
        if (!exists) {
          setConnections(prev => [...prev, { id: genId(), from, to }])
          setTooltip({ id: 'success', label: '✓ Connection created!', sx, sy })
          setTimeout(() => setTooltip(null), 1500)
        } else {
          setTooltip({ id: 'error', label: '✗ Connection already exists', sx, sy })
          setTimeout(() => setTooltip(null), 1500)
        }
      }
      connectingFrom.current = null
      setGhostLine(null)
      if (isConnectingMode) setIsConnectingMode(false)
    }
  }, [hitDot, toCanvas, isConnectingMode])

  const onWheel = useCallback((e) => {
    e.preventDefault()
    const rect = containerRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setTransform(prev => {
      const ns = Math.min(4, Math.max(0.15, prev.scale * delta))
      const ratio = ns / prev.scale
      return { scale: ns, x: mx - ratio * (mx - prev.x), y: my - ratio * (my - prev.y) }
    })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  const deleteConnection = (id) => {
    setConnections(prev => prev.filter(c => c.id !== id))
    setSelectedConnection(null)
  }

  const exportData = () => {
    const data = JSON.stringify({ dots, connections }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `dot-connectors-${Date.now()}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const importData = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result)
          if (parsed.dots && parsed.connections) {
            setDots(parsed.dots); setConnections(parsed.connections)
          }
        } catch { alert('Invalid JSON file') }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const resetView = () => setTransform({ x: 0, y: 0, scale: 1 })
  const clearAll = () => {
    if (window.confirm('Clear all dots and connections?')) {
      setDots([]); setConnections([]); setSelectedDot(null); setSelectedConnection(null)
    }
  }

  const toggleConnectMode = () => {
    setIsConnectingMode(prev => !prev)
    if (connectingFrom.current) {
      connectingFrom.current = null
      setGhostLine(null)
    }
  }

  const dotMap = Object.fromEntries(dots.map(d => [d.id, d]))

  const selectedDotData = dots.find(d => d.id === selectedDot)
  const selectedConnData = selectedConnection ? connections.find(c => c.id === selectedConnection) : null

  // Project canvas coord -> screen coord
  const getScreenPos = (dot, offsetX = 0, offsetY = 0) => {
    if (!dot) return null
    const { x: tx, y: ty, scale } = transform
    const sx = dot.x * scale + tx + offsetX * scale
    const sy = dot.y * scale + ty + offsetY * scale
    return { sx, sy }
  }

  const selectedDotR = selectedDotData ? getDotRadius(selectedDotData.label) : 0
  const deletePos = selectedDotData ? getScreenPos(selectedDotData, selectedDotR - 6, -selectedDotR + 6) : null
  const editPos = selectedDotData ? getScreenPos(selectedDotData, -selectedDotR + 6, -selectedDotR + 6) : null

  // Connection midpoint for delete button
  const getConnMidpoint = (conn) => {
    const a = dotMap[conn.from], b = dotMap[conn.to]
    if (!a || !b) return null
    const { x: tx, y: ty, scale } = transform
    const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
    const sag = dist * GRAVITY_AMOUNT
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2 + sag
    return {
      sx: mx * scale + tx,
      sy: my * scale + ty,
    }
  }

  return (
    <div style={{
      width: '100%', height: '100vh',
      background: 'var(--background)',
      color: 'var(--foreground)',
      fontFamily: "'IBM Plex Mono', 'Fira Mono', monospace",
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        .dc-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.65);
          border-radius: 7px;
          padding: 6px 12px;
          cursor: pointer;
          font-size: 11px;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.15s;
          font-family: 'IBM Plex Mono', monospace;
          white-space: nowrap;
        }
        .dc-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
        .dc-btn.active { background: ${BRAND}; border-color: ${BRAND}; color: #fff; }
        .dc-btn.danger { color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.07); }
        .dc-btn.danger:hover { background: rgba(248,113,113,0.15); }
        @media (max-width: 600px) {
          .dc-btn-label { display: none; }
          .dc-btn { padding: 6px 9px; }
        }
        .dc-textarea {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--foreground);
          font-size: 13px;
          font-family: 'IBM Plex Mono', monospace;
          outline: none;
          letter-spacing: 0.03em;
          padding: 8px 0;
          line-height: 1.5;
          min-height: 38px;
          max-height: 160px;
          resize: none;
          overflow-y: auto;
          display: block;
          width: 100%;
          box-sizing: border-box;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
        .dc-textarea::-webkit-scrollbar { width: 4px; }
        .dc-textarea::-webkit-scrollbar-track { background: transparent; }
        .dc-textarea::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .dc-icon-btn {
          position: absolute;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 2px solid rgba(0,0,0,0.5);
          color: #fff;
          font-size: 11px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          transform: translate(-50%, -50%);
          transition: background 0.1s, transform 0.1s;
          line-height: 1;
          pointer-events: all;
        }
        .dc-delete-btn { background: #ef4444; }
        .dc-delete-btn:hover { background: #dc2626; transform: translate(-50%, -50%) scale(1.15); }
        .dc-edit-btn { background: ${BRAND}; }
        .dc-edit-btn:hover { background: #0148cc; transform: translate(-50%, -50%) scale(1.15); }
        .dc-conn-delete-btn { background: #ef4444; }
        .dc-conn-delete-btn:hover { background: #dc2626; transform: translate(-50%, -50%) scale(1.15); }

        /* Edit modal */
        .dc-edit-modal {
          position: absolute;
          z-index: 200;
          background: rgba(10,15,30,0.97);
          border: 1px solid ${BRAND}55;
          border-radius: 14px;
          padding: 16px;
          min-width: 260px;
          max-width: 320px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
          backdrop-filter: blur(16px);
          pointer-events: all;
        }
        .dc-edit-modal textarea {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          color: #fff;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          padding: 8px;
          resize: none;
          outline: none;
          line-height: 1.5;
          min-height: 80px;
          max-height: 180px;
          overflow-y: auto;
        }
        .dc-edit-modal textarea:focus { border-color: ${BRAND}; }
        .dc-color-swatch {
          width: 22px; height: 22px; border-radius: 50%;
          cursor: pointer;
          border: 2px solid transparent;
          transition: border-color 0.1s, transform 0.1s;
          flex-shrink: 0;
        }
        .dc-color-swatch:hover { transform: scale(1.15); }
        .dc-color-swatch.selected { border-color: #fff; }
      `}</style>

      {/* TOP NAV */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px',
        background: 'transparent',
        position: 'absolute', top: 0, left: 0, right: 0,
        zIndex: 20,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 6 }}>
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <circle cx="5" cy="5" r="4" fill={BRAND} />
            <circle cx="17" cy="5" r="4" fill={BRAND} opacity="0.7" />
            <circle cx="11" cy="17" r="4" fill={BRAND} opacity="0.5" />
            <path d="M5 5 Q11 11 17 5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
            <path d="M5 5 Q8 14 11 17" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
            <path d="M17 5 Q14 14 11 17" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" fill="none" />
          </svg>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', color: '#fff' }}>
            DOT<span style={{ color: BRAND }}>CONNECT</span>
          </span>
        </div>

        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginRight: 'auto', letterSpacing: '0.05em' }}>
          {dots.length} NODES · {connections.length} CONNECTIONS
        </span>

        <button className={`dc-btn ${isConnectingMode ? 'active' : ''}`} onClick={toggleConnectMode}>
          🔗 <span className="dc-btn-label">{isConnectingMode ? 'Connecting ON' : 'Connect Mode'}</span>
        </button>
        <button className="dc-btn" onClick={importData}>📁 <span className="dc-btn-label">Import</span></button>
        <button className="dc-btn" onClick={exportData}>💾 <span className="dc-btn-label">Export</span></button>
        <button className="dc-btn" onClick={resetView}>⊙ <span className="dc-btn-label">Reset</span></button>
        <button className="dc-btn danger" onClick={clearAll}>✕ <span className="dc-btn-label">Clear</span></button>

        <span style={{
          fontSize: 10, color: 'rgba(255,255,255,0.35)',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 5, padding: '4px 8px', minWidth: 42, textAlign: 'center',
        }}>
          {Math.round(transform.scale * 100)}%
        </span>
      </header>

      {/* CANVAS */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          cursor: isConnectingMode ? 'crosshair' : 'default',
          touchAction: 'none',
        }}
      >
        {/* Grid */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <pattern id="sg" width={24 * transform.scale} height={24 * transform.scale}
              patternUnits="userSpaceOnUse"
              x={transform.x % (24 * transform.scale)} y={transform.y % (24 * transform.scale)}>
              <path d={`M ${24 * transform.scale} 0 L 0 0 0 ${24 * transform.scale}`}
                fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            </pattern>
            <pattern id="bg" width={120 * transform.scale} height={120 * transform.scale}
              patternUnits="userSpaceOnUse"
              x={transform.x % (120 * transform.scale)} y={transform.y % (120 * transform.scale)}>
              <rect width={120 * transform.scale} height={120 * transform.scale} fill="url(#sg)" />
              <path d={`M ${120 * transform.scale} 0 L 0 0 0 ${120 * transform.scale}`}
                fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.7" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg)" />
        </svg>

        {/* Main SVG */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>

            {/* Connections */}
            {connections.map(conn => {
              const a = dotMap[conn.from], b = dotMap[conn.to]
              if (!a || !b) return null
              const d = getCurvedPath(a.x, a.y, b.x, b.y)
              const isSelConn = selectedConnection === conn.id
              return (
                <g key={conn.id} style={{ pointerEvents: 'visibleStroke' }}>
                  <path d={d} fill="none" stroke="transparent" strokeWidth={18}
                    style={{ pointerEvents: 'visibleStroke', cursor: 'pointer' }}
                    onClick={() => setSelectedConnection(conn.id === selectedConnection ? null : conn.id)}
                    onDoubleClick={() => deleteConnection(conn.id)} />
                  <path d={d} fill="none"
                    stroke={isSelConn ? '#ef4444' : `${BRAND}33`}
                    strokeWidth={isSelConn ? 5 : 4}
                    strokeLinecap="round" />
                  <path d={d} fill="none"
                    stroke={isSelConn ? 'rgba(248,113,113,0.7)' : 'rgba(255,255,255,0.4)'}
                    strokeWidth={isSelConn ? 1.8 : 1.2}
                    strokeLinecap="round"
                    strokeDasharray={isSelConn ? '5 3' : undefined} />
                </g>
              )
            })}

            {/* Ghost line */}
            {ghostLine && (
              <path
                d={getCurvedPath(ghostLine.x1, ghostLine.y1, ghostLine.x2, ghostLine.y2)}
                fill="none" stroke={BRAND} strokeWidth={2.5}
                strokeDasharray="8 4" strokeLinecap="round" opacity={0.9} />
            )}

            {/* Dots */}
            {dots.map(dot => {
              const r = getDotRadius(dot.label)
              const isSelected = selectedDot === dot.id
              const isConnecting = connectingFrom.current?.id === dot.id
              const dotColor = dot.color || DOT_BG

              // font size based on radius and content
              const lines = dot.label.split('\n')
              const maxLen = Math.max(...lines.map(l => l.length))
              const fontSize = Math.max(9, Math.min(13, (r * 1.7) / Math.max(maxLen, 1)))

              return (
                <g key={dot.id} transform={`translate(${dot.x},${dot.y})`}>
                  {/* Pulse ring */}
                  {(isSelected || isConnecting) && (
                    <circle r={r + 12} fill="none"
                      stroke={BRAND}
                      strokeWidth={2} opacity={0.5}>
                      <animate attributeName="r" from={r + 8} to={r + 16} dur="1s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.6" to="0" dur="1s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Shadow */}
                  <ellipse rx={r * 0.8} ry={r * 0.2} cy={r + 4} fill="rgba(0,0,0,0.4)" />
                  {/* Glow when selected */}
                  {isSelected && (
                    <circle r={r + 4} fill="none" stroke={BRAND} strokeWidth={2.5} opacity={0.6} />
                  )}
                  {/* Body */}
                  <circle r={r} fill={dotColor} />
                  {/* Brand color border */}
                  <circle r={r} fill="none" stroke={BRAND} strokeWidth={2} opacity={0.85} />

                  {/* Label via foreignObject — wraps text properly */}
                  <foreignObject
                    x={-(r - DOT_PADDING / 2)}
                    y={-(r - DOT_PADDING / 2)}
                    width={(r - DOT_PADDING / 2) * 2}
                    height={(r - DOT_PADDING / 2) * 2}
                    style={{ pointerEvents: 'none' }}
                  >
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      textAlign: 'center',
                      color: '#ffffff',
                      fontSize: `${fontSize}px`,
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontWeight: '600',
                      lineHeight: 1.4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      overflow: 'hidden',
                      padding: '4px',
                    }}>
                      {dot.label}
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </g>
        </svg>

        {/* ── OVERLAY BUTTONS ── */}

        {/* Delete dot button */}
        {selectedDotData && deletePos && !editingDot && (
          <button
            className="dc-icon-btn dc-delete-btn"
            style={{ left: deletePos.sx, top: deletePos.sy }}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); deleteDot(selectedDotData.id) }}
            title="Delete node"
          >✕</button>
        )}

        {/* Edit dot button */}
        {selectedDotData && editPos && !editingDot && (
          <button
            className="dc-icon-btn dc-edit-btn"
            style={{ left: editPos.sx, top: editPos.sy }}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); openEditDot(selectedDotData) }}
            title="Edit node"
          >✎</button>
        )}

        {/* Delete connection button (shown when connection is selected) */}
        {selectedConnData && (() => {
          const mid = getConnMidpoint(selectedConnData)
          if (!mid) return null
          return (
            <button
              className="dc-icon-btn dc-conn-delete-btn"
              style={{ left: mid.sx, top: mid.sy, width: 26, height: 26 }}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); deleteConnection(selectedConnData.id) }}
              title="Delete connection"
            >✕</button>
          )
        })()}

        {/* ── EDIT MODAL ── */}
        {editingDot && (() => {
          const dot = dots.find(d => d.id === editingDot.id)
          if (!dot) return null
          const { x: tx, y: ty, scale } = transform
          // Position modal near the dot, but keep it on screen
          const dotSx = dot.x * scale + tx
          const dotSy = dot.y * scale + ty
          const modalW = 280
          const modalH = 220
          let mx = dotSx + (getDotRadius(dot.label) + 10) * scale
          let my = dotSy - modalH / 2
          // clamp to viewport
          const vw = containerRef.current?.clientWidth || 800
          const vh = containerRef.current?.clientHeight || 600
          if (mx + modalW > vw - 8) mx = dotSx - (getDotRadius(dot.label) + 10) * scale - modalW
          if (mx < 8) mx = 8
          if (my < 50) my = 50
          if (my + modalH > vh - 80) my = vh - modalH - 80

          return (
            <div
              className="dc-edit-modal"
              style={{ left: mx, top: my }}
              onPointerDown={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8, letterSpacing: '0.08em' }}>
                EDIT NODE
              </div>
              <textarea
                ref={editTextareaRef}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); saveEditDot() }
                  if (e.key === 'Escape') cancelEdit()
                }}
                rows={4}
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="Node content..."
              />
              {/* Color picker */}
              <div style={{ marginTop: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: '0.06em' }}>
                  DOT COLOR
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {DOT_COLORS.map(col => (
                    <div
                      key={col.value}
                      className={`dc-color-swatch${editColor === col.value ? ' selected' : ''}`}
                      style={{ background: col.value, border: `2px solid ${editColor === col.value ? '#fff' : BRAND + '66'}` }}
                      title={col.label}
                      onClick={() => setEditColor(col.value)}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={saveEditDot}
                  style={{
                    flex: 1, background: BRAND, border: 'none', borderRadius: 7,
                    color: '#fff', fontSize: 11, fontWeight: 700, padding: '7px 0',
                    cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: '0.06em',
                  }}
                >SAVE (Ctrl+Enter)</button>
                <button
                  onClick={cancelEdit}
                  style={{
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 7, color: 'rgba(255,255,255,0.6)', fontSize: 11,
                    padding: '7px 12px', cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >ESC</button>
              </div>
            </div>
          )
        })()}

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute', left: tooltip.sx + 16, top: tooltip.sy - 16,
            background: tooltip.id === 'success' ? 'rgba(16,185,129,0.95)' :
                       tooltip.id === 'error' ? 'rgba(239,68,68,0.95)' :
                       'rgba(10,15,30,0.96)',
            border: `1px solid ${tooltip.id === 'success' ? '#10b981' :
                      tooltip.id === 'error' ? '#ef4444' :
                      BRAND + '55'}`,
            borderRadius: 8, padding: '6px 14px', fontSize: 12,
            color: '#fff', fontWeight: 500,
            pointerEvents: 'none', zIndex: 99, backdropFilter: 'blur(12px)',
            letterSpacing: '0.03em', whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {tooltip.label}
          </div>
        )}

        {/* Connection mode indicator */}
        {isConnectingMode && !connectingFrom.current && (
          <div style={{
            position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
            background: BRAND, padding: '8px 20px', borderRadius: 20,
            fontSize: 12, fontWeight: 600, color: '#fff',
            pointerEvents: 'none', zIndex: 99, whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            🔗 Connection Mode: Click a dot, then click another dot
          </div>
        )}

        {/* Connection selected indicator */}
        {selectedConnData && (
          <div style={{
            position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(239,68,68,0.9)', padding: '8px 20px', borderRadius: 20,
            fontSize: 12, fontWeight: 600, color: '#fff',
            pointerEvents: 'none', zIndex: 99, whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            🔴 Connection selected — click ✕ to delete · double-click to quick-delete
          </div>
        )}

        {/* Empty state */}
        {dots.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', gap: 12,
          }}>
            <svg width="72" height="72" viewBox="0 0 64 64" opacity={0.15}>
              <circle cx="16" cy="16" r="10" fill={BRAND} />
              <circle cx="48" cy="16" r="10" fill={BRAND} opacity="0.7" />
              <circle cx="32" cy="48" r="10" fill={BRAND} opacity="0.5" />
              <path d="M16 16 Q32 30 48 16" stroke="white" strokeWidth="2" fill="none" />
              <path d="M16 16 Q24 38 32 48" stroke="white" strokeWidth="2" fill="none" />
              <path d="M48 16 Q40 38 32 48" stroke="white" strokeWidth="2" fill="none" />
            </svg>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, letterSpacing: '0.05em' }}>
              Type below and press Enter
            </p>
          </div>
        )}

        {/* Hint bar */}
        <div style={{
          position: 'absolute', bottom: 80, left: 16,
          fontSize: 10, color: 'rgba(255,255,255,0.25)',
          lineHeight: 1.8, pointerEvents: 'none', letterSpacing: '0.05em',
          background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: 8,
          backdropFilter: 'blur(8px)',
        }}>
          <div>✨ <strong>Click "Connect Mode"</strong> → click first dot → click second dot</div>
          <div>✏️ Click dot → select · click ✎ → edit label &amp; color</div>
          <div>🔗 Click a connection line → select it · click ✕ → delete</div>
          <div>🖱️ Double-click connection → quick delete</div>
          <div>🎯 Drag dot → move · scroll → zoom · drag canvas → pan</div>
          <div>❌ Click ✕ on selected dot → delete node</div>
        </div>
      </div>

      {/* INPUT AREA */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '12px 16px 20px',
        background: 'transparent',
        flexShrink: 0, zIndex: 10,
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 10,
          width: '100%', maxWidth: 650,
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 16,
          padding: '8px 8px 8px 16px',
          backdropFilter: 'blur(16px)',
          transition: 'border-color 0.2s',
        }}>
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                addDot()
              }
            }}
            placeholder="Type your node name... (Shift+Enter for new line)"
            className="dc-textarea"
            rows={1}
          />
          <button
            onClick={addDot}
            disabled={!inputText.trim()}
            style={{
              background: inputText.trim() ? BRAND : `${BRAND}44`,
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              padding: '8px 20px',
              fontSize: 12,
              fontWeight: 700,
              cursor: inputText.trim() ? 'pointer' : 'not-allowed',
              letterSpacing: '0.08em',
              transition: 'all 0.15s',
              fontFamily: "'IBM Plex Mono', monospace",
              whiteSpace: 'nowrap',
              flexShrink: 0,
              minHeight: '38px',
            }}
          >
            + ADD NODE
          </button>
        </div>
      </div>
    </div>
  )
}