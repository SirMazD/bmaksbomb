
const socket = io();
const $ = id => document.getElementById(id);
const ships = [{name:"Carrier",size:5},{name:"Battleship",size:4},{name:"Cruiser",size:3},{name:"Submarine",size:3},{name:"Destroyer",size:2}];
let state = null, myIndex = null, room = null;
let selectedShip = 0, vertical = false, placements = [], hoveredCell = null;

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}
function setVisible(id, yes) { $(id).classList.toggle("hidden", !yes); }
function playerName() { return $("playerName").value.trim() || "Captain"; }
function startGameUI() {
  setVisible("lobby", false); setVisible("game", true);
  $("roomCode").textContent = room || "------";
}
function makeEmptyGrid() { return Array.from({length:10},()=>Array(10).fill(null)); }

function allCellsForPlacement(shipIndex, startR, startC, orientation = vertical) {
  const size = ships[shipIndex].size;
  return Array.from({length:size},(_,i)=>({
    r:startR+(orientation?i:0),
    c:startC+(orientation?0:i)
  }));
}

function canPlace(cells, skipIndex = selectedShip) {
  if (cells.some(c=>c.r<0||c.r>9||c.c<0||c.c>9)) return false;
  for (let i=0;i<placements.length;i++) {
    if (i===skipIndex || !placements[i]) continue;
    if (placements[i].cells.some(a=>cells.some(b=>a.r===b.r&&a.c===b.c))) return false;
  }
  return true;
}

function placeAt(r,c) {
  if (placements[selectedShip]) {
    toast("That ship is already placed. Select another ship.");
    return;
  }

  const cells = allCellsForPlacement(selectedShip,r,c);

  if (!canPlace(cells)) {
    toast("That ship won't fit there. Try another starting cell.");
    return;
  }

  placements[selectedShip] = {name:ships[selectedShip].name,cells};
  hoveredCell = null;

  const next = ships.findIndex((s,i)=>!placements[i]);
  if (next >= 0) selectedShip = next;

  renderPlacement();
}

function renderShipChoices() {
  $("shipChoices").innerHTML = "";
  ships.forEach((ship,i)=>{
    const b=document.createElement("button");
    b.className="ship-choice"+(i===selectedShip?" active":"")+(placements[i]?" done":"");
    b.textContent=`${ship.name} · ${ship.size}`;
    b.onclick=()=>{
      if(!placements[i]) {
        selectedShip=i;
        hoveredCell=null;
        renderPlacement();
      }
    };
    $("shipChoices").appendChild(b);
  });
}

function updatePlacementPreview() {
  const board = $("placementBoard");
  if (!board) return;

  const cells = [...board.children];
  cells.forEach(cell => {
    cell.classList.remove("preview", "invalid-preview");
  });

  if (!hoveredCell || placements[selectedShip]) return;

  const previewCells = allCellsForPlacement(
    selectedShip,
    hoveredCell.r,
    hoveredCell.c
  );

  const valid = canPlace(previewCells);

  previewCells.forEach(({r,c}) => {
    if (r < 0 || r > 9 || c < 0 || c > 9) return;

    const cell = cells[r * 10 + c];
    if (cell) {
      cell.classList.add(valid ? "preview" : "invalid-preview");
    }
  });
}

function renderPlacement() {
  renderShipChoices();
  $("shipCounter").textContent=`${placements.filter(Boolean).length} / 5 placed`;
  $("readyBtn").disabled=placements.filter(Boolean).length!==5;

  const board=$("placementBoard");
  board.innerHTML="";

  const occupied=makeEmptyGrid();
  placements.forEach((p,i)=>p&&p.cells.forEach(c=>occupied[c.r][c.c]=i));

  for(let r=0;r<10;r++) {
    for(let c=0;c<10;c++) {
      const b=document.createElement("button");
      b.className="cell";
      b.type="button";

      if(occupied[r][c]!==null) b.classList.add("ship");

      b.setAttribute("aria-label",`Row ${r+1}, column ${c+1}`);

      b.onclick=()=>placeAt(r,c);

      b.onmouseenter=()=>{
        if(placements[selectedShip]) return;
        hoveredCell={r,c};
        updatePlacementPreview();
      };

      board.appendChild(b);
    }
  }

  updatePlacementPreview();
}

function randomize() {
  placements=[];
  hoveredCell=null;

  for(let i=0;i<ships.length;i++){
    let done=false, tries=0;

    while(!done&&tries++<1000){
      const orientation=Math.random()<.5;
      const r=Math.floor(Math.random()*10);
      const c=Math.floor(Math.random()*10);
      const cells=allCellsForPlacement(i,r,c,orientation);

      if(canPlace(cells,i)){
        placements[i]={name:ships[i].name,cells};
        done=true;
      }
    }

    if(!done){
      placements=[];
      return randomize();
    }
  }

  vertical=false;
  selectedShip=0;
  renderPlacement();
}

