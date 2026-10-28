import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSchoolInfo } from '../lib/schools'

const SITE_ADMIN_PASSWORD = 'BoxEld3r#B33$'

export default function SeasonStandings() {
  const [activeTab, setActiveTab] = useState('team') // 'team' | 'individual'
  const [teamStandings, setTeamStandings] = useState([])
  const [playerStandings, setPlayerStandings] = useState([])
  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)

  // Reset Season Modal State
  const [showResetModal, setShowResetModal] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    fetchSeasonData()
  }, [])

  async function fetchSeasonData() {
    setLoading(true)

    // 1. Fetch Tournaments
    const { data: tourneyData } = await supabase
      .from('tournaments')
      .select('*')
      .order('completed_at', { ascending: false })

    if (tourneyData) setTournaments(tourneyData)

    // 2. Fetch Team Season Results
    const { data: teamResults } = await supabase.from('season_team_results').select(`
      points_earned, finish_rank, total_strokes, to_par,
      schools ( id, name )
    `)

    // 3. Fetch Player Season Results
    const { data: playerResults } = await supabase.from('season_player_results').select(`
      points_earned, finish_rank, total_strokes, to_par,
      players ( id, name, rank, schools ( name ) )
    `)

    // Process Team Season Standings
    if (teamResults) {
      const teamMap = {}
      teamResults.forEach((row) => {
        const schoolName = row.schools?.name || 'Unknown'
        if (!teamMap[schoolName]) {
          const info = getSchoolInfo(schoolName)
          teamMap[schoolName] = {
            schoolName,
            schoolLogo: info.url,
            schoolColor: info.color,
            totalPoints: 0,
            tournamentsPlayed: 0,
            bestFinish: 99,
          }
        }
        teamMap[schoolName].totalPoints += Number(row.points_earned || 0)
        teamMap[schoolName].tournamentsPlayed += 1
        if (row.finish_rank < teamMap[schoolName].bestFinish) {
          teamMap[schoolName].bestFinish = row.finish_rank
        }
      })

      const sortedTeams = Object.values(teamMap).sort((a, b) => b.totalPoints - a.totalPoints)
      setTeamStandings(sortedTeams)
    }

    // Process Individual Season Standings
    if (playerResults) {
      const playerMap = {}
      playerResults.forEach((row) => {
        const playerId = row.players?.id
        if (!playerId) return

        const playerName = row.players?.name || `Player #${row.players?.rank}`
        const schoolName = row.players?.schools?.name || 'Unknown'
        const info = getSchoolInfo(schoolName)

        if (!playerMap[playerId]) {
          playerMap[playerId] = {
            id: playerId,
            playerName,
            schoolName,
            schoolLogo: info.url,
            totalPoints: 0,
            tournamentsPlayed: 0,
            bestFinish: 99,
          }
        }
        playerMap[playerId].totalPoints += Number(row.points_earned || 0)
        playerMap[playerId].tournamentsPlayed += 1
        if (row.finish_rank < playerMap[playerId].bestFinish) {
          playerMap[playerId].bestFinish = row.finish_rank
        }
      })

      const sortedPlayers = Object.values(playerMap).sort((a, b) => b.totalPoints - a.totalPoints)
      setPlayerStandings(sortedPlayers)
    }

    setLoading(false)
  }

  // Reset Season Data Handler
  const handleResetSeasonSubmit = async (e) => {
    e.preventDefault()
    if (adminPassword !== SITE_ADMIN_PASSWORD) {
      setResetError('Incorrect Site Admin Password.')
      return
    }

    setResetting(true)
    setResetError('')

    try {
      // Clear season results and tournaments tables
      const { error: err1 } = await supabase.from('season_player_results').delete().neq('id', 0)
      const { error: err2 } = await supabase.from('season_team_results').delete().neq('id', 0)
      const { error: err3 } = await supabase.from('tournaments').delete().not('id', 'is', null)

      if (err1 || err2 || err3) {
        throw err1 || err2 || err3
      }

      setTeamStandings([])
      setPlayerStandings([])
      setTournaments([])
      setShowResetModal(false)
      setAdminPassword('')
    } catch (err) {
      console.error('Reset season error:', err)
      setResetError(`Failed to reset season: ${err.message}`)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header & View Switcher */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-5 rounded-3xl shadow-xl shadow-slate-200/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-800">
              Region 5 Cumulative Standings
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900">Season Points Leaderboard</h2>
          <p className="text-xs text-slate-500">
            {tournaments.length} Tournament{tournaments.length === 1 ? '' : 's'} Completed
          </p>
        </div>

        <div className="flex bg-slate-100/80 backdrop-blur-md p-1 rounded-2xl border border-slate-200/80 w-full sm:w-auto shadow-inner">
          <button
            onClick={() => setActiveTab('team')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'team'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Team Leaders
          </button>
          <button
            onClick={() => setActiveTab('individual')}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'individual'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Individual Leaders
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-3xl p-8 text-center text-slate-400 text-sm shadow-xl shadow-slate-200/50">
          Loading season points...
        </div>
      ) : tournaments.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-3xl p-12 text-center space-y-2 shadow-xl shadow-slate-200/50">
          <p className="text-slate-900 font-extrabold text-base">No Season Results Yet</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Once a tournament is finished, tap <strong>End Tournament</strong> to calculate points and archive standings here.
          </p>
        </div>
      ) : activeTab === 'team' ? (
        /* Team Season Standings Table */
        <div className="bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-mono text-xs uppercase">
                <th className="py-3.5 px-4 w-12 text-center">POS</th>
                <th className="py-3.5 px-4">SCHOOL</th>
                <th className="py-3.5 px-4 text-center">EVENTS</th>
                <th className="py-3.5 px-4 text-center">BEST FINISH</th>
                <th className="py-3.5 px-4 text-right">SEASON PTS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamStandings.map((team, idx) => (
                <tr key={team.schoolName} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-400">
                    #{idx + 1}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      {team.schoolLogo && (
                        <img
                          src={team.schoolLogo}
                          alt={team.schoolName}
                          className="w-6 h-6 object-contain bg-slate-50 p-0.5 rounded border border-slate-200/80 shrink-0"
                        />
                      )}
                      <span className="font-extrabold text-slate-900">{team.schoolName}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono text-slate-600 font-semibold">
                    {team.tournamentsPlayed}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono text-slate-500">
                    {team.bestFinish === 99 ? '—' : `#${team.bestFinish}`}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-base font-black text-emerald-700">
                    {team.totalPoints.toFixed(1)} pts
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Individual Season Standings Table */
        <div className="bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-3xl overflow-hidden shadow-xl shadow-slate-200/50">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-mono text-xs uppercase">
                <th className="py-3.5 px-4 w-12 text-center">POS</th>
                <th className="py-3.5 px-4">PLAYER</th>
                <th className="py-3.5 px-4">SCHOOL</th>
                <th className="py-3.5 px-4 text-center">EVENTS</th>
                <th className="py-3.5 px-4 text-right">SEASON PTS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {playerStandings.map((player, idx) => (
                <tr key={player.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-400">
                    #{idx + 1}
                  </td>
                  <td className="py-3.5 px-4 font-extrabold text-slate-900">{player.playerName}</td>
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
                    {player.tournamentsPlayed}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-base font-black text-emerald-700">
                    {player.totalPoints.toFixed(1)} pts
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inconspicuous Reset Season Footer Link */}
      <div className="pt-6 pb-2 text-center">
        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 transition-colors underline decoration-dotted underline-offset-4"
        >
          Reset Entire Season Standings
        </button>
      </div>

      {/* Reset Season Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white/95 backdrop-blur-xl border border-white/90 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl flex items-center justify-center mx-auto text-xl shadow-xs">
              ⚠️
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900">Reset Season Standings</h3>
              <p className="text-xs text-slate-500 mt-1">
                This will permanently erase all archived tournaments and cumulative points for the season. Enter Site Admin Password to confirm.
              </p>
            </div>

            <form onSubmit={handleResetSeasonSubmit} className="space-y-4 pt-1">
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value)
                  if (resetError) setResetError('')
                }}
                placeholder="Enter Site Admin Password..."
                className="w-full bg-white border border-slate-200/90 text-slate-900 text-center font-mono text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15"
                autoFocus
              />

              {resetError && <p className="text-xs font-bold text-rose-600">{resetError}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(false)
                    setAdminPassword('')
                    setResetError('')
                  }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-2xl text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 text-white font-bold rounded-2xl text-xs shadow-lg shadow-rose-600/20 active:scale-95 transition-all"
                >
                  {resetting ? 'Resetting...' : 'Reset Season Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}