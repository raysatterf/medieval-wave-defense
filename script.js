const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const tileSize = 40;
const path = [
  {x:0,y:4},{x:5,y:4},{x:5,y:1},{x:9,y:1}
];

const game = {
  gold: 100,
  life: 10,
  wave: 0,
  towers: [],
  enemies: [],
  logs: []
};

function updateHud(){
  document.getElementById('gold').textContent = game.gold;
  document.getElementById('life').textContent = game.life;
  document.getElementById('wave').textContent = game.wave;
}

function logEvent(type,msg){
  const entry = `[${new Date().toISOString()}] ${type}: ${msg}`;
  console.log(entry);
  game.logs.push(entry);
  const logEl = document.getElementById('log');
  if(logEl){
    logEl.textContent = game.logs.slice(-20).join('\n');
  }
}

function logError(msg,err){
  console.error(msg,err);
  logEvent('ERROR', `${msg} - ${err}`);
}

window.addEventListener('error', e=> logError('Unhandled', e.error));

function playSound(type){
  try{
    const ctxAudio = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();
    osc.connect(gain);
    gain.connect(ctxAudio.destination);
    if(type==='spend') osc.frequency.value=260;
    else if(type==='attack') osc.frequency.value=440;
    else if(type==='damage') osc.frequency.value=130;
    else if(type==='victory') osc.frequency.value=520;
    else if(type==='defeat') osc.frequency.value=90;
    osc.start();
    osc.stop(ctxAudio.currentTime+0.1);
  }catch(e){
    logError('Audio',e);
  }
}

class Tower{
  constructor(x,y){
    this.x=x;this.y=y;
    this.range=2;
    this.damage=1;
    this.rate=60; // frames
    this.cool=0;
    this.level=1;
  }
  update(){
    if(this.cool>0){this.cool--;return;}
    const target=game.enemies.find(en=>distance(this,en)<=this.range*tileSize);
    if(target){
      target.hp-=this.damage;
      playSound('attack');
      logEvent('TOWER','Attacked enemy');
      this.cool=this.rate;
    }
  }
  draw(){
    ctx.fillStyle='blue';
    ctx.fillRect(this.x*tileSize,this.y*tileSize,tileSize,tileSize);
  }
  upgrade(){
    if(game.gold>=50){
      game.gold-=50;
      this.level++;
      this.damage++;
      this.range+=0.5;
      this.rate=Math.max(20,this.rate-5);
      playSound('spend');
      logEvent('TOWER',`Upgraded to level ${this.level}`);
      updateHud();
    }
  }
}

class Enemy{
  constructor(){
    this.hp=3+game.wave;
    this.speed=1;
    this.pathIndex=0;
    this.x=path[0].x*tileSize;
    this.y=path[0].y*tileSize;
  }
  update(){
    const target=path[this.pathIndex+1];
    if(!target) return;
    const tx=target.x*tileSize;
    const ty=target.y*tileSize;
    const dx=Math.sign(tx-this.x);
    const dy=Math.sign(ty-this.y);
    this.x+=dx*this.speed;
    this.y+=dy*this.speed;
    if(Math.abs(this.x-tx)<this.speed && Math.abs(this.y-ty)<this.speed){
      this.pathIndex++;
    }
  }
  draw(){
    ctx.fillStyle='red';
    ctx.fillRect(this.x,this.y,tileSize,tileSize);
  }
}

function distance(a,b){
  const ax=a.x*tileSize+aOffset(a);
  const ay=a.y*tileSize+aOffset(a,true);
  const bx=b.x;
  const by=b.y;
  return Math.hypot(ax-bx,ay-by);
}
function aOffset(obj,y=false){
  return obj instanceof Tower? tileSize/2 : y? tileSize/2 : tileSize/2;
}

function spawnWave(){
  game.wave++;
  updateHud();
  for(let i=0;i<game.wave+2;i++){
    setTimeout(()=>{
      const enemy=new Enemy();
      game.enemies.push(enemy);
      logEvent('GAME','Spawn enemy');
    },i*500);
  }
}

canvas.addEventListener('click', e=>{
  const rect=canvas.getBoundingClientRect();
  const x=Math.floor((e.clientX-rect.left)/tileSize);
  const y=Math.floor((e.clientY-rect.top)/tileSize);
  if(game.gold>=50){
    const existing=game.towers.find(t=>t.x===x&&t.y===y);
    if(existing){
      existing.upgrade();
    }else{
      game.towers.push(new Tower(x,y));
      game.gold-=50;
      playSound('spend');
      logEvent('GAME',`Placed tower at ${x},${y}`);
      updateHud();
    }
  }
});

function gameLoop(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // draw path
  ctx.strokeStyle='yellow';
  ctx.lineWidth=4;
  ctx.beginPath();
  ctx.moveTo(path[0].x*tileSize+tileSize/2,path[0].y*tileSize+tileSize/2);
  for(let p of path.slice(1)){
    ctx.lineTo(p.x*tileSize+tileSize/2,p.y*tileSize+tileSize/2);
  }
  ctx.stroke();

  for(const tower of game.towers){
    tower.update();
    tower.draw();
  }
  for(const enemy of [...game.enemies]){
    enemy.update();
    if(enemy.hp<=0){
      game.enemies.splice(game.enemies.indexOf(enemy),1);
      game.gold+=10;
      playSound('damage');
      logEvent('GAME','Enemy defeated');
      updateHud();
      continue;
    }
    if(enemy.pathIndex>=path.length-1){
      game.enemies.splice(game.enemies.indexOf(enemy),1);
      game.life--;
      playSound('damage');
      logEvent('GAME','Enemy reached end');
      updateHud();
      if(game.life<=0){
        playSound('defeat');
        logEvent('GAME','Defeat');
        alert('Defeat!');
        location.reload();
        return;
      }
    }
    enemy.draw();
  }
  if(game.enemies.length===0){
    spawnWave();
  }
  requestAnimationFrame(gameLoop);
}

updateHud();
spawnWave();
playSound('victory');
logEvent('GAME','Start');
requestAnimationFrame(gameLoop);

