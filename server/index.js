// Entry point for the Express + Socket.IO + SQLite backend
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const Sqids = require('sqids').default;
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());

// Rate limiting middleware for API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// SQLite setup
const db = new sqlite3.Database('./scoreboards.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS scoreboards (
    ScoreboardId INTEGER PRIMARY KEY AUTOINCREMENT,
    TeamName1 TEXT,
    TeamName2 TEXT,
    TeamColor1 TEXT,
    TeamAccent1 TEXT,
    TeamColor2 TEXT,
    TeamAccent2 TEXT,
    Tournament TEXT,
    BoardColor TEXT,
    Scores TEXT,
    ActiveSet INTEGER
  )`);
});

// Sqids setup (use env vars for security)
// Add to your .env file:
// SQIDS_ALPHABET=your-long-random-alphabet
// SQIDS_MIN_LENGTH=6
const SQIDS_ALPHABET = process.env.SQIDS_ALPHABET;
const SQIDS_MIN_LENGTH = parseInt(process.env.SQIDS_MIN_LENGTH, 10);
if (!SQIDS_ALPHABET || typeof SQIDS_ALPHABET !== 'string' || SQIDS_ALPHABET.length < 20) {
  throw new Error('Missing or invalid SQIDS_ALPHABET env variable. Set a long, random string in your .env file.');
}
if (!SQIDS_MIN_LENGTH || isNaN(SQIDS_MIN_LENGTH) || SQIDS_MIN_LENGTH < 4) {
  throw new Error('Missing or invalid SQIDS_MIN_LENGTH env variable. Set a number >= 4 in your .env file.');
}
const sqids = new Sqids({ minLength: SQIDS_MIN_LENGTH, alphabet: SQIDS_ALPHABET });

// CORS policy: allow localhost for dev, skorbord.app for prod
const allowedOrigins = [
  'http://localhost:5173', // Vite default
  'http://localhost:3000', // Common React dev
  'http://localhost:4000', // Backend dev
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000', // Backend dev
  'https://skorbord.app'
];
const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// --- Input validation helper ---
function validateScoreboardInput(body) {
  const errors = [];
  // Team names: string, max 40 chars
  if (typeof body.TeamName1 !== 'string' || body.TeamName1.length > 40) errors.push('Invalid TeamName1');
  if (typeof body.TeamName2 !== 'string' || body.TeamName2.length > 40) errors.push('Invalid TeamName2');
  // Colors: hex string, 4-9 chars
  const colorRe = /^#[0-9a-fA-F]{3,8}$/;
  if (!colorRe.test(body.TeamColor1)) errors.push('Invalid TeamColor1');
  if (!colorRe.test(body.TeamAccent1)) errors.push('Invalid TeamAccent1');
  if (!colorRe.test(body.TeamColor2)) errors.push('Invalid TeamColor2');
  if (!colorRe.test(body.TeamAccent2)) errors.push('Invalid TeamAccent2');
  // Tournament: string, max 100 chars
  if (typeof body.Tournament !== 'string' || body.Tournament.length > 100) errors.push('Invalid Tournament');
  // BoardColor: hex string or empty
  if (body.BoardColor && !colorRe.test(body.BoardColor)) errors.push('Invalid BoardColor');
  // MatchLength: 3 or 5 (default to 3 if not provided for backward compatibility)
  const matchLength = body.MatchLength || 3;
  if (![3, 5].includes(matchLength)) errors.push('Invalid MatchLength');
  // Scores: comma-separated numbers, 6 values for 3-set, 10 values for 5-set
  const expectedScoreCount = matchLength === 3 ? 6 : 10;
  const scorePattern = matchLength === 3 
    ? /^\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2}$/
    : /^\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2}$/;
  if (typeof body.Scores !== 'string' || !scorePattern.test(body.Scores)) errors.push('Invalid Scores');
  // ActiveSet: validate against MatchLength (0 to matchLength-1)
  const validActiveSets = Array.from({length: matchLength}, (_, i) => i);
  if (!validActiveSets.includes(body.ActiveSet)) errors.push('Invalid ActiveSet');
  return errors;
}

// --- Socket.IO payload validation helpers ---
function isValidSqid(sqid) {
  // Sqids are alphanumeric, length >= SQIDS_MIN_LENGTH
  return typeof sqid === 'string' && sqid.length >= SQIDS_MIN_LENGTH && /^[a-zA-Z0-9]+$/.test(sqid);
}
function isValidScores(scores) {
  // Scores: comma-separated numbers, 6 or 10 values (for 3-set or 5-set matches)
  return typeof scores === 'string' && (
    /^\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2}$/.test(scores) ||
    /^\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2},\d{1,2}$/.test(scores)
  );
}
function isValidTeamInfo(obj) {
  const colorRe = /^#[0-9a-fA-F]{3,8}$/;
  return obj &&
    typeof obj.team1 === 'string' && obj.team1.length <= 40 &&
    typeof obj.team2 === 'string' && obj.team2.length <= 40 &&
    colorRe.test(obj.team1Color) &&
    colorRe.test(obj.team1Accent) &&
    colorRe.test(obj.team2Color) &&
    colorRe.test(obj.team2Accent);
}
function isValidDisplay(obj) {
  const colorRe = /^#[0-9a-fA-F]{3,8}$/;
  return obj &&
    typeof obj.tournament === 'string' && obj.tournament.length <= 100 &&
    (!obj.boardColor || colorRe.test(obj.boardColor));
}
function isValidSetIndex(idx, matchLength = 3) {
  // Validate set index against match length (0 to matchLength-1)
  const validSets = Array.from({length: matchLength}, (_, i) => i);
  return validSets.includes(idx);
}
function isValidMatchLength(matchLength) {
  return [3, 5].includes(matchLength);
}

// REST API: Get scoreboard by Sqid
app.get('/api/scoreboard/:sqid', (req, res) => {
  const id = sqids.decode(req.params.sqid)[0];
  if (!id) return res.status(404).json({ error: 'Invalid Sqid' });
  db.get('SELECT * FROM scoreboards WHERE ScoreboardId = ?', [id], (err, row) => {
    if (err) {
      console.error('GET /api/scoreboard/:sqid error:', err);
      return res.status(500).json({ error: err.message });
    }
    if (!row) return res.status(404).json({ error: 'Not found' });
    
    // Ensure backward compatibility: set default MatchLength to 3 if not present
    const result = { ...row };
    if (result.MatchLength == null) {
      result.MatchLength = 3;
    }
    
    res.json(result);
  });
});

// REST API: Create new scoreboard
app.post('/api/scoreboard', (req, res) => {
  const errors = validateScoreboardInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  const { TeamName1, TeamName2, TeamColor1, TeamAccent1, TeamColor2, TeamAccent2, Tournament, BoardColor, Scores, ActiveSet, MatchLength } = req.body;
  const matchLength = MatchLength || 3; // Default to 3 for backward compatibility
  db.run(
    'INSERT INTO scoreboards (TeamName1, TeamName2, TeamColor1, TeamAccent1, TeamColor2, TeamAccent2, Tournament, BoardColor, Scores, ActiveSet, MatchLength) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [TeamName1, TeamName2, TeamColor1, TeamAccent1, TeamColor2, TeamAccent2, Tournament, BoardColor, Scores, ActiveSet, matchLength],
    function (err) {
      if (err) {
        console.error('POST /api/scoreboard error:', err);
        return res.status(500).json({ error: err.message });
      }
      const sqid = sqids.encode([this.lastID]);
      res.json({ BoardSqid: sqid });
    }
  );
});

// REST API: Update scoreboard
app.put('/api/scoreboard/:sqid', (req, res) => {
  const errors = validateScoreboardInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  const id = sqids.decode(req.params.sqid)[0];
  if (!id) return res.status(404).json({ error: 'Invalid Sqid' });
  const { TeamName1, TeamName2, TeamColor1, TeamAccent1, TeamColor2, TeamAccent2, Tournament, BoardColor, Scores, ActiveSet, MatchLength } = req.body;
  const matchLength = MatchLength || 3; // Default to 3 for backward compatibility
  db.run(
    'UPDATE scoreboards SET TeamName1=?, TeamName2=?, TeamColor1=?, TeamAccent1=?, TeamColor2=?, TeamAccent2=?, Tournament=?, BoardColor=?, Scores=?, ActiveSet=?, MatchLength=? WHERE ScoreboardId=?',
    [TeamName1, TeamName2, TeamColor1, TeamAccent1, TeamColor2, TeamAccent2, Tournament, BoardColor, Scores, ActiveSet, matchLength, id],
    function (err) {
      if (err) {
        console.error('PUT /api/scoreboard/:sqid error:', err);
        return res.status(500).json({ error: err.message });
      }
      // Emit socket events for real-time update
      const sqid = req.params.sqid;
      // Emit scores (updated validation for both 6 and 10 values)
      if (isValidScores(Scores)) {
        const scoresArray = Scores.split(',').map(Number);
        io.to(sqid).emit('UpdateScores', scoresArray);
      }
      // Emit active set (validate against match length)
      if (isValidSetIndex(ActiveSet, matchLength)) {
        io.to(sqid).emit('UpdateActiveSet', ActiveSet);
      }
      // Emit match length
      if (isValidMatchLength(matchLength)) {
        io.to(sqid).emit('UpdateMatchLength', matchLength);
      }
      // Emit team info
      io.to(sqid).emit('UpdateTeamInfo', {
        team1: TeamName1,
        team1Color: TeamColor1,
        team1Accent: TeamAccent1,
        team2: TeamName2,
        team2Color: TeamColor2,
        team2Accent: TeamAccent2,
        tournament: Tournament
      });
      // Emit display info
      io.to(sqid).emit('UpdateDisplay', {
        tournament: Tournament,
        boardColor: BoardColor
      });
      res.json({ success: true });
    }
  );
});

// Socket.IO connection rate limiting (basic)
const socketConnectionCounts = {};
io.use((socket, next) => {
  const ip = socket.handshake.address;
  const now = Date.now();
  if (!socketConnectionCounts[ip]) socketConnectionCounts[ip] = [];
  // Remove timestamps older than 15 min
  socketConnectionCounts[ip] = socketConnectionCounts[ip].filter(ts => now - ts < 15 * 60 * 1000);
  if (socketConnectionCounts[ip].length >= 30) {
    return next(new Error('Too many socket connections from this IP.'));
  }
  socketConnectionCounts[ip].push(now);
  next();
});

// Socket.IO events for real-time updates
io.on('connection', (socket) => {
  socket.on('joinBoard', (sqid) => {
    if (!isValidSqid(sqid)) {
      socket.emit('error', { error: 'Invalid Sqid for joinBoard' });
      return;
    }
    socket.join(sqid);
  });

  socket.on('UpdateScores', ({ sqid, scores }) => {
    if (!isValidSqid(sqid) || !isValidScores(scores)) {
      socket.emit('error', { error: 'Invalid payload for UpdateScores' });
      return;
    }
    io.to(sqid).emit('UpdateScores', scores);
  });

  socket.on('UpdateTeamInfo', (payload) => {
    if (!isValidSqid(payload.sqid) || !isValidTeamInfo(payload)) {
      socket.emit('error', { error: 'Invalid payload for UpdateTeamInfo' });
      return;
    }
    const { sqid, team1, team1Color, team1Accent, team2, team2Color, team2Accent } = payload;
    io.to(sqid).emit('UpdateTeamInfo', { team1, team1Color, team1Accent, team2, team2Color, team2Accent });
  });

  socket.on('UpdateDisplay', (payload) => {
    if (!isValidSqid(payload.sqid) || !isValidDisplay(payload)) {
      socket.emit('error', { error: 'Invalid payload for UpdateDisplay' });
      return;
    }
    const { sqid, tournament, boardColor } = payload;
    io.to(sqid).emit('UpdateDisplay', { tournament, boardColor });
  });

  socket.on('UpdateActiveSet', (payload) => {
    if (!isValidSqid(payload.sqid)) {
      socket.emit('error', { error: 'Invalid payload for UpdateActiveSet' });
      return;
    }
    
    // Get the scoreboard to validate set index against match length
    const id = sqids.decode(payload.sqid)[0];
    if (!id) {
      socket.emit('error', { error: 'Invalid Sqid for UpdateActiveSet' });
      return;
    }
    
    db.get('SELECT MatchLength FROM scoreboards WHERE ScoreboardId = ?', [id], (err, row) => {
      if (err || !row) {
        socket.emit('error', { error: 'Could not validate set index' });
        return;
      }
      
      const matchLength = row.MatchLength || 3; // Default to 3 for backward compatibility
      if (!isValidSetIndex(payload.setIndex, matchLength)) {
        socket.emit('error', { error: 'Invalid payload for UpdateActiveSet' });
        return;
      }
      
      io.to(payload.sqid).emit('UpdateActiveSet', payload.setIndex);
    });
  });

  socket.on('UpdateMatchLength', (payload) => {
    if (!isValidSqid(payload.sqid) || !isValidMatchLength(payload.matchLength)) {
      socket.emit('error', { error: 'Invalid payload for UpdateMatchLength' });
      return;
    }
    const { sqid, matchLength } = payload;
    io.to(sqid).emit('UpdateMatchLength', matchLength);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
