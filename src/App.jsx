import { useState } from 'react'
import Navbar from './components/Navbar'
import CoachRoster from './components/CoachRoster'
import AdminPairings from './components/AdminPairings'
import Scorekeeper from './components/Scorekeeper'
import Leaderboard from './components/Leaderboard'
import SeasonStandings from './components/SeasonStandings'
import { supabase } from './lib/supabase'

const COACH_PASSWORD = 'Region5$27'
const SITE_ADMIN_PASSWORD = 'BoxEld3r#B33$'

export default function App() {
  const [activeTab, setActiveTab] = useState('roster')
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('coach_authenticated') === 'true'
  })
  const [inputPassword, setInputPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)

  // End Tournament Modal State
  const [showEndModal, setShowEndModal] = useState(false)
  const [tournamentName, setTournamentName] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [endError, setEndError] = useState('')
  const [endingInProgress, setEndingInProgress] = useState(false)

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    if (inputPassword === COACH_PASSWORD) {
      setIsAuthenticated(true)
      sessionStorage.setItem('coach_authenticated', 'true')
      setPasswordError(false)
      setInputPassword('')
    } else {
      setPasswordError(true)
    }
  }

  // End Tournament Core Logic
  const handleEndTournamentSubmit = async (e) => {
    e.preventDefault()
    if (adminPassword !== SITE_ADMIN_PASSWORD) {
      setEndError('Incorrect Site Admin Password.')
      return
    }

    setEndingInProgress(true)
    setEndError('')

    try {
      // 1. Load course settings (pars)
      const { data: cSettings } = await supabase.from('course_settings').select('*').eq('id', 1).single()
      const pars = cSettings?.pars && cSettings.pars.length === 18 ? cSettings.pars : Array(18).fill(4)

      // 2. Load players and scores
      const { data: playersData } = await supabase.from('players').select('id, name, rank, school_id, schools(id, name)')
      const { data: scoresData } = await supabase.from('scores').select('*')

      if (!playersData || !scoresData) {
        throw new Error('Unable to retrieve active tournament scores.')
      }

      // Process Player Scores
      const processedPlayers = playersData.map((p) => {
        const pScores = scoresData.filter((s) => s.player_id === p.id && s.strokes > 0)
        let totalStrokes = 0
        let totalPar = 0
        pScores.forEach((s) => {
          totalStrokes += s.strokes
          totalPar += pars[s.hole_number - 1] || 4
        })
        const holesCompleted = pScores.length
        const toPar = holesCompleted > 0 ? totalStrokes - totalPar : null

        return {
          id: p.id,
          name: p.name || `Player #${p.rank}`,
          schoolId: p.school_id,
          schoolName: p.schools?.name || 'Unknown',
          totalStrokes,
          holesCompleted,
          toPar,
        }
      })

      // Sort Players for Individual Finish
      const sortedPlayers = [...processedPlayers].sort((a, b) => {
        if (a.toPar === null && b.toPar === null) return 0
        if (a.toPar === null) return 1
        if (b.toPar === null) return -1
        return a.toPar - b.toPar
      })

      // Individual Point Schedule: 1st=10, 2nd=9, 3rd=8, 4th=7, 5th=6, 6th=5, 7th=4, 8th=3, 9th=2, 10th=1
      const indivPointsSchedule = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
      let pIdx = 0
      while (pIdx < sortedPlayers.length) {
        if (sortedPlayers[pIdx].toPar === null) break

        let matchGroupEnd = pIdx
        while (
          matchGroupEnd < sortedPlayers.length &&
          sortedPlayers[matchGroupEnd].toPar === sortedPlayers[pIdx].toPar
        ) {
          matchGroupEnd++
        }

        const tiedCount = matchGroupEnd - pIdx
        let pointsSum = 0
        for (let pos = pIdx; pos < matchGroupEnd; pos++) {
          pointsSum += indivPointsSchedule[pos] || 0
        }
        const splitPoints = pointsSum / tiedCount

        for (let pos = pIdx; pos < matchGroupEnd; pos++) {
          sortedPlayers[pos].finishRank = pIdx + 1
          sortedPlayers[pos].pointsEarned = splitPoints
        }

        pIdx = matchGroupEnd
      }

      // Process Team Standings with 5th-8th Tie Breaker
      const schoolMap = {}
      processedPlayers.forEach((p) => {
        if (!p.schoolId) return
        if (!schoolMap[p.schoolId]) {
          schoolMap[p.schoolId] = {
            schoolId: p.schoolId,
            schoolName: p.schoolName,
            players: [],
          }
        }
        schoolMap[p.schoolId].players.push(p)
      })

      const teamList = Object.values(schoolMap).map((team) => {
        const sortedRoster = [...team.players].sort((a, b) => {
          if (a.toPar === null && b.toPar === null) return 0
          if (a.toPar === null) return 1
          if (b.toPar === null) return -1
          return a.toPar - b.toPar
        })

        const top4 = sortedRoster.filter((p) => p.toPar !== null).slice(0, 4)
        const teamToPar = top4.length > 0 ? top4.reduce((sum, p) => sum + p.toPar, 0) : null
        const teamStrokes = top4.reduce((sum, p) => sum + p.totalStrokes, 0)

        return {
          schoolId: team.schoolId,
          schoolName: team.schoolName,
          teamToPar,
          teamStrokes,
          sortedRoster,
        }
      })

      // Sort Teams (Primary: teamToPar, Tie-Breakers: 5th, 6th, 7th, 8th player scores)
      teamList.sort((teamA, teamB) => {
        if (teamA.teamToPar !== teamB.teamToPar) {
          if (teamA.teamToPar === null) return 1
          if (teamB.teamToPar === null) return -1
          return teamA.teamToPar - teamB.teamToPar
        }

        for (let tieIdx = 4; tieIdx < 8; tieIdx++) {
          const scoreA = teamA.sortedRoster[tieIdx]?.toPar ?? 999
          const scoreB = teamB.sortedRoster[tieIdx]?.toPar ?? 999
          if (scoreA !== scoreB) {
            return scoreA - scoreB
          }
        }
        return 0
      })

      // Team Points Schedule: 1st=7, 2nd=6, 3rd=5, 4th=4, 5th=3, 6th=2, 7th=1
      const teamPointsSchedule = [7, 6, 5, 4, 3, 2, 1]
      teamList.forEach((team, idx) => {
        team.finishRank = idx + 1
        team.pointsEarned = teamPointsSchedule[idx] || 0
      })

      // 3. Create Tournament Archive Record
      const nameToSave = tournamentName.trim() || `Tournament ${new Date().toLocaleDateString()}`
      const { data: newTourney, error: tErr } = await supabase
        .from('tournaments')
        .insert({ name: nameToSave })
        .select()
        .single()

      if (tErr) throw tErr

      // 4. Archive Season Team Results
      const teamRows = teamList.map((t) => ({
        tournament_id: newTourney.id,
        school_id: t.schoolId,
        finish_rank: t.finishRank,
        points_earned: t.pointsEarned,
        total_strokes: t.teamStrokes,
        to_par: t.teamToPar,
      }))
      await supabase.from('season_team_results').insert(teamRows)

      // 5. Archive Season Player Results
      const playerRows = sortedPlayers.map((p) => ({
        tournament_id: newTourney.id,
        player_id: p.id,
        finish_rank: p.finishRank || 99,
        points_earned: p.pointsEarned || 0,
        total_strokes: p.totalStrokes,
        to_par: p.toPar,
      }))
      await supabase.from('season_player_results').insert(playerRows)

      // 6. Clear Active Round Scores & Signatures (Leaves Rosters & Pairings)
      await supabase.from('scores').delete().neq('id', 0)
      await supabase.from('scorecard_signatures').delete().neq('id', 0)

      setShowEndModal(false)
      setTournamentName('')
      setAdminPassword('')
      setActiveTab('season')
    } catch (err) {
      console.error('End tournament error:', err)
      setEndError(`Failed to end tournament: ${err.message}`)
    } finally {
      setEndingInProgress(false)
    }
  }

  const isProtectedTab = activeTab === 'roster' || activeTab === 'pairings'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/20 to-slate-100 text-slate-800 font-sans selection:bg-emerald-600 selection:text-white">
      {/* Frosted Light Header & Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenEndTournamentModal={() => setShowEndModal(true)}
      />

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto p-4 sm:p-6 pb-28 sm:pb-8">
        {isProtectedTab && !isAuthenticated ? (
          <div className="max-w-md mx-auto my-12 bg-white/70 backdrop-blur-xl border border-white/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-slate-200/60 text-center space-y-5">
            <div className="w-14 h-14 bg-emerald-50 border border-emerald-200/80 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-xs">
              🔒
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Coach Authorization</h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter password to unlock <span className="text-emerald-700 font-extrabold uppercase">{activeTab}</span> controls.
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-1">
              <div>
                <input
                  type="password"
                  value={inputPassword}
                  onChange={(e) => {
                    setInputPassword(e.target.value)
                    if (passwordError) setPasswordError(false)
                  }}
                  placeholder="Enter Password..."
                  className="w-full bg-white/90 border border-slate-200/90 text-slate-900 text-center font-mono text-sm px-4 py-3.5 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/15 shadow-inner placeholder:text-slate-400"
                  autoFocus
                />
                {passwordError && (
                  <p className="text-xs font-bold text-rose-600 mt-2">
                    Incorrect password. Please try again.
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all text-xs uppercase tracking-wider active:scale-95"
              >
                Unlock Coach Access
              </button>
            </form>
          </div>
        ) : (
          <>
            {activeTab === 'roster' && <CoachRoster />}
            {activeTab === 'pairings' && <AdminPairings />}
            {activeTab === 'scorekeeper' && <Scorekeeper />}
            {activeTab === 'leaderboard' && <Leaderboard />}
            {activeTab === 'season' && <SeasonStandings />}
          </>
        )}
      </main>

      {/* End Tournament Authorization Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏁</span>
                <h3 className="text-lg font-black text-slate-900">End Tournament & Push Points</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEndModal(false)
                  setEndError('')
                }}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              This will calculate season points for teams and individuals, archive final standings to Season Standings, and clear active round scores/signatures.
            </p>

            <form onSubmit={handleEndTournamentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Tournament Name:
                </label>
                <input
                  type="text"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder="e.g. Region 5 Match #1"
                  className="w-full bg-white border border-slate-200/90 text-slate-900 font-semibold text-xs px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Site Admin Password:
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value)
                    if (endError) setEndError('')
                  }}
                  placeholder="Enter Admin Password..."
                  className="w-full bg-white border border-slate-200/90 text-slate-900 text-center font-mono text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
                  autoFocus
                />
                {endError && <p className="text-xs font-bold text-rose-600 mt-2">{endError}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowEndModal(false)
                    setEndError('')
                  }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={endingInProgress}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 text-white font-bold rounded-2xl text-xs shadow-lg shadow-rose-600/20 active:scale-95 transition-all"
                >
                  {endingInProgress ? 'Processing...' : '🏁 Finalize & Archive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}