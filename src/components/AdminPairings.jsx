import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSchoolInfo } from '../lib/schools'

const HOLE_SEQUENCE = [
  '1A', '1B', '18A', '18B', '17A', '17B', '16A', '16B',
  '15A', '15B', '14A', '14B', '13A', '13B', '12A', '12B',
  '11A', '11B', '10A', '10B', '9A', '9B', '8A', '8B',
  '7A', '7B', '6A', '6B', '5A', '5B', '4A', '4B', '3A', '3B', '2A', '2B'
]

const ALL_HOLE_OPTIONS = Array.from({ length: 18 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat()

export default function AdminPairings() {
  const [schools, setSchools] = useState([])
  const [dbPlayers, setDbPlayers] = useState([])
  const [pairingMode, setPairingMode] = useState('single') // 'single' | 'double'
  const [schoolPairings, setSchoolPairings] = useState({})
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [dragOverGroup, setDragOverGroup] = useState(null)
  const [showMobileRoster, setShowMobileRoster] = useState(false)

  // Course & Par Settings
  const [courseName, setCourseName] = useState('Region 5 Championship Course')
  const [holePars, setHolePars] = useState(Array(18).fill(4))
  const [savingCourse, setSavingCourse] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      const { data: courseData } = await supabase.from('course_settings').select('*').eq('id', 1).single()
      if (courseData) {
        if (courseData.course_name) setCourseName(courseData.course_name)
        if (Array.isArray(courseData.pars) && courseData.pars.length === 18) {
          setHolePars(courseData.pars)
        }
      }

      const { data: schoolData } = await supabase.from('schools').select('*').order('name')
      if (schoolData) {
        setSchools(schoolData)
        // Default Single Pairings: 4 schools in M1, 3 schools in M2
        const initialMap = {}
        schoolData.forEach((s, idx) => { initialMap[s.id] = idx < 4 ? 1 : 2 })
        setSchoolPairings(initialMap)
      }

      const { data: playerData } = await supabase.from('players').select(`
          id, name, rank, school_id, schools ( name )
        `)
      if (playerData) setDbPlayers(playerData)

      const { data: savedPairings, error: pairingsError } = await supabase
        .from('pairings')
        .select(`
          group_number,
          hole_number,
          player_id,
          players (
            id,
            name,
            rank,
            school_id,
            schools ( name )
          )
        `)
        .order('group_number')

      if (!pairingsError && savedPairings && savedPairings.length > 0) {
        const groupMap = {}
        savedPairings.forEach((row) => {
          const gNum = row.group_number
          if (!groupMap[gNum]) {
            groupMap[gNum] = {
              id: gNum,
              hole: row.hole_number,
              seed: Math.floor((gNum - 1) / 2) + 1,
              matchupName: 'Matchup',
              players: []
            }
          }
          if (row.players) {
            groupMap[gNum].players.push({
              id: row.players.id,
              name: row.players.name,
              schoolId: row.players.school_id,
              schoolName: row.players.schools?.name || 'Unknown',
              seed: row.players.rank
            })
          }
        })

        const loadedGroups = Object.values(groupMap).sort((a, b) => a.id - b.id)
        setGroups(loadedGroups)
      }

      setLoading(false)
    }

    loadData()
  }, [])

  const handleModeChange = (mode) => {
    setPairingMode(mode)
    setMessage(null)

    // Re-assign default school matchups when switching modes
    setSchoolPairings((prev) => {
      const updated = { ...prev }
      schools.forEach((s, idx) => {
        if (mode === 'single') {
          updated[s.id] = idx < 4 ? 1 : 2
        } else {
          updated[s.id] = idx < 2 ? 1 : idx < 4 ? 2 : 3
        }
      })
      return updated
    })
  }

  const handleSaveCourseSettings = async () => {
    setSavingCourse(true)
    setMessage(null)

    const sanitizedPars = holePars.map((p) => {
      const num = parseInt(p, 10)
      if (isNaN(num)) return 4
      return Math.max(3, Math.min(6, num))
    })

    setHolePars(sanitizedPars)

    const { error } = await supabase.from('course_settings').upsert({
      id: 1,
      course_name: courseName,
      pars: sanitizedPars,
      updated_at: new Date().toISOString()
    })

    if (error) {
      setMessage({ type: 'error', text: `Failed to save course info: ${error.message}` })
    } else {
      setMessage({ type: 'success', text: '[OK] Course name and par settings saved!' })
    }
    setSavingCourse(false)
  }

  const handleParChange = (index, value) => {
    const newPars = [...holePars]
    if (value === '') {
      newPars[index] = ''
      setHolePars(newPars)
      return
    }
    const valStr = value.length > 1 ? value.slice(-1) : value
    const num = parseInt(valStr, 10)
    if (!isNaN(num)) {
      newPars[index] = num
      setHolePars(newPars)
    }
  }

  const setSchoolGroup = (sId, targetGroup) => {
    setSchoolPairings((prev) => ({ ...prev, [sId]: targetGroup }))
  }

  const getEffectivePlayer = (school, seed) => {
    const existing = dbPlayers.find(
      (p) => p.school_id === school.id && p.rank === seed && p.name && p.name.trim() !== ''
    )
    if (existing) {
      return { id: existing.id, name: existing.name, schoolId: school.id, schoolName: school.name, seed }
    }
    return { id: `temp-${school.id}-seed-${seed}`, name: `Player ${seed}`, schoolId: school.id, schoolName: school.name, seed }
  }

  // Generate Pairings Button Handler
  const handleGeneratePairings = () => {
    setMessage(null)

    if (pairingMode === 'single') {
      // SINGLE PAIRINGS (1-vs-1 across 2 Matchups: All Matchup 1 first, then all Matchup 2)
      const m1Schools = schools.filter((s) => schoolPairings[s.id] === 1)
      const m2Schools = schools.filter((s) => schoolPairings[s.id] === 2)

      if (m1Schools.length === 0 && m2Schools.length === 0) {
        setMessage({ type: 'error', text: 'Please assign schools to Matchup 1 or Matchup 2.' })
        return
      }

      const rawGroups = []

      // All Matchup 1 groups first (Seeds 1 to 8)
      if (m1Schools.length > 0) {
        for (let seed = 1; seed <= 8; seed++) {
          rawGroups.push({
            matchupName: 'Matchup 1',
            seed,
            players: m1Schools.map((school) => getEffectivePlayer(school, seed)),
          })
        }
      }

      // Then all Matchup 2 groups (Seeds 1 to 8)
      if (m2Schools.length > 0) {
        for (let seed = 1; seed <= 8; seed++) {
          rawGroups.push({
            matchupName: 'Matchup 2',
            seed,
            players: m2Schools.map((school) => getEffectivePlayer(school, seed)),
          })
        }
      }

      const finalGroups = rawGroups.map((g, idx) => ({
        id: idx + 1,
        hole: HOLE_SEQUENCE[idx] || `${idx + 1}A`,
        seed: g.seed,
        matchupName: g.matchupName,
        players: g.players,
      }))

      setGroups(finalGroups)
      setMessage({ type: 'success', text: `[OK] Generated ${finalGroups.length} Single Pairing groups!` })
    } else {
      // DOUBLE PAIRINGS (2-vs-2 across 3 Matchups: All Matchup 1 first, then Matchup 2, then Matchup 3)
      const m1Schools = schools.filter((s) => schoolPairings[s.id] === 1)
      const m2Schools = schools.filter((s) => schoolPairings[s.id] === 2)
      const m3Schools = schools.filter((s) => schoolPairings[s.id] === 3)

      if (m1Schools.length === 0 && m2Schools.length === 0 && m3Schools.length === 0) {
        setMessage({ type: 'error', text: 'Please assign schools to Matchup 1, Matchup 2, or Matchup 3.' })
        return
      }

      const getPair = (school, seed1, seed2) => [
        getEffectivePlayer(school, seed1),
        getEffectivePlayer(school, seed2)
      ]

      const buildDoubleGroupsForMatchup = (schoolsList, matchupName) => {
        const list = []
        if (schoolsList.length === 0) return list

        if (schoolsList.length === 2) {
          // 2-School Matchup: 4 groups of 4 players (1,2 / 3,4 / 5,6 / 7,8)
          const [tA, tB] = schoolsList
          const seedPairs = [[1, 2], [3, 4], [5, 6], [7, 8]]
          seedPairs.forEach(([s1, s2]) => {
            list.push({
              matchupName,
              seed: s1,
              players: [...getPair(tA, s1, s2), ...getPair(tB, s1, s2)]
            })
          })
        } else if (schoolsList.length === 3) {
          // 3-School Matchup: 6 groups in 3-way rotation
          const [t1, t2, t3] = schoolsList
          const blocks = [
            { tA: t1, bA: [1, 2], tB: t2, bB: [1, 2], seed: 1 },
            { tA: t3, bA: [1, 2], tB: t1, bB: [3, 4], seed: 1 },
            { tA: t2, bA: [3, 4], tB: t3, bB: [3, 4], seed: 3 },
            { tA: t1, bA: [5, 6], tB: t2, bB: [5, 6], seed: 5 },
            { tA: t3, bA: [5, 6], tB: t1, bB: [7, 8], seed: 5 },
            { tA: t2, bA: [7, 8], tB: t3, bB: [7, 8], seed: 7 },
          ]
          blocks.forEach((b) => {
            list.push({
              matchupName,
              seed: b.seed,
              players: [...getPair(b.tA, b.bA[0], b.bA[1]), ...getPair(b.tB, b.bB[0], b.bB[1])]
            })
          })
        } else {
          // Fallback for 4+ schools
          for (let i = 0; i < schoolsList.length; i += 2) {
            if (i + 1 < schoolsList.length) {
              const tA = schoolsList[i]
              const tB = schoolsList[i + 1]
              const seedPairs = [[1, 2], [3, 4], [5, 6], [7, 8]]
              seedPairs.forEach(([s1, s2]) => {
                list.push({
                  matchupName,
                  seed: s1,
                  players: [...getPair(tA, s1, s2), ...getPair(tB, s1, s2)]
                })
              })
            }
          }
        }
        return list
      }

      const rawG1 = buildDoubleGroupsForMatchup(m1Schools, 'Matchup 1')
      const rawG2 = buildDoubleGroupsForMatchup(m2Schools, 'Matchup 2')
      const rawG3 = buildDoubleGroupsForMatchup(m3Schools, 'Matchup 3')

      const allRaw = [...rawG1, ...rawG2, ...rawG3]
      const finalGroups = allRaw.map((g, idx) => ({
        id: idx + 1,
        hole: HOLE_SEQUENCE[idx] || `${idx + 1}A`,
        seed: g.seed,
        matchupName: g.matchupName,
        players: g.players
      }))

      setGroups(finalGroups)
      setMessage({ type: 'success', text: `[OK] Generated ${finalGroups.length} Double Pairing groups!` })
    }
  }

  const handleSavePairings = async () => {
    if (groups.length === 0) return
    setSaving(true)
    setMessage(null)

    try {
      const { error: deleteError } = await supabase.from('pairings').delete().neq('id', 0)
      if (deleteError && deleteError.code !== 'PGRST116') {
        console.warn('Clear pairings notice:', deleteError)
      }

      const rowsToInsert = []
      for (const group of groups) {
        for (const player of group.players) {
          let realPlayerId = player.id

          if (typeof player.id === 'string' && player.id.startsWith('temp-')) {
            const { data: newPlayerData, error: playerError } = await supabase
              .from('players')
              .insert({ name: player.name, school_id: player.schoolId, rank: player.seed })
              .select()

            if (playerError) throw playerError
            if (newPlayerData && newPlayerData[0]) {
              realPlayerId = newPlayerData[0].id
            }
          }

          rowsToInsert.push({
            group_number: group.id,
            hole_number: group.hole,
            player_id: realPlayerId,
          })
        }
      }

      const { error: insertError } = await supabase.from('pairings').insert(rowsToInsert)
      if (insertError) throw insertError

      setMessage({ type: 'success', text: '[OK] Pairings saved! Scorekeeper tab is ready.' })
    } catch (err) {
      console.error('Error saving pairings:', err)
      setMessage({ type: 'error', text: `Save failed: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  const handleDragStart = (e, player, sourceGroupId = null) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ player, sourceGroupId }))
  }

  const handleDragOver = (e, groupId) => {
    e.preventDefault()
    setDragOverGroup(groupId)
  }

  const handleDragLeave = () => setDragOverGroup(null)

  const handleDrop = (e, targetGroupId) => {
    e.preventDefault()
    setDragOverGroup(null)
    const rawData = e.dataTransfer.getData('text/plain')
    if (!rawData) return

    const { player, sourceGroupId } = JSON.parse(rawData)

    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (sourceGroupId && group.id === sourceGroupId) {
          return { ...group, players: group.players.filter((p) => p.id !== player.id) }
        }
        if (group.id === targetGroupId) {
          if (group.players.some((p) => p.id === player.id)) return group
          return { ...group, players: [...group.players, player] }
        }
        return group
      })
    )
  }

  const handleRemovePlayerFromGroup = (groupId, playerId) => {
    setGroups(groups.map((g) => (g.id === groupId ? { ...g, players: g.players.filter((p) => p.id !== playerId) } : g)))
  }

  const handleUpdateGroupHole = (groupId, newHole) => {
    const seqIndex = HOLE_SEQUENCE.indexOf(newHole)

    setGroups((prevGroups) => {
      const targetIdx = prevGroups.findIndex((g) => g.id === groupId)
      if (targetIdx === -1 || seqIndex === -1) {
        return prevGroups.map((g) => (g.id === groupId ? { ...g, hole: newHole } : g))
      }

      return prevGroups.map((group, idx) => {
        if (idx < targetIdx) {
          return group
        }
        const offset = idx - targetIdx
        const nextSeqIndex = (seqIndex + offset) % HOLE_SEQUENCE.length
        return {
          ...group,
          hole: HOLE_SEQUENCE[nextSeqIndex],
        }
      })
    })
  }

  const handleUpdateGroupSeed = (groupId, seed) => {
    setGroups(groups.map((g) => (g.id === groupId ? { ...g, seed } : g)))
  }

  const getMatchupBadgeStyle = (matchupName) => {
    if (matchupName === 'Matchup 1') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
    if (matchupName === 'Matchup 2') return 'bg-blue-50 text-blue-800 border-blue-200'
    return 'bg-purple-50 text-purple-800 border-purple-200'
  }

  const group1List = schools.filter((s) => schoolPairings[s.id] === 1)
  const group2List = schools.filter((s) => schoolPairings[s.id] === 2)
  const group3List = schools.filter((s) => schoolPairings[s.id] === 3)
  const totalPar = holePars.reduce((a, b) => a + (parseInt(b, 10) || 4), 0)

  return (
    <div className="space-y-6">
      {/* Course Name & Par Setup Card */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-6 rounded-3xl shadow-xl shadow-slate-200/50 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-black text-emerald-800">Course & Par Setup</h2>
            <p className="text-xs text-slate-500">
              Set the golf course name and par values for live leaderboard calculations.
            </p>
          </div>
          <button
            onClick={handleSaveCourseSettings}
            disabled={savingCourse}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all"
          >
            {savingCourse ? 'Saving...' : '💾 Save Course Info'}
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Course Name:</label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g. Eagle Mountain Golf Course"
              className="w-full sm:w-1/2 bg-white border border-slate-200/90 text-slate-900 px-3.5 py-2 rounded-xl text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase">Hole Par Values (18 Holes):</label>
              <span className="text-xs font-bold text-emerald-700 font-mono">Total Par: {totalPar}</span>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-18 gap-1.5">
              {holePars.map((p, idx) => (
                <div key={idx} className="bg-slate-50/80 p-1.5 rounded-xl border border-slate-200/80 text-center">
                  <span className="block text-[10px] text-slate-400 font-mono font-bold">H{idx + 1}</span>
                  <input
                    type="number"
                    min="3"
                    max="6"
                    value={p}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleParChange(idx, e.target.value)}
                    className="w-full bg-white border border-slate-200 text-center text-slate-900 font-extrabold text-xs py-1 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Shotgun Starting Hole Builder Controls */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-6 rounded-3xl shadow-xl shadow-slate-200/50 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">Shotgun Starting Hole Builder</h2>
            <p className="text-xs text-slate-500">
              Select pairing format, configure school matchups, then click <strong>Generate Pairings</strong>.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleGeneratePairings}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all active:scale-95"
            >
              ⚡ Generate Pairings
            </button>

            {groups.length > 0 && (
              <button
                onClick={handleSavePairings}
                disabled={saving}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-blue-600/20 transition-all active:scale-95"
              >
                {saving ? 'Saving...' : '💾 Save Pairings'}
              </button>
            )}
          </div>
        </div>

        {/* Format Selector Toggle */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
            Pairing Format:
          </label>
          <div className="flex bg-slate-100/80 p-1 rounded-2xl border border-slate-200/80 max-w-md">
            <button
              type="button"
              onClick={() => handleModeChange('single')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                pairingMode === 'single'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Single Pairings (1-vs-1)
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('double')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                pairingMode === 'double'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Double Pairings (2-vs-2)
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                : 'bg-rose-50 text-rose-800 border border-rose-200/80'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Matchup Assignment Slots */}
        <div className="space-y-3 pt-1">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
            Assign Schools to Matchups ({pairingMode === 'single' ? '2 Matchups' : '3 Matchups'}):
          </label>

          {pairingMode === 'single' ? (
            /* Single Pairings Layout: 2 Matchup Slots */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {schools.map((s) => {
                  const inGroup1 = schoolPairings[s.id] === 1
                  const info = getSchoolInfo(s.name)
                  return (
                    <div
                      key={s.id}
                      className="flex justify-between items-center bg-white p-3 rounded-2xl border border-slate-200/80 text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        {info.url && (
                          <img
                            src={info.url}
                            alt={s.name}
                            className="w-5 h-5 object-contain bg-slate-50 p-0.5 rounded border border-slate-200/80 shrink-0"
                          />
                        )}
                        <span className={`font-bold truncate ${inGroup1 ? 'text-slate-900' : 'text-slate-400'}`}>
                          {s.name}
                        </span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSchoolGroup(s.id, 1)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            inGroup1 ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Matchup 1
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchoolGroup(s.id, 2)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            !inGroup1 ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Matchup 2
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="bg-emerald-50/40 p-3.5 rounded-2xl border border-emerald-200/80 space-y-1">
                  <span className="font-bold text-emerald-800 text-xs block">Matchup 1 ({group1List.length} Schools):</span>
                  <p className="text-slate-700 text-xs font-medium">
                    {group1List.map((s) => s.name).join(', ') || 'None assigned'}
                  </p>
                </div>

                <div className="bg-blue-50/40 p-3.5 rounded-2xl border border-blue-200/80 space-y-1">
                  <span className="font-bold text-blue-800 text-xs block">Matchup 2 ({group2List.length} Schools):</span>
                  <p className="text-slate-700 text-xs font-medium">
                    {group2List.map((s) => s.name).join(', ') || 'None assigned'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Double Pairings Layout: 3 Matchup Slots */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {schools.map((s) => {
                  const currentM = schoolPairings[s.id] || 1
                  const info = getSchoolInfo(s.name)
                  return (
                    <div
                      key={s.id}
                      className="flex justify-between items-center bg-white p-3 rounded-2xl border border-slate-200/80 text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        {info.url && (
                          <img
                            src={info.url}
                            alt={s.name}
                            className="w-5 h-5 object-contain bg-slate-50 p-0.5 rounded border border-slate-200/80 shrink-0"
                          />
                        )}
                        <span className="font-bold truncate text-slate-900">
                          {s.name}
                        </span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSchoolGroup(s.id, 1)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            currentM === 1 ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          M1
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchoolGroup(s.id, 2)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            currentM === 2 ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          M2
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchoolGroup(s.id, 3)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            currentM === 3 ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          M3
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                <div className="bg-emerald-50/40 p-3.5 rounded-2xl border border-emerald-200/80 space-y-1">
                  <span className="font-bold text-emerald-800 text-xs block">Matchup 1 ({group1List.length} Schools):</span>
                  <p className="text-slate-700 text-xs font-medium">
                    {group1List.map((s) => s.name).join(', ') || 'None assigned'}
                  </p>
                </div>

                <div className="bg-blue-50/40 p-3.5 rounded-2xl border border-blue-200/80 space-y-1">
                  <span className="font-bold text-blue-800 text-xs block">Matchup 2 ({group2List.length} Schools):</span>
                  <p className="text-slate-700 text-xs font-medium">
                    {group2List.map((s) => s.name).join(', ') || 'None assigned'}
                  </p>
                </div>

                <div className="bg-purple-50/40 p-3.5 rounded-2xl border border-purple-200/80 space-y-1">
                  <span className="font-bold text-purple-800 text-xs block">Matchup 3 ({group3List.length} Schools):</span>
                  <p className="text-slate-700 text-xs font-medium">
                    {group3List.map((s) => s.name).join(', ') || 'None assigned'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 bg-white/80 rounded-3xl border border-white/80 text-sm">
          Loading schools and roster pairings...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Available Players Sidebar */}
          <div className="lg:col-span-1 bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-4 space-y-4 shadow-lg shadow-slate-200/40 lg:sticky lg:top-20 lg:max-h-[80vh] lg:overflow-y-auto">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-black text-slate-900 text-sm">Available Players</h3>
                <p className="text-[11px] text-slate-500">Drag player into a group slot</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileRoster(!showMobileRoster)}
                className="lg:hidden text-xs bg-slate-100 hover:bg-slate-200 text-emerald-700 border border-slate-200 font-bold px-2.5 py-1 rounded-lg"
              >
                {showMobileRoster ? 'Hide Roster ▲' : 'Show Roster ▼'}
              </button>
            </div>

            <div className={`${showMobileRoster ? 'block' : 'hidden'} lg:block space-y-4`}>
              {schools.map((school) => {
                const currentM = schoolPairings[school.id] || 1
                const info = getSchoolInfo(school.name)
                return (
                  <div key={school.id} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1">
                      {info.url && (
                        <img
                          src={info.url}
                          alt={school.name}
                          className="w-4 h-4 object-contain bg-slate-50 p-0.5 rounded border border-slate-200 shrink-0"
                        />
                      )}
                      <span
                        className={`text-[11px] font-extrabold uppercase tracking-wider truncate ${
                          currentM === 1 ? 'text-emerald-700' : currentM === 2 ? 'text-blue-700' : 'text-purple-700'
                        }`}
                      >
                        {school.name}
                      </span>
                    </div>

                    <div className="space-y-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
                        const player = getEffectivePlayer(school, seed)
                        return (
                          <div
                            key={player.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, player)}
                            className="bg-slate-50 hover:bg-white border border-slate-200/80 rounded-xl p-2 text-xs text-slate-800 font-bold cursor-grab active:cursor-grabbing flex justify-between items-center shadow-xs transition-all"
                          >
                            <span className="truncate">{player.name}</span>
                            <span className="text-[10px] bg-slate-200/80 px-1.5 py-0.5 rounded-md text-slate-600 font-mono">
                              #{seed}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Shotgun Groups Grid */}
          <div className="lg:col-span-3 space-y-4">
            {groups.length === 0 ? (
              <div className="p-12 text-center bg-white/80 rounded-3xl border border-white/80 space-y-3 shadow-xl shadow-slate-200/50">
                <p className="text-slate-800 font-bold">No Shotgun Groups Generated Yet</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Configure school matchups above and click <strong className="text-emerald-600">⚡ Generate Pairings</strong> to build shotgun groups.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.map((group) => {
                  const isDragTarget = dragOverGroup === group.id

                  return (
                    <div
                      key={group.id}
                      onDragOver={(e) => handleDragOver(e, group.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, group.id)}
                      className={`bg-white/80 backdrop-blur-xl border rounded-3xl p-4 space-y-3 shadow-md shadow-slate-200/40 transition-all ${
                        isDragTarget
                          ? 'border-emerald-500 bg-emerald-50/40 ring-2 ring-emerald-500/30'
                          : 'border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">Group #{group.id}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${getMatchupBadgeStyle(
                              group.matchupName
                            )}`}
                          >
                            {group.matchupName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-400 font-semibold">Hole:</span>
                            <select
                              value={group.hole}
                              onChange={(e) => handleUpdateGroupHole(group.id, e.target.value)}
                              className="bg-slate-50 border border-slate-200 text-slate-900 text-xs px-2 py-1 rounded-lg font-mono font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                            >
                              {ALL_HOLE_OPTIONS.map((h) => (
                                <option key={h} value={h}>Hole {h}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-400 font-semibold">Seed:</span>
                            <select
                              value={group.seed}
                              onChange={(e) => handleUpdateGroupSeed(group.id, Number(e.target.value))}
                              className="bg-slate-50 border border-slate-200 text-slate-900 text-xs px-2 py-1 rounded-lg font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                                <option key={s} value={s}>#{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 min-h-[120px] bg-slate-50/60 p-2 rounded-2xl border border-slate-200/60">
                        {group.players.length === 0 ? (
                          <div className="h-24 flex items-center justify-center text-xs text-slate-400 italic border-2 border-dashed border-slate-200 rounded-xl">
                            Drag players here
                          </div>
                        ) : (
                          group.players.map((p) => {
                            const pSchoolInfo = getSchoolInfo(p.schoolName)
                            return (
                              <div
                                key={p.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, p, group.id)}
                                className="bg-white hover:bg-slate-50 p-2 rounded-xl border border-slate-200/80 text-xs flex justify-between items-center cursor-grab active:cursor-grabbing shadow-xs transition-colors"
                              >
                                <div className="flex items-center gap-2 truncate pr-1">
                                  {pSchoolInfo.url && (
                                    <img
                                      src={pSchoolInfo.url}
                                      alt={p.schoolName}
                                      className="w-5 h-5 object-contain bg-slate-50 p-0.5 rounded border border-slate-200 shrink-0"
                                    />
                                  )}
                                  <div className="truncate">
                                    <span className="font-extrabold text-slate-900 block truncate">{p.name}</span>
                                    <span className="text-[10px] text-slate-500 block truncate">{p.schoolName}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleRemovePlayerFromGroup(group.id, p.id)}
                                  className="text-slate-400 hover:text-rose-600 text-xs font-bold px-1.5 py-0.5 shrink-0"
                                  title="Remove from group"
                                >
                                  ✕
                                </button>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}