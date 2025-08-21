import React from 'react';
import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import io from 'socket.io-client';

// Use relative URLs in production, fallback to localhost in development
defaultApiBase();
function defaultApiBase() {
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') {
    // Use same origin for API and socket in production (assumes reverse proxy or same FQDN)
    window.API_BASE = '/api';
    window.SOCKET_URL = window.location.origin;
  } else {
    window.API_BASE = 'http://localhost:4000/api';
    window.SOCKET_URL = 'http://localhost:4000';
  }
}
const API_BASE = window.API_BASE;
const SOCKET_URL = window.SOCKET_URL;

// --- Utility Hooks ---
function useColorScheme() {
  const [isDark, setIsDark] = useState(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = e => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDark;
}

function useScoreboard(sqid) {
  const [scoreboard, setScoreboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(`${API_BASE}/scoreboard/${sqid}`)
      .then(r => r.json())
      .then(data => {
        setScoreboard(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load scoreboard');
        setLoading(false);
      });
  }, [sqid]);
  return { scoreboard, setScoreboard, loading, error };
}

function useSocket(sqid, setScoreboard) {
  useEffect(() => {
    const s = io(SOCKET_URL);
    s.emit('joinBoard', sqid);
    s.on('UpdateScores', payload => {
      if (Array.isArray(payload)) {
        setScoreboard(sb => ({ ...sb, Scores: payload.join(',') }));
      } else if (payload && Array.isArray(payload.scores)) {
        setScoreboard(sb => ({ ...sb, Scores: payload.scores.join(',') }));
      }
    });
    s.on('UpdateActiveSet', payload => {
      if (typeof payload === 'number') {
        setScoreboard(sb => ({ ...sb, ActiveSet: payload }));
      } else if (payload && typeof payload.setIndex === 'number') {
        setScoreboard(sb => ({ ...sb, ActiveSet: payload.setIndex }));
      }
    });
    s.on('UpdateMatchLength', payload => {
      if (typeof payload === 'number' && [3, 5].includes(payload)) {
        setScoreboard(sb => ({ ...sb, MatchLength: payload }));
      }
    });
    s.on('UpdateTeamInfo', payload => {
      setScoreboard(sb => ({
        ...sb,
        TeamName1: payload.team1 ?? sb.TeamName1,
        TeamColor1: payload.team1Color ?? sb.TeamColor1,
        TeamAccent1: payload.team1Accent ?? sb.TeamAccent1,
        TeamName2: payload.team2 ?? sb.TeamName2,
        TeamColor2: payload.team2Color ?? sb.TeamColor2,
        TeamAccent2: payload.team2Accent ?? sb.TeamAccent2,
        Tournament: payload.tournament ?? sb.Tournament
      }));
    });
    s.on('UpdateDisplay', payload => {
      setScoreboard(sb => ({
        ...sb,
        Tournament: payload.tournament ?? sb.Tournament,
        BoardColor: payload.boardColor ?? sb.BoardColor
      }));
    });
    return () => {
      s.disconnect();
    };
  }, [sqid, setScoreboard]);
}

// --- Utility: Throttle function ---
function throttle(fn, wait) {
  let last = 0, timeout;
  return function(...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    } else {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
      }, wait - (now - last));
    }
  };
}

