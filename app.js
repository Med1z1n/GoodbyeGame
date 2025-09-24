// === Constants ===
const SERVICE_UUID = '4a980001-1cc4-e7c1-c757-f1267dd021e8';
const CHAR_UUID = '4a980002-1cc4-e7c1-c757-f1267dd021e8';
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const ENEMY_START_X = 50;
const ENEMY_START_Y = 50;
const ENEMY_DESCENT_STEP = 10;
const BASE_ENEMY_SPEED = 1;
const BASE_ENEMY_SHOOT_PROB = 0.002;
const LASER_COOLDOWN = 10000; // 10s

// === BLE Setup ===
let device;
let characteristic;

// === Movement State ===
let leftPressed = false;
let rightPressed = false;

// === Pause/Resume ===
let isPaused = false;
function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('pauseButton');
    btn.innerText = isPaused ? "Resume" : "Pause";
}

// === Canvas Setup ===
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas element not found!');
        return;
    }
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');

    // === Player ===
    const player = {
        x: CANVAS_WIDTH / 2 - 25,
        y: CANVAS_HEIGHT - 60,
        width: 50,
        height: 50,
        color: '#f1c40f',
        dx: 0,
        speed: 5,
        health: 3,
        update() {
            if (leftPressed && !rightPressed) {
                this.dx = -this.speed;
            } else if (rightPressed && !leftPressed) {
                this.dx = this.speed;
            } else {
                this.dx = 0;
            }
            this.x += this.dx;
            if (this.x < 0) this.x = 0;
            if (this.x + this.width > CANVAS_WIDTH) this.x = CANVAS_WIDTH - this.width;
        },
        draw(ctx) {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.width, this.height);
            ctx.fillStyle = '#fff';
            ctx.font = '20px Arial';
            ctx.fillText(`Health: ${this.health}`, CANVAS_WIDTH - 120, 30);
        }
    };

    // === Bullets ===
    const bulletPool = [];
    const bullets = [];
    function createBulletPool(size) {
        for (let i = 0; i < size; i++) {
            bulletPool.push({ x: 0, y: 0, width: 10, height: 20, speed: -8, active: false });
        }
    }
    function getBullet() {
        let bullet = bulletPool.find(b => !b.active);
        if (!bullet) {
            bullet = { x: 0, y: 0, width: 10, height: 20, speed: -8, active: false };
            bulletPool.push(bullet);
        }
        return bullet;
    }
    function shootBullet() {
        const bullet = getBullet();
        bullet.x = player.x + player.width / 2 - 5;
        bullet.y = player.y;
        bullet.active = true;
        bullets.push(bullet);
    }
    function updateBullets() {
        for (let i = bullets.length - 1; i >= 0; i--) {
            if (!bullets[i].active) continue;
            bullets[i].y += bullets[i].speed;
            if (bullets[i].y + bullets[i].height < 0) {
                bullets[i].active = false;
                bullets.splice(i, 1);
            }
        }
    }
    function drawBullets(ctx) {
        ctx.fillStyle = '#e74c3c';
        bullets.forEach(b => {
            if (b.active) ctx.fillRect(b.x, b.y, b.width, b.height);
        });
    }

    // === Laser ===
    let lastLaserTime = 0;
    const lasers = [];
    function fireLaser() {
        const now = Date.now();
        if (now - lastLaserTime >= LASER_COOLDOWN) {
            lasers.push({
                x: player.x + player.width / 2 - 5,
                y: 0,
                width: 10,
                height: player.y + player.height,
                color: '#00ffff',
                startTime: now
            });
            lastLaserTime = now;
        }
    }
    function updateLasers() {
        const now = Date.now();
        for (let i = lasers.length - 1; i >= 0; i--) {
            if (now - lasers[i].startTime >= 1000) {
                lasers.splice(i, 1);
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
    let enemyDirection = BASE_ENEMY_SPEED;
    let respawnScheduled = false;
    let enemiesToRemoveSet = new Set();
    let waveNumber = 1;

    function initEnemies() {
        enemies.length = 0;
        for (let r = 0; r < enemyRows; r++) {
            for (let c = 0; c < enemyCols; c++) {
                const x = ENEMY_START_X + c * (enemyWidth + enemySpacingX);
                const y = ENEMY_START_Y + r * (enemyHeight + enemySpacingY);
                enemies.push({ x, y, width: enemyWidth, height: enemyHeight });
            }
        }
    }

    // === Enemy Bullets ===
    const enemyBullets = [];
    function updateEnemyBullets() {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const bullet = enemyBullets[i];
            if (!bullet) {
                enemyBullets.splice(i, 1);
                continue;
            }
            bullet.y += bullet.speed;
            if (bullet.y > CANVAS_HEIGHT) {
                enemyBullets.splice(i, 1);
                continue;
            }
            if (rectCollision(bullet, player)) {
                enemyBullets.splice(i, 1);
                player.health -= 1;
                if (player.health <= 0) {
                    alert('Game Over! Score: ' + score);
                    restartGame();
                }
            }
        }
    }
    function drawEnemyBullets(ctx) {
        ctx.fillStyle = '#ff3333';
        enemyBullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));
    }

    // === Update Enemies ===
    function updateEnemies(deltaTime) {
        if (enemies.length === 0) {
            if (!respawnScheduled) {
                respawnScheduled = true;
                setTimeout(() => {
                    waveNumber++;
                    enemyDirection = BASE_ENEMY_SPEED + waveNumber * 0.5;
                    initEnemies();
                    respawnScheduled = false;
                }, 1000);
            }
            return;
        }

        // Check if any enemy hits edge
        let hitEdge = enemies.some(e =>
            e.x < 0 || e.x + e.width > CANVAS_WIDTH
        );

        enemies.forEach(e => {
            e.x += enemyDirection * deltaTime;

            // Game over if enemy reaches bottom
            if (e.y + e.height >= CANVAS_HEIGHT) {
                alert('Game Over! Enemies invaded. Score: ' + score);
                restartGame();
                return;
            }
        });

        if (hitEdge) {
            enemyDirection *= -1;
            enemies.forEach(e => e.y += ENEMY_DESCENT_STEP * deltaTime);
        }

        // Collision with bullets/lasers
        enemiesToRemoveSet.clear();
        bullets.forEach((b, bi) => {
            if (!b.active) return;
            enemies.forEach((e, ei) => {
                if (rectCollision(b, e)) {
                    b.active = false;
                    bullets.splice(bi, 1);
                    enemiesToRemoveSet.add(ei);
                    score += 10;
                }
            });
        });
        lasers.forEach(l => {
            enemies.forEach((e, ei) => {
                if (rectCollision(l, e)) {
                    enemiesToRemoveSet.add(ei);
                    score += 20;
                }
            });
        });

        Array.from(enemiesToRemoveSet).sort((a, b) => b - a).forEach(i => enemies.splice(i, 1));

        // Enemy shooting
        enemies.forEach(e => {
            const shootChance = BASE_ENEMY_SHOOT_PROB + waveNumber * 0.001;
            if (Math.random() < shootChance) {
                enemyBullets.push({
                    x: e.x + e.width / 2 - 5,
                    y: e.y + e.height,
                    width: 10,
                    height: 20,
                    speed: 4 + 0.2 * waveNumber
                });
            }
        });
    }

    // === Draw Enemies ===
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

    // === Score & Wave ===
    let score = 0;
    function drawHUD() {
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.fillText('Score: ' + score, 10, 30);
        ctx.fillText('Wave: ' + waveNumber, 10, 60);
    }

    // === Reset Game ===
    function restartGame() {
        player.x = CANVAS_WIDTH / 2 - player.width / 2;
        player.y = CANVAS_HEIGHT - 60;
        player.dx = 0;
        player.health = 3;
        leftPressed = false;
        rightPressed = false;
        bullets.length = 0;
        lasers.length = 0;
        enemyBullets.length = 0;
        score = 0;
        lastLaserTime = 0;
        waveNumber = 1;
        enemyDirection = BASE_ENEMY_SPEED;
        respawnScheduled = false;
        enemiesToRemoveSet.clear();
        initEnemies();
    }

    // === Game Loop ===
    let lastTime = performance.now();
    function gameLoop(timestamp) {
        let deltaTime = (timestamp - lastTime) / 16.67;
        if (!isFinite(deltaTime)) deltaTime = 1;
        lastTime = timestamp;

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        if (!isPaused) {
            player.update();
            updateBullets();
            updateLasers();
            updateEnemies(deltaTime);
            updateEnemyBullets();
        }

        player.draw(ctx);
        drawBullets(ctx);
        drawEnemies(ctx);
        drawLasers(ctx);
        drawEnemyBullets(ctx);
        drawHUD();

        if (isPaused) {
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            ctx.fillStyle = "#fff";
            ctx.font = "40px Arial";
            ctx.fillText("Paused", CANVAS_WIDTH/2 - 70, CANVAS_HEIGHT/2);
        }

        requestAnimationFrame(gameLoop);
    }

    // === Init ===
    createBulletPool(50);
    initEnemies();
    requestAnimationFrame(gameLoop);

    // === BLE Connection ===
    document.getElementById('connectButton').addEventListener('click', async () => {
        try {
            device = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'Cycler' }],
                optionalServices: [SERVICE_UUID]
            });
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            characteristic = await service.getCharacteristic(CHAR_UUID);
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', handleNotification);

            const btn = document.getElementById('connectButton');
            btn.innerText = "Connected";
            btn.disabled = true;

            device.addEventListener('gattserverdisconnected', () => {
                btn.innerText = "Connect to Device";
                btn.disabled = false;
                console.log('BLE device disconnected');
            });
        } catch (err) {
            console.error('BLE connection error:', err);
            alert("Failed to connect: " + err.message);
        }
    });

    // === Pause Button ===
    document.getElementById('pauseButton').addEventListener('click', togglePause);

    // === BLE Notification Handler ===
    function handleNotification(event) {
        try {
            const value = new TextDecoder().decode(event.target.value);
            if (value.startsWith("1:")) shootBullet();
            else if (value.startsWith("2:")) fireLaser();
            else if (value === "3") leftPressed = !leftPressed;
            else if (value === "4") rightPressed = !rightPressed;
        } catch (err) {
            console.error('Error processing BLE notification:', err);
        }
    }

    // === Mobile Controls ===
    function setupMobileControls() {
        const btnLeft = document.getElementById('btnLeft');
        const btnRight = document.getElementById('btnRight');
        const btnShoot = document.getElementById('btnShoot');
        const btnLaser = document.getElementById('btnLaser');

        btnLeft.addEventListener('touchstart', () => { leftPressed = true; });
        btnLeft.addEventListener('touchend', () => { leftPressed = false; });

        btnRight.addEventListener('touchstart', () => { rightPressed = true; });
        btnRight.addEventListener('touchend', () => { rightPressed = false; });

        btnShoot.addEventListener('touchstart', shootBullet);
        btnLaser.addEventListener('touchstart', fireLaser);
    }
    setupMobileControls();

    // === Keyboard Controls ===
    document.addEventListener('keydown', (e) => {
        if (e.key === "ArrowLeft") leftPressed = true;
        if (e.key === "ArrowRight") rightPressed = true;
        if (e.key === "z") fireLaser();
        if (e.key === " ") shootBullet();
        if (e.key.toLowerCase() === "p") togglePause();
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === "ArrowLeft") leftPressed = false;
        if (e.key === "ArrowRight") rightPressed = false;
    });
});
