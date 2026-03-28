const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverScreen = document.getElementById('game-over');
const scoreElement = document.getElementById('score');
const finalScoreElement = document.getElementById('final-score');

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GROUND_Y = 320;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const SCROLL_SPEED = 5;

// Load Images
const images = {};
const imageSources = {
    cookie: 'resources/cookie.png',
    background: 'resources/background.png',
    obstacle: 'resources/obstacle.png',
    jelly: 'resources/jelly.png'
};

let imagesLoaded = 0;
const totalImages = Object.keys(imageSources).length;

function loadImages(callback) {
    for (const [name, src] of Object.entries(imageSources)) {
        images[name] = new Image();
        images[name].src = src;
        images[name].onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
                callback();
            }
        };
    }
}

// Game State
let score = 0;
let gameActive = false;
let obstacles = [];
let jellies = [];
let frameCount = 0;
let bgX = 0;

// Player Object
const player = {
    x: 100,
    y: GROUND_Y - 60,
    width: 60,
    height: 60,
    vy: 0,
    jumpCount: 0,
    maxJumps: 2,
    
    update() {
        this.vy += GRAVITY;
        this.y += this.vy;
        
        // Ground Collision
        if (this.y > GROUND_Y - this.height) {
            this.y = GROUND_Y - this.height;
            this.vy = 0;
            this.jumpCount = 0;
        }
    },
    
    draw() {
        ctx.drawImage(images.cookie, this.x, this.y, this.width, this.height);
    },
    
    jump() {
        if (this.jumpCount < this.maxJumps) {
            this.vy = JUMP_FORCE;
            this.jumpCount++;
        }
    }
};

// Background Draw
function drawBackground() {
    bgX -= SCROLL_SPEED * 0.5;
    if (bgX <= -CANVAS_WIDTH) bgX = 0;
    
    ctx.drawImage(images.background, bgX, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.drawImage(images.background, bgX + CANVAS_WIDTH, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// Obstacles and Items
class GameObject {
    constructor(image, x, y, width, height, type) {
        this.image = image;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.type = type;
    }
    
    update() {
        this.x -= SCROLL_SPEED;
    }
    
    draw() {
        ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
    }
}

function spawnObjects() {
    frameCount++;
    
    // Spawn Obstacle
    if (frameCount % 120 === 0) {
        obstacles.push(new GameObject(images.obstacle, CANVAS_WIDTH, GROUND_Y - 50, 50, 50, 'obstacle'));
    }
    
    // Spawn Jelly
    if (frameCount % 60 === 0) {
        const jellyY = (Math.random() * (GROUND_Y - 150)) + 100;
        jellies.push(new GameObject(images.jelly, CANVAS_WIDTH, jellyY, 30, 30, 'jelly'));
    }
}

function checkCollisions() {
    // Check Obstacles
    obstacles.forEach((obs, index) => {
        if (player.x < obs.x + obs.width - 10 &&
            player.x + player.width - 10 > obs.x &&
            player.y < obs.y + obs.height - 10 &&
            player.y + player.height - 10 > obs.y) {
            endGame();
        }
        if (obs.x + obs.width < 0) obstacles.splice(index, 1);
    });
    
    // Check Jellies
    jellies.forEach((jelly, index) => {
        if (player.x < jelly.x + jelly.width &&
            player.x + player.width > jelly.x &&
            player.y < jelly.y + jelly.height &&
            player.y + player.height > jelly.y) {
            score += 10;
            scoreElement.innerText = score;
            jellies.splice(index, 1);
        }
        if (jelly.x + jelly.width < 0) jellies.splice(index, 1);
    });
}

function gameLoop() {
    if (!gameActive) return;
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    drawBackground();
    
    player.update();
    player.draw();
    
    spawnObjects();
    
    obstacles.forEach(obs => {
        obs.update();
        obs.draw();
    });
    
    jellies.forEach(jelly => {
        jelly.update();
        jelly.draw();
    });
    
    checkCollisions();
    
    requestAnimationFrame(gameLoop);
}

function startGame() {
    score = 0;
    scoreElement.innerText = 0;
    obstacles = [];
    jellies = [];
    gameActive = true;
    gameOverScreen.style.display = 'none';
    player.y = GROUND_Y - player.height;
    player.vy = 0;
    gameLoop();
}

function endGame() {
    gameActive = false;
    gameOverScreen.style.display = 'block';
    finalScoreElement.innerText = score;
}

// Controls
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (!gameActive && gameOverScreen.style.display === 'block') {
            startGame();
        } else {
            player.jump();
        }
    }
});

canvas.addEventListener('mousedown', () => {
    if (!gameActive && gameOverScreen.style.display === 'block') {
        startGame();
    } else {
        player.jump();
    }
});

function init() {
    loadImages(() => {
        // Show start screen essentially
        endGame();
        document.querySelector('#game-over h1').innerText = "COOKIE RUN CLONE";
        document.querySelector('#game-over button').innerText = "START GAME";
    });
}

init();