// --- ScoreView ---
function ScoreView() {
  const { sqid } = useParams();
  const { scoreboard, setScoreboard, loading, error } = useScoreboard(sqid);
  const [edit, setEdit] = useState({
    TeamName1: '', TeamName2: '', Tournament: '',
    TeamColor1: '#00adb5', TeamAccent1: '#007c85',
    TeamColor2: '#ff6f3c', TeamAccent2: '#ffb26b',
    MatchLength: 3
  });
  const [showEdit, setShowEdit] = useState(false);
  const isDark = useColorScheme();

  // Sync edit fields with scoreboard
  useEffect(() => {
    if (!scoreboard) return;
    setEdit({
      TeamName1: scoreboard.TeamName1 || '',
      TeamName2: scoreboard.TeamName2 || '',
      Tournament: scoreboard.Tournament || '',
      TeamColor1: scoreboard.TeamColor1 || '#00adb5',
      TeamAccent1: scoreboard.TeamAccent1 || '#007c85',
      TeamColor2: scoreboard.TeamColor2 || '#ff6f3c',
      TeamAccent2: scoreboard.TeamAccent2 || '#ffb26b',
      MatchLength: scoreboard.MatchLength || 3
    });
  }, [scoreboard]);

  // Use the shared socket hook for real-time updates
  useSocket(sqid, setScoreboard);

  // Remove emitSocket and all socket emits from update functions

  const updateScore = (setIdx, teamIdx, delta) => {
    if (!scoreboard) return;
    const scores = scoreboard.Scores.split(',').map(Number);
    const idx = setIdx * 2 + teamIdx;
    scores[idx] = Math.max(0, scores[idx] + delta);
    const newScores = scores.join(',');
    const updated = { ...scoreboard, Scores: newScores };
    setScoreboard(updated);
    fetch(`${API_BASE}/scoreboard/${sqid}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
    });
  };

  const updateActiveSet = (setIdx) => {
    if (!scoreboard) return;
    const matchLength = scoreboard.MatchLength || 3;
    // Validate set index against match length
    if (setIdx < 0 || setIdx >= matchLength) return;
    const updated = { ...scoreboard, ActiveSet: setIdx };
    setScoreboard(updated);
    fetch(`${API_BASE}/scoreboard/${sqid}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
    });
  };

  const saveTeamInfo = () => {
    if (!scoreboard) return;
    let updatedScoreboard = { ...scoreboard, ...edit };
    
    // Handle MatchLength changes
    const currentMatchLength = scoreboard.MatchLength || 3;
    const newMatchLength = edit.MatchLength || 3;
    
    if (currentMatchLength !== newMatchLength) {
      const currentScores = scoreboard.Scores.split(',').map(Number);
      let newScores;
      
      if (newMatchLength === 3 && currentMatchLength === 5) {
        // Switching from 5 to 3 sets: truncate to first 6 values
        newScores = currentScores.slice(0, 6);
        // Reset ActiveSet if it's beyond 3-set range
        if (scoreboard.ActiveSet > 2) {
          updatedScoreboard.ActiveSet = 0;
        }
      } else if (newMatchLength === 5 && currentMatchLength === 3) {
        // Switching from 3 to 5 sets: pad with zeros for sets 4 and 5
        newScores = [...currentScores, 0, 0, 0, 0];
      } else {
        newScores = currentScores;
      }
      
      updatedScoreboard.Scores = newScores.join(',');
    }
    
    setScoreboard(updatedScoreboard);
    fetch(`${API_BASE}/scoreboard/${sqid}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedScoreboard)
    });
  };

  // Throttled versions of update functions
  const throttledUpdateScore = throttle(updateScore, 400);
  const throttledUpdateActiveSet = throttle(updateActiveSet, 400);
  const throttledSaveTeamInfo = throttle(saveTeamInfo, 800);

  useEffect(() => {
  }, [scoreboard]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;
  if (!scoreboard) return <div>Not found</div>;

  const scores = scoreboard.Scores.split(',').map(Number);
  const themeVars = {
    '--team1': '#00adb5', '--team2': '#ff6f3c',
    '--bg': isDark ? '#181c1f' : '#f7fafd',
    '--card': isDark ? '#23272b' : '#f7fafd',
    '--border': isDark ? '#222831' : '#eee',
    '--text': isDark ? '#f7fafd' : '#222',
    '--input-bg': isDark ? '#23272b' : '#fff',
    '--input-border': '#00adb5',
    '--bottom-bg': isDark ? '#181c1f' : '#fff',
    '--bottom-shadow': isDark ? '#0006' : '#0001',
    '--edit-bg': isDark ? '#23272b' : '#fff',
    '--edit-shadow': '#00adb511',
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="score-view" style={{ maxWidth: 420, width: '100%', padding: 0, background: 'none', boxShadow: 'none', ...themeVars }}>
        {/* Material-style card for main controls */}
        <div style={{ background: 'var(--card)', borderRadius: 18, boxShadow: '0 2px 12px #00adb522', padding: 20, marginTop: 24, marginBottom: 16 }}>
          <div style={{ marginTop: 18, marginBottom: 0 }}>
            {Array.from({length: scoreboard.MatchLength || 3}, (_, setIdx) => (
              <div key={setIdx} style={{
                border: scoreboard.ActiveSet === setIdx ? `2px solid var(--team1)` : '1px solid var(--border)',
                borderRadius: 14,
                background: scoreboard.ActiveSet === setIdx ? '#e0f7fa' : 'var(--card)',
                marginBottom: 18,
                padding: 10, // reduced from 14
                boxShadow: scoreboard.ActiveSet === setIdx ? '0 1px 3px #00adb511' : 'none', // less shadow
                transition: 'box-shadow 0.2s',
                minHeight: 0 // allow smaller
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: scoreboard.ActiveSet === setIdx ? 'var(--team1)' : 'var(--text)', fontSize: '1em' }}>Set {setIdx + 1}</span>
                  <button
                    style={{
                      background: scoreboard.ActiveSet === setIdx ? 'var(--team1)' : 'var(--border)',
                      color: scoreboard.ActiveSet === setIdx ? '#fff' : 'var(--text)',
                      border: 'none',
                      borderRadius: 6, // smaller radius
                      padding: '4px 12px', // smaller button
                      fontWeight: 500, // less bold
                      marginLeft: 6,
                      cursor: 'pointer',
                      fontSize: '0.95em', // relative font size
                      boxShadow: scoreboard.ActiveSet === setIdx ? '0 1px 2px #00adb511' : 'none',
                      transition: 'box-shadow 0.2s',
                      opacity: scoreboard.ActiveSet === setIdx ? 0.85 : 1 // less prominent
                    }}
                    onClick={() => throttledUpdateActiveSet(setIdx)}
                    aria-label={`Set active set to ${setIdx + 1}`}
                  >
                    {scoreboard.ActiveSet === setIdx ? 'Active' : 'Set Active'}
                  </button>
                </div>
                {/* Team 1 header */}
                <div style={{ fontSize: '1.2em', fontWeight: 600, color: 'var(--team1)', marginBottom: 2, textAlign: 'center' }}>{edit.TeamName1}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 14 }}>
                  <button
                    onClick={() => throttledUpdateScore(setIdx, 0, -1)}
                    style={{ width: 80, height: 64, fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e0f7fa', color: 'var(--team1)', border: 'none', borderRadius: 22, fontWeight: 700, marginRight: 2, boxShadow: '0 1px 4px #00adb522', transition: 'background 0.2s' }}
                    aria-label="Decrement Team 1 Score"
                  >
                    -
                  </button>
                  <span style={{ fontWeight: 700, fontSize: '2.2em', color: 'var(--team1)', minWidth: 48, textAlign: 'center' }}>{scores[setIdx * 2]}</span>
                  <button
                    onClick={() => throttledUpdateScore(setIdx, 0, 1)}
                    style={{ width: 80, height: 64, fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--team1)', color: '#fff', border: 'none', borderRadius: 22, fontWeight: 700, marginLeft: 2, boxShadow: '0 1px 4px #00adb522', transition: 'background 0.2s' }}
                    aria-label="Increment Team 1 Score"
                  >
                    +
                  </button>
                </div>
                {/* Team 2 header */}
                <div style={{ fontSize: '1.2em', fontWeight: 600, color: 'var(--team2)', marginBottom: 2, textAlign: 'center' }}>{edit.TeamName2}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
                  <button
                    onClick={() => throttledUpdateScore(setIdx, 1, -1)}
                    style={{ width: 80, height: 64, fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff3e6', color: 'var(--team2)', border: 'none', borderRadius: 22, fontWeight: 700, marginRight: 2, boxShadow: '0 1px 4px #ff6f3c22', transition: 'background 0.2s' }}
                    aria-label="Decrement Team 2 Score"
                  >
                    -
                  </button>
                  <span style={{ fontWeight: 700, fontSize: '2.2em', color: 'var(--team2)', minWidth: 48, textAlign: 'center' }}>{scores[setIdx * 2 + 1]}</span>
                  <button
                    onClick={() => throttledUpdateScore(setIdx, 1, 1)}
                    style={{ width: 80, height: 64, fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--team2)', color: '#fff', border: 'none', borderRadius: 22, fontWeight: 700, marginLeft: 2, boxShadow: '0 1px 4px #ff6f3c22', transition: 'background 0.2s' }}
                    aria-label="Increment Team 2 Score"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Collapsible bottom section for team/tournament editing */}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--bottom-bg)', borderTop: '1.5px solid var(--border)', boxShadow: '0 -2px 8px var(--bottom-shadow)', padding: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
          <button
            onClick={() => setShowEdit(v => !v)}
            style={{ width: '100%', maxWidth: 420, background: 'var(--card)', color: 'var(--team1)', border: 'none', borderTopLeftRadius: 8, borderTopRightRadius: 8, fontWeight: 700, fontSize: 16, padding: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 -1px 4px var(--edit-shadow)' }}
            aria-expanded={showEdit}
          >
            <span style={{ marginRight: 8 }}>{showEdit ? 'Hide' : 'Show'} Match Info</span>
            <span style={{ fontSize: 18 }}>{showEdit ? '\u25BC' : '\u25B2'}</span>
          </button>
          {showEdit && (
            <div style={{ width: '100%', maxWidth: 420, padding: 16, background: 'var(--edit-bg)', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, boxShadow: '0 2px 8px var(--edit-shadow)' }}>
              <form
                style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch', justifyContent: 'center', width: '100%' }}
                onSubmit={e => { e.preventDefault(); throttledSaveTeamInfo(); }}
              >
                <input
                  type="text"
                  value={edit.TeamName1}
                  onChange={e => setEdit({ ...edit, TeamName1: e.target.value })}
                  placeholder="Team 1 Name"
                  aria-label="Edit Team 1 Name"
                  style={{ fontWeight: 600, fontSize: 16, border: 'none', borderBottom: '2px solid var(--team1)', outline: 'none', background: 'var(--input-bg)', minWidth: 80, color: 'var(--text)', marginBottom: 6 }}
                  ref={el => { if (el && edit._focusTeam1) { el.focus(); setEdit(edit => ({ ...edit, _focusTeam1: false })); } }}
                />
                <button
                  type="button"
                  style={{ background: '#eee', color: 'var(--team1)', border: 'none', borderRadius: 6, fontWeight: 500, fontSize: 13, padding: '4px 10px', marginBottom: 6, marginLeft: 4, cursor: 'pointer' }}
                  onClick={() => setEdit(edit => ({ ...edit, TeamName1: '', _focusTeam1: true }))}
                  aria-label="Clear Team 1 Name"
                >
                  Clear
                </button>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <label style={{ fontSize: 13, color: 'var(--team1)' }}>
                    Main Color
                    <input type="color" value={edit.TeamColor1} onChange={e => setEdit({ ...edit, TeamColor1: e.target.value })} style={{ marginLeft: 6, verticalAlign: 'middle', width: 32, height: 24, border: 'none', background: 'none' }} aria-label="Team 1 Main Color" />
                  </label>
                  <label style={{ fontSize: 13, color: 'var(--team1)' }}>
                    Accent
                    <input type="color" value={edit.TeamAccent1} onChange={e => setEdit({ ...edit, TeamAccent1: e.target.value })} style={{ marginLeft: 6, verticalAlign: 'middle', width: 32, height: 24, border: 'none', background: 'none' }} aria-label="Team 1 Accent Color" />
                  </label>
                </div>
                <input
                  type="text"
                  value={edit.TeamName2}
                  onChange={e => setEdit({ ...edit, TeamName2: e.target.value })}
                  placeholder="Team 2 Name"
                  aria-label="Edit Team 2 Name"
                  style={{ fontWeight: 600, fontSize: 16, border: 'none', borderBottom: '2px solid var(--team2)', outline: 'none', background: 'var(--input-bg)', minWidth: 80, color: 'var(--text)', marginBottom: 6 }}
                  ref={el => { if (el && edit._focusTeam2) { el.focus(); setEdit(edit => ({ ...edit, _focusTeam2: false })); } }}
                />
                <button
                  type="button"
                  style={{ background: '#eee', color: 'var(--team2)', border: 'none', borderRadius: 6, fontWeight: 500, fontSize: 13, padding: '4px 10px', marginBottom: 6, marginLeft: 4, cursor: 'pointer' }}
                  onClick={() => setEdit(edit => ({ ...edit, TeamName2: '', _focusTeam2: true }))}
                  aria-label="Clear Team 2 Name"
                >
                  Clear
                </button>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <label style={{ fontSize: 13, color: 'var(--team2)' }}>
                    Main Color
                    <input type="color" value={edit.TeamColor2} onChange={e => setEdit({ ...edit, TeamColor2: e.target.value })} style={{ marginLeft: 6, verticalAlign: 'middle', width: 32, height: 24, border: 'none', background: 'none' }} aria-label="Team 2 Main Color" />
                  </label>
                  <label style={{ fontSize: 13, color: 'var(--team2)' }}>
                    Accent
                    <input type="color" value={edit.TeamAccent2} onChange={e => setEdit({ ...edit, TeamAccent2: e.target.value })} style={{ marginLeft: 6, verticalAlign: 'middle', width: 32, height: 24, border: 'none', background: 'none' }} aria-label="Team 2 Accent Color" />
                  </label>
                </div>
                <input
                  type="text"
                  value={edit.Tournament}
                  onChange={e => setEdit({ ...edit, Tournament: e.target.value })}
                  placeholder="Tournament Name"
                  aria-label="Edit Tournament Name"
                  style={{ fontWeight: 500, fontSize: 15, border: 'none', borderBottom: '2px solid var(--team1)', outline: 'none', background: 'var(--input-bg)', minWidth: 120, color: 'var(--text)', marginBottom: 10 }}
                />
                <div style={{ marginBottom: 10 }}>
                  <label htmlFor="matchLength" style={{ fontSize: 14, color: 'var(--team1)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Match Length:
                  </label>
                  <select 
                    id="matchLength"
                    value={edit.MatchLength || 3} 
                    onChange={e => setEdit({...edit, MatchLength: parseInt(e.target.value)})}
                    style={{ 
                      fontSize: 15, 
                      border: 'none', 
                      borderBottom: '2px solid var(--team1)', 
                      outline: 'none', 
                      background: 'var(--input-bg)', 
                      color: 'var(--text)',
                      width: '100%',
                      padding: '4px 0',
                      fontWeight: 500
                    }}
                    aria-label="Select Match Length"
                  >
                    <option value={3}>Best of 3 Sets</option>
                    <option value={5}>Best of 5 Sets</option>
                  </select>
                </div>
                <button type="submit" style={{ background: 'var(--team1)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 15, padding: '10px 0', marginTop: 4, boxShadow: '0 1px 4px #00adb522' }}>Save</button>
                <button
                  type="button"
                  style={{
                    background: '#e53935',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 15,
                    padding: '10px 0',
                    marginTop: 8,
                    boxShadow: '0 1px 4px #e5393522',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    // Reset scores for all sets to 0 and activate Set 1
                    if (!scoreboard) return;
                    const matchLength = scoreboard.MatchLength || 3;
                    const resetScores = Array(matchLength * 2).fill(0).join(',');
                    const updated = { ...scoreboard, Scores: resetScores, ActiveSet: 0 };
                    setScoreboard(updated);
                    fetch(`${API_BASE}/scoreboard/${sqid}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated)
                    });
                  }}
                  aria-label="Reset all scores to zero and activate Set 1"
                >
                  Reset Scores
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// List of subtle cubic-bezier easings for in/out
const sweepEasings = [
  'cubic-bezier(0.4,0,0.2,1)', // standard
  'cubic-bezier(0.55,0,0.1,1)', // easeInOut
  'cubic-bezier(0.77,0,0.175,1)', // easeInOutQuart
  'cubic-bezier(0.65,0,0.35,1)', // easeInOutSine
  'cubic-bezier(0.86,0,0.07,1)', // easeInOutCirc
  'cubic-bezier(0.47,0,0.745,0.715)', // easeInQuad
  'cubic-bezier(0.39,0.575,0.565,1)', // easeOutQuad
  'cubic-bezier(0.445,0.05,0.55,0.95)', // easeInOut
];

