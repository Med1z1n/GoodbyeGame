// === BLE Setup ===
const serviceUUID = '4a980001-1cc4-e7c1-c757-f1267dd021e8';
const charUUID = '4a980002-1cc4-e7c1-c757-f1267dd021e8';
let device;
let characteristic;

// === Canvas Setup ===
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// === Player ===
const player = {
    x: canvas.width / 2 - 25,
    y: canvas.height - 60,
    width: 50,
    height: 50,
    color: '#f1c40f',
    dx: 0,
    speed: 5,
    moveLeft() { this.dx = -this.speed; },
    moveRight() { this.dx = this.speed; },
    stopHorizontal() { this.dx = 0; },
    update() {
        this.x += this.dx;
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > canvas.width) this.x = canvas.width - this.width;
    },
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
};

// === Bullets ===
const bullets = [];
function shootBullet() {
    bullets.push({ x: player.x + player.width / 2 - 5, y: player.y, width: 10, height: 20, speed: -8 });
}
function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y += bullets[i].speed;
        if (bullets[i].y + bullets[i].height < 0) bullets.splice(i, 1);
    }
}
function drawBullets(ctx) {
    ctx.fillStyle = '#e74c3c';
    bullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));
}

// === Laser ===
let lastLaserTime = 0;
const laserCooldown = 10000; // 10s
const lasers = [];

function fireLaser() {
    const now = Date.now();
    if (now - lastLaserTime >= laserCooldown) {
        lasers.push({
            x: player.x + player.width / 2 - 5,
            y: 0,                   // top of canvas
            width: 10,
            height: player.y,       // reaches top of player
            color: '#00ffff',
            startTime: now
        });
        lastLaserTime = now;
    }
}

function updateLasers() {
    const now = Date.now();
    for (let i = lasers.length - 1; i >= 0; i--) {
        if (now - lasers[i].startTime >= 1000) { // 1s duration
            lasers.splice(i, 1);
            continue;
        }
        // collision with enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (rectCollision(lasers[i], enemies[j])) {
                enemies.splice(j, 1);
                score++;
            }
        }
    }
}

function drawLasers(ctx) {
    lasers.forEach(l => {
        ctx.fillStyle = l.color;
        ctx.fillRect(l.x, l.y, l.width, l.height);
    });
}

// === Enemies ===
const enemies = [];
const enemyRows = 3;
const enemyCols = 8;
const enemyWidth = 40;
const enemyHeight = 40;
const enemySpacingX = 20;
const enemySpacingY = 20;
let enemyDirection = 1;
let respawnScheduled = false;

function initEnemies() {
    enemies.length = 0;
    for (let r = 0; r < enemyRows; r++) {
        for (let c = 0; c < enemyCols; c++) {
            enemies.push({
                x: 50 + c * (enemyWidth + enemySpacingX),
                y: 50 + r * (enemyHeight + enemySpacingY),
                width: enemyWidth,
                height: enemyHeight
            });
        }
    }
}

// === Enemy Bullets ===
const enemyBullets = [];
function updateEnemyBullets() {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        enemyBullets[i].y += enemyBullets[i].speed;
        if (enemyBullets[i].y > canvas.height) enemyBullets.splice(i, 1);
        if (rectCollision(enemyBullets[i], player)) {
            enemyBullets.splice(i, 1);
            console.log("Player hit!");
            // TODO: lives/game over
        }
    }
}

function drawEnemyBullets(ctx) {
    ctx.fillStyle = '#ff3333';
    enemyBullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));
}

// === Update Enemies ===
function updateEnemies() {
    if (enemies.length === 0) {
        if (!respawnScheduled) {
            respawnScheduled = true;
            setTimeout(() => {
                initEnemies();
                respawnScheduled = false;
            }, 1000);
        }
        return;
    }

    // move side to side
    let shouldDescend = false;
    enemies.forEach(e => {
        e.x += 1 * enemyDirection;
        if (e.x + e.width > canvas.width || e.x < 0) shouldDescend = true;
    });
    if (shouldDescend) {
        enemyDirection *= -1;
        enemies.forEach(e => e.y += 10);
    }

    // bullets hit enemies
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            if (rectCollision(bullets[i], enemies[j])) {
                bullets.splice(i, 1);
                enemies.splice(j, 1);
                score++;
                break;
            }
        }
    }

    // enemy shooting
    enemies.forEach(e => {
        if (Math.random() < 0.002) {
            enemyBullets.push({
                x: e.x + e.width / 2 - 5,
                y: e.y + e.height,
                width: 10,
                height: 20,
                speed: 4
            });
        }
    });
}

function drawEnemies(ctx) {
    ctx.fillStyle = '#2ecc71';
    enemies.forEach(e => ctx.fillRect(e.x, e.y, e.width, e.height));
}

// === Collision Detection ===
function rectCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

// === Score ===
let score = 0;
function drawScore() {
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText('Score: ' + score, 10, 30);
}

// === Game Loop ===
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    player.update();
    updateBullets();
    updateEnemies();
    updateLasers();
    updateEnemyBullets();
    player.draw(ctx);
    drawBullets(ctx);
    drawEnemies(ctx);
    drawLasers(ctx);
    drawEnemyBullets(ctx);
    drawScore();
    requestAnimationFrame(gameLoop);
}
initEnemies();
gameLoop();

// === BLE Connection ===
document.getElementById('connectButton').addEventListener('click', async () => {
    try {
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'Cycler' }],
            optionalServices: [serviceUUID]
        });
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(serviceUUID);
        characteristic = await service.getCharacteristic(charUUID);
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleNotification);

        const btn = document.getElementById('connectButton');
        btn.innerText = "Connected";
        btn.disabled = true;
    } catch (err) {
        console.error(err);
        alert("Failed to connect: " + err);
    }
});

// === BLE Notification Handler ===
function handleNotification(event) {
    const value = new TextDecoder().decode(event.target.value);

    if (value.startsWith("1:")) {
        player.moveLeft();
        setTimeout(() => player.stopHorizontal(), 150);
    } else if (value.startsWith("2:")) {
        player.moveRight();
        setTimeout(() => player.stopHorizontal(), 150);
    } else if (value === "3") {
        fireLaser();
    } else if (value === "4") {
        shootBullet();
    }
}

// === Keyboard Controls ===
document.addEventListener('keydown', (e) => {
    switch(e.key) {
        case "ArrowLeft": player.moveLeft(); break;
        case "ArrowRight": player.moveRight(); break;
        case "z": fireLaser(); break;
        case " ": shootBullet(); break;
    }
});
document.addEventListener('keyup', (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") player.stopHorizontal();
});
