export default function Navbar({ activeTab, setActiveTab, onOpenEndTournamentModal }) {
  const navItems = [
    {
      id: 'roster',
      label: 'Roster',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'pairings',
      label: 'Pairings',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      id: 'scorekeeper',
      label: 'Scores',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
    },
    {
      id: 'leaderboard',
      label: 'Leaderboard',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'season',
      label: 'Season',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      ),
    },
  ]

  return (
    <>
      {/* Frosted Glass Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-40 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⛳</span>
            <span className="font-black text-slate-900 text-lg tracking-tight">Region 5 Golf</span>
            <span className="hidden sm:inline-block bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold shadow-xs">
              LIVE SCORING
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop Navigation */}
            <nav className="hidden sm:flex items-center gap-1 bg-slate-100/80 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/80 shadow-inner">
              {navItems.map((item) => {
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </nav>

            {/* End Tournament Button */}
            <button
              onClick={onOpenEndTournamentModal}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/20 transition-all active:scale-95 flex items-center gap-1"
            >
              <span>🏁 End Tournament</span>
            </button>
          </div>
        </div>
      </header>

      {/* Floating Glass Mobile Dock */}
      <nav className="sm:hidden fixed bottom-4 left-4 right-4 z-50 bg-white/80 backdrop-blur-xl border border-slate-200/80 px-2 py-1.5 flex justify-around items-center rounded-3xl shadow-2xl shadow-slate-900/10">
        {navItems.map((item) => {
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-2.5 rounded-2xl transition-all ${
                isActive
                  ? 'text-emerald-700 font-extrabold bg-emerald-50 border border-emerald-200/80 shadow-xs scale-105'
                  : 'text-slate-500 font-medium active:scale-95'
              }`}
            >
              <span className={isActive ? 'text-emerald-600' : 'text-slate-500'}>
                {item.icon}
              </span>
              <span className="text-[10px] mt-0.5 leading-tight font-semibold">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}