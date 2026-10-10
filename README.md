# Battleship Online

A real-time, room-code multiplayer Battleship game built with Node.js, Express and Socket.IO.

## Features
- Two players can play from separate devices/browsers
- Private 6-character room codes
- Ship placement on a 10×10 grid
- Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2)
- Horizontal/vertical placement and random fleet placement
- Turn-based attacks, hits/misses and win detection
- Responsive layout for phones and computers

## Run locally
1. Install Node.js 18 or newer.
2. Extract this ZIP and open the folder in VS Code.
3. In a terminal, run:
   ```bash
   npm install
   npm start
   ```
4. Open `http://localhost:3000`.
5. For two-player testing on one computer, use two browser tabs. For friends on other devices, deploy it online.

## Deploy on Render
1. Create a GitHub repository and upload these project files.
2. In Render, create a **Web Service** connected to the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Deploy, then share the public Render URL. Each player opens the same URL and uses the room code.

## Notes
- Rooms are held in server memory. Restarting the server clears active games.
- This starter version supports two players per room. Add reconnection support, persistent rooms, rematches, and anti-abuse controls before a larger public launch.
- Never expose private server secrets in frontend files.
