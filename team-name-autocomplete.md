# Team Name Autocomplete Implementation Steps

This document outlines the steps to add team name autocomplete functionality for TeamName2 in the Skorbord Volleyball Scoreboard App.

## Backend (Node.js/Express, SQLite)

1. **Create a Team Names Table**
   - Add a new table (e.g., `team_names`) in SQLite to store unique team names.
2. **API Endpoint for Autocomplete**
   - Implement a REST endpoint (e.g., `GET /api/team-names?query=...`) that returns a list of team names matching the query (case-insensitive, partial match).
3. **API Endpoint to Add Team Name**
   - Implement a REST endpoint (e.g., `POST /api/team-names`) to add a new team name if it doesn’t already exist (case-insensitive check).
4. **Update Scoreboard Save Logic**
   - When saving a scoreboard, if TeamName2 is new, ensure it is added to the `team_names` table.

## Frontend (React)

5. **Autocomplete UI for TeamName2**
   - Replace the TeamName2 input with an autocomplete component (e.g., using a library like MUI Autocomplete or a custom solution).
   - On input change, call the backend autocomplete API to fetch matching team names.
   - Allow free text entry; if the user enters a name not in the list and submits, call the backend to add it.
6. **Case-Insensitive Matching**
   - Ensure both backend and frontend treat team names case-insensitively for matching and storing.
7. **Update State and UI**
   - When a new team name is added, update the UI and local state accordingly.

## General

8. **Testing**
   - Add tests for the new endpoints and UI component.
   - Test the full flow: autocomplete, free entry, and new name addition.
