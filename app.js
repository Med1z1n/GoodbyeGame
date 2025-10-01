const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

// === Game Hub ===
let currentGame = null;

const backToMenuButton = document.getElementById("backToMenuButton");

// don't show mobile controls on not touch screen devices.
function isTouchDevice() {
  return (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
}

window.addEventListener("DOMContentLoaded", () => {
  const controls = document.getElementById("mobileControls");
  if (!isTouchDevice()) {
    controls.style.display = "none"; // hide if not a touchscreen
  }
});

backToMenuButton.addEventListener("click", () => {
    // Stop the game loop if needed (you may want a flag)
    paused = true;

    // Hide game elements
    document.getElementById("gameCanvas").style.display = "none";
    document.getElementById("mobileControls").style.display = "none";
    document.getElementById("snakeControls").style.display = "none";
    document.getElementById("pongControls").style.display = "none";
    backToMenuButton.style.display = "none";

    // Show menu
    document.getElementById("menu").style.display = "flex";
});


function startGame(gameName) {
    document.getElementById("menu").style.display = "none";
    canvas.style.display = "block";
    backToMenuButton.style.display = "block";
    if (currentGame && currentGame.stop) currentGame.stop();

    switch(gameName) {
        case "spaceShooter":
            currentGame = new SpaceShooter(canvas);
            break;
        // add new games here
        case "placeholder":
            currentGame = new PlaceholderGame(canvas);
            break;

        case "Snake":
          currentGame = new SnakeGame(canvas);
          break;

        case "Pong":
          currentGame = new PongGame(canvas);
          break;
    }

    currentGame.start();
}

// === Base Game Class ===
class SpaceShooter {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.animationFrame = null;

        // controls display
        if (isTouchDevice()) {
          document.getElementById("mobileControls").style.display = "block";
        }

        // BLE
        this.device = null;
        this.characteristic = null;
        this.SERVICE_UUID = '4a980001-1cc4-e7c1-c757-f1267dd021e8';
        this.CHAR_UUID = '4a980002-1cc4-e7c1-c757-f1267dd021e8';

        // Player
        this.player = { x: CANVAS_WIDTH/2-20, y: CANVAS_HEIGHT-60, width:40, height:40, speed:5, health:3 };

        // State
        this.bullets = [];
        this.enemyBullets = [];
        this.enemies = [];
        this.score = 0;
        this.wave = 1;
        this.gameOver = false;
        this.d = false;

        // Movement
        this.leftPressed = false;
        this.rightPressed = false;

        // Enemy config
        this.enemyRows = 3;
        this.enemyCols = 6;
        this.enemySpeedX = 1;
        this.enemyDropDistance = 20;
        this.enemyShootChance = 0.002;

        // Laser
        this.laserCooldown = 5000;
        this.laserDuration = 500;
        this.lastLaserTime = 0;
        this.laserReady = true;

        this.keydownHandler = this.handleKeyDown.bind(this);
        this.keyupHandler = this.handleKeyUp.bind(this);
    }

    start() {
        this.setupControls();
        this.spawnEnemies();
        this.gameLoop();
    }

    stop() {
        cancelAnimationFrame(this.animationFrame);
        document.removeEventListener("keydown", this.keydownHandler);
        document.removeEventListener("keyup", this.keyupHandler);
    }

    setupControls() {
        document.addEventListener("keydown", this.keydownHandler);
        document.addEventListener("keyup", this.keyupHandler);

        // Mobile buttons
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

        // BLE Connect
        document.getElementById('connectButton')?.addEventListener('click', async () => {
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

                this.device.addEventListener('gattserverdisconnected', () => {
                    btn.innerText = "Connect to Device";
                    btn.disabled = false;
                    console.log('BLE disconnected');
                });
            } catch (err) {
                console.error(err);
                alert("BLE Error: "+err.message);
            }
        });
    }

    handleNotification(event) {
        const value = new TextDecoder().decode(event.target.value);
        if(this.gameOver) return this.restartGame();

        if (value.startsWith("1:")) this.shootBullet();
        else if (value.startsWith("2:")) this.fireLaser();
        else if (value === "3") this.leftPressed = !this.leftPressed;
        else if (value === "4") this.rightPressed = !this.rightPressed;
    }

    handleKeyDown(e) {
        if(this.gameOver) return this.restartGame();
        if(e.key === "ArrowLeft") this.leftPressed = true;
        if(e.key === "ArrowRight") this.rightPressed = true;
        if(e.key === " " || e.key === "Spacebar") this.shootBullet();
        if(e.key === "z" || e.key === "Z") this.fireLaser();
        if(e.key === "p" || e.key === "P") this.paused = !this.paused;
    }

    handleKeyUp(e) {
        if(e.key === "ArrowLeft") this.leftPressed = false;
        if(e.key === "ArrowRight") this.rightPressed = false;
    }

    shootBullet() {
        if(this.gameOver) return this.restartGame();
        this.bullets.push({ x: this.player.x + this.player.width/2 -2, y: this.player.y, width:4, height:10, speed:7, laser:false });
    }

    fireLaser() {
        if(!this.laserReady) return;
        if(this.gameOver) return this.restartGame();

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
        setTimeout(()=>{ this.laserReady = true; }, this.laserCooldown);
    }

    spawnEnemies() {
        this.enemies = [];
        let startX = 60, startY = 40, spacingX = 60, spacingY = 50;
        for(let r=0;r<this.enemyRows;r++){
            for(let c=0;c<this.enemyCols;c++){
                this.enemies.push({ x: startX+c*spacingX, y: startY+r*spacingY, width:40, height:30 });
            }
        }
    }

    update() {
        if(this.paused || this.gameOver) return;

        if(this.leftPressed && this.player.x>0) this.player.x -= this.player.speed;
        if(this.rightPressed && this.player.x+this.player.width<CANVAS_WIDTH) this.player.x += this.player.speed;

        this.updateBullets();
        this.updateEnemies();
        this.updateEnemyBullets();

        if(this.enemies.length === 0){
            this.wave++;
            this.enemySpeedX += 0.5;
            this.enemyShootChance += 0.001;
            this.enemyRows = Math.min(6, this.enemyRows+1);
            this.spawnEnemies();
        }
    }

    updateBullets() {
        const now = Date.now();
        for(let i=this.bullets.length-1;i>=0;i--){
            let b = this.bullets[i];
            if(!b.laser) b.y -= b.speed;

            if(b.laser){
                b.x = this.player.x + this.player.width/2 -2;
                b.height = this.player.y;
                if(now - b.startTime >= this.laserDuration){
                    this.bullets.splice(i,1);
                    continue;
                }
            }

            // Collision
            for(let j=this.enemies.length-1;j>=0;j--){
                let e = this.enemies[j];
                if(this.rectCollision(b,e)){
                    this.enemies.splice(j,1);
                    this.score += 10;
                    if(!b.laser){ this.bullets.splice(i,1); break; }
                }
            }

            if(!b.laser && b.y + b.height < 0) this.bullets.splice(i,1);
        }
    }

    updateEnemies() {
        let hitEdge = false;
        for(let e of this.enemies){
            e.x += this.enemySpeedX;
            if(Math.random() < this.enemyShootChance) this.enemyBullets.push({x:e.x+e.width/2,y:e.y+e.height,width:4,height:10,speed:3});
            if(e.x+e.width >= CANVAS_WIDTH || e.x <= 0) hitEdge = true;
        }
        if(hitEdge){
            this.enemySpeedX = -this.enemySpeedX;
            for(let e of this.enemies){
                e.y += this.enemyDropDistance;
                if(e.y+e.height>=CANVAS_HEIGHT) this.gameOver = true;
            }
        }
    }

    updateEnemyBullets(){
        for(let i=this.enemyBullets.length-1;i>=0;i--){
            let b = this.enemyBullets[i];
            if(!b){ this.enemyBullets.splice(i,1); continue;}
            b.y += b.speed;
            if(b.y>CANVAS_HEIGHT){ this.enemyBullets.splice(i,1); continue;}
            if(this.rectCollision(b,this.player)){
                this.enemyBullets.splice(i,1);
                this.player.health--;
                if(this.player.health<=0) this.gameOver=true;
            }
        }
    }

    rectCollision(a,b){
        return a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
    }

    restartGame(){
        this.player.x = CANVAS_WIDTH/2-20;
        this.player.y = CANVAS_HEIGHT-60;
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
        ctx.clearRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);

        // Player
        ctx.fillStyle="green";
        ctx.fillRect(this.player.x,this.player.y,this.player.width,this.player.height);

        // Bullets
        ctx.fillStyle="yellow";
        this.bullets.forEach(b=>ctx.fillRect(b.x,b.y,b.width,b.height));

        // Enemies
        ctx.fillStyle="red";
        this.enemies.forEach(e=>ctx.fillRect(e.x,e.y,e.width,e.height));

        // Enemy bullets
        ctx.fillStyle="white";
        this.enemyBullets.forEach(b=>ctx.fillRect(b.x,b.y,b.width,b.height));

        // HUD
        ctx.fillStyle="black";
        ctx.font="20px Arial";
        ctx.fillText("Score: "+this.score,10,20);
        ctx.fillText("Health: "+this.player.health,10,40);
        ctx.fillText("Wave: "+this.wave,10,60);

        // Laser bar
        ctx.fillText("Laser:",10,80);
        ctx.strokeStyle="black";
        ctx.strokeRect(70,65,100,15);
        if(this.laserReady){
            ctx.fillStyle="blue";
            ctx.fillRect(70,65,100,15);
        } else {
            let progress=Math.min(1,(Date.now()-this.lastLaserTime)/this.laserCooldown);
            ctx.fillStyle="blue";
            ctx.fillRect(70,65,100*progress,15);
        }

        // Paused/Game Over
        if(this.paused){
            ctx.fillStyle="rgba(0,0,0,0.5)";
            ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
            ctx.fillStyle="white";
            ctx.font="40px Arial";
            ctx.fillText("PAUSED",CANVAS_WIDTH/2-80,CANVAS_HEIGHT/2);
        }
        if(this.gameOver){
            ctx.fillStyle="rgba(0,0,0,0.5)";
            ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
            ctx.fillStyle="white";
            ctx.font="40px Arial";
            ctx.fillText("GAME OVER",CANVAS_WIDTH/2-120,CANVAS_HEIGHT/2);
            ctx.font="20px Arial";
            ctx.fillText("Press any button to Restart",CANVAS_WIDTH/2-120,CANVAS_HEIGHT/2+40);
        }
    }

    gameLoop() {
        this.update();
        this.draw();
        this.animationFrame = requestAnimationFrame(this.gameLoop.bind(this));
    }
}

