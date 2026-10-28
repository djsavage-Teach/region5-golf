import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getSchoolInfo } from '../lib/schools'

export default function CoachRoster() {
  const [schools, setSchools] = useState([])
  const [selectedSchoolId, setSelectedSchoolId] = useState('')
  const [roster, setRoster] = useState(
    Array.from({ length: 8 }, (_, i) => ({ seed: i + 1, name: `Player ${i + 1}`, id: null }))
  )
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    async function loadSchools() {
      const { data, error } = await supabase.from('schools').select('*').order('name')
      if (error) {
        setMessage({ type: 'error', text: `Failed to load schools: ${error.message}` })
        return
      }
      if (data && data.length > 0) {
        setSchools(data)
        setSelectedSchoolId(data[0].id)
      }
    }
    loadSchools()
  }, [])

  useEffect(() => {
    if (!selectedSchoolId) return

    async function loadRoster() {
      setLoading(true)
      setMessage(null)

      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('school_id', selectedSchoolId)

      if (error) {
        console.error('Error fetching roster:', error)
        setMessage({ type: 'error', text: `Fetch error: ${error.message}` })
        setLoading(false)
        return
      }

      const sortedData = data ? [...data].sort((a, b) => (a.rank || 0) - (b.rank || 0)) : []

      const updatedRoster = Array.from({ length: 8 }, (_, i) => {
        const seedNum = i + 1
        const existingPlayer = sortedData.find((p) => p.rank === seedNum)
        return {
          seed: seedNum,
          name: existingPlayer && existingPlayer.name ? existingPlayer.name : `Player ${seedNum}`,
          id: existingPlayer ? existingPlayer.id : null,
        }
      })

      setRoster(updatedRoster)
      setLoading(false)
    }

    loadRoster()
  }, [selectedSchoolId])

  const handleNameChange = (index, value) => {
    const updated = [...roster]
    updated[index].name = value
    setRoster(updated)
  }

  const handleSaveRoster = async () => {
    if (!selectedSchoolId) return
    setSaving(true)
    setMessage(null)

    try {
      for (let i = 0; i < roster.length; i++) {
        const player = roster[i]
        const nameToSave = player.name && player.name.trim() !== '' ? player.name.trim() : `Player ${player.seed}`

        if (player.id) {
          const { error: updateError } = await supabase
            .from('players')
            .update({ name: nameToSave, rank: player.seed })
            .eq('id', player.id)

          if (updateError) throw updateError
        } else {
          const { data: insertData, error: insertError } = await supabase
            .from('players')
            .insert({
              name: nameToSave,
              school_id: selectedSchoolId,
              rank: player.seed,
            })
            .select()

          if (insertError) throw insertError

          if (insertData && insertData[0]) {
            roster[i].id = insertData[0].id
          }
        }
      }
      setMessage({ type: 'success', text: '✓ Roster saved successfully!' })
    } catch (err) {
      console.error('Save error details:', err)
      setMessage({ type: 'error', text: `Save failed: ${err.message || err.details || JSON.stringify(err)}` })
    } finally {
      setSaving(false)
    }
  }

  const currentSchool = schools.find((s) => String(s.id) === String(selectedSchoolId))
  const currentSchoolInfo = getSchoolInfo(currentSchool?.name)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 p-6 rounded-3xl shadow-xl shadow-slate-200/50 space-y-5">
        <div>
          <h2 className="text-xl font-black text-slate-900">Coach Roster Entry</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter your team lineup in seed order (1 through 8) for tournament pairings.
          </p>
        </div>

        {/* Interactive School Picker */}
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Select Your School
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {schools.map((school) => {
              const isSelected = String(selectedSchoolId) === String(school.id)
              const info = getSchoolInfo(school.name)
              return (
                <button
                  key={school.id}
                  type="button"
                  onClick={() => setSelectedSchoolId(school.id)}
                  className={`p-2.5 rounded-2xl border flex items-center gap-2.5 transition-all text-left ${
                    isSelected
                      ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-md shadow-emerald-600/10'
                      : 'bg-slate-50/80 border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  {info.url && (
                    <img
                      src={info.url}
                      alt={school.name}
                      className="w-6 h-6 object-contain bg-slate-100 p-0.5 rounded-lg border border-slate-200/80 shrink-0"
                    />
                  )}
                  <span
                    className={`text-xs font-bold truncate ${
                      isSelected ? 'text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    {school.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {message && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-bold ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
                : 'bg-rose-50 text-rose-800 border border-rose-200/80'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm">Loading roster...</div>
        ) : (
          <div className="space-y-3 pt-2">
            {currentSchool && (
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3 mb-4">
                {currentSchoolInfo.url && (
                  <img
                    src={currentSchoolInfo.url}
                    alt={currentSchool.name}
                    className="w-6 h-6 object-contain bg-slate-50 p-0.5 rounded-lg border border-slate-200/80 shrink-0"
                  />
                )}
                <span className="text-sm font-extrabold text-slate-900">
                  {currentSchool.name} Lineup (#1 – #8)
                </span>
              </div>
            )}

            {roster.map((slot, index) => (
              <div key={slot.seed} className="flex items-center gap-3">
                <span className="w-20 text-xs font-mono font-bold uppercase tracking-wider text-slate-600 bg-slate-100/80 px-3 py-2.5 rounded-xl border border-slate-200/80 text-center shrink-0">
                  Seed #{slot.seed}
                </span>
                <input
                  type="text"
                  value={slot.name}
                  onChange={(e) => handleNameChange(index, e.target.value)}
                  placeholder={`Player ${slot.seed}`}
                  className="flex-1 bg-white border border-slate-200/90 text-slate-900 font-bold px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 placeholder:text-slate-400"
                />
              </div>
            ))}

            <button
              onClick={handleSaveRoster}
              disabled={saving}
              className="w-full mt-4 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 transition-all text-xs uppercase tracking-wider active:scale-95"
            >
              {saving ? 'Saving Lineup...' : '💾 Save Team Lineup'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}