document.addEventListener('DOMContentLoaded', () => {
    const GameLogger = {
        log: function(message, level = 'INFO') { const ts = new Date().toLocaleTimeString(); console.log(`[${ts}][${level}] ${message}`); },
        error: function(message) { this.log(message, 'ERROR'); }, warn: function(message) { this.log(message, 'WARN'); },
        info: function(message) { this.log(message, 'INFO'); }, debug: function(message) { this.log(message, 'DEBUG'); }
    };

    GameLogger.info("Game script loading...");

    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const goldAmountSpan = document.getElementById('gold-amount');
    const livesAmountSpan = document.getElementById('lives-amount');
    const archerTowerButton = document.getElementById('buy-archer-tower');
    const mageTowerButton = document.getElementById('buy-mage-tower'); // Get the mage tower button

    if (!canvas || !ctx || !archerTowerButton || !mageTowerButton || !goldAmountSpan || !livesAmountSpan) {
        GameLogger.error("Essential DOM elements not found! Check canvas, context, tower buttons, gold/lives spans.");
        return;
    }

    const audioManager = {
        sounds: {}, playSound: function(soundName) { GameLogger.debug(`SFX: ${soundName}`); }
    };

    // --- Entity Type Definitions ---
    const TILE_SIZE = 40; // Moved TILE_SIZE here as it's used by definitions
    const towerTypes = {
        'archer': { name: "Archer Tower", radius: TILE_SIZE / 2, range: TILE_SIZE * 3, damage: 25, fireRate: 50, cost: 50, color: "#0000FF", projectileColor: "#FFFF00" },
        'mage': { name: "Mage Tower", radius: TILE_SIZE / 2, range: TILE_SIZE * 2.5, damage: 40, fireRate: 80, cost: 75, color: "#FF00FF", projectileColor: "#FF00FF" }
    };

    const enemyTypes = {
        'orc': { name: "Orc", health: 100, speed: 1, radius: TILE_SIZE / 3, color: "#FF0000", goldReward: 10 },
        'goblin': { name: "Goblin", health: 60, speed: 1.5, radius: TILE_SIZE / 4, color: "#008000", goldReward: 7 }
    };
    // --- End Entity Type Definitions ---

    const pathCoordinates = [
        { x: 0, y: 4 }, { x: 1, y: 4 }, { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 },
        { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 }, { x: 7, y: 8 }, { x: 7, y: 9 }, { x: 7, y: 10 }, { x: 7, y: 11 }, { x: 7, y: 12 },
        { x: 8, y: 12}, { x: 9, y: 12}, { x:10, y: 12}
    ];
    const waypoints = pathCoordinates.map(coord => ({ x: coord.x * TILE_SIZE + TILE_SIZE / 2, y: coord.y * TILE_SIZE + TILE_SIZE / 2 }));

    let gameState = 'playing'; let playerLives = 20; const WAVES_TO_WIN = 5;
    let enemies = []; let towers = []; let gameTime = 0; let waveCount = 0;
    let selectedTowerType = null; let currentGold = 150; // Start with more gold
    let lastMouseX = 0, lastMouseY = 0; let needsRedrawForPreview = false;
    let allEnemiesSpawnedForFinalWave = false;

    function updateGoldDisplay() { goldAmountSpan.textContent = currentGold; }
    function updateLivesDisplay() { livesAmountSpan.textContent = playerLives; }
    function isPointOnPath(x, y, r = TILE_SIZE / 2) { for(const c of pathCoordinates){const tX=c.x*TILE_SIZE,tY=c.y*TILE_SIZE;if(x+r>tX&&x-r<tX+TILE_SIZE&&y+r>tY&&y-r<tY+TILE_SIZE)return true;}return false;}
    function distance(x1,y1,x2,y2){return Math.sqrt(Math.pow(x2-x1,2)+Math.pow(y2-y1,2));}

    class Enemy {
        constructor(typeKey = 'orc') {
            const typeData = enemyTypes[typeKey];
            this.x = waypoints[0].x; this.y = waypoints[0].y;
            this.type = typeKey;
            this.health = typeData.health; this.maxHealth = typeData.health;
            this.speed = typeData.speed; this.radius = typeData.radius;
            this.color = typeData.color; this.goldReward = typeData.goldReward;
            this.waypointIndex = 0; this.active = true;
        }
        draw() {
            if (!this.active) return;
            ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
            const healthBarWidth = this.radius*2, healthBarHeight = 5, healthBarX = this.x-this.radius, healthBarY = this.y-this.radius-healthBarHeight-2;
            ctx.fillStyle = "#555"; ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
            ctx.fillStyle = "#00FF00"; ctx.fillRect(healthBarX, healthBarY, healthBarWidth * (this.health / this.maxHealth), healthBarHeight);
        }
        update() {
            if (!this.active || gameState !== 'playing') return;
            if (this.health <= 0) {
                this.active = false; currentGold += this.goldReward; updateGoldDisplay(); audioManager.playSound('enemyDefeated');
                GameLogger.info(`${enemyTypes[this.type].name} defeated. +${this.goldReward}G. Gold: ${currentGold}.`);
                checkVictoryCondition(); return;
            }
            if (this.waypointIndex < waypoints.length - 1) {
                let targetWaypoint = waypoints[this.waypointIndex+1]; let dx=targetWaypoint.x-this.x, dy=targetWaypoint.y-this.y; let dist=distance(this.x,this.y,targetWaypoint.x,targetWaypoint.y);
                if (dist < this.speed) {
                    this.waypointIndex++;
                    if (this.waypointIndex < waypoints.length - 1) { this.x=waypoints[this.waypointIndex].x; this.y=waypoints[this.waypointIndex].y; }
                    else { this.x=targetWaypoint.x; this.y=targetWaypoint.y; this.active=false; playerLives--; updateLivesDisplay(); audioManager.playSound('enemyReachedEnd'); GameLogger.warn(`${enemyTypes[this.type].name} reached end. Lives: ${playerLives}.`); if (playerLives<=0) setGameOver(); }
                } else { this.x+=(dx/dist)*this.speed; this.y+=(dy/dist)*this.speed; }
            } else { if(this.active){ this.active=false; playerLives--; updateLivesDisplay(); audioManager.playSound('enemyReachedEnd'); GameLogger.warn(`${enemyTypes[this.type].name} reached end (at waypoint). Lives: ${playerLives}.`); if (playerLives<=0) setGameOver();}}
        }
        takeDamage(amount) {
            if (this.health <= 0 || gameState !== 'playing') return;
            this.health -= amount; audioManager.playSound('enemyHit'); GameLogger.debug(`${enemyTypes[this.type].name} took ${amount} damage. HP: ${this.health}.`);
        }
    }

    class Tower {
        constructor(x, y, typeKey) {
            const typeData = towerTypes[typeKey];
            this.x=x; this.y=y; this.type=typeKey; this.radius=typeData.radius; this.range=typeData.range;
            this.damage=typeData.damage; this.fireRate=typeData.fireRate; this.cost=typeData.cost;
            this.color=typeData.color; this.projectileColor=typeData.projectileColor;
            this.fireCooldown=0; this.target=null; this.drawRangeActive=false;
        }
        draw() {
            ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
            if (this.drawRangeActive) { ctx.strokeStyle="rgba(0,0,0,0.2)"; ctx.beginPath(); ctx.arc(this.x,this.y,this.range,0,Math.PI*2); ctx.stroke(); }
        }
        findTarget() {
            if (gameState !== 'playing') { this.target = null; return; }
            if (this.target && this.target.active && distance(this.x,this.y,this.target.x,this.target.y) <= this.range) return;
            this.target=null; let closestDist = this.range + 1;
            for(const enemy of enemies) { if(!enemy.active) continue; const d = distance(this.x,this.y,enemy.x,enemy.y); if(d <= this.range && d < closestDist) { closestDist=d; this.target=enemy; }}
        }
        attack() {
            if (this.fireCooldown > 0) { this.fireCooldown--; return; }
            if (this.target && this.target.active && gameState === 'playing') {
                this.target.takeDamage(this.damage); audioManager.playSound('towerShoot');
                GameLogger.debug(`${towerTypes[this.type].name} at (${this.x.toFixed(0)},${this.y.toFixed(0)}) attacked ${enemyTypes[this.target.type].name}. Target HP: ${this.target.health}`);
                this.fireCooldown = this.fireRate;
                ctx.beginPath(); ctx.moveTo(this.x,this.y); ctx.lineTo(this.target.x,this.target.y); ctx.strokeStyle=this.projectileColor; ctx.lineWidth=2; ctx.stroke();
            }
        }
        update() { if(gameState!=='playing')return; this.findTarget(); this.attack(); }
    }

    function drawPlacementPreview(event) {
        if (gameState !== 'playing' || !selectedTowerType) {needsRedrawForPreview = false; if(canvas.style.cursor !== 'default') canvas.style.cursor = 'default'; return;}
        const clientX = event.clientX || lastMouseX + canvas.getBoundingClientRect().left;
        const clientY = event.clientY || lastMouseY + canvas.getBoundingClientRect().top;
        const x = clientX - canvas.getBoundingClientRect().left;
        const y = clientY - canvas.getBoundingClientRect().top;
        const towerProto = towerTypes[selectedTowerType];
        drawGameBackground(); drawPath();
        enemies.forEach(e=>{if(e.active)e.draw();}); towers.forEach(t=>{t.drawRangeActive=false;t.draw();});
        ctx.fillStyle=towerProto.color; ctx.globalAlpha=0.5; ctx.beginPath(); ctx.arc(x,y,towerProto.radius,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1.0;
        ctx.strokeStyle="rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.arc(x,y,towerProto.range,0,Math.PI*2); ctx.stroke();
        let canPlace=true; if(isPointOnPath(x,y,towerProto.radius))canPlace=false; if(canPlace){for(const t of towers){if(distance(x,y,t.x,t.y)<towerProto.radius+t.radius){canPlace=false;break;}}}
        if(!canPlace){ctx.fillStyle="rgba(255,0,0,0.3)";ctx.beginPath();ctx.arc(x,y,towerProto.radius,0,Math.PI*2);ctx.fill();}
        canvas.style.cursor=canPlace?'crosshair':'not-allowed';
        // needsRedrawForPreview should be managed by mousemove and gameLoop
    }

    function spawnEnemy(typeKey = 'orc') {
        if (gameState !== 'playing') return;
        enemies.push(new Enemy(typeKey));
        GameLogger.debug(`Spawned ${enemyTypes[typeKey].name}.`);
    }

    function manageWaves() {
        if (gameState !== 'playing') return;
        const baseSpawnInterval = 100;
        const maxTotalEnemies = 10;
        const enemiesToSpawnThisTrigger = 2;

        if (waveCount > WAVES_TO_WIN && enemies.every(e => !e.active)) { // Check if all enemies cleared after final wave
            allEnemiesSpawnedForFinalWave = true; // Ensure this is set
            checkVictoryCondition();
            return;
        }
        if (waveCount > WAVES_TO_WIN) return; // Don't spawn more if past wave target

        let activeOrQueuedEnemies = enemies.filter(e => e.active || e.waypointIndex === 0).length;

        if (gameTime % baseSpawnInterval === 0 && activeOrQueuedEnemies < maxTotalEnemies) {
            if (activeOrQueuedEnemies === 0 && (enemies.length === 0 || enemies.every(e => !e.active))) {
                if(waveCount < WAVES_TO_WIN) { //Only increment waveCount if not past WAVES_TO_WIN already
                    waveCount++;
                    GameLogger.info(`Starting Wave ${waveCount}/${WAVES_TO_WIN}.`);
                    if (waveCount === WAVES_TO_WIN) GameLogger.info(`Final Wave (${WAVES_TO_WIN}) initiated.`);
                } else if (waveCount === WAVES_TO_WIN && !allEnemiesSpawnedForFinalWave) {
                    // This case means we are on the final wave, but maybe not all enemies for it have been spawned.
                    // The condition waveCount > WAVES_TO_WIN handles the post-final wave scenario.
                }

            }

            if(waveCount > 0 && waveCount <= WAVES_TO_WIN){ // Only spawn if waves have started and not exceeded target
                let spawnedThisTrigger = 0;
                for (let i = 0; i < enemiesToSpawnThisTrigger && activeOrQueuedEnemies + spawnedThisTrigger < maxTotalEnemies; i++) {
                    if (waveCount >= 2 && Math.random() < 0.4) {
                        spawnEnemy('goblin');
                    } else {
                        spawnEnemy('orc');
                    }
                    spawnedThisTrigger++;
                }

                if (waveCount === WAVES_TO_WIN && enemies.filter(e=>e.active || e.waypointIndex === 0).length >= maxTotalEnemies ) {
                     allEnemiesSpawnedForFinalWave = true;
                } else if (waveCount === WAVES_TO_WIN && activeOrQueuedEnemies + spawnedThisTrigger === 0 && enemies.length > 0 && enemies.every(e=>!e.active)){
                    // If it's the final wave and all spawned enemies are defeated, mark as all spawned.
                    allEnemiesSpawnedForFinalWave = true;
                }
            }
        }
        checkVictoryCondition();
    }

    function checkVictoryCondition(){if(gameState==='playing'&&waveCount>=WAVES_TO_WIN&&allEnemiesSpawnedForFinalWave&&enemies.every(e=>!e.active))setVictory();}
    function setGameOver(){if(gameState==='playing'){gameState='gameOver';audioManager.playSound('gameOver');GameLogger.info("Game Over! Lives reached 0.");}}
    function setVictory(){if(gameState==='playing'){gameState='victory';audioManager.playSound('victory');GameLogger.info(`Victory! Survived ${WAVES_TO_WIN} waves.`);}}

    function handleTowerPlacement(event) {
        if(gameState!=='playing'||!selectedTowerType)return;
        const rect=canvas.getBoundingClientRect();const x=event.clientX-rect.left,y=event.clientY-rect.top;
        const towerProto=towerTypes[selectedTowerType];
        if(currentGold<towerProto.cost){GameLogger.warn(`Not enough gold for ${towerProto.name}.`);audioManager.playSound('error');selectedTowerType=null;canvas.style.cursor='default';needsRedrawForPreview=false;requestAnimationFrame(gameLoop);return;}

        let canPlace = true;
        if(isPointOnPath(x,y,towerProto.radius)) canPlace = false;
        if(canPlace) {for(const t of towers){if(distance(x,y,t.x,t.y)<towerProto.radius+t.radius){canPlace=false;break;}}}

        if(!canPlace){GameLogger.warn(`Invalid placement for ${towerProto.name}.`);audioManager.playSound('error');canvas.style.cursor='not-allowed';return;}

        currentGold-=towerProto.cost;updateGoldDisplay(); const newTower=new Tower(x,y,selectedTowerType);towers.push(newTower);
        audioManager.playSound('placeTower');GameLogger.info(`Placed ${towerProto.name}. Cost:${towerProto.cost}. Gold:${currentGold}.`);
        if(currentGold>=towerProto.cost){canvas.style.cursor='crosshair';needsRedrawForPreview=true;} // Keep preview active for next placement
        else{selectedTowerType=null;canvas.style.cursor='default';needsRedrawForPreview=false;}
        requestAnimationFrame(gameLoop);
    }

    function setupTowerButtonListener(buttonElement, towerKey) {
        if (!buttonElement) { GameLogger.error(`Button for tower key ${towerKey} not found!`); return;}
        const towerName = towerTypes[towerKey].name;
        const towerCost = towerTypes[towerKey].cost;
        buttonElement.addEventListener('click', () => {
            if (gameState !== 'playing') return;
            if (selectedTowerType === towerKey) {
                selectedTowerType = null; canvas.style.cursor = 'default'; needsRedrawForPreview = false;
                GameLogger.info(`Deselected ${towerName}.`); requestAnimationFrame(gameLoop);
            } else if (currentGold >= towerCost) {
                selectedTowerType = towerKey; GameLogger.info(`Selected ${towerName}. Cost: ${towerCost}.`);
                canvas.style.cursor = 'crosshair'; needsRedrawForPreview = true;
            } else {
                GameLogger.warn(`Not enough gold for ${towerName}. Need: ${towerCost}, Have: ${currentGold}`);
                audioManager.playSound('error');
            }
        });
    }
    setupTowerButtonListener(archerTowerButton, 'archer');
    setupTowerButtonListener(mageTowerButton, 'mage');


    canvas.addEventListener('click', handleTowerPlacement);
    canvas.addEventListener('mousemove', (e)=>{if(gameState!=='playing'||!selectedTowerType){needsRedrawForPreview=false; if(canvas.style.cursor !== 'default' && gameState === 'playing') canvas.style.cursor = 'default';return;}lastMouseX=e.clientX-canvas.getBoundingClientRect().left;lastMouseY=e.clientY-canvas.getBoundingClientRect().top;needsRedrawForPreview=true;});
    canvas.addEventListener('mouseleave', ()=>{if(gameState!=='playing')return;if(selectedTowerType){needsRedrawForPreview=false; if(canvas.style.cursor !== 'default') canvas.style.cursor = 'default';requestAnimationFrame(gameLoop);}});

    function drawGameBackground(){ctx.fillStyle="#D3D3D3";ctx.fillRect(0,0,canvas.width,canvas.height);}
    function drawPath(){pathCoordinates.forEach(c=>{ctx.fillStyle="#90EE90";ctx.fillRect(c.x*TILE_SIZE,c.y*TILE_SIZE,TILE_SIZE,TILE_SIZE);ctx.strokeStyle="#3A3A3A";ctx.strokeRect(c.x*TILE_SIZE,c.y*TILE_SIZE,TILE_SIZE,TILE_SIZE);});}
    function drawEndScreen(message){ctx.fillStyle="rgba(0,0,0,0.75)";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.font="48px Arial";ctx.fillStyle="white";ctx.textAlign="center";ctx.fillText(message,canvas.width/2,canvas.height/2);ctx.font="24px Arial";ctx.fillText("Refresh to play again.",canvas.width/2,canvas.height/2+50);}

    let lastTime=0;
    function gameLoop(timestamp) {
        timestamp = timestamp || lastTime;
        if(gameState==='gameOver'){drawEndScreen("Game Over!");return;} if(gameState==='victory'){drawEndScreen("Victory!");return;}

        const deltaTime=timestamp-lastTime;lastTime=timestamp; if(timestamp)gameTime++;
        drawGameBackground();drawPath();
        if(gameState==='playing'){
            manageWaves();
            enemies=enemies.filter(e=>e.active);enemies.forEach(e=>{e.update();e.draw();});
            towers.forEach(t=>{/*t.drawRangeActive=false;*/ t.update();t.draw();}); // drawRangeActive logic might need review if towers can be selected
        }
        else{enemies.forEach(e=>e.draw());towers.forEach(t=>t.draw());} // Draw static elements if not playing

        if(gameState==='playing'&&selectedTowerType&&needsRedrawForPreview){
            drawPlacementPreview({clientX:lastMouseX+canvas.getBoundingClientRect().left,clientY:lastMouseY+canvas.getBoundingClientRect().top});
        } else if(gameState==='playing'&&!selectedTowerType&&canvas.style.cursor!=='default'){
            canvas.style.cursor='default';
        }
        requestAnimationFrame(gameLoop);
    }

    updateGoldDisplay(); updateLivesDisplay();
    GameLogger.info(`Game initialized. Gold:${currentGold}, Lives:${playerLives}. Target Waves:${WAVES_TO_WIN}.`);
    waveCount = 0; requestAnimationFrame(gameLoop);
});
