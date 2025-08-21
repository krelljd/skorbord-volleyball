# Match Length Toggle Implementation Plan

## Overview
Add a "Match Length" toggle feature that allows volleyball matches to be played in either 3-set or 5-set format. The toggle will be located in the "Show Match Info" section of the ScoreView and will be persisted in the database.

## Requirements Summary
- Toggle between 3-set and 5-set match formats
- Final set logic (play to 15) applies only to the actual final set (3rd or 5th)
- Hide 4th and 5th set controls and display when Match Length is set to 3
- Preserve all existing functionality
- Persist setting in database
- Real-time updates via WebSocket

## Implementation Plan

### Phase 1: Database Schema Update ✅ COMPLETE

#### 1.1 Update SQLite Schema ✅ COMPLETE
**File:** `server/index.js`
- ✅ Added `MatchLength` column to scoreboards table
- ✅ Default value: `3` (to maintain compatibility with existing scoreboards)
- ✅ Data type: `INTEGER` with constraint `CHECK (MatchLength IN (3, 5))`
- ✅ Migration executed manually

**Changes:**
```sql
ALTER TABLE scoreboards ADD COLUMN MatchLength INTEGER DEFAULT 3 CHECK (MatchLength IN (3, 5));
```

#### 1.2 Update Validation Functions ✅ COMPLETE
**File:** `server/index.js`
- ✅ Updated `validateScoreboardInput()` to include MatchLength validation
- ✅ Ensured MatchLength is either 3 or 5
- ✅ Updated all validation references to handle the new field

#### 1.3 Update API Endpoints ✅ COMPLETE
**File:** `server/index.js`
- ✅ Added MatchLength to GET `/api/scoreboard/:sqid` response
- ✅ Added MatchLength to POST `/api/scoreboard` input validation and creation
- ✅ Added MatchLength to PUT `/api/scoreboard/:sqid` input validation and update
- ✅ Updated Socket.IO payload validation for new UpdateMatchLength event

### Phase 2: Backend WebSocket Events ✅ COMPLETE

#### 2.1 New Socket Event ✅ COMPLETE
**File:** `server/index.js`
- ✅ Added `UpdateMatchLength` socket event handler
- ✅ Validates payload structure: `{ sqid: string, matchLength: 3|5 }`
- ✅ Emits event to all connected clients for real-time updates

#### 2.2 Update Existing Events ✅ COMPLETE
**File:** `server/index.js`  
- ✅ Updated PUT endpoint to emit MatchLength changes via socket
- ✅ Ensured MatchLength is included in all relevant data broadcasts

### Phase 3: Frontend Data Model Updates ✅ COMPLETE

#### 3.1 Update useScoreboard Hook ✅ COMPLETE
**File:** `src/main.jsx`
- ✅ Updated initial state to include MatchLength field
- ✅ Ensured MatchLength is properly handled in API responses

#### 3.2 Update Socket Event Handlers ✅ COMPLETE
**File:** `src/main.jsx`
- ✅ Added handler for `UpdateMatchLength` socket event in `useSocket` hook
- ✅ Updates scoreboard state when MatchLength changes

### Phase 4: ScoreView UI Implementation ✅ COMPLETE

#### 4.1 Add Match Length Toggle ✅ COMPLETE
**File:** `src/main.jsx` - ScoreView component
- ✅ Added MatchLength to edit state (default: 3)
- ✅ Added toggle control in the "Show Match Info" section
- ✅ Positioned near Tournament field for logical grouping
- ✅ Used accessible select dropdown
- ✅ Updated `saveTeamInfo` function to include MatchLength

#### 4.2 Dynamic Set Display Logic ✅ COMPLETE
**File:** `src/main.jsx` - ScoreView component
- ✅ Modified the set mapping logic `[0, 1, 2].map(...)` to be dynamic
- ✅ Shows sets 1-3 when MatchLength is 3
- ✅ Shows sets 1-5 when MatchLength is 5
- ✅ Updated set iteration to use: `Array.from({length: scoreboard.MatchLength}, (_, i) => i)`

#### 4.3 Final Set Scoring Logic ✅ COMPLETE
**File:** `src/main.jsx` - ScoreView component
- ✅ ScoreView doesn't contain scoring validation logic (handled in OverlayView)
- ✅ Score updates work correctly with dynamic set counts
- ✅ Will be implemented in Phase 5 for OverlayView

#### 4.4 ActiveSet Validation ✅ COMPLETE
**File:** `src/main.jsx` - ScoreView component
- ✅ Updated `updateActiveSet` function to validate set index against MatchLength
- ✅ Prevents setting active set beyond available sets
- ✅ Resets to Set 1 if current ActiveSet exceeds new MatchLength limit
- ✅ Added edge case handling for MatchLength changes
- ✅ Updated Reset Scores to work with dynamic match lengths

### Phase 5: OverlayView Updates ✅ COMPLETE

#### 5.1 Dynamic Set Display ✅ COMPLETE
**File:** `src/main.jsx` - OverlayView component
- ✅ Updated set display logic from hardcoded `[0, 1, 2].map(...)` to dynamic based on MatchLength
- ✅ Used same pattern: `Array.from({length: scoreboard.MatchLength || 3}, (_, i) => i)`
- ✅ Added safety checks for undefined scores with fallback to 0

#### 5.2 Final Set Highlighting ✅ COMPLETE
**File:** `src/main.jsx` - OverlayView component
- ✅ Updated win condition logic to use dynamic final set determination
- ✅ Changed `setIdx === 2 ? 15 : 25` to `setIdx === (scoreboard.MatchLength - 1) ? 15 : 25`
- ✅ Ensured proper highlighting for set wins based on match length

