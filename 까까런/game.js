const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameOverScreen = document.getElementById('game-over');
const scoreElement = document.getElementById('score');
const finalScoreElement = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
const GROUND_Y = 340;
const GRAVITY = 0.7; // Slightly increased for a snappier jump
const JUMP_FORCE = -14; // Reverted to original starting value as requested
const SCROLL_SPEED = 7;

// Load Images
const images = {};
const imageSources = {
    cookie: 'resources/cookie.png?v=8', // Actions (Jump, Hit, Slide)
    charRun: 'resources/char_run.png', // Running
    background: 'resources/background.png',
    obstacleSheet: 'resources/obstacles_sheet.png', // 3x3 Mid/Tall/Ceiling
    lowSheet: 'resources/low_obstacles.png?v=2', // 1x5 Low (Single Jump)
    jelly: 'resources/jelly.svg'
};

let imagesLoaded = 0;
const totalImages = Object.keys(imageSources).length;
let obstacleAspectRatio = 1.0; 
let lowAspectRatio = 1.0; // For the new 1.0x (1x5) sheet

function processSpriteTransparency(img, cols = 1, rows = 1) {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        const getColor = (nx, ny) => {
            let i = (ny * w + nx) * 4;
            if (data[i+3] < 255) return -1; // Treat existing transparent pixels as barriers
            return (data[i]<<16) | (data[i+1]<<8) | data[i+2];
        };
        
        // Match checkerboard grayscale colors (White / Light-Gray)
        const isCheckerboardColor = (c) => {
            if (c === -1) return false;
            const r = (c>>16)&0xff, g = (c>>8)&0xff, b = c&0xff;
            const diff = Math.max(r,g,b) - Math.min(r,g,b);
            const avg = (r + g + b) / 3;
            return avg > 140 && diff < 35; 
        };

        const visited = new Uint8Array(w * h);
        const flatQueue = [];
        let head = 0;
        
        const sw = Math.floor(w / cols);
        const sh = Math.floor(h / rows);
        
        // Start flood fill from the borders of EVERY frame cell
        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                let startX = c * sw;
                let endX = Math.min(startX + sw - 1, w - 1);
                let startY = r * sh;
                let endY = Math.min(startY + sh - 1, h - 1);
                
                // Vertical borders
                for(let y=startY; y<=endY; y++) {
                    for(let x of [startX, endX]) {
                        if(isCheckerboardColor(getColor(x,y))) {
                            let idx = y*w + x;
                            if(!visited[idx]) { visited[idx]=1; flatQueue.push(idx); }
                        }
                    }
                }
                // Horizontal borders
                for(let x=startX; x<=endX; x++) {
                    for(let y of [startY, endY]) {
                        if(isCheckerboardColor(getColor(x,y))) {
                            let idx = y*w + x;
                            if(!visited[idx]) { visited[idx]=1; flatQueue.push(idx); }
                        }
                    }
                }
            }
        }
        
        // 8-way BFS to make background transparent
        while(head < flatQueue.length) {
            let idx = flatQueue[head++];
            let x = idx % w;
            let y = Math.floor(idx / w);
            
            data[idx * 4 + 3] = 0; // Alpha = 0
            
            // Check 8 neighbors to bypass anti-aliased corners
            for(let dy=-1; dy<=1; dy++) {
                for(let dx=-1; dx<=1; dx++) {
                    if (dx===0 && dy===0) continue;
                    let nx = x + dx;
                    let ny = y + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        let nIdx = ny * w + nx;
                        if (!visited[nIdx]) {
                            if (isCheckerboardColor(getColor(nx, ny))) {
                                visited[nIdx] = 1;
                                flatQueue.push(nIdx);
                            }
                        }
                    }
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    } catch (e) {
        console.warn("Transparency processing failed:", e);
        return img;
    }
}

