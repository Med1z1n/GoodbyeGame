const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// === BLE Manager ===
class BLEManager {
  constructor() {
    this.device = null;
    this.characteristic = null;
    this.SERVICE_UUID = '4a980001-1cc4-e7c1-c757-f1267dd021e8';
    this.CHAR_UUID = '4a980002-1cc4-e7c1-c757-f1267dd021e8';
    this.listeners = [];
    this.isConnecting = false;
    this.retryTimeout = null;
    this.maxRetryTime = 5000; // 5 seconds retry period
    this.setupConnectButton();
  }

  async connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ name: "Sienna's Remote" }],
        optionalServices: [this.SERVICE_UUID]
      });
      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(this.SERVICE_UUID);
      this.characteristic = await service.getCharacteristic(this.CHAR_UUID);
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));

      const btn = document.getElementById('connectButton');
      btn.innerText = "Connected";
      btn.disabled = true;

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));
      this.isConnecting = false;
      clearTimeout(this.retryTimeout);
    } catch (err) {
      this.isConnecting = false;
      clearTimeout(this.retryTimeout);
      console.error(err);
      alert("BLE Error: " + err.message);
    }
  }

  handleDisconnect() {
    const btn = document.getElementById('connectButton');
    btn.innerText = "Connect to Device";
    btn.disabled = false;
    console.log('BLE disconnected');
    this.device = null;
    this.characteristic = null;
    this.autoReconnect();
  }

  async autoReconnect() {
    const startTime = Date.now();
    const attemptReconnect = async () => {
      if (Date.now() - startTime >= this.maxRetryTime) {
        console.log('Max retry time reached');
        return;
      }
      try {
        await this.connect();
      } catch (err) {
        this.retryTimeout = setTimeout(attemptReconnect, 1000);
      }
    };
    this.retryTimeout = setTimeout(attemptReconnect, 1000);
  }

  handleNotification(event) {
    const value = new TextDecoder().decode(event.target.value);
    this.listeners.forEach(listener => listener(value));
  }

  addListener(listener) {
    this.listeners.push(listener);
  }

  removeListener(listener) {
    this.listeners = this.listeners.filter(l => l !== listener);
  }

  setupConnectButton() {
    document.getElementById('connectButton')?.addEventListener('click', () => this.connect());
  }
}

const bleManager = new BLEManager();

// === Game Hub ===
let currentGame = null;

const backToMenuButton = document.getElementById("backToMenuButton");

