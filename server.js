const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let waitingPlayer = null;
const matches = new Map();

wss.on("connection", function connection(ws) {
  let sessionId = null;
  let matchKey = null;

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.type === "name") {
      sessionId = data.sessionId || uuidv4();
      ws.sessionId = sessionId;
      ws.playerName = data.name || "Anonymous";

      // If a player is waiting, pair them
      if (waitingPlayer && waitingPlayer.ws.readyState === WebSocket.OPEN) {
        const player1 = waitingPlayer.ws;
        const player2 = ws;
        const sid1 = waitingPlayer.sessionId;
        const sid2 = sessionId;
        const names = { 1: waitingPlayer.name, 2: ws.playerName };

        matchKey = uuidv4();
        const match = {
          players: [player1, player2],
          names,
          board: Array.from({ length: 10 }, () => Array(10).fill(0)),
          turn: 0,
          isGameOver: false,
        };
        matches.set(matchKey, match);

        // ✅ Assign matchKey and sessionId to players
        player1.matchKey = matchKey;
        player2.matchKey = matchKey;
        player1.sessionId = sid1;
        player2.sessionId = sid2;

        // Notify both players
        player1.send(JSON.stringify({ type: "start", player: 1, sessionId: sid1 }));
        player2.send(JSON.stringify({ type: "start", player: 2, sessionId: sid2 }));
        player1.send(JSON.stringify({ type: "names", names }));
        player2.send(JSON.stringify({ type: "names", names }));

        waitingPlayer = null;
      } else {
        // No player waiting, so wait
        waitingPlayer = { ws, sessionId, name: ws.playerName };
        ws.send(JSON.stringify({ type: "wait" }));
      }
    }

    if (data.type === "move") {
      const match = matches.get(ws.matchKey);
      if (!match || match.isGameOver) return;

      const playerIndex = match.players.indexOf(ws);
      if (playerIndex !== match.turn) return;

      const { x, y } = data;
      if (match.board[y][x] !== 0) return;

      match.board[y][x] = playerIndex + 1;
      match.turn = 1 - match.turn;

      match.players.forEach(p =>
        p.send(JSON.stringify({ type: "move", x, y, player: playerIndex + 1 }))
      );

      if (checkWin(match.board, x, y, playerIndex + 1)) {
        match.isGameOver = true;
        match.players.forEach(p =>
          p.send(JSON.stringify({ type: "win", player: playerIndex + 1 }))
        );
      }
    }

    if (data.type === "rematch_request") {
      const match = matches.get(ws.matchKey);
      if (!match) return;

      const opponent = match.players.find(p => p !== ws);
      if (opponent.readyState === WebSocket.OPEN) {
        opponent.send(JSON.stringify({ type: "rematch_request" }));
      }
    }

    if (data.type === "rematch_accept") {
      const match = matches.get(ws.matchKey);
      if (!match) return;

      match.board = Array.from({ length: 10 }, () => Array(10).fill(0));
      match.turn = 0;
      match.isGameOver = false;

      match.players.forEach((p, i) => {
        p.send(JSON.stringify({ type: "rematch_start", player: i + 1, sessionId: p.sessionId }));
        p.send(JSON.stringify({ type: "names", names: match.names }));
      });
    }

    if (data.type === "rematch_decline") {
      const match = matches.get(ws.matchKey);
      if (!match) return;
      const opponent = match.players.find(p => p !== ws);
      if (opponent.readyState === WebSocket.OPEN) {
        opponent.send(JSON.stringify({ type: "rematch_decline" }));
      }
    }
  });

  ws.on("close", () => {
    const match = matches.get(ws.matchKey);
    if (match && !match.isGameOver) {
      const opponent = match.players.find(p => p !== ws);
      if (opponent.readyState === WebSocket.OPEN) {
        opponent.send(JSON.stringify({ type: "opponent_left_win" }));
      }
      match.isGameOver = true;
    }
    if (waitingPlayer && waitingPlayer.sessionId === sessionId) {
      waitingPlayer = null;
    }
  });
});

// ✅ Win check helper
function checkWin(board, x, y, player) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of directions) {
    let count = 1;
    for (let i = 1; i < 5; i++) {
      if (board[y + dy * i]?.[x + dx * i] === player) count++;
      else break;
    }
    for (let i = 1; i < 5; i++) {
      if (board[y - dy * i]?.[x - dx * i] === player) count++;
      else break;
    }
    if (count >= 5) return true;
  }
  return false;
}

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`✅ Server running at http://localhost:${port}`));