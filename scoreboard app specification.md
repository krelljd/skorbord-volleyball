# Skorbord Volleyball Scoreboard App - Specification

## Business Logic

- Real-time score updates are provided via REST and WebSocket (Socket.IO) APIs.
- Admin/operator view allows updating of team names, colors, tournament info, and scores.
- Overlay/public view displays scores and team info for streaming overlays, always in light mode, minimal padding, and top-aligned.
- Team color/accent bars extend full height, with no spacing or borders.
- The active set is visually highlighted (border left/right only).
- Winning score in each set is highlighted if the set is won (to 25 for sets 1/2, 15 for set 3, must win by 2 points).
- All font sizes use relative units (em) for accessibility.
- Tournament name and all scoreboard data update in real time.
- White and black are allowed as accent colors.
- All scoreboard data operations use REST and WebSocket APIs.
- Frontend build output is always in the `dist/` directory for deployment.
- Secure access to each scoreboard is via a unique encoded URL parameter (Sqids).

## Data Model

A Scoreboard consists of the following fields:

- `TeamName1`: Name of team 1
- `TeamName2`: Name of team 2
- `TeamColor1`: Primary color for team 1
- `TeamAccent1`: Accent color for team 1
- `TeamColor2`: Primary color for team 2
- `TeamAccent2`: Accent color for team 2
- `Tournament`: Tournament name
- `BoardColor`: Background color for the board
- `Scores`: CSV string of set scores
- `ActiveSet`: Index or identifier for the currently active set
- `Sqid`: Unique encoded identifier for secure access

## UI/UX Requirements

- OverlayView: Minimal, stream-friendly, always light mode, fills viewport, no spacing or borders, top-aligned.
- ScoreView: Compact controls, collapsible match info section.
- Buttons and text use relative font sizes for accessibility.
- Active set and winning scores are visually highlighted according to volleyball rules.

## Set and Scoring Rules

- Sets 1 & 2: Play to 25 points.
- Set 3: Play to 15 points.
- Must win by 2 points in any set.
- Highlight the winning score with color and glow only if the criteria are met.

## Example OverlayView Score Highlighting (JSX)

```
<span className="overlay-score">
  <span style={team1Won ? { color: '#00ffae', fontWeight: 900, textShadow: '0 0 8px #00ffae88', fontSize: 'inherit' } : { fontSize: 'inherit' }}>{team1Score}</span>
  <span className="overlay-score-sep">-</span>
  <span style={team2Won ? { color: '#00ffae', fontWeight: 900, textShadow: '0 0 8px #00ffae88', fontSize: 'inherit' } : { fontSize: 'inherit' }}>{team2Score}</span>
</span>
```

## Additional Notes

- All code follows modern best practices for accessibility and maintainability.
- Deployment steps and automation scripts are documented in `deployment_steps.md`.
- See `code_map.json` for a machine-readable project structure and dependency map.