function loadImages(callback) {
    for (const [name, src] of Object.entries(imageSources)) {
        images[name] = new Image();
        images[name].src = src;
        images[name].onload = () => {
            // Process transparency perfectly tailored to each sprite grid map
            if (name === 'cookie' || name === 'charRun') {
                images[name] = processSpriteTransparency(images[name], 2, 2);
            } else if (name === 'lowSheet') {
                images[name] = processSpriteTransparency(images[name], 1, 5);
                lowAspectRatio = images[name].width / (images[name].height / 5);
            } else if (name === 'obstacleSheet') {
                images[name] = processSpriteTransparency(images[name], 3, 3);
                obstacleAspectRatio = (images[name].width / 3) / (images[name].height / 3);
            }
            
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
                callback();
            }
        };
        images[name].onerror = () => {
             console.error('Failed to load image:', src);
             imagesLoaded++; 
             if (imagesLoaded === totalImages) callback();
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
let particles = []; // Particle storage

// Particle Class
class Particle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'dust' or 'star'
        this.life = 1.0;
        this.decay = Math.random() * 0.05 + 0.02;
        this.size = type === 'star' ? Math.random() * 6 + 6 : Math.random() * 10 + 5;
        this.vx = type === 'star' ? (Math.random() - 0.5) * 8 : (Math.random() - 1.0) * 3;
        this.vy = type === 'star' ? (Math.random() * 8 + 2) : (Math.random() - 0.5) * 2;
        this.color = type === 'star' ? (Math.random() > 0.5 ? '#fff35c' : '#ff7de9') : '#d9d9d9';
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
        if (this.type === 'dust') this.vx *= 0.95; // Dust slows down
    }

    draw() {
        ctx.save();
        // Stars stay opaque longer
        ctx.globalAlpha = this.type === 'star' ? Math.min(1.0, this.life * 2) : this.life;
        ctx.fillStyle = this.color;
        
        if (this.type === 'star') {
            // PRO QUALITY: 5-pointed star with glowing effect
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            const spikes = 5;
            const outerRadius = this.size;
            const innerRadius = this.size / 2.5;
            let rot = Math.PI / 2 * 3;
            let cx = this.x;
            let cy = this.y;
            let step = Math.PI / spikes;

            ctx.beginPath();
            ctx.moveTo(this.x, this.y - outerRadius);
            for (let i = 0; i < spikes; i++) {
                cx = this.x + Math.cos(rot) * outerRadius;
                cy = this.y + Math.sin(rot) * outerRadius;
                ctx.lineTo(cx, cy);
                rot += step;
                cx = this.x + Math.cos(rot) * innerRadius;
                cy = this.y + Math.sin(rot) * innerRadius;
                ctx.lineTo(cx, cy);
                rot += step;
            }
            ctx.lineTo(this.x, this.y - outerRadius);
            ctx.closePath();
            ctx.fill();
        } else {
            // PRO QUALITY: 'Fluffy' cloud dust (overlapping circles)
            for (let j = 0; j < 3; j++) {
                const ox = Math.sin(j * 2) * (this.size * 0.5);
                const oy = Math.cos(j * 2) * (this.size * 0.3);
                ctx.beginPath();
                ctx.arc(this.x + ox, this.y + oy, this.size * (1 - j * 0.2), 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

// Player Object
const player = {
    x: 80,
    y: GROUND_Y - 144, // Initialized for 1.6x size (90 * 1.6 = 144)
    width: 144,
    height: 144,
    vy: 0,
    jumpCount: 0,
    maxJumps: 2,
    animFrame: 0,
    animTick: 0,
    isSliding: false, 
    
    update() {
        this.vy += GRAVITY;
        this.y += this.vy;
        
        // Ground Collision
        const currentHeight = this.isSliding ? this.height * 0.35 : this.height;
        if (this.y > GROUND_Y - currentHeight) {
            this.y = GROUND_Y - currentHeight;
            this.vy = 0;
            this.jumpCount = 0;
        }

        // Prevent jumping too far off-screen (Top limit)
        if (this.y < -100) {
            this.y = -100;
            this.vy = 0;
        }

        // Animation logic for the sheet
        this.animTick++;
        if (this.animTick % 5 === 0) {
            this.animFrame = (this.animFrame + 1) % 4;
        }

        // Emit sliding dust
        if (this.isSliding && frameCount % 3 === 0) {
            particles.push(new Particle(this.x + 20, GROUND_Y - 5, 'dust'));
        }
    },
    
    draw() {
        // Switch between Action sheet (cookie) and Running sheet (charRun)
        const isJumping = this.vy < 0 || this.y < GROUND_Y - (this.isSliding ? this.height * 0.35 : this.height);
        let sheet = images.charRun; // Default to Run
        
        if (isJumping || !gameActive || this.isSliding) {
            sheet = images.cookie; // Use Action sheet
        }

        if (!sheet || (sheet instanceof HTMLImageElement && !sheet.complete)) return;
        
        const sw = sheet.width / 2;
        const sh = sheet.height / 2;
        let sx = 0, sy = 0;

        if (!gameActive) { // Hit (Top-Left of Action sheet)
            sx = 0; sy = 0;
        } else if (this.isSliding) { // Slide (Bottom-Right of Action sheet) - Higher Priority!
            sx = sw; sy = sh;
        } else if (isJumping) { // Jump (Top-Right of Action sheet)
            sx = sw; sy = 0;
        } else { // Run (Full 4-frame cycle from Running sheet)
            sx = (this.animFrame % 2) * sw;
            sy = Math.floor(this.animFrame / 2) * sh;
        }

        ctx.save();
        if (this.isSliding) {
            // Lowered the frame by 42px to ensure the character touches the GROUND_Y
            ctx.drawImage(sheet, sx, sy, sw, sh, this.x, (GROUND_Y - this.height) + 42, this.width, this.height);
        } else {
            ctx.drawImage(sheet, sx, sy, sw, sh, this.x, this.y, this.width, this.height);
        }
        ctx.restore();
    },
    
    jump() {
        if (this.jumpCount < this.maxJumps) {
            this.vy = JUMP_FORCE;
            this.jumpCount++;
            
            // Emit stars on jump (3-5 random count)
            const starCount = Math.floor(Math.random() * 3) + 3;
            for (let i = 0; i < starCount; i++) {
                particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, 'star'));
            }
        }
    }
};

// Background Draw
function drawBackground() {
    const img = images.background;
    if (!img.complete) return;
    
    // Scale image to match CANVAS_HEIGHT while keeping aspect ratio
    const scale = CANVAS_HEIGHT / img.height;
    const drawnWidth = img.width * scale;
    
    bgX -= SCROLL_SPEED * 0.2; // Slightly slower background for depth
    if (bgX <= -drawnWidth) bgX = 0;
    
    ctx.drawImage(img, bgX, 0, drawnWidth, CANVAS_HEIGHT);
    if (bgX + drawnWidth < CANVAS_WIDTH) {
        ctx.drawImage(img, bgX + drawnWidth, 0, drawnWidth, CANVAS_HEIGHT);
    }
    
    // Draw Floor line/tile
    ctx.fillStyle = '#140c21'; // Harmonizing with background
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);
    ctx.strokeStyle = '#c060ff'; // Mystical purple glow
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
    ctx.stroke();
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
        if (this.type === 'obstacle') {
            if (this.isLow) {
                const sheet = images.lowSheet;
                const sw = sheet.width;
                const sh = sheet.height / 5;
                const sy = this.variant * sh; // Pick one of 5 rows
                ctx.drawImage(sheet, 0, sy, sw, sh, this.x, this.y, this.width, this.height);
            } else {
                const sheet = images.obstacleSheet;
                const sw = sheet.width / 3;
                const sh = sheet.height / 3;
                const sx = this.variant * sw;
                const sy = this.row * sh;
                ctx.drawImage(sheet, sx, sy, sw, sh, this.x, this.y, this.width, this.height);
            }
        } else {
            ctx.drawImage(this.image, this.x, this.y, this.width, this.height);
        }
    }
}

function spawnObjects() {
    frameCount++;
    
    // Spawn Obstacles (Types: 0=New Low, 1=Mid, 2=Tall, 3=Ceiling)
    if (frameCount % 90 === 0) {
        const type = Math.floor(Math.random() * 4);
        let ow, oh, oy, isLow = false, row = 0, variant = 0;
        
        if (type === 0) { // NEW LOW (Single Jump)
            oh = 100; ow = oh * lowAspectRatio; oy = GROUND_Y - oh + 20;
            isLow = true; variant = Math.floor(Math.random() * 5);
        } else if (type === 1) { // MID
            oh = 160; ow = oh * obstacleAspectRatio; oy = GROUND_Y - oh + 20;
            row = 0; variant = Math.floor(Math.random() * 3);
        } else if (type === 2) { // TALL
            oh = 220; ow = oh * obstacleAspectRatio; oy = GROUND_Y - oh + 20;
            row = 1; variant = Math.floor(Math.random() * 3);
        } else { // CEILING
            oh = 260; ow = oh * obstacleAspectRatio; oy = -30;
            row = 2; variant = Math.floor(Math.random() * 3);
        }
        
        const obs = new GameObject(null, CANVAS_WIDTH, oy, ow, oh, 'obstacle');
        obs.isLow = isLow;
        obs.row = row;
        obs.variant = variant;
        obstacles.push(obs);
    }
    
    // Spawn Jellies
    if (frameCount % 45 === 0) {
        const jellyY = (Math.random() * (GROUND_Y - 180)) + 60;
        jellies.push(new GameObject(images.jelly, CANVAS_WIDTH, jellyY, 35, 45, 'jelly'));
    }
}

function checkCollisions() {
    // Check Obstacles
    obstacles.forEach((obs, index) => {
        // TIGHT HITBOX: Higher margins for fairer feel (character sprite has whitespace)
        const hitX = player.isSliding ? 40 : 45; // Increase left/right margin
        const ph = player.isSliding ? player.height * 0.25 : player.height * 0.65;
        // Shift py down by 42px to match the new visual position
        const py = player.isSliding ? (GROUND_Y - player.height * 0.25) + 38 : player.y + player.height * 0.25;
        
        // Tighten obstacle hitbox too (mostly at sides)
        const obsMarginX = obs.width * 0.25;
        const obsMarginY = obs.height * 0.15;

        if (player.x + hitX < obs.x + obs.width - obsMarginX &&
            player.x + player.width - hitX > obs.x + obsMarginX &&
            py < obs.y + obs.height - obsMarginY &&
            py + ph > obs.y + obsMarginY) {
            endGame();
        }
        if (obs.x + obs.width < -100) obstacles.splice(index, 1);
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
        if (jelly.x + jelly.width < -100) jellies.splice(index, 1);
    });
}

function gameLoop() {
    if (!gameActive) return;
    
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    drawBackground();
    
    player.update();
    
    // Update and Draw Particles
    particles.forEach((p, index) => {
        p.update();
        if (p.life <= 0) particles.splice(index, 1);
        else p.draw();
    });

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
    // Draw the final 'hit' frame (0,0) for visual feedback
    const sheet = images.cookie;
    if (sheet && (!(sheet instanceof HTMLImageElement) || sheet.complete)) {
        const sw = sheet.width / 2;
        const sh = sheet.height / 2;
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); // Final clear
        drawBackground(); // Draw background one last time
        ctx.drawImage(sheet, 0, 0, sw, sh, player.x, player.y, player.width, player.height);
    }
    gameOverScreen.style.display = 'flex';
    finalScoreElement.innerText = score;
}

// Controls
window.addEventListener('keydown', (e) => {
    // Prevent page scrolling with game keys
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
    }
    
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (!gameActive && gameOverScreen.style.display === 'flex') {
            startGame();
        } else {
            player.jump();
        }
    }
    if (e.code === 'ArrowDown') player.isSliding = true;
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown') player.isSliding = false;
});

// Mouse & Touch Controls
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
        if (!gameActive && gameOverScreen.style.display === 'flex') {
            startGame();
        } else {
            player.jump();
        }
    }
});

// Right-click for Sliding
window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (gameActive) player.isSliding = true;
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) player.isSliding = false; // Right-click release
});

startBtn.onclick = (e) => {
    e.preventDefault(); // Prevent any anchor/link behavior
    startGame();
};

function init() {
    loadImages(() => {
        endGame(); // Show start screen
    });
}

init();