function isTouchDevice() {
  return (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
}

window.addEventListener("DOMContentLoaded", () => {
  const controls = document.getElementById("mobileControls");
  if (!isTouchDevice()) {
    controls.style.display = "none";
  }
});

backToMenuButton.addEventListener("click", () => {
  if (currentGame && currentGame.stop) {
    currentGame.stop();
    currentGame = null;
  }

  document.getElementById("gameCanvas").style.display = "none";
  document.getElementById("mobileControls").style.display = "none";
  document.getElementById("snakeControls").style.display = "none";
  document.getElementById("pongControls").style.display = "none";
  document.getElementById("flappyControls").style.display = "none";
  backToMenuButton.style.display = "none";

  document.getElementById("menu").style.display = "flex";
});

function startGame(gameName) {
  if (currentGame && currentGame.stop) {
    currentGame.stop();
    currentGame = null;
  }

  document.getElementById("menu").style.display = "none";
  canvas.style.display = "block";
  backToMenuButton.style.display = "block";

  switch(gameName) {
    case "spaceShooter":
      currentGame = new SpaceShooter(canvas);
      break;
    case "Snake":
      currentGame = new SnakeGame(canvas);
      break;
    case "Pong":
      currentGame = new PongGame(canvas);
      break;
    case "Flappy":
      currentGame = new FlappyBirdGame(canvas);
      break;
    case "placeholder":
      currentGame = new PlaceholderGame(canvas);
      break;
  }

  currentGame.start();
}

class FlappyBirdGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.bird = { x: 50, y: canvas.height / 2, vy: 0, width: 20, height: 20 };
    this.gravity = 0.6;
    this.lift = -10;
    this.pipes = [];
    this.pipeWidth = 40;
    this.pipeGap = 120;
    this.pipeSpeed = 2;

    this.score = 0;
    this.gameOver = false;
    this.paused = false;

    this.bleListener = this.handleBLEInput.bind(this);

    if (isTouchDevice()) {
      document.getElementById("flappyControls").style.display = "block";
      document.getElementById("flapButton")?.addEventListener("click", () => { this.gameOver ? this.restartGame() : this.flap()});
    }
  }

  start() {
    document.addEventListener("keydown", this.keydownHandler = (e) => {
      if (this.gameOver) return this.restartGame();
      if (e.key === " " || e.key === "ArrowUp") this.flap();
      if (e.key === "p") this.paused = !this.paused;
    });

    bleManager.addListener(this.bleListener);
    this.gameLoop = setInterval(() => this.update(), 20);

    // Start with initial pipes
    this.pipes.push(this.generatePipe(this.canvas.width));
  }

  stop() {
    clearInterval(this.gameLoop);
    document.removeEventListener("keydown", this.keydownHandler);
    bleManager.removeListener(this.bleListener);
  }

  handleBLEInput(value) {
    if (this.gameOver) return this.restartGame();
    if (value.startsWith("1:") || value.startsWith("2:") || value === "3" || value === "4") this.flap(); // Map any button for flap
  }

  flap() {
    this.bird.vy = this.lift;
  }

  generatePipe(x) {
    const topHeight = Math.floor(Math.random() * (this.canvas.height - this.pipeGap - 40)) + 20;
    return { x, top: topHeight, bottom: topHeight + this.pipeGap };
  }

  update() {
    if (this.paused || this.gameOver) return;

    // Apply gravity
    this.bird.vy += this.gravity;
    this.bird.y += this.bird.vy;

    // Move pipes
    for (let pipe of this.pipes) {
      pipe.x -= this.pipeSpeed;
    }

    // Add new pipe if needed
    if (this.pipes[this.pipes.length - 1].x < this.canvas.width - 200) {
      this.pipes.push(this.generatePipe(this.canvas.width));
    }

    // Remove offscreen pipes
    if (this.pipes[0].x + this.pipeWidth < 0) {
      this.pipes.shift();
      this.score++;
    }

    // Collision detection
    for (let pipe of this.pipes) {
      if (
        this.bird.x + this.bird.width > pipe.x &&
        this.bird.x < pipe.x + this.pipeWidth &&
        (this.bird.y < pipe.top || this.bird.y + this.bird.height > pipe.bottom)
      ) {
        this.endGame();
      }
    }

    // Floor & ceiling collision
    if (this.bird.y + this.bird.height > this.canvas.height || this.bird.y < 0) {
      this.endGame();
    }

    this.draw();
  }

  draw() {
    // Clear screen
    this.ctx.fillStyle = "skyblue";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw bird
    this.ctx.fillStyle = "yellow";
    this.ctx.fillRect(this.bird.x, this.bird.y, this.bird.width, this.bird.height);

    // Draw pipes
    this.ctx.fillStyle = "green";
    for (let pipe of this.pipes) {
      this.ctx.fillRect(pipe.x, 0, this.pipeWidth, pipe.top);
      this.ctx.fillRect(pipe.x, pipe.bottom, this.pipeWidth, this.canvas.height - pipe.bottom);
    }

    // Draw score
    this.ctx.fillStyle = "white";
    this.ctx.font = "20px Arial";
    this.ctx.fillText("Score: " + this.score, 10, 20);

    // Paused text
    if (this.paused) {
      this.ctx.fillStyle = "white";
      this.ctx.font = "24px Arial";
      this.ctx.fillText("Paused", this.canvas.width / 2 - 40, this.canvas.height / 2);
    }

    // Game over text
    if (this.gameOver) {
      this.ctx.fillStyle = "white";
      this.ctx.font = "24px Arial";
      this.ctx.fillText("Game Over - Press Any Key or BLE Button", 20, this.canvas.height / 2);
    }
  }

  endGame() {
    this.gameOver = true;
    clearInterval(this.gameLoop);
  }

  restartGame() {
    this.bird.y = this.canvas.height / 2;
    this.bird.vy = 0;
    this.pipes = [this.generatePipe(this.canvas.width)];
    this.score = 0;
    this.gameOver = false;
    this.paused = false;
    clearInterval(this.gameLoop);
    this.gameLoop = setInterval(() => this.update(), 20);
  }
}

