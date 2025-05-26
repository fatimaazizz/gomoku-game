// script.js
let board = document.getElementById("board");
let socket = null;
let player = null;
let myTurn = false;
let sessionId = localStorage.getItem("gomokuSessionId") || null;
let playerNames = {1: "Player 1", 2: "Player 2"};

let h1Title = null;
let waitTimeout = null;
let moveTimeout = null;
let countdownInterval = null;
let timedOut = false;
let countdown = 10;

document.addEventListener("DOMContentLoaded", () => {
  h1Title = document.querySelector("#game-container h1");
});

function startGame() {
  socket = new WebSocket("ws://" + location.host);
  const nameInput = document.getElementById("nameInput").value;
  document.getElementById("intro-screen").style.display = "none";
  document.getElementById("game-container").style.display = "block";
  board.style.display = "none";
  h1Title.innerText = "GoMoKu - Waiting for second player to join...";
  document.getElementById("turnDisplay").innerHTML = "<div class='dot-flashing'></div>";
  timedOut = false;
  document.getElementById("retryButton")?.remove();
  document.getElementById("overlay")?.remove();

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "name", name: nameInput || "Anonymous", sessionId }));
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "start" || msg.type === "rematch_start") {
      player = msg.player;
      myTurn = (player === 1);
      document.getElementById("playerLabel").innerText = `You are Player ${player}`;
      if (msg.sessionId) {
        sessionId = msg.sessionId;
        localStorage.setItem("gomokuSessionId", sessionId);
      }
      resetGameState();
    }

    if (msg.type === "wait") {
      h1Title.innerText = "GoMoKu - Waiting for second player to join...";
      document.getElementById("turnDisplay").innerHTML = "<div class='dot-flashing'></div>";
      board.style.display = "none";

      waitTimeout = setTimeout(() => {
        h1Title.innerText = "We were unable to find a second player.";
        document.getElementById("turnDisplay").innerHTML = "";
        timedOut = true;
        localStorage.removeItem("gomokuSessionId");
        socket.close();

        const retryBtn = document.createElement("button");
        retryBtn.id = "retryButton";
        retryBtn.textContent = "Try Again";
        retryBtn.style.marginTop = "20px";
        retryBtn.onclick = () => {
          localStorage.setItem("gomokuSessionId", crypto.randomUUID());
          location.reload();
        };
        document.getElementById("game-container").appendChild(retryBtn);
      }, 30000);
    }

    if (msg.type === "names") {
      playerNames = msg.names;
      if (playerNames[1].toLowerCase() === "anonymous" && playerNames[2].toLowerCase() === "anonymous") {
        playerNames[1] = "Anonymous 1";
        playerNames[2] = "Anonymous 2";
      }
      updateNameDisplay();
      board.style.display = "grid";
      clearTimeout(waitTimeout);
      updateTurnDisplay();
    }

    if (msg.type === "move") {
      clearTimeout(moveTimeout);
      clearInterval(countdownInterval);
      const index = msg.y * 10 + msg.x;
      document.querySelectorAll(".cell")[index].classList.add(msg.player === 1 ? "black" : "white");
      myTurn = (msg.player !== player);
      updateTurnDisplay();
    }

    if (msg.type === "win") {
      showOverlay(msg.player === player ? "You Win! 🎉" : "You Lose 😞", true);
    }

    if (msg.type === "opponent_left_win") {
      showOverlay("Opponent Left — You Win! 🎉", false);
    }

    if (msg.type === "rematch_request") {
      showRematchDialog();
    }

    if (msg.type === "rematch_accept" || msg.type === "rematch_start") {
      resetGameState();
    }

    if (msg.type === "rematch_decline") {
      alert("Opponent declined the rematch.");
    }
  };
}

function sendRematchRequest() {
  socket.send(JSON.stringify({ type: 'rematch_request' }));
  showOverlay("Waiting for opponent to accept rematch...", false);
}