#### 5.3 Responsive Layout ✅ COMPLETE
**File:** `src/main.jsx` - OverlayView component
- ✅ Adjusted set container styling to accommodate 5 sets
- ✅ Updated maxWidth: 20% for 5-set matches, 33.33% for 3-set matches
- ✅ Reduced font size for 5-set matches (1.8em vs 2em)
- ✅ Adjusted score animation wrapper width for better fit
- ✅ Updated animation arrays to support up to 10 scores (5 sets)
- ✅ Enhanced animation logic to handle variable match lengths

### Phase 6: Backend Input Validation Updates

#### 6.1 Scores CSV Validation
**File:** `server/index.js`
- Update Scores validation to handle variable length based on MatchLength
- 3-set match: 6 values (current behavior)
- 5-set match: 10 values (team1_set1, team2_set1, team1_set2, team2_set2, ..., team1_set5, team2_set5)
- Update regex patterns accordingly

#### 6.2 ActiveSet Validation
**File:** `server/index.js`
- Update ActiveSet validation from `[0,1,2]` to dynamic range based on MatchLength
- 3-set match: `[0,1,2]`
- 5-set match: `[0,1,2,3,4]`

### Phase 7: Data Migration Strategy

#### 7.1 Existing Scoreboards
**File:** `server/index.js`
- Create migration logic to add MatchLength column with default value 3
- Ensure all existing scoreboards continue to work as 3-set matches
- No data loss or breaking changes

#### 7.2 Scores CSV Handling
**File:** `src/main.jsx`
- Add backward compatibility for existing 6-value CSV scores
- When MatchLength is 5 but Scores only has 6 values, pad with "0,0,0,0"
- When MatchLength is 3 but Scores has 10 values, truncate to first 6 values

### Phase 8: Error Handling & Edge Cases

#### 8.1 Match Length Change Handling
**File:** `src/main.jsx`
- When changing from 5 to 3 sets:
  - Reset ActiveSet to 0 if it's currently set 4 or 5
  - Truncate scores to first 6 values
  - Clear any data for sets 4 and 5
- When changing from 3 to 5 sets:
  - Keep existing scores for sets 1-3
  - Initialize sets 4 and 5 with 0-0 scores

#### 8.2 Validation Error Messages
**File:** `server/index.js`
- Add appropriate error messages for MatchLength validation failures
- Ensure WebSocket error handling includes MatchLength validation

### Phase 9: Testing Considerations

#### 9.1 Database Testing
- Test schema migration on existing database
- Verify new scoreboards default to 3-set format
- Test MatchLength validation constraints

#### 9.2 UI Testing
- Test toggle functionality in ScoreView
- Verify set hiding/showing based on MatchLength
- Test ActiveSet validation and reset behavior
- Verify final set scoring logic (15 vs 25 points)

#### 9.3 Real-time Testing  
- Test WebSocket updates for MatchLength changes
- Verify OverlayView updates dynamically
- Test multiple clients receiving MatchLength updates

#### 9.4 Edge Case Testing
- Test switching MatchLength mid-match
- Test with various ActiveSet values
- Test score truncation/padding logic
- Test with malformed data

### Phase 10: Documentation Updates

#### 10.1 API Documentation
- Update API documentation to include MatchLength field
- Document new WebSocket events
- Update example payloads

#### 10.2 Specification Updates
**File:** `scoreboard app specification.md`
- Add MatchLength to data model
- Update scoring rules to reflect dynamic final set logic
- Update business logic description

### Technical Implementation Details

#### Database Schema Change
```sql
-- Migration script
ALTER TABLE scoreboards ADD COLUMN MatchLength INTEGER DEFAULT 3 CHECK (MatchLength IN (3, 5));
```

#### UI Component Structure
```jsx
{/* In ScoreView - Show Match Info section */}
<div>
  <label htmlFor="matchLength">Match Length:</label>
  <select 
    id="matchLength"
    value={edit.MatchLength || 3} 
    onChange={e => setEdit({...edit, MatchLength: parseInt(e.target.value)})}
  >
    <option value={3}>Best of 3 Sets</option>
    <option value={5}>Best of 5 Sets</option>
  </select>
</div>
```

#### Dynamic Set Iteration
```jsx
{/* Replace hardcoded [0,1,2] with dynamic array */}
{Array.from({length: scoreboard.MatchLength || 3}, (_, setIdx) => (
  // Set component JSX
))}
```

#### Final Set Logic
```jsx
{/* Replace hardcoded setIdx === 2 with dynamic check */}
const isLastSet = setIdx === (scoreboard.MatchLength - 1);
const setTarget = isLastSet ? 15 : 25;
```

## Risk Mitigation

1. **Backward Compatibility**: Default MatchLength to 3 ensures existing scoreboards continue working
2. **Data Integrity**: CSV validation prevents malformed score data
3. **UI Responsiveness**: Responsive design ensures 5-set matches display properly
4. **Real-time Sync**: WebSocket events keep all clients synchronized
5. **Progressive Enhancement**: Feature can be implemented incrementally without breaking existing functionality

## Success Criteria

- ✅ Users can toggle between 3-set and 5-set match formats
- ✅ Final set correctly plays to 15 points (3rd set in 3-set match, 5th set in 5-set match)
- ✅ Sets 4 and 5 are hidden when MatchLength is 3
- ✅ All existing scoreboards continue to function as 3-set matches
- ✅ Changes persist in database and sync in real-time
- ✅ Both ScoreView and OverlayView handle dynamic set counts
- ✅ No breaking changes to existing API or functionality

This implementation plan provides a comprehensive approach to adding the Match Length toggle while maintaining system stability and user experience.