function OverlayView() {
  const { sqid } = useParams();
  const [scoreboard, setScoreboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State for randomized sweep duration, animation key, and easing
  const [sweepDuration, setSweepDuration] = useState(10); // default 10s
  const [sweepKey, setSweepKey] = useState(0);
  const [sweepEasing, setSweepEasing] = useState('cubic-bezier(0.4,0,0.2,1)');

  // Animation state for scores (support up to 5 sets = 10 scores)
  const [scoreAnim, setScoreAnim] = useState([null, null, null, null, null, null, null, null, null, null]); // {prev, next, dir}
  const prevScoresRef = React.useRef([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

  useEffect(() => {
    fetch(`${API_BASE}/scoreboard/${sqid}`)
      .then(r => r.json())
      .then(data => {
        setScoreboard(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load scoreboard');
        setLoading(false);
      });
  }, [sqid]);

  // Use the shared socket hook for real-time updates
  useSocket(sqid, setScoreboard);

  // Randomize sweep duration, easing, and restart animation on each sweep
  useEffect(() => {
    let timeout;
    function startSweep() {
      // Slow sweep: random duration between 24 and 40 seconds
      const duration = Math.floor(Math.random() * 17) + 24;
      // Random easing
      const easing = sweepEasings[Math.floor(Math.random() * sweepEasings.length)];
      setSweepDuration(duration);
      setSweepEasing(easing);
      setSweepKey(k => k + 1); // force re-render to restart animation
      timeout = setTimeout(startSweep, duration * 1000);
    }
    startSweep();
    return () => clearTimeout(timeout);
  }, []);

  // Animation effect for score changes
  useEffect(() => {
    if (!scoreboard) return;
    const scores = scoreboard.Scores.split(',').map(Number);
    const prev = prevScoresRef.current;
    const matchLength = scoreboard.MatchLength || 3;
    const maxScores = matchLength * 2; // 2 scores per set
    let animArr = [null, null, null, null, null, null, null, null, null, null];
    for (let i = 0; i < maxScores; ++i) {
      if (scores[i] !== prev[i]) {
        animArr[i] = { prev: prev[i], next: scores[i], dir: scores[i] > prev[i] ? 1 : -1 };
      }
    }
    setScoreAnim(animArr);
    if (animArr.some(Boolean)) {
      setTimeout(() => setScoreAnim([null, null, null, null, null, null, null, null, null, null]), 350);
    }
    prevScoresRef.current = scores;
  }, [scoreboard && scoreboard.Scores]);

  useEffect(() => {
  }, [scoreboard]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;
  if (!scoreboard) return <div>Not found</div>;

  const scores = scoreboard.Scores.split(',').map(Number);
  // Set CSS vars for team colors
  const boardStyle = {
    background: scoreboard.BoardColor || '#222831',
    '--team1': scoreboard.TeamColor1,
    '--team1-accent': scoreboard.TeamAccent1,
    '--team2': scoreboard.TeamColor2,
    '--team2-accent': scoreboard.TeamAccent2
  };
  // Helper: get readable text color for a given bg
  function getContrastText(bg) {
    if (!bg) return '#222';
    // Remove # and parse hex
    const hex = bg.replace('#', '');
    const r = parseInt(hex.substring(0,2), 16);
    const g = parseInt(hex.substring(2,4), 16);
    const b = parseInt(hex.substring(4,6), 16);
    // Luminance
    const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
    return luminance > 0.6 ? '#222' : '#fff';
  }

  return (
    <div className="overlay-root">
      <div className="overlay-board" style={{ ...boardStyle, borderRadius: 0, boxShadow: 'none', position: 'relative', overflow: 'hidden', zIndex: 1 }}>
        {/* Parallax background layer */}
        <div className="overlay-parallax-bg" />
        {/* Animated background gradient/light effect (must be first child for stacking) */}
        <div
          className="overlay-animated-bg"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(120deg, rgba(0,255,174,0.04) 0%, rgba(0,173,181,0.04) 40%, rgba(255,111,60,0.04) 60%, rgba(255,255,255,0.03) 100%)',
            backgroundSize: '400% 400%',
            animation: 'overlayLightMove 24s linear infinite',
            filter: 'blur(6px)',
            opacity: 0.5,
            transition: 'background 0.5s',
          }}
        />
        {/* Shimmer effect layer */}
        <div className="overlay-shimmer" />
        {/* Subtle moving angled light sweep */}
        <div
          key={sweepKey}
          className="overlay-angled-light"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1,
            pointerEvents: 'none',
            background: 'linear-gradient(100deg, rgba(255,255,255,0) 60%, rgba(255,255,255,0.13) 70%, rgba(255,255,255,0) 80%)',
            backgroundSize: '200% 200%',
            animation: `angledLightSweep ${sweepDuration}s ${sweepEasing}`,
            opacity: 0.35,
            filter: 'blur(8px)',
          }}
        />
        {/* Overlay content (zIndex: 1 by stacking context) */}
        <div className="overlay-row" style={{ display: 'flex', alignItems: 'stretch', width: '100%' }}>
          <div className="overlay-team overlay-team1" style={{ 
            background: `linear-gradient(135deg, ${scoreboard.TeamColor1} 75%, ${scoreboard.TeamAccent1} 100%)`,
            display: 'flex', alignItems: 'center', padding: 0 }}>
            <span className="overlay-team-name" style={{ color: getContrastText(scoreboard.TeamColor1), padding: '6px 18px' }}>{scoreboard.TeamName1}</span>
          </div>
          <div className="overlay-team overlay-team2" style={{ 
            background: `linear-gradient(135deg, ${scoreboard.TeamColor2} 75%, ${scoreboard.TeamAccent2} 100%)`,
            display: 'flex', alignItems: 'center', padding: 0 }}>
            <span className="overlay-team-name" style={{ color: getContrastText(scoreboard.TeamColor2), padding: '6px 18px' }}>{scoreboard.TeamName2}</span>
          </div>
          {/* Set scores region, max 50% of overlay row */}
          <div style={{
            display: 'flex',
            flex: '0 1 50%',
            maxWidth: '50%',
            minWidth: 0,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            gap: 0,
          }}>
            {Array.from({length: scoreboard.MatchLength || 3}, (_, setIdx) => {
              const arrIdx = setIdx;
              const arr = Array.from({length: scoreboard.MatchLength || 3});
              const team1Score = scores[setIdx * 2] || 0;
              const team2Score = scores[setIdx * 2 + 1] || 0;
              const setTarget = setIdx === (scoreboard.MatchLength - 1) ? 15 : 25;
              // Determine if either team has won the set
              let team1Won = false, team2Won = false;
              if (
                team1Score >= setTarget &&
                team1Score - team2Score >= 2
              ) team1Won = true;
              if (
                team2Score >= setTarget &&
                team2Score - team1Score >= 2
              ) team2Won = true;
              return (
                <React.Fragment key={setIdx}>
                  {arrIdx > 0 && (
                    <div style={{ width: 1, height: 38, background: '#444', margin: '0 8px', alignSelf: 'center', borderRadius: 1, opacity: 0.7 }} />
                  )}
                  <div
                    className={`overlay-set${scoreboard.ActiveSet === setIdx ? ' active' : ''}`}
                    style={{
                      ...(
                        scoreboard.ActiveSet === setIdx
                          ? {
                              border: 'none',
                              background: 'transparent',
                              color: '#fff',
                              opacity: 1,
                              filter: 'none',
                              transition: 'opacity 180ms cubic-bezier(0.4,0,0.2,1)',
                            }
                          : {
                              background: 'transparent',
                              color: '#aaa',
                              opacity: 0.7,
                              filter: 'grayscale(0.2) brightness(0.95)',
                              transition: 'opacity 180ms cubic-bezier(0.4,0,0.2,1)',
                            }
                      ),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 0,
                      flex: '1 1 0',
                      maxWidth: scoreboard.MatchLength === 5 ? '20%' : '33.33%', // Each set max 1/5 for 5-set, 1/3 for 3-set
                      overflow: 'hidden',
                      padding: 0,
                    }}
                  >
                    <span
                      className="overlay-score"
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        minWidth: 0,
                        width: '100%',
                        overflow: 'hidden',
                        flex: '1 1 0',
                        fontSize: scoreboard.MatchLength === 5 ? '1.8em' : '2em', // Smaller font for 5-set matches
                        fontWeight: 800,
                        lineHeight: 1.1,
                      }}
                    >
                      <span className="score-anim-wrap" style={{ display: 'inline-block', overflow: 'hidden', width: scoreboard.MatchLength === 5 ? '2em' : '2.2em', height: '1.2em', verticalAlign: 'middle', textAlign: 'center', position: 'relative', minWidth: 0 }}>
                        {scoreAnim[setIdx*2] ? (
                          <>
                            <span className={`score-slide-out${scoreAnim[setIdx*2].dir === -1 ? ' reverse' : ''}`} style={{ display: 'block', width: '100%', ...((team1Won) ? { color: '#00ffae', fontWeight: 900, textShadow: '0 0 8px #00ffae88' } : {}) }}>{scoreAnim[setIdx*2].prev}</span>
                            <span className={`score-slide-in${scoreAnim[setIdx*2].dir === -1 ? ' reverse' : ''}`} style={{ display: 'block', width: '100%', ...((team1Won) ? { color: '#00ffae', fontWeight: 900, textShadow: '0 0 8px #00ffae88' } : {}) }}>{scoreAnim[setIdx*2].next}</span>
                          </>
                        ) : (
                          <span style={team1Won ? { color: '#00ffae', fontWeight: 900, textShadow: '0 0 8px #00ffae88' } : {}}>{team1Score}</span>
                        )}
                      </span>
                      <span className="overlay-score-sep" style={{ fontWeight: 700, fontSize: '1em', verticalAlign: 'middle', userSelect: 'none', minWidth: 0 }}>-</span>
                      <span className="score-anim-wrap" style={{ display: 'inline-block', overflow: 'hidden', width: scoreboard.MatchLength === 5 ? '2em' : '2.2em', height: '1.2em', verticalAlign: 'middle', textAlign: 'center', position: 'relative', minWidth: 0 }}>
                        {scoreAnim[setIdx*2+1] ? (
                          <>
                            <span className={`score-slide-out${scoreAnim[setIdx*2+1].dir === -1 ? ' reverse' : ''}`} style={{ display: 'block', width: '100%', ...((team2Won) ? { color: '#00ffae', fontWeight: 900, textShadow: '0 0 8px #00ffae88' } : {}) }}>{scoreAnim[setIdx*2+1].prev}</span>
                            <span className={`score-slide-in${scoreAnim[setIdx*2+1].dir === -1 ? ' reverse' : ''}`} style={{ display: 'block', width: '100%', ...((team2Won) ? { color: '#00ffae', fontWeight: 900, textShadow: '0 0 8px #00ffae88' } : {}) }}>{scoreAnim[setIdx*2+1].next}</span>
                          </>
                        ) : (
                          <span style={team2Won ? { color: '#00ffae', fontWeight: 900, textShadow: '0 0 8px #00ffae88' } : {}}>{team2Score}</span>
                        )}
                      </span>
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <div className="overlay-tournament" style={{
          background: '#181c1f', // fixed dark background
          borderTop: '3px solid var(--team1)', // teal accent border
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.8em',
          textAlign: 'center',
          padding: '5px 0',
          letterSpacing: 1,
          width: '100%',
          boxShadow: '0 -2px 8px #00adb522',
        }}>{scoreboard.Tournament}</div>
      </div>
    </div>
  );
}

// Inject keyframes for the animated background effect
if (typeof window !== 'undefined' && !document.getElementById('overlayLightMove-keyframes')) {
  const style = document.createElement('style');
  style.id = 'overlayLightMove-keyframes';
  style.innerHTML = `
@keyframes overlayLightMove {
  0% { background-position: 0% 50%; }
  25% { background-position: 50% 100%; }
  50% { background-position: 100% 50%; }
  75% { background-position: 50% 0%; }
  100% { background-position: 0% 50%; }
}
@keyframes angledLightSweep {
  0% { background-position: 120% 0%; opacity: 0.0; }
  10% { opacity: 0.35; }
  50% { background-position: -120% 0%; opacity: 0.35; }
  90% { opacity: 0.0; }
  100% { background-position: -120% 0%; opacity: 0.0; }
}
@keyframes overlayParallax {
  0% { transform: translateY(0px) scale(1.01); }
  50% { transform: translateY(10px) scale(1.03); }
  100% { transform: translateY(0px) scale(1.01); }
}
@keyframes overlayShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.overlay-parallax-bg {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  z-index: 0;
  pointer-events: none;
  background: linear-gradient(120deg, rgba(0,255,174,0.06) 0%, rgba(0,173,181,0.06) 40%, rgba(255,111,60,0.06) 60%, rgba(255,255,255,0.04) 100%);
  background-size: 400% 400%;
  filter: blur(10px);
  opacity: 0.35;
  animation: overlayParallax 36s ease-in-out infinite;
}
.overlay-shimmer {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(100deg, rgba(255,255,255,0) 60%, rgba(255,255,255,0.18) 70%, rgba(255,255,255,0) 80%);
  background-size: 300% 100%;
  opacity: 0.18;
  filter: blur(4px);
  animation: overlayShimmer 18s linear infinite;
}
`;
  document.head.appendChild(style);
}

// Inject keyframes for score slide animation (no absolute positioning)
if (typeof window !== 'undefined' && !document.getElementById('score-slide-keyframes')) {
  const style = document.createElement('style');
  style.id = 'score-slide-keyframes';
  style.innerHTML = `
.score-anim-wrap { display: inline-block; overflow: hidden; width: 2.2em; height: 1.2em; vertical-align: middle; text-align: center; position: relative; }
.score-slide-out {
  animation: scoreSlideOut 350ms cubic-bezier(0.4,0,0.2,1) forwards;
  position: absolute;
  left: 0; right: 0;
}
.score-slide-in {
  animation: scoreSlideIn 350ms cubic-bezier(0.4,0,0.2,1) forwards;
  position: absolute;
  left: 0; right: 0;
}
.score-slide-out.reverse {
  animation: scoreSlideOutReverse 350ms cubic-bezier(0.4,0,0.2,1) forwards;
}
.score-slide-in.reverse {
  animation: scoreSlideInReverse 350ms cubic-bezier(0.4,0,0.2,1) forwards;
}
@keyframes scoreSlideOut {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(100%); }
}
@keyframes scoreSlideIn {
  0% { opacity: 0; transform: translateY(-100%); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes scoreSlideOutReverse {
  0% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-100%); }
}
@keyframes scoreSlideInReverse {
  0% { opacity: 0; transform: translateY(100%); }
  100% { opacity: 1; transform: translateY(0); }
}
`;
  document.head.appendChild(style);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/score/:sqid" element={<ScoreView />} />
        <Route path="/board/:sqid" element={<OverlayView />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
