const serviceUUID = '4a980001-1cc4-e7c1-c757-f1267dd021e8';
const charUUID = '4a980002-1cc4-e7c1-c757-f1267dd021e8';

let device;
let characteristic;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Simple player object
const player = {
    x: canvas.width / 2 - 25,
    y: canvas.height - 60,
    width: 50,
    height: 50,
    color: '#f1c40f',
    dx: 0,
    dy: 0,
    speed: 5,
    gravity: 0.5,
    jumpPower: -10,
    onGround: true,
    update() {
        // Apply horizontal movement
        this.x += this.dx;

        // Boundaries
        if(this.x < 0) this.x = 0;
        if(this.x + this.width > canvas.width) this.x = canvas.width - this.width;

        // Apply gravity
        if (!this.onGround) {
            this.dy += this.gravity;
            this.y += this.dy;

            if(this.y + this.height >= canvas.height) {
                this.y = canvas.height - this.height;
                this.dy = 0;
                this.onGround = true;
            }
        }
    },
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    },
    moveLeft() { this.dx = -this.speed; },
    moveRight() { this.dx = this.speed; },
    stopHorizontal() { this.dx = 0; },
    jump() {
        if (this.onGround) {
            this.dy = this.jumpPower;
            this.onGround = false;
        }
    },
    shoot() {
        console.log("Shoot action triggered!");
        // Implement bullets or actions here
    }
};

// Game loop
function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    player.update();
    player.draw(ctx);
    requestAnimationFrame(gameLoop);
}
gameLoop();

// BLE connection
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

        alert("Connected!");
    } catch (err) {
        console.error(err);
        alert("Failed to connect: " + err);
    }
});

// Handle BLE messages
function handleNotification(event) {
    const value = new TextDecoder().decode(event.target.value);

    switch(value) {
        case "1": player.moveLeft(); break;
        case "2": player.moveRight(); break;
        case "3": player.jump(); break;
        case "4": player.shoot(); break;
        case "stopLeft": if(player.dx < 0) player.stopHorizontal(); break;
        case "stopRight": if(player.dx > 0) player.stopHorizontal(); break;
        default: break;
    }
}

// Optional: stop moving when buttons released (if your firmware supports it)
// You can send "stopLeft"/"stopRight" notifications when buttons are released
