const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// === Player ===
let player = {
    x: CANVAS_WIDTH / 2 - 20,
    y: CANVAS_HEIGHT - 60,
    width: 40,
    height: 40,
    speed: 5,
    health: 3
};

// === Game state ===
let bullets = [];
let enemyBullets = [];
let enemies = [];
let score = 0;
let gameOver = false;
let paused = false;
let wave = 1;

// Movement state
let leftPressed = false;
let rightPressed = false;

// === Enemy config ===
let enemyRows = 3;
let enemyCols = 6;
let enemySpeedX = 1;
let enemyDropDistance = 20;
let enemyShootChance = 0.002;

// === Laser cooldown ===
let laserReady = true;
let laserCooldown = 5000; // 5 seconds
let lastLaserTime = 0;

// === Keyboard controls ===
document.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") leftPressed = true;
    if (e.key === "ArrowRight") rightPressed = true;
    if (e.key === " " || e.key === "Spacebar") shootBullet();
    if (e.key === "z" || e.key === "Z") fireLaser();  // <-- changed from L to Z
    if (e.key === "p" || e.key === "P") paused = !paused;
});

document.addEventListener("keyup", e => {
    if (e.key === "ArrowLeft") leftPressed = false;
    if (e.key === "ArrowRight") rightPressed = false;
});

// === Mobile controls ===
function setupMobileControls() {
    const btnLeft = document.getElementById("btnLeft");
    const btnRight = document.getElementById("btnRight");
    const btnShoot = document.getElementById("btnShoot");
    const btnLaser = document.getElementById("btnLaser");

    btnLeft.addEventListener("touchstart", () => { leftPressed = true; });
    btnLeft.addEventListener("touchend", () => { leftPressed = false; });

    btnRight.addEventListener("touchstart", () => { rightPressed = true; });
    btnRight.addEventListener("touchend", () => { rightPressed = false; });

    btnShoot.addEventListener("touchstart", shootBullet);
    btnLaser.addEventListener("touchstart", fireLaser);
}
setupMobileControls();

// === Game functions ===
function shootBullet() {
    bullets.push({ x: player.x + player.width / 2 - 2, y: player.y, width: 4, height: 10, speed: 7 });
}

function fireLaser() {
    let now = Date.now();
    if (!laserReady) return;

    bullets.push({ x: player.x + player.width / 2 - 2, y: 0, width: 4, height: player.y, speed: 0, laser: true });

    laserReady = false;
    lastLaserTime = now;
    setTimeout(() => { laserReady = true; }, laserCooldown);
}

function spawnEnemies() {
    enemies = [];
    let startX = 60;
    let startY = 40;
    let spacingX = 60;
    let spacingY = 50;

    for (let r = 0; r < enemyRows; r++) {
        for (let c = 0; c < enemyCols; c++) {
            enemies.push({
                x: startX + c * spacingX,
                y: startY + r * spacingY,
                width: 40,
                height: 30
            });
        }
    }
}

function updateBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        if (!b.laser) b.y -= b.speed;

        // Remove off-screen
        if (b.y + b.height < 0) {
            bullets.splice(i, 1);
            continue;
        }

        // Collision with enemies
        for (let j = enemies.length - 1; j >= 0; j--) {
            let e = enemies[j];
            if (rectCollision(b, e)) {
                bullets.splice(i, 1);
                enemies.splice(j, 1);
                score += 10;
                break;
            }
        }
    }
}

function updateEnemyBullets() {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let b = enemyBullets[i];
        if (!b) { enemyBullets.splice(i, 1); continue; }

        b.y += b.speed;
        if (b.y > CANVAS_HEIGHT) {
            enemyBullets.splice(i, 1);
            continue;
        }

        if (rectCollision(b, player)) {
            enemyBullets.splice(i, 1);
            player.health--;
            if (player.health <= 0) {
                gameOver = true;
            }
        }
    }
}

function updateEnemies() {
    let hitEdge = false;

    for (let e of enemies) {
        e.x += enemySpeedX;

        // Shoot randomly
        if (Math.random() < enemyShootChance) {
            enemyBullets.push({ x: e.x + e.width / 2, y: e.y + e.height, width: 4, height: 10, speed: 3 });
        }

        // Edge check
        if (e.x + e.width >= CANVAS_WIDTH || e.x <= 0) {
            hitEdge = true;
        }
    }

    // If edge hit → drop once
    if (hitEdge) {
        enemySpeedX = -enemySpeedX;
        for (let e of enemies) {
            e.y += enemyDropDistance;

            // Game over if enemy reaches bottom
            if (e.y + e.height >= CANVAS_HEIGHT) {
                gameOver = true;
            }
        }
    }
}

function rectCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

function restartGame() {
    player.x = CANVAS_WIDTH / 2 - 20;
    player.y = CANVAS_HEIGHT - 60;
    player.health = 3;

    bullets = [];
    enemyBullets = [];
    score = 0;
    wave = 1;
    enemySpeedX = 1;
    enemyShootChance = 0.002;
    gameOver = false;

    laserReady = true;
    lastLaserTime = 0;

    spawnEnemies();
}

// === Update & Draw ===
function update() {
    if (paused || gameOver) return;

    if (leftPressed && player.x > 0) player.x -= player.speed;
    if (rightPressed && player.x + player.width < CANVAS_WIDTH) player.x += player.speed;

    updateBullets();
    updateEnemyBullets();
    updateEnemies();

    // Wave cleared → new wave
    if (enemies.length === 0) {
        wave++;
        enemySpeedX += 0.5;
        enemyShootChance += 0.001;
        enemyRows = Math.min(6, enemyRows + 1); // cap rows
        spawnEnemies();
    }
}

function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Player
    ctx.fillStyle = "green";
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Bullets
    ctx.fillStyle = "yellow";
    bullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));

    // Enemies
    ctx.fillStyle = "red";
    enemies.forEach(e => ctx.fillRect(e.x, e.y, e.width, e.height));

    // Enemy bullets
    ctx.fillStyle = "white";
    enemyBullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));

    // HUD
    ctx.fillStyle = "black";
    ctx.font = "20px Arial";
    ctx.fillText("Score: " + score, 10, 20);
    ctx.fillText("Health: " + player.health, 10, 40);
    ctx.fillText("Wave: " + wave, 10, 60);

    // Laser cooldown bar
    ctx.fillText("Laser:", 10, 80);
    ctx.strokeStyle = "black";
    ctx.strokeRect(70, 65, 100, 15);
    if (laserReady) {
        ctx.fillStyle = "blue";
        ctx.fillRect(70, 65, 100, 15);
    } else {
        let progress = Math.min(1, (Date.now() - lastLaserTime) / laserCooldown);
        ctx.fillStyle = "blue";
        ctx.fillRect(70, 65, 100 * progress, 15);
    }

    if (paused) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "white";
        ctx.font = "40px Arial";
        ctx.fillText("PAUSED", CANVAS_WIDTH/2 - 80, CANVAS_HEIGHT/2);
    }

    if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = "white";
        ctx.font = "40px Arial";
        ctx.fillText("GAME OVER", CANVAS_WIDTH/2 - 120, CANVAS_HEIGHT/2);
        ctx.font = "20px Arial";
        ctx.fillText("Press R to Restart", CANVAS_WIDTH/2 - 80, CANVAS_HEIGHT/2 + 40);
    }
}

// Restart with "R"
document.addEventListener("keydown", e => {
    if (e.key === "r" || e.key === "R") restartGame();
});

// === Game Loop ===
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start game
restartGame();
gameLoop();
