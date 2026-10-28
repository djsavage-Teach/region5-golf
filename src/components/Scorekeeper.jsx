import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getSchoolInfo } from '../lib/schools'

const COACH_PASSWORD = 'Region5$27'
const SITE_ADMIN_PASSWORD = 'BoxEld3r#B33$'

// Digital Signature Canvas Component
function SignatureCanvas({ label, onSave, onClear, initialValue }) {
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'

    if (initialValue) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = initialValue
      setHasDrawn(true)
    }
  }, [initialValue])

  const startDrawing = (e) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
  }

  const draw = (e) => {
    if (!isDrawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
    setHasDrawn(true)
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas && hasDrawn) {
      onSave(canvas.toDataURL())
    }
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    onClear()
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">{label}</label>
        {hasDrawn && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] text-rose-600 font-bold hover:underline"
          >
            Clear
          </button>
        )}
      </div>
      <div className="border border-slate-300 rounded-xl bg-white overflow-hidden shadow-inner touch-none">
        <canvas
          ref={canvasRef}
          width={320}
          height={90}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-20 cursor-crosshair bg-slate-50/50"
        />
      </div>
      <p className="text-[10px] text-slate-400 italic text-center">Sign above using finger or stylus</p>
    </div>
  )
}

export default function Scorekeeper() {
  const [availableGroups, setAvailableGroups] = useState([])
  const [selectedGroupNumber, setSelectedGroupNumber] = useState('')
  const [groupPlayers, setGroupPlayers] = useState([])
  const [scores, setScores] = useState({})
  const [signatures, setSignatures] = useState({}) // { playerId: { playerSig, scorerSig, isLocked, scorerId } }
  const [coursePars, setCoursePars] = useState(Array(18).fill(4))
  const [currentHole, setCurrentHole] = useState(1)
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(null)

  // Sign & Unlock Modal States
  const [signingPlayer, setSigningPlayer] = useState(null)
  const [playerSigTemp, setPlayerSigTemp] = useState('')
  const [scorerSigTemp, setScorerSigTemp] = useState('')
  const [unlockPlayer, setUnlockPlayer] = useState(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState(false)

  // Clear Scores Modal State
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearAdminPassword, setClearAdminPassword] = useState('')
  const [clearError, setClearError] = useState('')
  const [clearingInProgress, setClearingInProgress] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      // Fetch course par values
      const { data: courseData } = await supabase.from('course_settings').select('*').eq('id', 1).single()
      if (courseData && Array.isArray(courseData.pars) && courseData.pars.length === 18) {
        setCoursePars(courseData.pars)
      }

      // Fetch pairings
      const { data: pairingsData, error } = await supabase
        .from('pairings')
        .select(`
          group_number,
          hole_number,
          player_id,
          players (
            id,
            name,
            rank,
            schools ( name )
          )
        `)

      if (error) {
        console.error('Error loading pairings:', error)
        setLoading(false)
        return
      }

      if (pairingsData && pairingsData.length > 0) {
        const groupMap = {}
        pairingsData.forEach((row) => {
          if (!groupMap[row.group_number]) {
            groupMap[row.group_number] = {
              groupNumber: row.group_number,
              holeNumber: row.hole_number,
              players: [],
            }
          }
          if (row.players) {
            groupMap[row.group_number].players.push({
              id: row.players.id,
              name: row.players.name,
              schoolName: row.players.schools?.name || 'Unknown',
            })
          }
        })

        const sortedGroups = Object.values(groupMap).sort((a, b) => a.groupNumber - b.groupNumber)
        setAvailableGroups(sortedGroups)
        if (sortedGroups.length > 0) {
          setSelectedGroupNumber(sortedGroups[0].groupNumber)
        }
      }
      setLoading(false)
    }

    loadData()
  }, [])

  useEffect(() => {
    if (!selectedGroupNumber) return

    const activeGroup = availableGroups.find((g) => g.groupNumber === Number(selectedGroupNumber))
    if (!activeGroup) return

    setGroupPlayers(activeGroup.players)

    const parsedHole = parseInt(activeGroup.holeNumber, 10)
    if (!isNaN(parsedHole)) {
      setCurrentHole(parsedHole)
    }

    async function loadScoresAndSignatures() {
      const playerIds = activeGroup.players.map((p) => p.id)
      if (playerIds.length === 0) return

      // Load scores
      const { data: scoreData } = await supabase
        .from('scores')
        .select('*')
        .in('player_id', playerIds)

      if (scoreData) {
        const scoreMap = {}
        scoreData.forEach((s) => {
          scoreMap[`${s.player_id}-${s.hole_number}`] = s.strokes
        })
        setScores(scoreMap)
      }

      // Load Signatures & Locks
      const { data: sigData } = await supabase
        .from('scorecard_signatures')
        .select('*')
        .in('player_id', playerIds)

      if (sigData) {
        const sigMap = {}
        sigData.forEach((s) => {
          sigMap[s.player_id] = {
            playerSig: s.player_signature,
            scorerSig: s.scorer_signature,
            isLocked: s.is_locked,
            scorerId: s.scorer_id,
          }
        })
        setSignatures(sigMap)
      }
    }

    loadScoresAndSignatures()
  }, [selectedGroupNumber, availableGroups])

  // Cross-Team Scorer Auto-Assignment Rule
  const getScorerForPlayer = (player) => {
    if (!player || groupPlayers.length < 2) return null
    const idx = groupPlayers.findIndex((p) => p.id === player.id)
    if (idx === -1) return null

    if (
      groupPlayers.length === 4 &&
      groupPlayers[0].schoolName === groupPlayers[1].schoolName &&
      groupPlayers[2].schoolName === groupPlayers[3].schoolName
    ) {
      const scorerIdx = (idx + 2) % 4
      return groupPlayers[scorerIdx]
    }

    for (let offset = 1; offset < groupPlayers.length; offset++) {
      const candidateIdx = (idx + offset) % groupPlayers.length
      const candidate = groupPlayers[candidateIdx]
      if (candidate && candidate.schoolName !== player.schoolName) {
        return candidate
      }
    }

    const fallbackIdx = (idx + 1) % groupPlayers.length
    return groupPlayers[fallbackIdx]
  }

  const isPlayerLocked = (playerId) => {
    return !!signatures[playerId]?.isLocked
  }

  const handleScoreChange = async (playerId, holeNum, strokesValue) => {
    if (isPlayerLocked(playerId)) {
      setUnlockPlayer(groupPlayers.find((p) => p.id === playerId))
      return
    }

    const strokes = Math.max(0, parseInt(strokesValue, 10) || 0)
    const key = `${playerId}-${holeNum}`

    setScores((prev) => ({ ...prev, [key]: strokes }))
    setSavingStatus({ type: 'info', text: 'Saving...' })

    const { error } = await supabase.from('scores').upsert(
      {
        player_id: playerId,
        hole_number: holeNum,
        strokes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id,hole_number' }
    )

    if (error) {
      console.error('Error saving score:', error)
      setSavingStatus({ type: 'error', text: `Save error: ${error.message}` })
    } else {
      setSavingStatus({ type: 'success', text: '[OK] Saved' })
      setTimeout(() => setSavingStatus(null), 1500)
    }
  }

  const getPlayerTotal = (playerId) => {
    let total = 0
    for (let h = 1; h <= 18; h++) {
      total += scores[`${playerId}-${h}`] || 0
    }
    return total
  }

  const getPlayerToPar = (playerId) => {
    let strokesTotal = 0
    let parTotal = 0
    let count = 0
    for (let h = 1; h <= 18; h++) {
      const s = scores[`${playerId}-${h}`]
      if (s && s > 0) {
        strokesTotal += s
        parTotal += coursePars[h - 1] || 4
        count++
      }
    }
    if (count === 0) return 'E'
    const diff = strokesTotal - parTotal
    if (diff === 0) return 'E'
    return diff > 0 ? `+${diff}` : `${diff}`
  }

  const handleOpenSignModal = (player) => {
    setSigningPlayer(player)
    const existing = signatures[player.id]
    setPlayerSigTemp(existing?.playerSig || '')
    setScorerSigTemp(existing?.scorerSig || '')
  }

  const handleSaveSignaturesAndLock = async () => {
    if (!signingPlayer) return
    if (!playerSigTemp || !scorerSigTemp) {
      alert('Both Player Signature and Scorer Signature are required to finalize the scorecard.')
      return
    }

    const scorer = getScorerForPlayer(signingPlayer)

    const payload = {
      player_id: signingPlayer.id,
      scorer_id: scorer?.id || null,
      player_signature: playerSigTemp,
      scorer_signature: scorerSigTemp,
      is_locked: true,
      signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('scorecard_signatures')
      .upsert(payload, { onConflict: 'player_id' })

    if (error) {
      alert(`Failed to save signatures: ${error.message}`)
    } else {
      setSignatures((prev) => ({
        ...prev,
        [signingPlayer.id]: {
          playerSig: playerSigTemp,
          scorerSig: scorerSigTemp,
          isLocked: true,
          scorerId: scorer?.id,
        },
      }))
      setSigningPlayer(null)
    }
  }

  const handleUnlockSubmit = async (e) => {
    e.preventDefault()
    if (unlockPassword === COACH_PASSWORD) {
      if (!unlockPlayer) return

      const { error } = await supabase
        .from('scorecard_signatures')
        .update({ is_locked: false })
        .eq('player_id', unlockPlayer.id)

      if (error) {
        alert(`Unlock error: ${error.message}`)
      } else {
        setSignatures((prev) => ({
          ...prev,
          [unlockPlayer.id]: {
            ...prev[unlockPlayer.id],
            isLocked: false,
          },
        }))
        setUnlockPlayer(null)
        setUnlockPassword('')
        setUnlockError(false)
      }
    } else {
      setUnlockError(true)
    }
  }

  // Clear Scores Logic (Wipes scores & signatures without pushing to season archive)
  const handleClearScoresSubmit = async (e) => {
    e.preventDefault()
    if (clearAdminPassword !== SITE_ADMIN_PASSWORD) {
      setClearError('Incorrect Site Admin Password.')
      return
    }

    setClearingInProgress(true)
    setClearError('')

    try {
      const { error: errScores } = await supabase.from('scores').delete().neq('id', 0)
      const { error: errSigs } = await supabase.from('scorecard_signatures').delete().neq('id', 0)

      if (errScores || errSigs) {
        throw errScores || errSigs
      }

      setScores({})
      setSignatures({})
      setShowClearModal(false)
      setClearAdminPassword('')
    } catch (err) {
      console.error('Error clearing scores:', err)
      setClearError(`Failed to clear scores: ${err.message}`)
    } finally {
      setClearingInProgress(false)
    }
  }

  const handlePrevHole = () => setCurrentHole((h) => (h === 1 ? 18 : h - 1))
  const handleNextHole = () => setCurrentHole((h) => (h === 18 ? 1 : h + 1))

  const activeGroupObj = availableGroups.find((g) => g.groupNumber === Number(selectedGroupNumber))

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header & Group Selection Card */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-6 rounded-3xl shadow-xl shadow-slate-200/50 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">Live Scorekeeper Entry</h2>
            <p className="text-xs text-slate-500">
              Select assigned group, record hole-by-hole strokes, and sign scorecards upon round completion.
            </p>
          </div>

          {savingStatus && (
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                savingStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                  : savingStatus.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border-rose-200/80'
                  : 'bg-slate-100 text-slate-600 border-slate-200/80'
              }`}
            >
              {savingStatus.text}
            </span>
          )}
        </div>

        {availableGroups.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500">
            No saved pairings found. Please go to Pairings and click <strong>[Save Pairings]</strong> first.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Select Your Hole Group:
              </label>
              <select
                value={selectedGroupNumber}
                onChange={(e) => setSelectedGroupNumber(e.target.value)}
                className="w-full bg-white border border-slate-200/90 text-slate-900 p-3 rounded-2xl font-bold focus:ring-2 focus:ring-emerald-500/15 focus:border-emerald-500 outline-none text-sm shadow-xs"
              >
                {availableGroups.map((g) => (
                  <option key={g.groupNumber} value={g.groupNumber}>
                    Group #{g.groupNumber} — Hole {g.holeNumber} ({g.players.length} Players)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
                Active Hole Focus:
              </label>
              <select
                value={currentHole}
                onChange={(e) => setCurrentHole(Number(e.target.value))}
                className="w-full bg-white border border-slate-200/90 text-slate-900 p-3 rounded-2xl font-bold focus:ring-2 focus:ring-emerald-500/15 focus:border-emerald-500 outline-none text-sm shadow-xs"
              >
                {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    Hole #{h}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {activeGroupObj && groupPlayers.length > 0 && (
        <div className="bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-5 sm:p-6 space-y-6 shadow-xl shadow-slate-200/50">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <span className="font-extrabold text-emerald-800 text-sm">
              Hole #{currentHole} Focus (Group #{activeGroupObj.groupNumber} — Hole {activeGroupObj.holeNumber})
            </span>
            <div className="flex gap-2">
              <button
                onClick={handlePrevHole}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition-colors"
              >
                Prev Hole
              </button>
              <button
                onClick={handleNextHole}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold border border-slate-200 transition-colors"
              >
                Next Hole
              </button>
            </div>
          </div>

          {/* Stepper Input Cards with Auto-Assigned Scorer & Lock Badge */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {groupPlayers.map((player) => {
              const currentStrokes = scores[`${player.id}-${currentHole}`] ?? ''
              const total = getPlayerTotal(player.id)
              const pSchoolInfo = getSchoolInfo(player.schoolName)
              const scorer = getScorerForPlayer(player)
              const locked = isPlayerLocked(player.id)

              return (
                <div
                  key={player.id}
                  className={`bg-white/90 border-l-4 border p-4 rounded-2xl space-y-3.5 shadow-sm transition-all ${
                    locked ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200/80'
                  }`}
                  style={{ borderLeftColor: pSchoolInfo.color || '#94a3b8' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate pr-1">
                      {pSchoolInfo.url && (
                        <img
                          src={pSchoolInfo.url}
                          alt={player.schoolName}
                          className="w-6 h-6 object-contain bg-slate-50 p-0.5 rounded border border-slate-200 shrink-0"
                        />
                      )}
                      <div className="truncate">
                        <span className="font-extrabold text-slate-900 text-sm block truncate">{player.name}</span>
                        <span className="text-[10px] text-slate-500 block truncate">{player.schoolName}</span>
                      </div>
                    </div>

                    {locked && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0">
                        🔒 Locked
                      </span>
                    )}
                  </div>

                  {/* Auto-Assigned Scorer Line */}
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-200/80 text-[10px] font-medium text-slate-600 flex justify-between items-center">
                    <span>Scorer Assigned:</span>
                    <span className="font-bold text-slate-900 truncate pl-1">
                      {scorer ? `${scorer.name} (${scorer.schoolName})` : 'Self'}
                    </span>
                  </div>

                  {/* Hole Stepper Controls */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <label className="text-xs text-slate-500 font-bold">Hole #{currentHole}:</label>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          const val = currentStrokes === '' ? 4 : Math.max(1, Number(currentStrokes) - 1)
                          handleScoreChange(player.id, currentHole, val)
                        }}
                        className="w-10 h-10 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-40 text-slate-900 font-black rounded-xl border border-slate-200 text-lg flex items-center justify-center active:scale-95 transition-all select-none shadow-xs"
                      >
                        −
                      </button>

                      <div className="w-12 h-10 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center font-black text-emerald-800 text-lg font-mono shadow-inner">
                        {currentStrokes !== '' ? currentStrokes : '—'}
                      </div>

                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          const val = currentStrokes === '' ? 4 : Number(currentStrokes) + 1
                          handleScoreChange(player.id, currentHole, val)
                        }}
                        className="w-10 h-10 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-40 text-slate-900 font-black rounded-xl border border-slate-200 text-lg flex items-center justify-center active:scale-95 transition-all select-none shadow-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-500">Total:</span>
                    <span className="font-bold text-slate-900 font-mono">{total > 0 ? total : '-'}</span>
                  </div>

                  {/* Sign or Unlock Button */}
                  {locked ? (
                    <button
                      type="button"
                      onClick={() => setUnlockPlayer(player)}
                      className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 font-bold rounded-xl border border-amber-300 text-xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>🔒 Unlock Scorecard (Coach)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenSignModal(player)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <span>✍️ Sign & Lock Round</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Full Scorecard Table Grid */}
          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <span className="text-xs font-bold text-slate-400 uppercase block tracking-wider">Full Scorecard Grid:</span>
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500">
                    <th className="p-2.5 min-w-[140px]">Player</th>
                    {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
                      <th
                        key={h}
                        className={`p-2 text-center w-8 ${
                          h === currentHole ? 'text-emerald-800 font-black bg-emerald-50' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                    <th className="p-2.5 text-center font-bold text-slate-900">TOT</th>
                    <th className="p-2.5 text-center font-bold text-slate-900">LOCK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupPlayers.map((player) => {
                    const pSchoolInfo = getSchoolInfo(player.schoolName)
                    const locked = isPlayerLocked(player.id)

                    return (
                      <tr key={player.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-2.5 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            {pSchoolInfo.url && (
                              <img
                                src={pSchoolInfo.url}
                                alt={player.schoolName}
                                className="w-4 h-4 object-contain bg-slate-50 p-0.5 rounded border border-slate-200 shrink-0"
                              />
                            )}
                            <div>
                              <div>{player.name}</div>
                              <div className="text-[10px] text-slate-400 font-normal">{player.schoolName}</div>
                            </div>
                          </div>
                        </td>
                        {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => {
                          const val = scores[`${player.id}-${h}`] ?? ''
                          return (
                            <td
                              key={h}
                              className={`p-1 text-center font-mono ${
                                h === currentHole ? 'bg-emerald-50/40' : ''
                              }`}
                            >
                              <input
                                type="number"
                                disabled={locked}
                                value={val}
                                onChange={(e) => handleScoreChange(player.id, h, e.target.value)}
                                className="w-7 h-7 bg-white border border-slate-200/80 disabled:bg-slate-100 text-center text-slate-900 font-bold rounded text-xs focus:outline-none focus:border-emerald-500"
                              />
                            </td>
                          )
                        })}
                        <td className="p-2.5 text-center font-extrabold text-emerald-700 font-mono">
                          {getPlayerTotal(player.id) || '-'}
                        </td>
                        <td className="p-2.5 text-center font-mono text-xs">
                          {locked ? (
                            <span className="text-amber-600 font-bold">🔒 Locked</span>
                          ) : (
                            <span className="text-slate-400">Open</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Inconspicuous Clear Scores Footer Link */}
      <div className="pt-6 pb-2 text-center">
        <button
          type="button"
          onClick={() => setShowClearModal(true)}
          className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition-colors underline decoration-dotted underline-offset-4"
        >
          Clear All Active Scores & Signatures
        </button>
      </div>

      {/* Clear Scores Admin Modal */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto text-xl shadow-xs">
              🗑️
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">Clear Active Scores</h3>
              <p className="text-xs text-slate-500 mt-1">
                This will delete all current scores and signatures for this round without saving to season standings. Enter Site Admin Password to confirm.
              </p>
            </div>

            <form onSubmit={handleClearScoresSubmit} className="space-y-4 pt-1">
              <input
                type="password"
                value={clearAdminPassword}
                onChange={(e) => {
                  setClearAdminPassword(e.target.value)
                  if (clearError) setClearError('')
                }}
                placeholder="Enter Site Admin Password..."
                className="w-full bg-white border border-slate-200/90 text-slate-900 text-center font-mono text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
                autoFocus
              />

              {clearError && <p className="text-xs font-bold text-rose-600">{clearError}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowClearModal(false)
                    setClearAdminPassword('')
                    setClearError('')
                  }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-2xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clearingInProgress}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 text-white font-bold rounded-2xl text-xs shadow-lg shadow-rose-600/20 active:scale-95 transition-all"
                >
                  {clearingInProgress ? 'Clearing...' : 'Clear All Scores'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sign & Lock Modal with Full 18-Hole Attestation Review Grid */}
      {signingPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl p-5 sm:p-6 max-w-2xl w-full shadow-2xl space-y-5 my-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">Review & Sign Official Scorecard</h3>
                <p className="text-xs text-slate-500">
                  Verify hole-by-hole strokes for <strong className="text-slate-900">{signingPlayer.name}</strong> before attesting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSigningPlayer(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {/* Total Summary Header */}
            <div className="grid grid-cols-3 gap-3 bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200/80 text-center">
              <div>
                <span className="text-[10px] font-bold text-emerald-800 uppercase block">Player</span>
                <span className="text-sm font-extrabold text-slate-900 truncate block">
                  {signingPlayer.name}
                </span>
                <span className="text-[10px] text-slate-500 block">{signingPlayer.schoolName}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-800 uppercase block">Total Strokes</span>
                <span className="text-lg font-mono font-black text-slate-900">
                  {getPlayerTotal(signingPlayer.id) || '0'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-emerald-800 uppercase block">Score To Par</span>
                <span className="text-lg font-mono font-black text-emerald-700">
                  {getPlayerToPar(signingPlayer.id)}
                </span>
              </div>
            </div>

            {/* 18-Hole Attestation Review Scorecard */}
            <div className="space-y-3 font-mono text-xs">
              <span className="text-[10px] font-sans font-bold text-slate-400 uppercase block tracking-wider">
                Hole-by-Hole Stroke Breakdown:
              </span>

              {/* Front 9 */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500 text-[10px]">
                      <th className="p-1.5 border-r border-slate-200 font-sans font-bold text-left pl-2">HOLE</th>
                      {Array.from({ length: 9 }, (_, i) => (
                        <th key={i + 1} className="p-1.5 border-r border-slate-200">{i + 1}</th>
                      ))}
                      <th className="p-1.5 bg-slate-200 font-bold text-slate-700">OUT</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-200 text-slate-400 text-[10px]">
                      <td className="p-1 border-r border-slate-200 font-sans font-semibold text-left pl-2">PAR</td>
                      {coursePars.slice(0, 9).map((p, idx) => (
                        <td key={idx} className="p-1 border-r border-slate-200">{p}</td>
                      ))}
                      <td className="p-1 bg-slate-100 font-bold text-slate-600">
                        {coursePars.slice(0, 9).reduce((a, b) => a + b, 0)}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200 font-bold text-slate-900 text-xs">
                      <td className="p-1.5 border-r border-slate-200 font-sans font-bold text-left pl-2 text-emerald-800">SCORE</td>
                      {Array.from({ length: 9 }, (_, i) => {
                        const h = i + 1
                        const val = scores[`${signingPlayer.id}-${h}`]
                        const par = coursePars[i]
                        const diff = val ? val - par : null
                        return (
                          <td key={h} className="p-1.5 border-r border-slate-200">
                            {val ? (
                              <span
                                className={`inline-block w-5 h-5 leading-5 text-center rounded ${
                                  diff < 0
                                    ? 'bg-rose-100 text-rose-700 font-black border border-rose-300'
                                    : diff > 0
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'text-slate-900'
                                }`}
                              >
                                {val}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="p-1.5 bg-slate-100 font-black text-emerald-800">
                        {Array.from({ length: 9 }, (_, i) => scores[`${signingPlayer.id}-${i + 1}`] || 0).reduce((a, b) => a + b, 0) || '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Back 9 */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500 text-[10px]">
                      <th className="p-1.5 border-r border-slate-200 font-sans font-bold text-left pl-2">HOLE</th>
                      {Array.from({ length: 9 }, (_, i) => (
                        <th key={i + 10} className="p-1.5 border-r border-slate-200">{i + 10}</th>
                      ))}
                      <th className="p-1.5 bg-slate-200 font-bold text-slate-700">IN</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-200 text-slate-400 text-[10px]">
                      <td className="p-1 border-r border-slate-200 font-sans font-semibold text-left pl-2">PAR</td>
                      {coursePars.slice(9, 18).map((p, idx) => (
                        <td key={idx} className="p-1 border-r border-slate-200">{p}</td>
                      ))}
                      <td className="p-1 bg-slate-100 font-bold text-slate-600">
                        {coursePars.slice(9, 18).reduce((a, b) => a + b, 0)}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200 font-bold text-slate-900 text-xs">
                      <td className="p-1.5 border-r border-slate-200 font-sans font-bold text-left pl-2 text-emerald-800">SCORE</td>
                      {Array.from({ length: 9 }, (_, i) => {
                        const h = i + 10
                        const val = scores[`${signingPlayer.id}-${h}`]
                        const par = coursePars[i + 9]
                        const diff = val ? val - par : null
                        return (
                          <td key={h} className="p-1.5 border-r border-slate-200">
                            {val ? (
                              <span
                                className={`inline-block w-5 h-5 leading-5 text-center rounded ${
                                  diff < 0
                                    ? 'bg-rose-100 text-rose-700 font-black border border-rose-300'
                                    : diff > 0
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'text-slate-900'
                                }`}
                              >
                                {val}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="p-1.5 bg-slate-100 font-black text-emerald-800">
                        {Array.from({ length: 9 }, (_, i) => scores[`${signingPlayer.id}-${i + 10}`] || 0).reduce((a, b) => a + b, 0) || '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Signature Pad Section */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <SignatureCanvas
                label={`1. Player Signature (${signingPlayer.name})`}
                initialValue={playerSigTemp}
                onSave={(data) => setPlayerSigTemp(data)}
                onClear={() => setPlayerSigTemp('')}
              />

              <SignatureCanvas
                label={`2. Scorer/Marker Signature (${getScorerForPlayer(signingPlayer)?.name || 'Scorer'})`}
                initialValue={scorerSigTemp}
                onSave={(data) => setScorerSigTemp(data)}
                onClear={() => setScorerSigTemp('')}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSigningPlayer(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSignaturesAndLock}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl text-xs shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
              >
                🔒 Attest & Lock Scorecard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coach Password Unlock Modal */}
      {unlockPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 bg-amber-50 border border-amber-200 text-amber-700 rounded-2xl flex items-center justify-center mx-auto text-xl shadow-xs">
              🔒
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">Coach Unlock Authorization</h3>
              <p className="text-xs text-slate-500 mt-1">
                Scorecard for <strong className="text-slate-900">{unlockPlayer.name}</strong> is signed and locked. Enter coach password to unlock editing.
              </p>
            </div>

            <form onSubmit={handleUnlockSubmit} className="space-y-4">
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => {
                  setUnlockPassword(e.target.value)
                  if (unlockError) setUnlockError(false)
                }}
                placeholder="Enter Coach Password..."
                className="w-full bg-white border border-slate-200/90 text-slate-900 text-center font-mono text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15"
                autoFocus
              />

              {unlockError && (
                <p className="text-xs font-bold text-rose-600">Incorrect coach password.</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUnlockPlayer(null)
                    setUnlockPassword('')
                    setUnlockError(false)
                  }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-2xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-2xl text-xs shadow-lg shadow-amber-600/20 active:scale-95 transition-all"
                >
                  Unlock Scorecard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}