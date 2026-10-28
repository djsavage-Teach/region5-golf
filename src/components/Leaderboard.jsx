import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSchoolInfo, SCHOOLS } from '../lib/schools'

export default function Leaderboard() {
  const [activeTab, setActiveTab] = useState('individual') // 'individual' | 'team'
  const [players, setPlayers] = useState([])
  const [teams, setTeams] = useState([])
  const [courseSettings, setCourseSettings] = useState({ course_name: '', pars: Array(18).fill(4) })
  const [loading, setLoading] = useState(true)

  // Interactive Filter & Modal State
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState(null)
  const [modalPlayer, setModalPlayer] = useState(null)

  useEffect(() => {
    fetchLeaderboardData()

    // Realtime channel listening to score updates & signature locks
    const channel = supabase
      .channel('schema-leaderboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        fetchLeaderboardData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scorecard_signatures' }, () => {
        fetchLeaderboardData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchLeaderboardData() {
    setLoading(true)

    const { data: settings } = await supabase.from('course_settings').select('*').eq('id', 1).single()
    const pars = settings?.pars && settings.pars.length === 18 ? settings.pars : Array(18).fill(4)
    if (settings) setCourseSettings({ ...settings, pars })

    const { data: playerData } = await supabase.from('players').select(`
      id, name, rank, school_id,
      schools ( id, name )
    `)

    const { data: scoreData } = await supabase.from('scores').select('*')
    const { data: signatureData } = await supabase.from('scorecard_signatures').select('*')

    if (!playerData || !scoreData) {
      setLoading(false)
      return
    }

    // Map locked signatures by player_id
    const signedPlayerMap = {}
    if (signatureData) {
      signatureData.forEach((sig) => {
        if (sig.is_locked) {
          signedPlayerMap[sig.player_id] = true
        }
      })
    }

    const processedPlayers = playerData.map((player) => {
      const pScores = scoreData.filter((s) => s.player_id === player.id && s.strokes > 0)
      let totalStrokes = 0
      let totalPar = 0
      let holesCompleted = pScores.length

      const holeMap = {}
      pScores.forEach((s) => {
        holeMap[s.hole_number] = s.strokes
      })

      const detailedHoles = pars.map((parVal, idx) => {
        const holeNum = idx + 1
        const strokes = holeMap[holeNum] || 0
        return {
          hole: holeNum,
          par: parVal,
          strokes,
          toPar: strokes > 0 ? strokes - parVal : null,
        }
      })

      pScores.forEach((s) => {
        totalStrokes += s.strokes
        const holeIdx = s.hole_number - 1
        totalPar += pars[holeIdx] || 4
      })

      const toPar = holesCompleted > 0 ? totalStrokes - totalPar : null
      const schoolName = player.schools?.name || 'Unknown'
      const schoolInfo = getSchoolInfo(schoolName)
      const isSigned = !!signedPlayerMap[player.id]

      return {
        id: player.id,
        name: player.name || `Player #${player.rank}`,
        schoolId: player.school_id,
        schoolName,
        schoolLogo: schoolInfo.url,
        schoolColor: schoolInfo.color,
        totalStrokes,
        holesCompleted,
        toPar,
        isFinished: holesCompleted === 18,
        isSigned,
        detailedHoles,
      }
    })

    // Sort players by toPar to assign overall rank
    processedPlayers.sort((a, b) => {
      if (a.toPar === null && b.toPar === null) return 0
      if (a.toPar === null) return 1
      if (b.toPar === null) return -1
      return a.toPar - b.toPar
    })

    // Lock in official Overall Rank
    processedPlayers.forEach((p, idx) => {
      p.overallRank = idx + 1
    })

    setPlayers(processedPlayers)

    // Build Team Standings
    const schoolMap = {}
    processedPlayers.forEach((p) => {
      if (!p.schoolId) return
      if (!schoolMap[p.schoolId]) {
        schoolMap[p.schoolId] = {
          schoolId: p.schoolId,
          schoolName: p.schoolName,
          schoolLogo: p.schoolLogo,
          schoolColor: p.schoolColor,
          players: [],
        }
      }
      schoolMap[p.schoolId].players.push(p)
    })

    const processedTeams = Object.values(schoolMap).map((team) => {
      // Sort all team players by score
      const sortedRoster = [...team.players].sort((a, b) => {
        if (a.toPar === null && b.toPar === null) return 0
        if (a.toPar === null) return 1
        if (b.toPar === null) return -1
        return a.toPar - b.toPar
      })

      const countingScores = sortedRoster.filter((p) => p.toPar !== null).slice(0, 4)

      const teamToPar = countingScores.length > 0 ? countingScores.reduce((sum, p) => sum + p.toPar, 0) : null
      const teamStrokes = countingScores.reduce((sum, p) => sum + p.totalStrokes, 0)

      // All 8 players signed check
      const signedCount = sortedRoster.filter((p) => p.isSigned).length
      const allSigned = sortedRoster.length >= 8 && sortedRoster.every((p) => p.isSigned)

      return {
        schoolId: team.schoolId,
        schoolName: team.schoolName,
        schoolLogo: team.schoolLogo,
        schoolColor: team.schoolColor,
        teamToPar,
        teamStrokes,
        signedCount,
        allSigned,
        allPlayers: sortedRoster,
      }
    })

    processedTeams.sort((a, b) => {
      if (a.teamToPar === null) return 1
      if (b.teamToPar === null) return -1
      return a.teamToPar - b.teamToPar
    })

    setTeams(processedTeams)
    setLoading(false)
  }

  const formatToPar = (toPar) => {
    if (toPar === null || toPar === 0) return 'E'
    if (toPar < 0) return toPar
    return `+${toPar}`
  }

  const getToParColor = (toPar) => {
    if (toPar === null || toPar === 0) return 'text-slate-900 font-bold'
    if (toPar < 0) return 'text-rose-600 font-black'
    return 'text-slate-500 font-bold'
  }

  // Filtered player list based on team logo selection
  const displayedPlayers = selectedSchoolFilter
    ? players.filter((p) => String(p.schoolId) === String(selectedSchoolFilter) || p.schoolName.toUpperCase().includes(selectedSchoolFilter))
    : players

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Course Banner Header */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-5 rounded-3xl shadow-xl shadow-slate-200/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-600">
              Live Region 5 Scoring
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900">{courseSettings.course_name}</h2>
        </div>

        {/* View Switcher */}
        <div className="flex bg-slate-100/80 backdrop-blur-md p-1 rounded-2xl border border-slate-200/80 w-full sm:w-auto shadow-inner">
          <button
            onClick={() => setActiveTab('individual')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'individual'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Individual Standings
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'team'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Team Standings
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-3xl p-8 text-center text-slate-400 text-sm shadow-xl shadow-slate-200/50">
          Fetching live scores from the course...
        </div>
      ) : activeTab === 'individual' ? (
        <>
          {/* Team Filter Bar with School Logos */}
          <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-3 rounded-2xl shadow-md shadow-slate-200/40 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-1">
              Filter By Team:
            </span>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedSchoolFilter(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  selectedSchoolFilter === null
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>ALL TEAMS</span>
              </button>

              {SCHOOLS.map((school) => {
                const isSelected = selectedSchoolFilter === school.id
                return (
                  <button
                    key={school.id}
                    onClick={() => setSelectedSchoolFilter(school.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
                      isSelected
                        ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/30 text-slate-900 shadow-sm'
                        : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {school.url && (
                      <img
                        src={school.url}
                        alt={school.name}
                        className="w-4 h-4 object-contain bg-slate-100 p-0.5 rounded border border-slate-200"
                      />
                    )}
                    <span className="text-[11px]">{school.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mobile Card View (Signed = Light Translucent Glass Green) */}
          <div className="block sm:hidden space-y-2.5">
            {displayedPlayers.map((player) => (
              <div
                key={player.id}
                onClick={() => setModalPlayer(player)}
                className={`p-3.5 rounded-2xl flex items-center justify-between transition-all cursor-pointer border ${
                  player.isSigned
                    ? 'bg-emerald-50/70 backdrop-blur-md border-emerald-300/80 shadow-sm'
                    : 'bg-white/80 backdrop-blur-md border-slate-200/80 shadow-xs active:scale-98'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center font-mono text-xs font-bold text-slate-400">
                    #{player.overallRank}
                  </span>
                  {player.schoolLogo && (
                    <img
                      src={player.schoolLogo}
                      alt={player.schoolName}
                      className="w-7 h-7 object-contain bg-slate-50 p-0.5 rounded-lg border border-slate-200/80 shrink-0"
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 text-sm block leading-tight hover:text-emerald-700 underline decoration-dotted underline-offset-4">
                        {player.name}
                      </span>
                      {player.isSigned && (
                        <span className="text-[9px] font-bold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full font-mono shrink-0">
                          ✍️ Signed
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      {player.schoolName} • Thru {player.holesCompleted}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-lg font-mono block ${getToParColor(player.toPar)}`}>
                    {formatToPar(player.toPar)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {player.totalStrokes > 0 ? `${player.totalStrokes} strk` : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Leaderboard Table View (Signed = Light Translucent Glass Green Row) */}
          <div className="hidden sm:block bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-mono text-xs uppercase">
                  <th className="py-3.5 px-4 w-12 text-center">POS</th>
                  <th className="py-3.5 px-4">PLAYER</th>
                  <th className="py-3.5 px-4">SCHOOL</th>
                  <th className="py-3.5 px-4 text-center">THRU</th>
                  <th className="py-3.5 px-4 text-center">TOT</th>
                  <th className="py-3.5 px-4 text-right">SCORE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedPlayers.map((player) => (
                  <tr
                    key={player.id}
                    className={`transition-colors ${
                      player.isSigned
                        ? 'bg-emerald-50/70 hover:bg-emerald-100/70'
                        : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-400">
                      #{player.overallRank}
                    </td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setModalPlayer(player)}
                          className="hover:text-emerald-600 transition-colors underline decoration-dotted underline-offset-4 text-left"
                        >
                          {player.name}
                        </button>
                        {player.isSigned && (
                          <span className="text-[9px] font-bold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full font-mono">
                            ✍️ Signed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      <div className="flex items-center gap-2">
                        {player.schoolLogo && (
                          <img
                            src={player.schoolLogo}
                            alt={player.schoolName}
                            className="w-5 h-5 object-contain bg-slate-50 p-0.5 rounded border border-slate-200/80 shrink-0"
                          />
                        )}
                        <span className="font-medium">{player.schoolName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-slate-600 font-semibold">
                      {player.isFinished ? 'F' : player.holesCompleted || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                      {player.totalStrokes || '—'}
                    </td>
                    <td className={`py-3.5 px-4 text-right font-mono text-base ${getToParColor(player.toPar)}`}>
                      {formatToPar(player.toPar)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        /* Team Standings View (All 8 Players Signed = Light Translucent Glass Green Card) */
        <div className="space-y-4">
          {teams.map((team, idx) => (
            <div
              key={team.schoolName}
              className={`backdrop-blur-xl border-l-4 border p-5 rounded-3xl transition-all ${
                team.allSigned
                  ? 'bg-emerald-50/70 border-emerald-300/80 shadow-xl shadow-emerald-600/10 ring-2 ring-emerald-500/20'
                  : 'bg-white/80 border-slate-200/80 shadow-xl shadow-slate-200/50'
              }`}
              style={{ borderLeftColor: team.schoolColor || '#94a3b8' }}
            >
              <div className="flex justify-between items-center border-b border-slate-100/80 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-slate-400 w-6 text-center">
                    #{idx + 1}
                  </span>
                  {team.schoolLogo && (
                    <img
                      src={team.schoolLogo}
                      alt={team.schoolName}
                      className="w-10 h-10 object-contain bg-slate-50 p-1 rounded-xl border border-slate-200/80 shrink-0"
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-slate-900 text-base">{team.schoolName}</h3>
                      {team.allSigned && (
                        <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full font-mono">
                          ✍️ ALL 8 SIGNED
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Counting Top 4 Scores ({team.signedCount}/8 Signed)
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-2xl font-mono block ${getToParColor(team.teamToPar)}`}>
                    {formatToPar(team.teamToPar)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {team.teamStrokes > 0 ? `${team.teamStrokes} counting strokes` : '—'}
                  </span>
                </div>
              </div>

              <div className="pt-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Full Team Roster (Sorted by Score):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                  {team.allPlayers.map((player, pIdx) => {
                    const isCounting = pIdx < 4 && player.toPar !== null
                    return (
                      <div
                        key={player.id}
                        onClick={() => setModalPlayer(player)}
                        className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all hover:border-emerald-500 shadow-xs ${
                          player.isSigned
                            ? 'bg-emerald-100/60 border-emerald-300 text-emerald-900'
                            : isCounting
                            ? 'bg-emerald-50/50 border-emerald-200/80 ring-1 ring-emerald-500/20'
                            : 'bg-slate-50/60 border-slate-200/80 opacity-75'
                        }`}
                      >
                        <div className="truncate pr-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 truncate hover:text-emerald-700 underline decoration-dotted underline-offset-2">
                              {player.name}
                            </span>
                            {player.isSigned && (
                              <span className="text-[9px] font-bold text-emerald-700 font-mono shrink-0">
                                ✍️
                              </span>
                            )}
                            {isCounting && !player.isSigned && (
                              <span className="text-[9px] font-bold bg-emerald-600 text-white px-1.5 py-0.2 rounded-full font-mono shrink-0">
                                ★ TOP 4
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            Thru {player.holesCompleted || 0}
                          </span>
                        </div>

                        <span className={`text-xs font-mono font-extrabold ${getToParColor(player.toPar)}`}>
                          {formatToPar(player.toPar)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Interactive Full 18-Hole Scorecard Modal */}
      {modalPlayer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl p-6 max-w-2xl w-full shadow-2xl space-y-5 my-8">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                {modalPlayer.schoolLogo && (
                  <img
                    src={modalPlayer.schoolLogo}
                    alt={modalPlayer.schoolName}
                    className="w-12 h-12 object-contain bg-slate-50 p-1 rounded-2xl border border-slate-200"
                  />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-slate-900">{modalPlayer.name}</h3>
                    {modalPlayer.isSigned && (
                      <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full font-mono">
                        ✍️ Official Signed Card
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">
                    {modalPlayer.schoolName} • Overall Pos: <span className="text-emerald-600 font-mono">#{modalPlayer.overallRank}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setModalPlayer(null)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm flex items-center justify-center transition-all"
              >
                ✕
              </button>
            </div>

            {/* Total Summary Row */}
            <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-center">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Thru</span>
                <span className="text-base font-mono font-extrabold text-slate-800">
                  {modalPlayer.isFinished ? 'F' : modalPlayer.holesCompleted}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Strokes</span>
                <span className="text-base font-mono font-extrabold text-slate-800">
                  {modalPlayer.totalStrokes || '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Score To Par</span>
                <span className={`text-base font-mono font-black ${getToParColor(modalPlayer.toPar)}`}>
                  {formatToPar(modalPlayer.toPar)}
                </span>
              </div>
            </div>

            {/* Detailed 18-Hole Broadcast Grid */}
            <div className="space-y-4 text-xs font-mono">
              {/* Front 9 */}
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-400 uppercase block mb-1">Front 9:</span>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-500 text-[10px]">
                        {Array.from({ length: 9 }, (_, i) => (
                          <th key={i + 1} className="p-1.5 border-r border-slate-200">{i + 1}</th>
                        ))}
                        <th className="p-1.5 bg-slate-200 font-bold text-slate-700">OUT</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-200 text-slate-400 text-[11px]">
                        {modalPlayer.detailedHoles.slice(0, 9).map((h) => (
                          <td key={h.hole} className="p-1 border-r border-slate-200">P{h.par}</td>
                        ))}
                        <td className="p-1 bg-slate-100 font-bold text-slate-600">
                          P{modalPlayer.detailedHoles.slice(0, 9).reduce((a, b) => a + b.par, 0)}
                        </td>
                      </tr>
                      <tr className="border-t border-slate-200 font-bold text-slate-900">
                        {modalPlayer.detailedHoles.slice(0, 9).map((h) => (
                          <td key={h.hole} className="p-1.5 border-r border-slate-200">
                            {h.strokes ? (
                              <span
                                className={`inline-block w-6 h-6 leading-6 text-center rounded-md ${
                                  h.toPar < 0
                                    ? 'bg-rose-100 text-rose-700 border border-rose-300 font-black'
                                    : h.toPar > 0
                                    ? 'bg-slate-100 text-slate-500'
                                    : 'text-slate-900'
                                }`}
                              >
                                {h.strokes}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        ))}
                        <td className="p-1.5 bg-slate-100 font-black text-emerald-800">
                          {modalPlayer.detailedHoles.slice(0, 9).reduce((a, b) => a + (b.strokes || 0), 0) || '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Back 9 */}
              <div>
                <span className="text-[10px] font-sans font-bold text-slate-400 uppercase block mb-1">Back 9:</span>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-500 text-[10px]">
                        {Array.from({ length: 9 }, (_, i) => (
                          <th key={i + 10} className="p-1.5 border-r border-slate-200">{i + 10}</th>
                        ))}
                        <th className="p-1.5 bg-slate-200 font-bold text-slate-700">IN</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-slate-200 text-slate-400 text-[11px]">
                        {modalPlayer.detailedHoles.slice(9, 18).map((h) => (
                          <td key={h.hole} className="p-1 border-r border-slate-200">P{h.par}</td>
                        ))}
                        <td className="p-1 bg-slate-100 font-bold text-slate-600">
                          P{modalPlayer.detailedHoles.slice(9, 18).reduce((a, b) => a + b.par, 0)}
                        </td>
                      </tr>
                      <tr className="border-t border-slate-200 font-bold text-slate-900">
                        {modalPlayer.detailedHoles.slice(9, 18).map((h) => (
                          <td key={h.hole} className="p-1.5 border-r border-slate-200">
                            {h.strokes ? (
                              <span
                                className={`inline-block w-6 h-6 leading-6 text-center rounded-md ${
                                  h.toPar < 0
                                    ? 'bg-rose-100 text-rose-700 border border-rose-300 font-black'
                                    : h.toPar > 0
                                    ? 'bg-slate-100 text-slate-500'
                                    : 'text-slate-900'
                                }`}
                              >
                                {h.strokes}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        ))}
                        <td className="p-1.5 bg-slate-100 font-black text-emerald-800">
                          {modalPlayer.detailedHoles.slice(9, 18).reduce((a, b) => a + (b.strokes || 0), 0) || '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <button
              onClick={() => setModalPlayer(null)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition-all"
            >
              Close Scorecard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}