class SnakeGame {
    constructor(canvas, backToMenu) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.backToMenu = backToMenu;

        this.gridSize = 20;
        this.snake = [{ x: 5, y: 5 }];
        this.direction = { x: 1, y: 0 };
        this.food = this.randomFood();
        this.score = 0;
        this.gameOver = false;
        this.paused = false;

        // BLE
        this.device = null;
        this.characteristic = null;
        this.SERVICE_UUID = '4a980001-1cc4-e7c1-c757-f1267dd021e8';
        this.CHAR_UUID = '4a980002-1cc4-e7c1-c757-f1267dd021e8';

        if (isTouchDevice()) {
          document.getElementById("snakeControls").style.display = "block";
        }

        this.initControls();
        this.gameLoop = setInterval(() => this.update(), 150);
    }

    

    initControls() {
        // === Keyboard ===
        document.addEventListener("keydown", (e) => {
            if (this.gameOver) return this.restartGame();
            if (e.key === "ArrowUp") this.changeDirection(0, -1);
            else if (e.key === "ArrowDown") this.changeDirection(0, 1);
            else if (e.key === "ArrowLeft") this.changeDirection(-1, 0);
            else if (e.key === "ArrowRight") this.changeDirection(1, 0);
            else if (e.key === "p") this.paused = !this.paused;
        });

        // === Touch buttons (mobile) ===
        document.getElementById("SbtnUp")?.addEventListener("click", () => this.changeDirection(0, -1));
        document.getElementById("SbtnDown")?.addEventListener("click", () => this.changeDirection(0, 1));
        document.getElementById("SbtnLeft")?.addEventListener("click", () => this.changeDirection(-1, 0));
        document.getElementById("SbtnRight")?.addEventListener("click", () => this.changeDirection(1, 0));

        document.getElementById('connectButton')?.addEventListener('click', async () => {
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

                this.device.addEventListener('gattserverdisconnected', () => {
                    btn.innerText = "Connect to Device";
                    btn.disabled = false;
                    console.log('BLE disconnected');
                });
            } catch (err) {
                console.error(err);
                alert("BLE Error: "+err.message);
            }
        });

        const pauseGameButton = document.getElementById("pauseButton");

        pauseGameButton.addEventListener("click", () => {
            this.paused = !this.paused;
        });
    }

    handleNotification(event) {
        const value = new TextDecoder().decode(event.target.value);
        if (this.gameOver) return this.restartGame();

        if (value.startsWith("1:")) this.changeDirection(-1, 0); // left
        else if (value.startsWith("2:")) this.changeDirection(0, -1); // up
        else if (value === "3") this.changeDirection(0, 1); // down
        else if (value === "4") this.changeDirection(1, 0);  // right
    }

    changeDirection(x, y) {
        // Prevent reversing into self
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

        // Check collision with walls
        if (
            head.x < 0 ||
            head.y < 0 ||
            head.x >= this.canvas.width / this.gridSize ||
            head.y >= this.canvas.height / this.gridSize
        ) {
            return this.endGame();
        }

        // Check collision with self
        if (this.snake.some((part) => part.x === head.x && part.y === head.y)) {
            return this.endGame();
        }

        this.snake.unshift(head);

        // Check food
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

        // Snake
        this.ctx.fillStyle = "lime";
        for (const part of this.snake) {
            this.ctx.fillRect(part.x * this.gridSize, part.y * this.gridSize, this.gridSize, this.gridSize);
        }

        // Food
        this.ctx.fillStyle = "red";
        this.ctx.fillRect(this.food.x * this.gridSize, this.food.y * this.gridSize, this.gridSize, this.gridSize);

        // Score
        this.ctx.fillStyle = "white";
        this.ctx.font = "16px Arial";
        this.ctx.fillText("Score: " + this.score, 10, 20);
    }

    endGame() {
        this.gameOver = true;
        clearInterval(this.gameLoop);
        this.ctx.fillStyle = "white";
        this.ctx.font = "24px Arial";
        this.ctx.fillText("Game Over - Press Any Key or BLE Button", 50, this.canvas.height / 2);
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
    constructor(canvas, backToMenu) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.backToMenu = backToMenu;

        // Game objects
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

        // BLE setup
        this.device = null;
        this.characteristic = null;
        this.SERVICE_UUID = '4a980001-1cc4-e7c1-c757-f1267dd021e8';
        this.CHAR_UUID = '4a980002-1cc4-e7c1-c757-f1267dd021e8';

        if (isTouchDevice()) {
            document.getElementById("pongControls").style.display = "block";
        }

        this.initControls();
        this.gameLoop = setInterval(() => this.update(), 30);
    }

    initControls() {
        // === Keyboard ===
        document.addEventListener("keydown", (e) => {
            if (this.gameOver) return this.restartGame();

            if (e.key === "w") this.movePaddle(this.leftPaddle, -this.paddleSpeed);
            else if (e.key === "s") this.movePaddle(this.leftPaddle, this.paddleSpeed);
            else if (e.key === "ArrowUp") this.movePaddle(this.rightPaddle, -this.paddleSpeed);
            else if (e.key === "ArrowDown") this.movePaddle(this.rightPaddle, this.paddleSpeed);
            else if (e.key === "p") this.paused = !this.paused;
        });

        // === Touch ===
        document.getElementById("LbtnUp")?.addEventListener("click", () => this.movePaddle(this.leftPaddle, -this.paddleSpeed));
        document.getElementById("LbtnDown")?.addEventListener("click", () => this.movePaddle(this.leftPaddle, this.paddleSpeed));
        document.getElementById("RbtnUp")?.addEventListener("click", () => this.movePaddle(this.rightPaddle, -this.paddleSpeed));
        document.getElementById("RbtnDown")?.addEventListener("click", () => this.movePaddle(this.rightPaddle, this.paddleSpeed));

        // === BLE ===
        document.getElementById('connectButton')?.addEventListener('click', async () => {
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

                this.device.addEventListener('gattserverdisconnected', () => {
                    btn.innerText = "Connect to Device";
                    btn.disabled = false;
                    console.log('BLE disconnected');
                });
            } catch (err) {
                console.error(err);
                alert("BLE Error: " + err.message);
            }
        });

       const pauseGameButton = document.getElementById("pauseButton");

        pauseGameButton.addEventListener("click", () => {
            this.paused = !this.paused;
        });
    }

    handleNotification(event) {
        const value = new TextDecoder().decode(event.target.value);
        if (this.gameOver) return this.restartGame();

        if (value.startsWith("1:") this.movePaddle(this.leftPaddle, -this.paddleSpeed);  // Left up
        else if (value.startsWith("2:") this.movePaddle(this.leftPaddle, this.paddleSpeed); // Left down
        else if (value === "2") this.movePaddle(this.rightPaddle, -this.paddleSpeed); // Right up
        else if (value === "4") this.movePaddle(this.rightPaddle, this.paddleSpeed); // Right down
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

        // Ball movement
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;

        // Bounce top/bottom
        if (this.ball.y <= 0 || this.ball.y + this.ball.size >= this.canvas.height) {
            this.ball.vy *= -1;
        }

        // Paddle collision
        if (
            this.ball.x <= this.leftPaddle.x + this.paddleWidth &&
            this.ball.y + this.ball.size >= this.leftPaddle.y &&
            this.ball.y <= this.leftPaddle.y + this.paddleHeight
        ) {
            this.ball.vx *= -1;
            this.ball.x = this.leftPaddle.x + this.paddleWidth; // prevent stuck
        }

        if (
            this.ball.x + this.ball.size >= this.rightPaddle.x &&
            this.ball.y + this.ball.size >= this.rightPaddle.y &&
            this.ball.y <= this.rightPaddle.y + this.paddleHeight
        ) {
            this.ball.vx *= -1;
            this.ball.x = this.rightPaddle.x - this.ball.size; // prevent stuck
        }

        // Score check
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
        this.ball.vy = (Math.random() > 0.5 ? 2 : -2);
    }

    draw() {
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Paddles
        this.ctx.fillStyle = "white";
        this.ctx.fillRect(this.leftPaddle.x, this.leftPaddle.y, this.paddleWidth, this.paddleHeight);
        this.ctx.fillRect(this.rightPaddle.x, this.rightPaddle.y, this.paddleWidth, this.paddleHeight);

        // Ball
        this.ctx.fillRect(this.ball.x, this.ball.y, this.ball.size, this.ball.size);

        // Score
        this.ctx.font = "20px Arial";
        this.ctx.fillText(this.leftScore, this.canvas.width / 4, 20);
        this.ctx.fillText(this.rightScore, (this.canvas.width / 4) * 3, 20);

        if (this.paused) {
            this.ctx.font = "24px Arial";
            this.ctx.fillText("Paused", this.canvas.width / 2 - 40, this.canvas.height / 2);
        }
    }

    endGame() {
        this.gameOver = true;
        clearInterval(this.gameLoop);
        this.ctx.fillStyle = "white";
        this.ctx.font = "24px Arial";
        this.ctx.fillText("Game Over - Press Any Key or BLE Button", 50, this.canvas.height / 2);
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


// === Placeholder Game Example ===
class PlaceholderGame {
    constructor(canvas){
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.animationFrame = null;
    }
    start(){
        this.gameLoop();
    }
    stop(){
        cancelAnimationFrame(this.animationFrame);
    }
    draw(){
        this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
        this.ctx.fillStyle="purple";
        this.ctx.font="30px Arial";
        this.ctx.fillText("New Game Here",100,100);
        this.animationFrame = requestAnimationFrame(this.draw.bind(this));
    }
    gameLoop(){ this.draw(); }
}

// === Initialize Menu ===
document.addEventListener("DOMContentLoaded", () => {
    canvas.style.display = "none";
});