// === Base Game Class ===
class SpaceShooter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.animationFrame = null;

    if (isTouchDevice()) {
      document.getElementById("mobileControls").style.display = "block";
    }

    this.player = { x: CANVAS_WIDTH/2-20, y: CANVAS_HEIGHT-60, width:40, height:40, speed:5, health:3 };
    this.bullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.score = 0;
    this.wave = 1;
    this.gameOver = false;
    this.paused = false;
    this.leftPressed = false;
    this.rightPressed = false;
    this.enemyRows = 3;
    this.enemyCols = 6;
    this.enemySpeedX = 1;
    this.enemyDropDistance = 20;
    this.enemyShootChance = 0.002;
    this.laserCooldown = 5000;
    this.laserDuration = 500;
    this.lastLaserTime = 0;
    this.laserReady = true;

    this.bleListener = this.handleBLEInput.bind(this);
  }

  start() {
    this.setupControls();
    this.spawnEnemies();
    bleManager.addListener(this.bleListener);
    this.gameLoop();
  }

  stop() {
    cancelAnimationFrame(this.animationFrame);
    document.removeEventListener("keydown", this.keydownHandler);
    document.removeEventListener("keyup", this.keyupHandler);
    bleManager.removeListener(this.bleListener);
  }

  setupControls() {
    this.keydownHandler = this.handleKeyDown.bind(this);
    this.keyupHandler = this.handleKeyUp.bind(this);
    document.addEventListener("keydown", this.keydownHandler);
    document.addEventListener("keyup", this.keyupHandler);

    const btnLeft = document.getElementById("btnLeft");
    const btnRight = document.getElementById("btnRight");
    const btnShoot = document.getElementById("btnShoot");
    const btnLaser = document.getElementById("btnLaser");
    const pauseGameButton = document.getElementById("pauseButton");

    pauseGameButton.addEventListener("click", () => {
      this.paused = !this.paused;
    });

    btnLeft?.addEventListener("touchstart", () => { this.gameOver ? this.restartGame() : this.leftPressed = true; });
    btnLeft?.addEventListener("touchend", () => { this.leftPressed = false; });
    btnRight?.addEventListener("touchstart", () => { this.gameOver ? this.restartGame() : this.rightPressed = true; });
    btnRight?.addEventListener("touchend", () => { this.rightPressed = false; });
    btnShoot?.addEventListener("touchstart", () => { this.gameOver ? this.restartGame() : this.shootBullet(); });
    btnLaser?.addEventListener("touchstart", () => { this.gameOver ? this.restartGame() : this.fireLaser(); });
  }

  handleBLEInput(value) {
    if (this.gameOver) return this.restartGame();
    if (value.startsWith("1:")) this.shootBullet();
    else if (value.startsWith("2:")) this.fireLaser();
    else if (value === "3") this.leftPressed = !this.leftPressed;
    else if (value === "4") this.rightPressed = !this.rightPressed;
  }

  handleKeyDown(e) {
    if (this.gameOver) return this.restartGame();
    if (e.key === "ArrowLeft") this.leftPressed = true;
    if (e.key === "ArrowRight") this.rightPressed = true;
    if (e.key === " " || e.key === "Spacebar") this.shootBullet();
    if (e.key === "z" || e.key === "Z") this.fireLaser();
    if (e.key === "p" || e.key === "P") this.paused = !this.paused;
  }

  handleKeyUp(e) {
    if (e.key === "ArrowLeft") this.leftPressed = false;
    if (e.key === "ArrowRight") this.rightPressed = false;
  }

  shootBullet() {
    if (this.gameOver) return this.restartGame();
    this.bullets.push({ x: this.player.x + this.player.width/2 -2, y: this.player.y, width:4, height:10, speed:7, laser:false });
  }

  fireLaser() {
    if (!this.laserReady) return;
    if (this.gameOver) return this.restartGame();

    this.bullets.push({
      x: this.player.x + this.player.width/2 -2,
      y: 0,
      width: 4,
      height: this.player.y,
      speed: 0,
      laser: true,
      startTime: Date.now()
    });

    this.laserReady = false;
    this.lastLaserTime = Date.now();
    setTimeout(() => { this.laserReady = true; }, this.laserCooldown);
  }

  spawnEnemies() {
    this.enemies = [];
    let startX = 60, startY = 40, spacingX = 60, spacingY = 50;
    for (let r = 0; r < this.enemyRows; r++) {
      for (let c = 0; c < this.enemyCols; c++) {
        this.enemies.push({ x: startX + c * spacingX, y: startY + r * spacingY, width:40, height:30 });
      }
    }
  }

  update() {
    if (this.paused || this.gameOver) return;

    if (this.leftPressed && this.player.x > 0) this.player.x -= this.player.speed;
    if (this.rightPressed && this.player.x + this.player.width < CANVAS_WIDTH) this.player.x += this.player.speed;

    this.updateBullets();
    this.updateEnemies();
    this.updateEnemyBullets();

    if (this.enemies.length === 0) {
      this.wave++;
      this.enemySpeedX += 0.5;
      this.enemyShootChance += 0.001;
      this.enemyRows = Math.min(6, this.enemyRows + 1);
      this.spawnEnemies();
    }
  }

  updateBullets() {
    const now = Date.now();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      let b = this.bullets[i];
      if (!b.laser) b.y -= b.speed;

      if (b.laser) {
        b.x = this.player.x + this.player.width/2 -2;
        b.height = this.player.y;
        if (now - b.startTime >= this.laserDuration) {
          this.bullets.splice(i, 1);
          continue;
        }
      }

      for (let j = this.enemies.length - 1; j >= 0; j--) {
        let e = this.enemies[j];
        if (this.rectCollision(b, e)) {
          this.enemies.splice(j, 1);
          this.score += 10;
          if (!b.laser) { this.bullets.splice(i, 1); break; }
        }
      }

      if (!b.laser && b.y + b.height < 0) this.bullets.splice(i, 1);
    }
  }

  updateEnemies() {
    let hitEdge = false;
    for (let e of this.enemies) {
      e.x += this.enemySpeedX;
      if (Math.random() < this.enemyShootChance) this.enemyBullets.push({x: e.x + e.width/2, y: e.y + e.height, width:4, height:10, speed:3});
      if (e.x + e.width >= CANVAS_WIDTH || e.x <= 0) hitEdge = true;
    }
    if (hitEdge) {
      this.enemySpeedX = -this.enemySpeedX;
      for (let e of this.enemies) {
        e.y += this.enemyDropDistance;
        if (e.y + e.height >= CANVAS_HEIGHT) this.gameOver = true;
      }
    }
  }

  updateEnemyBullets() {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      let b = this.enemyBullets[i];
      if (!b) { this.enemyBullets.splice(i, 1); continue; }
      b.y += b.speed;
      if (b.y > CANVAS_HEIGHT) { this.enemyBullets.splice(i, 1); continue; }
      if (this.rectCollision(b, this.player)) {
        this.enemyBullets.splice(i, 1);
        this.player.health--;
        if (this.player.health <= 0) this.gameOver = true;
      }
    }
  }

  rectCollision(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  restartGame() {
    this.player.x = CANVAS_WIDTH/2 - 20;
    this.player.y = CANVAS_HEIGHT - 60;
    this.player.health = 3;
    this.bullets = [];
    this.enemyBullets = [];
    this.score = 0;
    this.wave = 1;
    this.enemySpeedX = 1;
    this.enemyShootChance = 0.002;
    this.gameOver = false;
    this.laserReady = true;
    this.lastLaserTime = 0;
    this.leftPressed = false;
    this.rightPressed = false;
    this.spawnEnemies();
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = "green";
    ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);

    ctx.fillStyle = "yellow";
    this.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));

    ctx.fillStyle = "red";
    this.enemies.forEach(e => ctx.fillRect(e.x, e.y, e.width, e.height));

    ctx.fillStyle = "white";
    this.enemyBullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));

    ctx.fillStyle = "black";
    ctx.font = "20px Arial";
    ctx.fillText("Score: " + this.score, 10, 20);
    ctx.fillText("Health: " + this.player.health, 10, 40);
    ctx.fillText("Wave: " + this.wave, 10, 60);

    ctx.fillText("Laser:", 10, 80);
    ctx.strokeStyle = "black";
    ctx.strokeRect(70, 65, 100, 15);
    if (this.laserReady) {
      ctx.fillStyle = "blue";
      ctx.fillRect(70, 65, 100, 15);
    } else {
      let progress = Math.min(1, (Date.now() - this.lastLaserTime) / this.laserCooldown);
      ctx.fillStyle = "blue";
      ctx.fillRect(70, 65, 100 * progress, 15);
    }

    if (this.paused) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "white";
      ctx.font = "40px Arial";
      ctx.fillText("PAUSED", CANVAS_WIDTH/2 - 80, CANVAS_HEIGHT/2);
    }
    if (this.gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = "white";
      ctx.font = "40px Arial";
      ctx.fillText("GAME OVER", CANVAS_WIDTH/2 - 120, CANVAS_HEIGHT/2);
      ctx.font = "20px Arial";
      ctx.fillText("Press any button to Restart", CANVAS_WIDTH/2 - 120, CANVAS_HEIGHT/2 + 40);
    }
  }

  gameLoop() {
    this.update();
    this.draw();
    this.animationFrame = requestAnimationFrame(this.gameLoop.bind(this));
  }
}

class SnakeGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.gridSize = 20;
    this.snake = [{ x: 5, y: 5 }];
    this.direction = { x: 1, y: 0 };
    this.food = this.randomFood();
    this.score = 0;
    this.gameOver = false;
    this.paused = false;
    this.bleListener = this.handleBLEInput.bind(this);

    if (isTouchDevice()) {
      document.getElementById("snakeControls").style.display = "block";
    }
  }

  start() {
    this.initControls();
    bleManager.addListener(this.bleListener);
    this.gameLoop = setInterval(() => this.update(), 150);
  }

  stop() {
    clearInterval(this.gameLoop);
    document.removeEventListener("keydown", this.keydownHandler);
    bleManager.removeListener(this.bleListener);
  }

  initControls() {
    this.keydownHandler = (e) => {
      if (this.gameOver) return this.restartGame();
      if (e.key === "ArrowUp") this.changeDirection(0, -1);
      else if (e.key === "ArrowDown") this.changeDirection(0, 1);
      else if (e.key === "ArrowLeft") this.changeDirection(-1, 0);
      else if (e.key === "ArrowRight") this.changeDirection(1, 0);
      else if (e.key === "p") this.paused = !this.paused;
    };
    document.addEventListener("keydown", this.keydownHandler);

    document.getElementById("SbtnUp")?.addEventListener("click", () => { this.gameOver ? this.restartGame() : this.changeDirection(0, -1); });
    document.getElementById("SbtnDown")?.addEventListener("click", () => { this.gameOver ? this.restartGame() : this.changeDirection(0, 1); });
    document.getElementById("SbtnLeft")?.addEventListener("click", () => { this.gameOver ? this.restartGame() : this.changeDirection(-1, 0); });
    document.getElementById("SbtnRight")?.addEventListener("click", () => { this.gameOver ? this.restartGame() : this.changeDirection(1, 0); });

    document.getElementById("pauseButton").addEventListener("click", () => {
      this.paused = !this.paused;
    });
  }

  handleBLEInput(value) {
    if (this.gameOver) return this.restartGame();
    if (value.startsWith("1:")) this.changeDirection(-1, 0);
    else if (value.startsWith("2:")) this.changeDirection(0, -1);
    else if (value === "3") this.changeDirection(0, 1);
    else if (value === "4") this.changeDirection(1, 0);
  }

  changeDirection(x, y) {
    if (this.snake.length > 1 && this.snake[0].x + x === this.snake[1].x && this.snake[0].y + y === this.snake[1].y) {
      return;
    }
    this.direction = { x, y };
  }

  randomFood() {
    return {
      x: Math.floor(Math.random() * (this.canvas.width / this.gridSize)),
      y: Math.floor(Math.random() * (this.canvas.height / this.gridSize)),
    };
  }

  update() {
    if (this.paused || this.gameOver) return;

    const head = {
      x: this.snake[0].x + this.direction.x,
      y: this.snake[0].y + this.direction.y,
    };

    if (
      head.x < 0 ||
      head.y < 0 ||
      head.x >= this.canvas.width / this.gridSize ||
      head.y >= this.canvas.height / this.gridSize
    ) {
      return this.endGame();
    }

    if (this.snake.some((part) => part.x === head.x && part.y === head.y)) {
      return this.endGame();
    }

    this.snake.unshift(head);

    if (head.x === this.food.x && head.y === this.food.y) {
      this.score++;
      this.food = this.randomFood();
    } else {
      this.snake.pop();
    }

    this.draw();
  }

  draw() {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = "lime";
    for (const part of this.snake) {
      this.ctx.fillRect(part.x * this.gridSize, part.y * this.gridSize, this.gridSize, this.gridSize);
    }

    this.ctx.fillStyle = "red";
    this.ctx.fillRect(this.food.x * this.gridSize, this.food.y * this.gridSize, this.gridSize, this.gridSize);

    this.ctx.fillStyle = "white";
    this.ctx.font = "16px Arial";
    this.ctx.fillText("Score: " + this.score, 10, 20);

    if (this.paused) {
      this.ctx.fillStyle = "rgba(0,0,0,0.5)";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = "white";
      this.ctx.font = "24px Arial";
      this.ctx.fillText("Paused", this.canvas.width/2 - 40, this.canvas.height/2);
    }

    if (this.gameOver) {
      this.ctx.fillStyle = "white";
      this.ctx.font = "24px Arial";
      this.ctx.fillText("Game Over - Press Any Key or BLE Button", 50, this.canvas.height/2);
    }
  }

  endGame() {
    this.gameOver = true;
    clearInterval(this.gameLoop);
  }

  restartGame() {
    this.snake = [{ x: 5, y: 5 }];
    this.direction = { x: 1, y: 0 };
    this.food = this.randomFood();
    this.score = 0;
    this.gameOver = false;
    this.paused = false;
    clearInterval(this.gameLoop);
    this.gameLoop = setInterval(() => this.update(), 150);
  }
}

class PongGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ball = { x: canvas.width / 2, y: canvas.height / 2, vx: 4, vy: 2, size: 10 };
    this.paddleHeight = 60;
    this.paddleWidth = 10;
    this.paddleSpeed = 20;
    this.leftPaddle = { x: 10, y: canvas.height / 2 - this.paddleHeight / 2 };
    this.rightPaddle = { x: canvas.width - 20, y: canvas.height / 2 - this.paddleHeight / 2 };
    this.leftScore = 0;
    this.rightScore = 0;
    this.maxScore = 10;
    this.paused = false;
    this.gameOver = false;
    this.bleListener = this.handleBLEInput.bind(this);

    if (isTouchDevice()) {
      document.getElementById("pongControls").style.display = "block";
    }
  }

  start() {
    this.initControls();
    bleManager.addListener(this.bleListener);
    this.gameLoop = setInterval(() => this.update(), 30);
  }

  stop() {
    clearInterval(this.gameLoop);
    document.removeEventListener("keydown", this.keydownHandler);
    bleManager.removeListener(this.bleListener);
  }

  initControls() {
    this.keydownHandler = (e) => {
      if (this.gameOver) return this.restartGame();
      if (e.key === "w") this.movePaddle(this.leftPaddle, -this.paddleSpeed);
      else if (e.key === "s") this.movePaddle(this.leftPaddle, this.paddleSpeed);
      else if (e.key === "ArrowUp") this.movePaddle(this.rightPaddle, -this.paddleSpeed);
      else if (e.key === "ArrowDown") this.movePaddle(this.rightPaddle, this.paddleSpeed);
      else if (e.key === "p") this.paused = !this.paused;
    };
    document.addEventListener("keydown", this.keydownHandler);

    document.getElementById("LbtnUp")?.addEventListener("click", () => this.movePaddle(this.leftPaddle, -this.paddleSpeed));
    document.getElementById("LbtnDown")?.addEventListener("click", () => this.movePaddle(this.leftPaddle, this.paddleSpeed));
    document.getElementById("RbtnUp")?.addEventListener("click", () => this.movePaddle(this.rightPaddle, -this.paddleSpeed));
    document.getElementById("RbtnDown")?.addEventListener("click", () => this.movePaddle(this.rightPaddle, this.paddleSpeed));

    document.getElementById("pauseButton").addEventListener("click", () => {
      this.paused = !this.paused;
    });
  }

  handleBLEInput(value) {
    if (this.gameOver) return this.restartGame();
    if (value.startsWith("1:")) this.movePaddle(this.leftPaddle, -this.paddleSpeed);
    else if (value === "3") this.movePaddle(this.leftPaddle, this.paddleSpeed);
    else if (value.startsWith("2:")) this.movePaddle(this.rightPaddle, -this.paddleSpeed);
    else if (value === "4") this.movePaddle(this.rightPaddle, this.paddleSpeed);
  }

  movePaddle(paddle, dy) {
    paddle.y += dy;
    if (paddle.y < 0) paddle.y = 0;
    if (paddle.y + this.paddleHeight > this.canvas.height) {
      paddle.y = this.canvas.height - this.paddleHeight;
    }
  }

  update() {
    if (this.paused || this.gameOver) return;

    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    if (this.ball.y <= 0 || this.ball.y + this.ball.size >= this.canvas.height) {
      this.ball.vy *= -1;
    }

    if (
      this.ball.x <= this.leftPaddle.x + this.paddleWidth &&
      this.ball.y + this.ball.size >= this.leftPaddle.y &&
      this.ball.y <= this.leftPaddle.y + this.paddleHeight
    ) {
      this.ball.vx *= -1;
      this.ball.x = this.leftPaddle.x + this.paddleWidth;
    }

    if (
      this.ball.x + this.ball.size >= this.rightPaddle.x &&
      this.ball.y + this.ball.size >= this.rightPaddle.y &&
      this.ball.y <= this.rightPaddle.y + this.paddleHeight
    ) {
      this.ball.vx *= -1;
      this.ball.x = this.rightPaddle.x - this.ball.size;
    }

    if (this.ball.x <= 0) {
      this.rightScore++;
      this.resetBall();
    }
    if (this.ball.x + this.ball.size >= this.canvas.width) {
      this.leftScore++;
      this.resetBall();
    }

    if (this.leftScore >= this.maxScore || this.rightScore >= this.maxScore) {
      this.endGame();
    }

    this.draw();
  }

  resetBall() {
    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height / 2;
    this.ball.vx = Math.random() > 0.5 ? 4 : -4;
    this.ball.vy = Math.random() > 0.5 ? 2 : -2;
  }

  draw() {
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = "white";
    this.ctx.fillRect(this.leftPaddle.x, this.leftPaddle.y, this.paddleWidth, this.paddleHeight);
    this.ctx.fillRect(this.rightPaddle.x, this.rightPaddle.y, this.paddleWidth, this.paddleHeight);

    this.ctx.fillRect(this.ball.x, this.ball.y, this.ball.size, this.ball.size);

    this.ctx.font = "20px Arial";
    this.ctx.fillText(this.leftScore, this.canvas.width / 4, 20);
    this.ctx.fillText(this.rightScore, (this.canvas.width / 4) * 3, 20);

    if (this.paused) {
      this.ctx.font = "24px Arial";
      this.ctx.fillText("Paused", this.canvas.width / 2 - 40, this.canvas.height / 2);
    }

    if (this.gameOver) {
      this.ctx.fillStyle = "white";
      this.ctx.font = "24px Arial";
      this.ctx.fillText("Game Over - Press Any Key or BLE Button", 50, this.canvas.height / 2);
    }
  }

  endGame() {
    this.gameOver = true;
    clearInterval(this.gameLoop);
  }

  restartGame() {
    this.leftScore = 0;
    this.rightScore = 0;
    this.gameOver = false;
    this.paused = false;
    this.resetBall();
    clearInterval(this.gameLoop);
    this.gameLoop = setInterval(() => this.update(), 30);
  }
}

class PlaceholderGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.animationFrame = null;
  }

  start() {
    this.gameLoop();
  }

  stop() {
    cancelAnimationFrame(this.animationFrame);
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "purple";
    this.ctx.font = "30px Arial";
    this.ctx.fillText("New Game Here", 100, 100);
    this.animationFrame = requestAnimationFrame(this.draw.bind(this));
  }

  gameLoop() {
    this.draw();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  canvas.style.display = "none";
});
