
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

const rooms = new Map();
const SHIPS = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 }
];

function newBoard() {
  return Array.from({ length: 10 }, () => Array(10).fill(null));
}

function newPlayer(socket) {
  return {
    id: socket.id,
    name: "Player",
    ready: false,
    ships: [],
    board: newBoard(),
    shots: newBoard(),
    incomingShots: newBoard(),
    hits: 0
  };
}

function roomCode() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function publicState(room, socketId) {
  const meIndex = room.players.findIndex(p => p.id === socketId);
  const opponent = room.players[1 - meIndex];
  const me = room.players[meIndex];

  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p, i) => ({
      name: p.name,
      ready: p.ready,
      connected: true,
      you: p.id === socketId,
      index: i
    })),
    currentTurn: room.currentTurn,
    yourIndex: meIndex,
    yourBoard: me ? me.board : null,
    yourShots: me ? me.shots : null,
    incomingShots: me ? me.incomingShots : null,
    opponentHits: opponent ? opponent.hits : 0,
    shipList: SHIPS,
    winnerIndex: room.winnerIndex,
    message: room.message || ""
  };
}

function sendState(room) {
  room.players.forEach(p => {
    io.to(p.id).emit("state", publicState(room, p.id));
  });
}

function getRoomForSocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.id === socketId)) return room;
  }
  return null;
}

function validPlacement(placements) {
  if (!Array.isArray(placements) || placements.length !== SHIPS.length) return false;

  const board = newBoard();

  for (let i = 0; i < SHIPS.length; i++) {
    const ship = placements[i], spec = SHIPS[i];

    if (!ship || !Array.isArray(ship.cells) || ship.cells.length !== spec.size) {
      return false;
    }

    const cells = ship.cells;
    const rows = cells.map(c => c.r);
    const cols = cells.map(c => c.c);

    if (cells.some(c =>
      !Number.isInteger(c.r) ||
      !Number.isInteger(c.c) ||
      c.r < 0 || c.r > 9 ||
      c.c < 0 || c.c > 9
    )) {
      return false;
    }

    const sameRow = rows.every(r => r === rows[0]);
    const sameCol = cols.every(c => c === cols[0]);

    if (!sameRow && !sameCol) return false;

    const sorted = (sameRow ? cols : rows).slice().sort((a, b) => a - b);

    if (sorted.some((v, idx) => idx > 0 && v !== sorted[idx - 1] + 1)) {
      return false;
    }

    for (const cell of cells) {
      if (board[cell.r][cell.c] !== null) return false;
      board[cell.r][cell.c] = spec.name;
    }
  }

  return true;
}

function remainingShips(player) {
  const names = new Set(player.ships.map(s => s.name));
  const hitNames = new Set();

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      if (player.board[r][c] && player.incomingShots[r][c] === "hit") {
        hitNames.add(player.board[r][c]);
      }
    }
  }

  return [...names].filter(n => !hitNames.has(n)).length;
}

io.on("connection", socket => {
  socket.emit("hello", { ships: SHIPS });

  socket.on("createRoom", ({ name } = {}) => {
    let code;
    do {
      code = roomCode();
    } while (rooms.has(code));

    const room = {
      code,
      phase: "waiting",
      players: [newPlayer(socket)],
      currentTurn: 0,
      winnerIndex: null,
      message: "Waiting for an opponent…"
    };

    room.players[0].name =
      String(name || "Player 1").trim().slice(0, 18) || "Player 1";

    rooms.set(code, room);
    socket.join(code);
    socket.emit("joined", { code, index: 0 });
    sendState(room);
  });

  socket.on("joinRoom", ({ code, name } = {}) => {
    code = String(code || "").trim().toUpperCase();

    const room = rooms.get(code);

    if (!room) {
      return socket.emit("errorMessage", "That room code was not found.");
    }

    if (room.players.length >= 2) {
      return socket.emit("errorMessage", "That room is already full.");
    }

    if (room.phase !== "waiting") {
      return socket.emit("errorMessage", "That game has already started.");
    }

    const player = newPlayer(socket);
    player.name = String(name || "Player 2").trim().slice(0, 18) || "Player 2";

    room.players.push(player);
    room.phase = "placement";
    room.message = "Both players are here. Place your ships.";

    socket.join(code);
    socket.emit("joined", { code, index: 1 });
    sendState(room);
  });

  socket.on("placeShips", ({ placements } = {}) => {
    const room = getRoomForSocket(socket.id);

    if (!room || room.phase !== "placement") return;

    const player = room.players.find(p => p.id === socket.id);

    if (player.ready) {
      return socket.emit("errorMessage", "You have already deployed your fleet.");
    }

    if (!validPlacement(placements)) {
      return socket.emit(
        "errorMessage",
        "Invalid ship layout. Check ship lengths, straight lines, and overlaps."
      );
    }

    player.ships = placements.map((s, i) => ({
      name: SHIPS[i].name,
      cells: s.cells.map(c => ({ r: c.r, c: c.c }))
    }));

    player.board = newBoard();

    for (const ship of player.ships) {
      for (const cell of ship.cells) {
        player.board[cell.r][cell.c] = ship.name;
      }
    }

    player.ready = true;

    room.message = room.players.every(p => p.ready)
      ? "Both fleets are ready. Battle!"
      : `${player.name} is ready. Waiting for the other fleet…`;

    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      room.phase = "battle";
      room.currentTurn = 0;
      room.message = `${room.players[0].name} fires first.`;
    }

    sendState(room);
  });

  socket.on("fire", ({ r, c } = {}) => {
    const room = getRoomForSocket(socket.id);

    if (!room || room.phase !== "battle") return;

    const index = room.players.findIndex(p => p.id === socket.id);

    if (index !== room.currentTurn) {
      return socket.emit("errorMessage", "It's not your turn.");
    }

    if (
      !Number.isInteger(r) ||
      !Number.isInteger(c) ||
      r < 0 || r > 9 ||
      c < 0 || c > 9
    ) {
      return;
    }

    const shooter = room.players[index];
    const enemy = room.players[1 - index];

    if (shooter.shots[r][c] !== null) {
      return socket.emit(
        "errorMessage",
        "You already fired at that coordinate."
      );
    }

    const shipName = enemy.board[r][c];
    const result = shipName ? "hit" : "miss";

    // Record the shot on the attacker's target grid.
    shooter.shots[r][c] = result;

    // Record the incoming shot on the defender's personal grid.
    enemy.incomingShots[r][c] = result;

    if (shipName) {
      enemy.hits++;
      room.message = `${shooter.name} hit a ${shipName}!`;

      if (remainingShips(enemy) === 0) {
        room.phase = "finished";
        room.winnerIndex = index;
        room.message = `${shooter.name} wins! All enemy ships have been sunk.`;
      }
    } else {
      room.message = `${shooter.name} missed.`;
    }

    if (room.phase === "battle") {
      room.currentTurn = 1 - index;
    }

    sendState(room);
  });

  socket.on("disconnect", () => {
    const room = getRoomForSocket(socket.id);
    if (!room) return;

    const idx = room.players.findIndex(p => p.id === socket.id);

    if (room.phase === "finished") {
      room.players = room.players.filter(p => p.id !== socket.id);

      if (!room.players.length) {
        rooms.delete(room.code);
      } else {
        sendState(room);
      }

      return;
    }

    room.phase = "waiting";
    room.message = "A player disconnected. This room is no longer active.";
    room.players = room.players.filter(p => p.id !== socket.id);

    if (!room.players.length) {
      rooms.delete(room.code);
    } else {
      sendState(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Battleship Online running on port ${PORT}`);
});