function showRematchDialog() {
  const dialog = document.createElement("div");
  dialog.style.position = "fixed";
  dialog.style.top = "50%";
  dialog.style.left = "50%";
  dialog.style.transform = "translate(-50%, -50%)";
  dialog.style.background = "#fff";
  dialog.style.padding = "20px";
  dialog.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
  dialog.style.zIndex = 9999;
  dialog.style.textAlign = "center";

  const text = document.createElement("p");
  text.innerText = "Your opponent requested a rematch.";
  dialog.appendChild(text);

  const acceptBtn = document.createElement("button");
  acceptBtn.innerText = "Accept";
  acceptBtn.onclick = () => {
    socket.send(JSON.stringify({ type: "rematch_accept" }));
    document.body.removeChild(dialog);
  };

  const declineBtn = document.createElement("button");
  declineBtn.innerText = "Decline";
  declineBtn.style.marginLeft = "10px";
  declineBtn.onclick = () => {
    socket.send(JSON.stringify({ type: "rematch_decline" }));
    document.body.removeChild(dialog);
  };

  dialog.appendChild(acceptBtn);
  dialog.appendChild(declineBtn);
  document.body.appendChild(dialog);
}

function showOverlay(message, allowRematch = true) {
  clearTimeout(moveTimeout);
  clearInterval(countdownInterval);
  const overlay = document.createElement("div");
  overlay.id = "overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.background = "rgba(0, 0, 0, 0.85)";
  overlay.style.color = "#fff";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "9999";

  const msg = document.createElement("h1");
  msg.innerText = message;
  overlay.appendChild(msg);

  if (allowRematch) {
    const rematchBtn = document.createElement("button");
    rematchBtn.innerText = "Request Rematch";
    rematchBtn.style.marginTop = "15px";
    rematchBtn.style.padding = "10px 20px";
    rematchBtn.onclick = sendRematchRequest;
    overlay.appendChild(rematchBtn);
  }

  const newGameBtn = document.createElement("button");
  newGameBtn.innerText = "New Game (New Player)";
  newGameBtn.style.marginTop = "10px";
  newGameBtn.style.padding = "10px 20px";
  newGameBtn.onclick = () => {
    localStorage.setItem("gomokuSessionId", crypto.randomUUID());
    location.reload();
  };
  overlay.appendChild(newGameBtn);

  document.body.appendChild(overlay);
}

function resetGameState() {
  board.innerHTML = ""; // Clear existing board

  // Rebuild the 10x10 board
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cell = document.createElement("div");
      cell.classList.add("cell");
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener("click", () => {
        if (!myTurn) {
          alert("It's not your turn!");
          return;
        }
        socket.send(JSON.stringify({ type: "move", x, y }));
        clearTimeout(moveTimeout);
        clearInterval(countdownInterval);
      });
      board.appendChild(cell);
    }
  }

  myTurn = (player === 1);
  timedOut = false;
  clearTimeout(moveTimeout);
  clearInterval(countdownInterval);
  updateTurnDisplay();
  document.getElementById("overlay")?.remove();
}

function updateNameDisplay() {
  if (!h1Title) h1Title = document.querySelector("#game-container h1");
  h1Title.innerText = `GoMoKu - ${playerNames[1]} vs ${playerNames[2]}`;
}

function updateTurnDisplay() {
  if (timedOut) return;
  if (myTurn) {
    countdown = 10;
    turnDisplay.innerText = `Your Turn (${countdown}s)`;
    clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        turnDisplay.innerText = `Your Turn (${countdown}s)`;
      } else {
        clearInterval(countdownInterval);
        showOverlay("You didn't move in time. You Lose 😞", true);
        socket.close();
      }
    }, 1000);
    clearTimeout(moveTimeout);
    moveTimeout = setTimeout(() => {
      socket.close();
    }, 10000);
  } else {
    clearInterval(countdownInterval);
    turnDisplay.innerText = `Waiting for ${playerNames[player === 1 ? 2 : 1]}...`;
  }
}