function drawBoard(containerId, grid, shots, interactive=false) {
  const el=$(containerId); el.innerHTML="";
  for(let r=0;r<10;r++) for(let c=0;c<10;c++){
    const b=document.createElement("button"); b.type="button"; b.className="cell";
    const shot=shots?.[r]?.[c];
    if(shot==="hit")b.classList.add("hit");
    else if(shot==="miss")b.classList.add("miss");
    else if(grid?.[r]?.[c]!==null && grid?.[r]?.[c]!==undefined)b.classList.add("ship");
    if(interactive){
      const isMyTurn=state && state.currentTurn===state.yourIndex && state.phase==="battle";
      b.disabled=!!shot || !isMyTurn;
      b.setAttribute("aria-label",`Fire at row ${r+1}, column ${c+1}`);
      b.onclick=()=>socket.emit("fire",{r,c});
    } else b.disabled=true;
    el.appendChild(b);
  }
}

function renderState(s) {
  state=s; myIndex=s.yourIndex; room=s.code; $("roomCode").textContent=room;
  $("statusMessage").textContent=s.message || "";
  $("phaseLabel").textContent=({waiting:"WAITING",placement:"DEPLOYMENT",battle:"BATTLE IN PROGRESS",finished:"GAME OVER"})[s.phase]||s.phase;
  setVisible("waitingPanel",s.phase==="waiting");
  setVisible("placementPanel",s.phase==="placement" && !s.players[myIndex]?.ready);
  setVisible("battlePanel",s.phase==="battle");
  setVisible("finishedPanel",s.phase==="finished");

  if(s.phase==="placement" && s.players[myIndex]?.ready){
    setVisible("placementPanel",false);setVisible("waitingPanel",true);
    $("waitingPanel").querySelector("h2").textContent="Fleet deployed";
    $("waitingPanel").querySelector(".muted").textContent="Your ships are in position. Waiting for the other player to deploy.";
  } else if(s.phase==="waiting") {
    $("waitingPanel").querySelector("h2").textContent="Waiting for your opponent";
    $("waitingPanel").querySelector(".muted").textContent="Send them the room code above. They can join from another device or browser.";
  }

  if(s.phase==="placement" && !s.players[myIndex]?.ready) renderPlacement();

  if(s.phase==="battle"){
    $("battleTitle").textContent=s.currentTurn===s.yourIndex?"Your turn — select a target":"Enemy turn — brace for impact";
    drawBoard("ownBoard",s.yourBoard,s.incomingShots,false);
    drawBoard("targetBoard",null,s.yourShots,true);

    // Target grid uses the shots made by this player, not the hidden enemy board.
    const target=$("targetBoard");
    [...target.children].forEach((cell,i)=>{
      const r=Math.floor(i/10),c=i%10,shot=s.yourShots[r][c];
      cell.className="cell";
      if(shot==="hit")cell.classList.add("hit");
      if(shot==="miss")cell.classList.add("miss");
      cell.disabled=!!shot||s.currentTurn!==s.yourIndex;
    });
  }

  if(s.phase==="finished"){
    $("winnerText").textContent=s.winnerIndex===s.yourIndex?"Victory! Fleet sunk.":"Defeat. Your fleet was sunk.";
    $("finishedMessage").textContent=s.message;
  }
}

$("createBtn").onclick=()=>{ $("lobbyError").textContent=""; socket.emit("createRoom",{name:playerName()}); };
$("joinBtn").onclick=()=>{ $("lobbyError").textContent=""; socket.emit("joinRoom",{code:$("roomCodeInput").value,name:playerName()}); };
$("roomCodeInput").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));
$("copyCode").onclick=async()=>{try{await navigator.clipboard.writeText(room);toast("Room code copied!");}catch{toast(`Share code: ${room}`);}};
$("rotateBtn").onclick=()=>{
  vertical=!vertical;
  $("rotateBtn").textContent=`Rotate: ${vertical?"Vertical ↕":"Horizontal ↔"}`;
  updatePlacementPreview();
};
$("randomBtn").onclick=randomize;
$("readyBtn").onclick=()=>{
  if(placements.filter(Boolean).length!==ships.length) {
    toast("Place all five ships before deploying.");
    return;
  }
  socket.emit("placeShips",{placements});
};
$("leaveBtn").onclick=()=>{location.reload();};
$("backToLobby").onclick=()=>location.reload();
socket.on("joined",data=>{
  room=data.code;
  myIndex=data.index;
  startGameUI();
  placements=[];
  selectedShip=0;
  vertical=false;
  hoveredCell=null;
  $("rotateBtn").textContent="Rotate: Horizontal ↔";
  renderPlacement();
});
socket.on("state",renderState);
socket.on("errorMessage",msg=>{ $("lobbyError").textContent=msg;toast(msg);});
socket.on("connect_error",()=>toast("Connection issue. Check your internet and refresh."));
