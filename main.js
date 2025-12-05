// ===== CONFIGURATION CONSTANTS =====
const LONG_PRESS_DURATION = 500; // ms
const ACID_EFFECT_INTERVAL = 100; // ms between acid effects
const ACID_DECAY_INTERVAL = 100; // ms between acid particle shrink updates
const ACID_STRENGTH = 0.1; // Percentage of size reduction per acid touch
const ACID_DECAY_RATE = 0.025; // Rate at which acid particles shrink
const MIN_PARTICLE_SIZE = 5; // Minimum size before particle is removed
const PARTICLE_COUNT_UPDATE_INTERVAL = 10; // frames between particle count updates

// Physics constants
const PHYSICS_GRAVITY = 0.5;
const PHYSICS_FRICTION = 0.3;
const PHYSICS_RESTITUTION = 0.4;
const PHYSICS_DENSITY = 0.001;
const PHYSICS_PADDING = 2.5;

// Initial velocity ranges
const INITIAL_VELOCITY_X_MIN = -5;
const INITIAL_VELOCITY_X_MAX = 5;
const INITIAL_VELOCITY_Y_MIN = -5;
const INITIAL_VELOCITY_Y_MAX = 0;

// Particle spawn settings
const DEFAULT_SPAWN_COUNT = 37;
const MIN_SPAWN_COUNT = 10;
const MAX_SPAWN_COUNT = 100;
const SPAWN_COUNT_WHEEL_DELTA = 7;
const MAX_PARTICLES = 1000;

// Size multipliers
const BASE_SIZE_MULTIPLIER = 0.04; // Relative to screen dimensions
const PARTICLE_SIZE_MIN = 0.75; // Multiplier of baseSize
const PARTICLE_SIZE_MAX = 1.5; // Multiplier of baseSize

// Selection and visual feedback
const SELECTION_RADIUS_MULTIPLIER = 2; // Multiplier of baseSize for touch selection
const PULSE_EFFECT_SCALE = 1.5;
const PULSE_EFFECT_DECAY = 0.05;

// Removal settings
const REMOVAL_RADIUS_MULTIPLIER = 0.15; // Multiplier of min screen dimension

// ===== STATE VARIABLES =====
let longPressActive = false;
let previousTouchDistance = 0;
let touchStartTime = 0;
let touchStartPos = { x: 0, y: 0 };
let longPressTimer = null;
let time = 0;
let rotation = 0;
let baseSize; // Base size for scaling
let spawnCount = DEFAULT_SPAWN_COUNT;
let padding = PHYSICS_PADDING;
let currentShape = 'circle';
const shapes = ['circle', 'square', 'triangle'];

// Drag selection mode variables
let isDragSelecting = false;
let selectionIndicator = null;
let lastDragPosition = { x: 0, y: 0 };

// Marquee selection variables
let isMarqueeSelecting = false;
let marqueeStartX = 0;
let marqueeStartY = 0;
let marqueeEndX = 0;
let marqueeEndY = 0;
let shiftPressed = false;
let mKeyPressed = false;
let xKeyPressed = false;
let vKeyPressed = false;

// Matter.js variables
let engine;
let world;
let particles = [];
let selectedParticles = [];
let lockedParticles = [];
let boundaries = [];
let previousColor;
let isRandomColor = true; // Flag to toggle between random and chosen color
let currentPickedColor = [255, 100, 100]; // Default custom color (will be initialized properly in setup)

const toolbar = document.getElementById('toolbar');

let backgroundBuffer; // Add this at the top with other global variables
let soundManager; // Sound effects manager
let currentlyHoveredParticle = null; // Track which particle is being hovered for sound

function calculateBaseSize() {
    // Calculate base size relative to screen dimensions
    return min(windowWidth, windowHeight) * BASE_SIZE_MULTIPLIER;
}

function setupPhysics() {
    // Initialize physics engine
    engine = Matter.Engine.create();
    world = engine.world;

    // Reduce gravity for more floaty feel
    engine.world.gravity.y = PHYSICS_GRAVITY;

    // Create boundaries
    createBoundaries();

    // Set up collision events for acid particles and sound effects
    Matter.Events.on(engine, 'collisionStart', (event) => {
        handleCollisionStart(event); // Acid effects
        handleCollisionSound(event);  // Sound effects
    });

    // Run the engine
    Matter.Runner.run(engine);
}

/**
 * Handle collision events for sound effects
 */
function handleCollisionSound(event) {
    if (!soundManager) return;

    const pairs = event.pairs;

    // Minimum velocity thresholds for audible collisions
    const MIN_PARTICLE_COLLISION_VELOCITY = 2.0; // Only play sound for visible impacts
    const MIN_WALL_COLLISION_VELOCITY = 3.0; // Walls need more energy to be perceptible

    for (let pair of pairs) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // Check for particle-particle collision
        if (bodyA.label === 'particle' && bodyB.label === 'particle') {
            const particleA = particles.find(p => p.body === bodyA);
            const particleB = particles.find(p => p.body === bodyB);

            if (particleA && particleB) {
                // Calculate relative velocity magnitude
                const velA = bodyA.velocity;
                const velB = bodyB.velocity;
                const relativeVel = Math.sqrt(
                    Math.pow(velA.x - velB.x, 2) + Math.pow(velA.y - velB.y, 2)
                );

                // Only play sound if collision is strong enough to be visible
                if (relativeVel >= MIN_PARTICLE_COLLISION_VELOCITY) {
                    soundManager.particleCollision(relativeVel, particleA.size, particleB.size);
                }
            }
        }
        // Check for particle-wall collision
        else if (
            (bodyA.label === 'particle' && boundaries.includes(bodyB)) ||
            (bodyB.label === 'particle' && boundaries.includes(bodyA))
        ) {
            const particleBody = bodyA.label === 'particle' ? bodyA : bodyB;
            const velocity = Math.sqrt(
                Math.pow(particleBody.velocity.x, 2) + Math.pow(particleBody.velocity.y, 2)
            );

            // Only play sound if wall bounce is strong enough to be visible
            if (velocity >= MIN_WALL_COLLISION_VELOCITY) {
                soundManager.wallBounce(velocity);
            }
        }
    }
}

/**
 * Handle collision events for acid particle effects
 */
function handleCollisionStart(event) {
    const pairs = event.pairs;

    for (let pair of pairs) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // Find the particles associated with these bodies
        const particleA = particles.find(p => p.body === bodyA);
        const particleB = particles.find(p => p.body === bodyB);

        // If both particles exist and one is acid
        if (particleA && particleB) {
            if (particleA.isAcid && !particleB.isAcid && !particleB.isLocked) {
                applyAcidEffect(particleA, particleB);
            } else if (particleB.isAcid && !particleA.isAcid && !particleA.isLocked) {
                applyAcidEffect(particleB, particleA);
            }
        }
    }
}


/**
 * Apply acid effect from one particle to another
 * @param {PhysicsParticle} acidParticle - The acid particle
 * @param {PhysicsParticle} targetParticle - The target particle to dissolve
 */
function applyAcidEffect(acidParticle, targetParticle) {
    // Reduce the target particle's size
    const newSize = targetParticle.size * (1 - acidParticle.acidStrength);

    // If particle is too small, remove it
    if (newSize < MIN_PARTICLE_SIZE) {
        targetParticle.remove();
        const index = particles.indexOf(targetParticle);
        if (index !== -1) {
            particles.splice(index, 1);
        }

        // Also remove from selected and locked arrays if needed
        const selectedIndex = selectedParticles.indexOf(targetParticle);
        if (selectedIndex !== -1) {
            selectedParticles.splice(selectedIndex, 1);
        }

        const lockedIndex = lockedParticles.indexOf(targetParticle);
        if (lockedIndex !== -1) {
            lockedParticles.splice(lockedIndex, 1);
        }

        // Update button states
        updateButtonStates();
    } else {
        // Update the particle's visual size
        targetParticle.size = newSize;
        // Update body with new size
        targetParticle.resizeBody();
    }
}

/**
 * Create or recreate physics boundaries (walls and floor)
 */
function createBoundaries() {
    // Clear existing boundaries
    for (let boundary of boundaries) {
        Matter.World.remove(world, boundary);
    }
    boundaries = [];

    // Create new boundaries
    let ground = Matter.Bodies.rectangle(windowWidth/2, windowHeight + 25, windowWidth, 50, {
        isStatic: true,
        friction: PHYSICS_FRICTION,
        restitution: PHYSICS_RESTITUTION
    });
    
    let leftWall = Matter.Bodies.rectangle(-25, windowHeight/2, 50, windowHeight, { isStatic: true });
    let rightWall = Matter.Bodies.rectangle(windowWidth + 25, windowHeight/2, 50, windowHeight, { isStatic: true });
    
    boundaries = [ground, leftWall, rightWall];
    Matter.World.add(world, boundaries);
}

/**
 * p5.js setup function - initializes the canvas and all systems
 */
function setup() {
    const canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('#canvasContainer');
    previousColor = [random(0, 255), random(0, 255), random(0, 255)];
    baseSize = calculateBaseSize();
    setupControls();
    setupPhysics();
    initializeUI();

    // Initialize sound pack system
    soundManager = new SoundPackManager();
    soundManager.registerPack('original', OriginalSoundPack);
    soundManager.registerPack('retro8bit', Retro8BitSoundPack);
    soundManager.registerPack('orchestral', OrchestraSoundPack);
    soundManager.loadSavedPack();

    // Create and cache the background
    createBackgroundBuffer();
}

/**
 * Create a cached gradient background buffer for performance optimization
 */
function createBackgroundBuffer() {
    // Create a buffer for the background
    backgroundBuffer = createGraphics(windowWidth, windowHeight);
    backgroundBuffer.background(0);
    
    // Create gradient background
    let c1 = color(255, 200, 100);
    let c2 = color(200, 100, 255);
    
    for(let y = 0; y < height; y++){
        let inter = map(y, 0, height, 0, 1);
        let c = lerpColor(c1, c2, inter);
        backgroundBuffer.stroke(c);
        backgroundBuffer.line(0, y, width, y);
    }
}

/**
 * p5.js window resize handler - updates canvas and physics boundaries
 */
function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    baseSize = calculateBaseSize();
    createBoundaries();
    createBackgroundBuffer(); // Recreate background buffer on resize
}

/**
 * p5.js draw loop - runs every frame
 */
function draw() {
    updateButtonStates();
    // Update time
    time += deltaTime * 0.001;
    
    // Draw cached background
    image(backgroundBuffer, 0, 0);
    
    // Update and draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.update();
        particle.display();
        
        // Apply pulse effect if it exists
        if (particle.pulseEffect && particle.pulseEffect > 1) {
            particle.pulseEffect -= PULSE_EFFECT_DECAY;
            if (particle.pulseEffect <= 1) {
                particle.pulseEffect = null;
            }
        }
    }
    
    // Draw marquee selection if active
    if (isMarqueeSelecting) {
        stroke(255, 255, 255, 100);
        strokeWeight(2);
        fill(255, 255, 255, 30);
        rect(marqueeStartX, marqueeStartY, marqueeEndX - marqueeStartX, marqueeEndY - marqueeStartY);
    }
    
    // Update particle count display less frequently
    if (frameCount % PARTICLE_COUNT_UPDATE_INTERVAL === 0) {
        const particleCountElement = document.getElementById('particleCount');
        if (particleCountElement) {
            particleCountElement.textContent = particles.length;
        }
    }
    
    // Hide instructions if particle count is greater than 0
    if (particles.length > 0) {
        const instructions = document.getElementById('instructions');
        if (instructions && !instructions.classList.contains('hidden')) {
            instructions.classList.add('hidden');
        }
    }
}

/**
 * Detect if the current device is mobile based on user agent and screen size
 * @returns {boolean} True if mobile device detected
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
}

/**
 * Create a Matter.js physics body based on the shape type
 * @param {string} shape - The shape type ('circle', 'square', or 'triangle')
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} size - Size of the shape
 * @param {Object} options - Matter.js body options
 * @returns {Matter.Body} The created physics body
 */
function createPhysicsBody(shape, x, y, size, options = {}) {
    const defaultOptions = {
        friction: PHYSICS_FRICTION,
        restitution: PHYSICS_RESTITUTION,
        angle: random(TWO_PI),
        density: PHYSICS_DENSITY,
        label: 'particle',
        ...options
    };

    switch (shape) {
        case 'circle':
            return Matter.Bodies.circle(x, y, size/2 + padding, defaultOptions);
        case 'square':
            return Matter.Bodies.rectangle(x, y, size + padding, size + padding, defaultOptions);
        case 'triangle':
            return Matter.Bodies.polygon(x, y, 3, size/1.8, defaultOptions);
        default:
            return Matter.Bodies.circle(x, y, size/2 + padding, defaultOptions);
    }
}

class PhysicsParticle {
    constructor(x, y, color, shape) {
        this.size = random(baseSize * PARTICLE_SIZE_MIN, baseSize * PARTICLE_SIZE_MAX);
        this.color = color;
        this.shape = currentShape;
        this.isHovered = false;
        this.isSelected = false;
        this.isLocked = false;
        this.isAcid = false;
        this.pulseEffect = null;
        this.alpha = 255;
        this.acidStrength = ACID_STRENGTH;
        this.originalSize = this.size;
        this.acidDecayRate = ACID_DECAY_RATE;
        this.acidDecayTimer = 0; // Timer for acid decay

        // Create body using helper function
        this.body = createPhysicsBody(shape, x, y, this.size);

        // Add initial velocity
        Matter.Body.setVelocity(this.body, {
            x: random(INITIAL_VELOCITY_X_MIN, INITIAL_VELOCITY_X_MAX),
            y: random(INITIAL_VELOCITY_Y_MIN, INITIAL_VELOCITY_Y_MAX)
        });

        Matter.World.add(world, this.body);
        previousColor = this.color;
    }

    update() {
        // Only update if not locked
        if (!this.isLocked) {
            // Add acid effect logic
            if (this.isAcid) {
                const currentTime = millis();
                
                // Update acid decay timer
                this.acidDecayTimer += deltaTime;

                // Gradually shrink acid particle
                if (this.acidDecayTimer > ACID_DECAY_INTERVAL) {
                    this.size *= (1 - this.acidDecayRate);

                    // If particle is too small, remove it
                    if (this.size < MIN_PARTICLE_SIZE) {
                        this.remove();
                        const index = particles.indexOf(this);
                        if (index !== -1) {
                            particles.splice(index, 1);
                        }
                        
                        // Also remove from selected and locked arrays if needed
                        const selectedIndex = selectedParticles.indexOf(this);
                        if (selectedIndex !== -1) {
                            selectedParticles.splice(selectedIndex, 1);
                        }
                        
                        const lockedIndex = lockedParticles.indexOf(this);
                        if (lockedIndex !== -1) {
                            lockedParticles.splice(lockedIndex, 1);
                        }
                        
                        // Update button states
                        updateButtonStates();
                    } else {
                        // Update body with new size
                        this.resizeBody();
                    }
                    this.acidDecayTimer = 0;
                }

                // Note: Acid collision effects are now handled by Matter.js collision events
                // See handleCollisionStart() for acid effect application
            }
        }
    }

    /**
     * Resize the physics body to match current size while preserving position and velocity
     */
    resizeBody() {
        // Store the particle's current position and velocity
        const pos = this.body.position;
        const vel = this.body.velocity;
        const angle = this.body.angle;

        // Remove the old body
        Matter.World.remove(world, this.body);

        // Create a new body with the updated size
        this.body = createPhysicsBody(this.shape, pos.x, pos.y, this.size, { angle });

        // Restore the particle's velocity
        Matter.Body.setVelocity(this.body, vel);

        // Add the new body to the world
        Matter.World.add(world, this.body);
    }

    display() {
        const pos = this.body.position;
        const angle = this.body.angle;
        
        push();
        translate(pos.x, pos.y);
        rotate(angle);
        rectMode(CENTER);
        noStroke();
        
        // Apply scale if pulse effect is active
        if (this.pulseEffect && this.pulseEffect > 1) {
            scale(this.pulseEffect);
        }
        
        // Change appearance based on state
        if (this.isHovered || this.isSelected) {
            // Draw hover/selection effect with white glow
            fill(255, 255, 255, 100);
            stroke(255, 255, 255, 100);
            strokeWeight(4);
            
            // Draw the glow shape
            switch (this.shape) {
                case 'circle':
                    circle(0, 0, this.size);
                    break;
                case 'square':
                    rect(0, 0, this.size, this.size);
                    break;
                case 'triangle':
                    triangle(-this.size/2, this.size/2, this.size/2, this.size/2, 0, -this.size/2);
                    break;
                default:
                    circle(0, 0, this.size);
                    break;
            }
            
            // Main particle fill
            fill(this.color[0], this.color[1], this.color[2], 120);
        } else {
            // Normal, locked, or acid state
            if (this.isAcid) {
                // Acid particles have a green glow and pulsing effect
                fill(this.color[0], this.color[1], this.color[2], 100);
                stroke(this.color[0], this.color[1], this.color[2], 150);
                strokeWeight(1);
                circle(0, 0, this.size * 1.2);
                
                // Main acid particle color (bright green)
                fill(this.color[0], this.color[1], this.color[2], 200);
            } else if (this.isLocked) {
                // Locked particles are paler in color
                fill(
                    this.color[0] + (255 - this.color[0]) * 0.4, 
                    this.color[1] + (255 - this.color[1]) * 0.4, 
                    this.color[2] + (255 - this.color[2]) * 0.4, 
                    this.alpha
                );
            } else {
                fill(this.color[0], this.color[1], this.color[2], this.alpha);
            }
        }
        
        // Draw the particle shape
        switch (this.shape) {
            case 'circle':
                circle(0, 0, this.size);
                break;
            case 'square':
                rect(0, 0, this.size, this.size);
                break;
            case 'triangle':
                triangle(-this.size/2, this.size/2, this.size/2, this.size/2, 0, -this.size/2);
                break;
            default:
                circle(0, 0, this.size);
                break;
        }
        pop();
    }

    remove() {
        Matter.World.remove(world, this.body);
    }
}

/**
 * Adjust particle spawn count with mouse wheel
 */
function mouseWheel(event) {
    if (event.delta < 0) {
        spawnCount += SPAWN_COUNT_WHEEL_DELTA;
    } else {
        spawnCount -= SPAWN_COUNT_WHEEL_DELTA;
    }
    spawnCount = constrain(spawnCount, MIN_SPAWN_COUNT, MAX_SPAWN_COUNT);
}

/**
 * p5.js mouse pressed handler
 */
function mousePressed() {
    // detect if click is inside the "toolbar" and prevent adding particles
    if (mouseX > toolbar.offsetLeft && mouseX < toolbar.offsetLeft + toolbar.offsetWidth && mouseY > toolbar.offsetTop && mouseY < toolbar.offsetTop + toolbar.offsetHeight) {
        return;
    }

    // Start marquee selection if shift is pressed
    if (shiftPressed) {
        isMarqueeSelecting = true;
        marqueeStartX = mouseX;
        marqueeStartY = mouseY;
        marqueeEndX = mouseX;
        marqueeEndY = mouseY;
        return;
    }
    
    if (particles.length === 0) {
        createParticles(mouseX, mouseY);
        return;
    }
    
    let clicked = false;
    // detect if mouse click is on a particle
    for (let particle of particles) {
        if (dist(mouseX, mouseY, particle.body.position.x, particle.body.position.y) < particle.size/2) {
            if (vKeyPressed) {
                // Convert particle to acid
                particle.isAcid = true;

                // Play acid conversion sound
                if (soundManager) {
                    soundManager.acidConvert();
                }

                clicked = true;
                break;
            } else if (xKeyPressed) {
                // Split the particle if M key is pressed
                splitParticle(particle);
                clicked = true;
                break;
            } else if (selectedParticles.indexOf(particle) === -1) {
                selectedParticles.push(particle);
                particle.isSelected = true;

                // Play select sound
                if (soundManager) {
                    soundManager.selectParticle();
                }
            } else {
                selectedParticles.splice(selectedParticles.indexOf(particle), 1);
                particle.isSelected = false;
                particle.isHovered = false;

                // Play deselect sound
                if (soundManager) {
                    soundManager.deselectParticle();
                }
            }
            clicked = true;
            break;
        }
    }
    if (!clicked) {
        createParticles(mouseX, mouseY);
    }
}

function touchStarted() {
    // First check if the touch is within the toolbar or help modal
    if (touches.length === 1) {
        const touch = touches[0];
        const toolbarElement = document.querySelector('.toolbar');
        if (toolbarElement) {
            const rect = toolbarElement.getBoundingClientRect();
            if (touch.x >= rect.left && touch.x <= rect.right && 
                touch.y >= rect.top && touch.y <= rect.bottom) {
                return true; // Allow default behavior for toolbar touches
            }
        }
        
        // Check for help modal
        const helpModal = document.getElementById('helpModal');
        if (helpModal && helpModal.style.display !== 'none') {
            const helpContent = helpModal.querySelector('.help-content');
            if (helpContent) {
                const rect = helpContent.getBoundingClientRect();
                if (touch.x >= rect.left && touch.x <= rect.right && 
                    touch.y >= rect.top && touch.y <= rect.bottom) {
                    return true; // Allow default behavior for help modal touches
                } else {
                    // Close the modal if clicking outside
                    helpModal.style.display = 'none';
                }
            }
        }
        
        // Only track single touches for long press
        touchStartTime = millis();
        touchStartPos = { x: touch.x, y: touch.y };
        lastDragPosition = { x: touch.x, y: touch.y };
        
        // Reset the drag selection mode
        isDragSelecting = false;
        
        // Set a timer for long press
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            // Check if we're still touching the same position
            if (touches.length === 1 && 
                dist(touches[0].x, touches[0].y, touchStartPos.x, touchStartPos.y) < 20) {
                // Initialize drag selection mode
                isDragSelecting = true;
                handleLongPress(touches[0].x, touches[0].y);
                
                // Create visual indicator for selection mode
                createSelectionIndicator(touches[0].x, touches[0].y);
            }
        }, LONG_PRESS_DURATION);

        // Check if touching a particle
        let touchedParticle = false;
        for (let particle of particles) {
            if (dist(touch.x, touch.y, particle.body.position.x, particle.body.position.y) < particle.size/2) {
                if (selectedParticles.indexOf(particle) === -1) {
                    selectedParticles.push(particle);
                    particle.isSelected = true;

                    // Play select sound
                    if (soundManager) {
                        soundManager.selectParticle();
                    }
                } else {
                    selectedParticles.splice(selectedParticles.indexOf(particle), 1);
                    particle.isSelected = false;
                    particle.isHovered = false;

                    // Play deselect sound
                    if (soundManager) {
                        soundManager.deselectParticle();
                    }
                }
                touchedParticle = true;
                break;
            }
        }

        // If not touching a particle, create new ones
        if (!touchedParticle) {
            createParticles(touch.x, touch.y);
        }
    } else if (touches.length === 2) {
        // Play two-finger tap sound
        if (soundManager) {
            soundManager.twoFingerTap();
        }

        resetParticles();
    } else if (touches.length === 3) {
        // Play snip sound
        if (soundManager) {
            soundManager.cutButton();
        }

        // Remove only unlocked particles
        for (let i = particles.length - 1; i >= 0; i--) {
            if (!particles[i].isLocked) {
                particles[i].remove();
                particles.splice(i, 1);
            }
        }
    }
    
    return false; // Prevent default behavior for canvas touches
}

function touchEnded() {
    // Clear the long press timer
    clearTimeout(longPressTimer);
    
    // If we were in drag selection mode, clean up
    if (isDragSelecting) {
        isDragSelecting = false;
        
        // Remove the selection indicator
        if (selectionIndicator) {
            selectionIndicator.remove();
            selectionIndicator = null;
        }
        
        // Update button states based on selections
        updateButtonStates();
    }
    
    return false;
}

function touchMoved() {
    // If in drag selection mode, select particles under the touch
    if (isDragSelecting && touches.length === 1) {
        const touch = touches[0];
        
        // Update the selection indicator position
        if (selectionIndicator) {
            selectionIndicator.style.left = (touch.x - 20) + 'px';
            selectionIndicator.style.top = (touch.y - 20) + 'px';
        }
        
        // Only process if touch has moved sufficiently (to avoid duplicate checks)
        if (dist(touch.x, touch.y, lastDragPosition.x, lastDragPosition.y) > 5) {
            // Check for particles under the touch path
            for (let particle of particles) {
                // Calculate distance from particle to touch
                const distance = dist(touch.x, touch.y, particle.body.position.x, particle.body.position.y);
                const selectionRadius = baseSize * SELECTION_RADIUS_MULTIPLIER;
                
                // If particle is within selection radius and not already selected
                if (distance < selectionRadius && !particle.isSelected) {
                    selectedParticles.push(particle);
                    particle.isSelected = true;
                    
                    // Add visual feedback (pulse effect)
                    particle.pulseEffect = PULSE_EFFECT_SCALE;
                }
            }
            
            // Remember last position for next move
            lastDragPosition = { x: touch.x, y: touch.y };
        }
        
        return false;
    }
    
    // Handle pinch-to-zoom behavior
    if (touches.length >= 2) {
        const touch1 = touches[0];
        const touch2 = touches[1];
        const currentDistance = dist(touch1.x, touch1.y, touch2.x, touch2.y);
        
        // If we have a previous distance, calculate the change
        if (previousTouchDistance > 0) {
            const distanceDelta = currentDistance - previousTouchDistance;
            
            // Adjust spawn count based on pinch gesture
            if (abs(distanceDelta) > 2) { // Threshold to avoid small fluctuations
                spawnCount += distanceDelta * 0.1;
                spawnCount = constrain(spawnCount, MIN_SPAWN_COUNT, MAX_SPAWN_COUNT);
            }
        }
        
        previousTouchDistance = currentDistance;
        return false;
    } else {
        // Reset for next gesture
        previousTouchDistance = 0;
    }
    
    return false;
}

function handleLongPress(x, y) {
    // Play long press sound
    if (soundManager) {
        soundManager.longPressSelect();
    }

    // Find particles near the long press position
    let nearbyParticles = [];

    for (let particle of particles) {
        if (dist(x, y, particle.body.position.x, particle.body.position.y) < baseSize * 3) {
            nearbyParticles.push(particle);
        }
    }

    // Select all nearby particles
    for (let particle of nearbyParticles) {
        if (selectedParticles.indexOf(particle) === -1) {
            selectedParticles.push(particle);
            particle.isSelected = true;
        }
    }
    
    // Show a visual feedback for the selection
    if (nearbyParticles.length > 0) {
        // Flash effect or some other visual indicator
        longPressActive = true;
        setTimeout(() => {
            longPressActive = false;
        }, 300);
    }
    
    // Update button states based on selection
    updateButtonStates();
}

/**
 * Create new particles at the specified position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function createParticles(x, y) {
    // Play particle creation sound
    if (soundManager) {
        soundManager.particleCreate(spawnCount);
    }

    let color;

    if (isRandomColor) {
        // Use noise to determine color based on rgb value of previousColor
        let noiseValue1 = noise(previousColor[0]);
        let noiseValue2 = noise(previousColor[1]);
        let noiseValue3 = noise(previousColor[2]);
        let r = map(noiseValue1, 0, 1, 0, 255);
        let g = map(noiseValue2, 0, 1, 0, 255);
        let b = map(noiseValue3, 0, 1, 0, 255);
        color = [r, g, b];
    } else {
        // Use the manually picked color
        color = [...currentPickedColor]; // Use a copy to avoid reference issues
    }

    for (let i = 0; i < spawnCount; i++) {
        particles.push(new PhysicsParticle(x, y, color, currentShape));
    }
}

/**
 * p5.js key pressed handler
 */
function keyPressed() {
    // Track shift key state
    if (keyCode === SHIFT) {
        shiftPressed = true;
    }

    // Track M key state
    if (key === 'm' || key === 'M') {
        mKeyPressed = true;
    }

    // Track C key state
    if (key === 'x' || key === 'X') {
        xKeyPressed = true;
    }

    // Track V key state
    if (key === 'v' || key === 'V') {
        vKeyPressed = true;
    }
    
    if (key === 'Backspace') {
        if (selectedParticles.length > 0) {
            // Play snip sound
            if (soundManager) {
                soundManager.cutButton();
            }

            // Remove selected particles (even if locked)
            for (let particle of selectedParticles) {
                // Also remove from lockedParticles if it was locked
                const lockedIndex = lockedParticles.indexOf(particle);
                if (lockedIndex !== -1) {
                    lockedParticles.splice(lockedIndex, 1);
                }

                particle.remove();
                particles.splice(particles.indexOf(particle), 1);
            }
            selectedParticles = [];
        } else {
            resetParticles();
        }
    }
    // detect escape key to deselect all particles
    if (key === 'Escape') {
        for (let particle of particles) {
            particle.isSelected = false;
            particle.isHovered = false;
        }
        selectedParticles = [];
        
        // Also cancel any ongoing marquee selection
        isMarqueeSelecting = false;
    }
    // L key to toggle lock/unlock for selected particles
    if (key === 'l' || key === 'L') {
        if (selectedParticles.length > 0) {
            const event = new Event('click');
            lockBtn.dispatchEvent(event);
        }
    }
    // ? key to show help
    if (key === '?') {
        const event = new Event('click');
        helpBtn.dispatchEvent(event);
    }
    // C key to change color of selected particles
    if (key === 'c' || key === 'C') {
        if (selectedParticles.length > 0) {
            for (let particle of selectedParticles) {
                if (isRandomColor) {
                    // Generate a new random color
                    let noiseValue1 = noise(previousColor[0]);
                    let noiseValue2 = noise(previousColor[1]);
                    let noiseValue3 = noise(previousColor[2]);
                    let r = map(noiseValue1, 0, 1, 0, 255);
                    let g = map(noiseValue2, 0, 1, 0, 255);
                    let b = map(noiseValue3, 0, 1, 0, 255);
                    particle.color = [r, g, b];
                } else {
                    // Use the current picked color
                    particle.color = [...currentPickedColor];
                }
            }
        }
    }
}

/**
 * p5.js key released handler
 */
function keyReleased() {
    // Track shift key state
    if (keyCode === SHIFT) {
        shiftPressed = false;
        
        // If a marquee selection was in progress, finalize it
        if (isMarqueeSelecting) {
            finalizeMarqueeSelection();
            isMarqueeSelecting = false;
        }
    }

    // Track M key state
    if (key === 'm' || key === 'M') {
        mKeyPressed = false;
    }

    if (key === 'x' || key === 'X') {
        xKeyPressed = false;
    }

    // Track V key state
    if (key === 'v' || key === 'V') {
        vKeyPressed = false;
    }

    return false;
}

/**
 * Remove a random cluster of unlocked particles (two-finger tap behavior)
 */
function resetParticles() {
    if (particles.length === 0) return;

    // Make a copy of the particles array for processing
    let particlesCopy = [...particles];

    // Filter out locked particles for determining the center
    let unlockParticles = particlesCopy.filter(p => !p.isLocked);

    // If all particles are locked, nothing to do
    if (unlockParticles.length === 0) return;
    
    // Pick a random unlocked particle as the center of removal
    let centerIndex = floor(random(unlockParticles.length));
    let centerParticle = unlockParticles[centerIndex];
    let centerPos = centerParticle.body.position;
    
    // Calculate radius based on screen size
    let removalRadius = min(windowWidth, windowHeight) * REMOVAL_RADIUS_MULTIPLIER;
    
    // Identify which ORIGINAL particles to remove (maintaining the original indices)
    let toRemove = [];
    
    for (let i = 0; i < particles.length; i++) {
        let particle = particles[i];
        
        // Skip locked particles
        if (particle.isLocked) {
            continue;
        }
        
        let pos = particle.body.position;
        let distance = dist(centerPos.x, centerPos.y, pos.x, pos.y);
        
        if (distance <= removalRadius) {
            // Store the actual particle reference to remove
            toRemove.push(particle);
        }
    }

    // Play snip sound
    if (soundManager && toRemove.length > 0) {
        soundManager.cutButton();
    }

    // Remove each particle from the physics world first
    for (let particle of toRemove) {
        particle.remove();
    }

    // Then filter the particles array to remove these particles
    particles = particles.filter(p => !toRemove.includes(p));
}

/**
 * p5.js mouse moved handler - updates hover states
 */
function mouseMoved() {
    // Update marquee selection if active
    if (isMarqueeSelecting) {
        marqueeEndX = mouseX;
        marqueeEndY = mouseY;
        return false;
    }
    
    // Change cursor when hovering over a particle
    let hovering = false;
    
    // Reset all particles to not hovered
    for (let particle of particles) {
        particle.isHovered = false;
    }
    
    // Check for hover on each particle
    let hoveredParticle = null;
    for (let particle of particles) {
        if (dist(mouseX, mouseY, particle.body.position.x, particle.body.position.y) < particle.size/2) {
            particle.isHovered = true;
            hovering = true;
            hoveredParticle = particle;
            break; // Only hover one particle at a time
        }
    }

    // Play hover sound only when entering a NEW particle
    if (hoveredParticle && hoveredParticle !== currentlyHoveredParticle) {
        if (soundManager) {
            soundManager.hoverParticle();
        }
    }

    // Update currently hovered particle
    currentlyHoveredParticle = hoveredParticle;

    // Change cursor based on hover state
    if (hovering) {
        cursor('pointer'); // Change cursor to pointer when hovering
    } else if (shiftPressed) {
        cursor('crosshair'); // Change cursor to crosshair when shift is pressed
    } else {
        cursor('default');
    }
    
    return false;
}

/**
 * p5.js mouse dragged handler - handles marquee selection
 */
function mouseDragged() {
    // Update marquee selection if active
    if (isMarqueeSelecting) {
        marqueeEndX = mouseX;
        marqueeEndY = mouseY;
        
        // Calculate the marquee box coordinates
        let x1 = min(marqueeStartX, marqueeEndX);
        let y1 = min(marqueeStartY, marqueeEndY);
        let x2 = max(marqueeStartX, marqueeEndX);
        let y2 = max(marqueeStartY, marqueeEndY);
        
        // Minimum size check to avoid accidental tiny selections
        if (abs(x2 - x1) < 10 || abs(y2 - y1) < 10) {
            return false;
        }
        
        // Select all particles inside the marquee
        for (let particle of particles) {
            const pos = particle.body.position;
            
            // Check if particle position is inside the marquee box
            if (pos.x >= x1 && pos.x <= x2 && pos.y >= y1 && pos.y <= y2) {
                // Only add if not already selected
                if (selectedParticles.indexOf(particle) === -1) {
                    selectedParticles.push(particle);
                    particle.isSelected = true;
                }
            } else {
                // Deselect particles outside the marquee
                const index = selectedParticles.indexOf(particle);
                if (index !== -1) {
                    selectedParticles.splice(index, 1);
                    particle.isSelected = false;
                }
            }
        }

        // Update button states based on current selection
        updateButtonStates();

        // Play sound based on selection count (trigger every 5 particles for variation)
        if (soundManager && selectedParticles.length % 5 === 0 && selectedParticles.length > 0) {
            soundManager.marqueeSelect(selectedParticles.length);
        }

        return false;
    }
    return true;
}

/**
 * p5.js mouse released handler
 */
function mouseReleased() {
    // Just clear the marquee selection state
    if (isMarqueeSelecting) {
        isMarqueeSelecting = false;
        return false;
    }
    return true;
}

// Helper function to convert RGB to Hex
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (Math.floor(r) << 16) + (Math.floor(g) << 8) + Math.floor(b)).toString(16).slice(1);
}

// Helper function to convert Hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [0, 0, 0];
}

/**
 * Set up toolbar button event listeners
 */
function setupControls() {
    const shapeSelectBtn = document.getElementById('shapeSelectBtn');
    const currentColor = document.getElementById('currentColor');
    const colorPickerInput = document.getElementById('colorPickerInput');
    const cutBtn = document.getElementById('cutBtn');
    const lockBtn = document.getElementById('lockBtn');
    const clearBtn = document.getElementById('clearBtn');
    const helpBtn = document.getElementById('helpBtn');
    const muteBtn = document.getElementById('muteBtn');
    const volumeSlider = document.getElementById('volumeSlider');

    // Initialize color picker with a random color
    const initialR = Math.floor(random(0, 255));
    const initialG = Math.floor(random(0, 255));
    const initialB = Math.floor(random(0, 255));
    currentPickedColor = [initialR, initialG, initialB];
    colorPickerInput.value = rgbToHex(initialR, initialG, initialB);

    // Set up current color click handler
    currentColor.addEventListener('click', () => {
        if (isRandomColor) {
            // Switch to custom color mode
            isRandomColor = false;
            currentColor.classList.remove('rainbow-bg');
            currentColor.style.backgroundColor = `rgb(${currentPickedColor[0]}, ${currentPickedColor[1]}, ${currentPickedColor[2]})`;

            // Play sound (switching to custom mode)
            if (soundManager) {
                soundManager.colorPickerToggle(false);
            }

            // Open the color picker
            colorPickerInput.click();
        } else {
            // Switch back to random color mode
            isRandomColor = true;
            currentColor.classList.add('rainbow-bg');
            currentColor.style.backgroundColor = '';

            // Play sound (switching to random mode)
            if (soundManager) {
                soundManager.colorPickerToggle(true);
            }
        }
    });

    // Set up color picker change handler
    colorPickerInput.addEventListener('change', (event) => {
        const hexColor = event.target.value;
        currentPickedColor = hexToRgb(hexColor);
        
        // Always update the color display when a new color is picked
        currentColor.style.backgroundColor = `rgb(${currentPickedColor[0]}, ${currentPickedColor[1]}, ${currentPickedColor[2]})`;
        
        // If we're in random color mode, switch to custom color mode
        if (isRandomColor) {
            isRandomColor = false;
            currentColor.classList.remove('rainbow-bg');
        }
    });
    
    // Set up shape select button
    shapeSelectBtn.addEventListener('click', () => {
        // cycle through shapes in shapes array
        currentShape = shapes[(shapes.indexOf(currentShape) + 1) % shapes.length];
        let shapeName;
        if (currentShape === 'triangle') {
            shapeName = 'change_history';
        } else {
            shapeName = currentShape;
        }

        // Update button content and aria-label
        const shapeLabel = currentShape.charAt(0).toUpperCase() + currentShape.slice(1);
        shapeSelectBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">' + shapeName + '</span>';
        shapeSelectBtn.setAttribute('aria-label', 'Cycle shape (' + shapeLabel + ')');

        // Play sound
        if (soundManager) {
            soundManager.shapeSelect();
        }
    });
    
    cutBtn.addEventListener('click', () => {
        if (selectedParticles.length > 0) {
            // Play sound
            if (soundManager) {
                soundManager.cutButton();
            }

            for (let particle of selectedParticles) {
                // Also remove from lockedParticles if it was locked
                const lockedIndex = lockedParticles.indexOf(particle);
                if (lockedIndex !== -1) {
                    lockedParticles.splice(lockedIndex, 1);
                }

                particle.remove();
                particles.splice(particles.indexOf(particle), 1);
            }
            selectedParticles = [];
            updateButtonStates();
        }
    });
    
    clearBtn.addEventListener('click', () => {
        // Play sound
        if (soundManager) {
            soundManager.clearButton();
        }

        // Remove all particles (even if locked)
        for (let particle of particles) {
            particle.remove();
        }
        particles = [];
        lockedParticles = [];
        selectedParticles = [];
        updateButtonStates();
    });

    lockBtn.addEventListener('click', () => {
        if (selectedParticles.length > 0) {
            // Determine if we're locking or unlocking based on first particle
            const isLocking = !selectedParticles[0].isLocked;

            // Play sound
            if (soundManager) {
                soundManager.lockButton(isLocking);
            }

            for (let particle of selectedParticles) {
                if (!particle.isLocked) {
                    // Lock the particle
                    particle.isLocked = true;

                    // Make it static to remove gravity and physics effects
                    Matter.Body.setStatic(particle.body, true);

                    // Add to locked particles array if not already there
                    if (lockedParticles.indexOf(particle) === -1) {
                        lockedParticles.push(particle);
                    }
                } else {
                    // Unlock the particle
                    particle.isLocked = false;

                    // Make it dynamic again
                    Matter.Body.setStatic(particle.body, false);

                    // Remove from locked particles array
                    const index = lockedParticles.indexOf(particle);
                    if (index !== -1) {
                        lockedParticles.splice(index, 1);
                    }
                }
            }
        }
        // Deselect all particles
        for (let particle of particles) {
            particle.isSelected = false;
            particle.isHovered = false;
        }
        selectedParticles = [];
        updateButtonStates();
    });

    // Set up help button
    helpBtn.addEventListener('click', () => {
        // Create modal container if it doesn't exist
        let helpModal = document.getElementById('helpModal');

        if (helpModal) {
            // If modal exists already, just toggle its visibility
            const isOpening = helpModal.style.display === 'none';
            helpModal.style.display = isOpening ? 'flex' : 'none';

            // Play sound
            if (soundManager) {
                soundManager.helpButton(isOpening);
            }
            return;
        }

        // Play sound (opening modal for first time)
        if (soundManager) {
            soundManager.helpButton(true);
        }
        
        // Create the modal
        helpModal = document.createElement('div');
        helpModal.id = 'helpModal';
        helpModal.classList.add('help-modal');
        
        // Create the content container
        const helpContent = document.createElement('div');
        helpContent.classList.add('help-content');
        
        // Define mobile-specific tips
        const mobileTips = isMobileDevice() ? `
            <p>Mobile Gestures</p>
            <table>
                <tr>
                    <td><b>Tap</b></td>
                    <td>Create particles or select/deselect a particle</td>
                </tr>
                <tr>
                    <td><b>Long Press</b></td>
                    <td>Select all particles in the area</td>
                </tr>
                <tr>
                    <td><b>Two-Finger Tap</b></td>
                    <td>Remove particles in a circular area</td>
                </tr>
                <tr>
                    <td><b>Three-Finger Tap</b></td>
                    <td>Remove all unlocked particles</td>
                </tr>
                <tr>
                    <td><b>Pinch</b></td>
                    <td>Adjust number of particles per spawn</td>
                </tr>
                <tr>
                    <td><b>Floating Button</b></td>
                    <td>Access mobile-specific controls</td>
                </tr>
            </table>
        ` : '';

        // Add help content
        helpContent.innerHTML = `
            <p>Hotkeys</p>
            <table>
                <tr>
                    <td><b>Click/Tap</b></td>
                    <td>Create particles at cursor position</td>
                </tr>
                <tr>
                    <td><b>Mouse Wheel</b></td>
                    <td>Adjust number of particles per spawn (10-100)</td>
                </tr>
                <tr>
                    <td><span class="key">Esc</span></td>
                    <td>Deselect all particles</td>
                </tr>
                <tr>
                    <td><span class="key">Backspace</span></td>
                    <td>Delete selected particles (or chunks if none selected)</td>
                </tr>
                <tr>
                    <td><span class="key">C</span></td>
                    <td>Change color of selected particles</td>
                </tr>
                <tr>
                    <td><span class="key">L</span></td>
                    <td>Lock/unlock selected particles</td>
                </tr>
                <tr>
                    <td><span class="key">X</span> + Click</td>
                    <td>Split a particle into smaller fragments</td>
                </tr>
                <tr>
                    <td><span class="key">V</span> + Click</td>
                    <td>Convert a particle into acid (dissolves other particles)</td>
                </tr>
                <tr>
                    <td><span class="key">Shift</span> + Drag</td>
                    <td>Marquee selection (draw a box to select multiple particles)</td>
                </tr>
            </table>
            
            <div class="tip">
                <b>Tip:</b> Click on particles to select them individually. Hold Shift and drag to select multiple particles at once.
            </div>
            
            <p>Toolbar</p>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                    <td><span class="material-symbols-outlined">palette</span></td>
                    <td>Toggle between random colors and manual color picking</td>
                </tr>
                <tr>
                    <td><span class="material-symbols-outlined">circle</span></td>
                    <td>Cycle between Circle, Square, and Triangle</td>
                </tr>
                <tr>
                    <td><span class="material-symbols-outlined">content_cut</span></td>
                    <td>Remove selected particles</td>
                </tr>
                <tr>
                    <td><span class="material-symbols-outlined">lock</span></td>
                    <td>Fix selected particles in place</td>
                </tr>
                <tr>
                    <td><span class="material-symbols-outlined">cleaning_services</span></td>
                    <td>Remove all particles</td>
                </tr>
                <tr>
                    <td><span class="material-symbols-outlined">help</span></td>
                    <td>Show this guide</td>
                </tr>
            </table>
            
            <p>Mobile controls</p>
            
            ${mobileTips}
            
            <div class="tip">
                <b>Creative tip:</b> Try locking some particles in place to create obstacles, then spawn more particles to interact with them!
            </div>
            
            <button id="closeHelpBtn">Got it!</button>
        `;
        
        helpModal.appendChild(helpContent);
        document.body.appendChild(helpModal);
        
        // Close button functionality
        document.getElementById('closeHelpBtn').addEventListener('click', () => {
            helpModal.style.display = 'none';

            // Play sound
            if (soundManager) {
                soundManager.helpButton(false);
            }
        });

        // Close when clicking outside the content
        helpModal.addEventListener('click', (event) => {
            if (event.target === helpModal) {
                helpModal.style.display = 'none';

                // Play sound
                if (soundManager) {
                    soundManager.helpButton(false);
                }
            }
        });
        
        // Prevent closing when clicking inside the content
        helpContent.addEventListener('click', (event) => {
            event.stopPropagation();
        });
    });

    // Mute button event listener
    muteBtn.addEventListener('click', () => {
        if (soundManager) {
            const isMuted = soundManager.toggleMute();
            const icon = muteBtn.querySelector('.material-symbols-outlined');

            if (isMuted) {
                icon.textContent = 'volume_off';
                muteBtn.classList.add('muted');
            } else {
                icon.textContent = 'volume_up';
                muteBtn.classList.remove('muted');
            }
        }
    });

    // Volume slider event listener
    volumeSlider.addEventListener('input', (event) => {
        if (soundManager) {
            const volume = parseInt(event.target.value) / 100; // Convert 0-100 to 0-1
            soundManager.setVolume(volume);
        }
    });

    // Sound pack selector
    const soundPackSelect = document.getElementById('soundPackSelect');
    if (soundPackSelect) {
        // Load saved pack selection
        const savedPack = localStorage.getItem('bubbleshop_soundpack') || 'original';
        soundPackSelect.value = savedPack;

        // Handle pack changes
        soundPackSelect.addEventListener('change', (e) => {
            const packId = e.target.value;
            if (soundManager) {
                soundManager.switchPack(packId);

                // Optional: Play preview sound using new pack
                setTimeout(() => {
                    soundManager.shapeSelect();
                }, 100);
            }
        });
    }

    // Initialize mute button state based on saved preferences
    if (soundManager) {
        const isMuted = soundManager.getMuted();
        const icon = muteBtn.querySelector('.material-symbols-outlined');

        if (isMuted) {
            icon.textContent = 'volume_off';
            muteBtn.classList.add('muted');
        }

        // Initialize volume slider value
        volumeSlider.value = Math.round(soundManager.getVolume() * 100);
    }
}

/**
 * Toggle between random color mode and custom color picker
 */
function toggleColorPicker() {
    const currentColor = document.getElementById('currentColor');
    const colorPickerInput = document.getElementById('colorPickerInput');
    
    if (isRandomColor) {
        // Switch to custom color mode
        isRandomColor = false;
        currentColor.classList.remove('rainbow-bg');
        currentColor.style.backgroundColor = `rgb(${currentPickedColor[0]}, ${currentPickedColor[1]}, ${currentPickedColor[2]})`;
        
        // Open the color picker
        colorPickerInput.click();
    } else {
        // Switch back to random color mode
        isRandomColor = true;
        currentColor.classList.add('rainbow-bg');
        currentColor.style.backgroundColor = '';
    }
}

function toggleShapeSelect() {
    const shapeSelectBtn = document.getElementById('shapeSelectBtn');
    // cycle through shapes in shapes array
    currentShape = shapes[(shapes.indexOf(currentShape) + 1) % shapes.length];
    let shapeName;
    if (currentShape === 'triangle') {
        shapeName = 'change_history';
    } else {
        shapeName = currentShape;
    }
    shapeSelectBtn.innerHTML = '<span class="material-symbols-outlined">' + shapeName + '</span>';
}

function toggleCutMode() {
    if (selectedParticles.length > 0) {
        for (let particle of selectedParticles) {
            // Also remove from lockedParticles if it was locked
            const lockedIndex = lockedParticles.indexOf(particle);
            if (lockedIndex !== -1) {
                lockedParticles.splice(lockedIndex, 1);
            }
            
            particle.remove();
            particles.splice(particles.indexOf(particle), 1);
        }
        selectedParticles = [];
    }
    updateButtonStates();
}

function toggleLockMode() {
    if (selectedParticles.length > 0) {
        for (let particle of selectedParticles) {
            if (!particle.isLocked) {
                // Lock the particle
                particle.isLocked = true;
                
                // Make it static to remove gravity and physics effects
                Matter.Body.setStatic(particle.body, true);
                
                // Add to locked particles array if not already there
                if (lockedParticles.indexOf(particle) === -1) {
                    lockedParticles.push(particle);
                }
            } else {
                // Unlock the particle
                particle.isLocked = false;
                
                // Make it dynamic again
                Matter.Body.setStatic(particle.body, false);
                
                // Remove from locked particles array
                const index = lockedParticles.indexOf(particle);
                if (index !== -1) {
                    lockedParticles.splice(index, 1);
                }
            }
        }
    }
    updateButtonStates();
}

function clearCanvas() {
    // Remove all particles (even if locked)
    for (let particle of particles) {
        particle.remove();
    }
    particles = [];
    lockedParticles = [];
    selectedParticles = [];
    updateButtonStates();
}

function initializeUI() {
    // Initialize color picker
    colorPickerInput = document.getElementById('colorPickerInput');
    colorPickerInput.addEventListener('input', handleColorPickerChange);
    colorPickerInput.addEventListener('change', handleColorPickerChange);

    // Initialize toolbar buttons with both click and touch events
    const currentColorBtn = document.getElementById('currentColor');
    const shapeSelectBtn = document.getElementById('shapeSelectBtn');
    const cutBtn = document.getElementById('cutBtn');
    const lockBtn = document.getElementById('lockBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    // Add click and touch events for all buttons
    currentColorBtn.addEventListener('click', toggleColorPicker);
    currentColorBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        toggleColorPicker();
    });
    
    shapeSelectBtn.addEventListener('click', toggleShapeSelect);
    shapeSelectBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        toggleShapeSelect();
    });
    
    cutBtn.addEventListener('click', toggleCutMode);
    cutBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        toggleCutMode();
    });
    
    lockBtn.addEventListener('click', toggleLockMode);
    lockBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        toggleLockMode();
    });
    
    clearBtn.addEventListener('click', clearCanvas);
    clearBtn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        clearCanvas();
    });

    // Update button states
    updateButtonStates();
}

function handleColorPickerChange(event) {
    const hexColor = event.target.value;
    currentPickedColor = hexToRgb(hexColor);
    
    // Always update the color display when a new color is picked
    const currentColor = document.getElementById('currentColor');
    currentColor.style.backgroundColor = `rgb(${currentPickedColor[0]}, ${currentPickedColor[1]}, ${currentPickedColor[2]})`;
    
    // If we're in random color mode, switch to custom color mode
    if (isRandomColor) {
        isRandomColor = false;
        currentColor.classList.remove('rainbow-bg');
    }
}

/**
 * Update toolbar button states (enabled/disabled) based on current selection
 */
function updateButtonStates() {
    const cutBtn = document.getElementById('cutBtn');
    const lockBtn = document.getElementById('lockBtn');
    const clearBtn = document.getElementById('clearBtn');

    // Enable/disable cut and lock buttons based on selection
    if (selectedParticles.length > 0) {
        cutBtn.classList.remove('disabled');
        lockBtn.classList.remove('disabled');
        cutBtn.setAttribute('aria-disabled', 'false');
        lockBtn.setAttribute('aria-disabled', 'false');
    } else {
        cutBtn.classList.add('disabled');
        lockBtn.classList.add('disabled');
        cutBtn.setAttribute('aria-disabled', 'true');
        lockBtn.setAttribute('aria-disabled', 'true');
    }

    // Enable/disable clear button based on particles
    if (particles.length > 0) {
        clearBtn.classList.remove('disabled');
        clearBtn.setAttribute('aria-disabled', 'false');
    } else {
        clearBtn.classList.add('disabled');
        clearBtn.setAttribute('aria-disabled', 'true');
    }
}

/**
 * Create a visual indicator for touch drag selection mode
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 */
function createSelectionIndicator(x, y) {
    // Remove any existing indicator
    if (selectionIndicator) {
        selectionIndicator.remove();
    }
    
    // Create a visual indicator for selection mode
    selectionIndicator = document.createElement('div');
    selectionIndicator.className = 'selection-indicator';
    document.body.appendChild(selectionIndicator);
    
    // Position it at the touch point
    selectionIndicator.style.left = (x - 20) + 'px';
    selectionIndicator.style.top = (y - 20) + 'px';
}

/**
 * Split a particle into multiple smaller fragments with explosion effect
 * @param {PhysicsParticle} particle - The particle to split
 */
function splitParticle(particle) {
    // Get original particle properties
    const originalSize = particle.size;
    const pos = particle.body.position;
    const originalColor = particle.color;
    const originalShape = particle.shape;
    
    // Remove the original particle
    particle.remove();
    const index = particles.indexOf(particle);
    if (index !== -1) {
        particles.splice(index, 1);
    }
    
    // Also remove from selected and locked arrays if needed
    const selectedIndex = selectedParticles.indexOf(particle);
    if (selectedIndex !== -1) {
        selectedParticles.splice(selectedIndex, 1);
    }
    
    const lockedIndex = lockedParticles.indexOf(particle);
    if (lockedIndex !== -1) {
        lockedParticles.splice(lockedIndex, 1);
    }
    
    // Number of smaller particles to create
    const numFragments = floor(random(4, 8));

    // Play particle split sound
    if (soundManager) {
        soundManager.particleSplit(numFragments);
    }

    // Size reduction factor - particles will be 60% of original size
    const sizeReduction = 0.6;
    
    // Store the original base size
    const originalBaseSize = baseSize;
    
    // Temporarily reduce base size for creating smaller particles
    // We want new particles that are sizeReduction (e.g. 60%) of the original's size
    // PhysicsParticle constructor uses random(baseSize * 0.75, baseSize * 1.5)
    // So we adjust baseSize so the middle of this range (baseSize * 1.125) is sizeReduction * originalSize
    baseSize = originalSize * sizeReduction / 1.125;
    
    // Create smaller particles
    for (let i = 0; i < numFragments; i++) {
        // Create a new particle with temporarily reduced baseSize
        const newParticle = new PhysicsParticle(pos.x, pos.y, originalColor, originalShape);
        
        // Apply random velocity for explosion effect
        const angle = random(TWO_PI);
        const force = random(2, 5);
        Matter.Body.setVelocity(newParticle.body, {
            x: cos(angle) * force,
            y: sin(angle) * force
        });
        
        // Add to particles array
        particles.push(newParticle);
    }
    
    // Restore original base size
    baseSize = originalBaseSize;
}

// ============================================================================
// SOUND MANAGER - Web Audio API Sound Effects System
// ============================================================================

/**
 * BaseSoundPack - Abstract base class defining the sound pack contract
 *
 * All sound packs must extend this class and implement all 21 required sound methods.
 * Provides shared infrastructure for Web Audio API, rate limiting, and volume/mute controls.
 */
class BaseSoundPack {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.isMuted = false;
        this.volume = 0.7; // Default 70%
        this.activeOscillators = 0;
        this.maxOscillators = 30;

        // Rate limiters (timestamps)
        this.lastCollisionSound = 0;
        this.lastHoverSound = 0;
        this.lastWallBounceSound = 0;

        // Rate limiting cooldowns (ms)
        this.collisionCooldown = 50;
        this.hoverCooldown = 200;
        this.wallBounceCooldown = 100;
    }

    /**
     * Initialize Web Audio API context and master gain
     */
    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.volume;
            this.loadPreferences();
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }

    /**
     * Resume AudioContext if suspended (autoplay policy)
     */
    ensureAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * Load saved volume/mute preferences from localStorage
     */
    loadPreferences() {
        const savedMute = localStorage.getItem('bubbleshop_muted');
        const savedVolume = localStorage.getItem('bubbleshop_volume');

        if (savedMute !== null) {
            this.isMuted = savedMute === 'true';
        }

        if (savedVolume !== null) {
            this.volume = parseFloat(savedVolume);
            if (this.masterGain) {
                this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
            }
        }
    }

    /**
     * Save volume/mute preferences to localStorage
     */
    savePreferences() {
        localStorage.setItem('bubbleshop_muted', this.isMuted);
        localStorage.setItem('bubbleshop_volume', this.volume);
    }

    // ========================================================================
    // REQUIRED: PARTICLE PHYSICS SOUNDS (6 methods)
    // Subclasses must implement all of these
    // ========================================================================

    particleCreate(count) {
        throw new Error('Must implement particleCreate()');
    }

    particleCollision(velocity, size1, size2) {
        throw new Error('Must implement particleCollision()');
    }

    wallBounce(velocity) {
        throw new Error('Must implement wallBounce()');
    }

    acidConvert() {
        throw new Error('Must implement acidConvert()');
    }

    acidCorrosion() {
        throw new Error('Must implement acidCorrosion()');
    }

    particleSplit(fragmentCount) {
        throw new Error('Must implement particleSplit()');
    }

    // ========================================================================
    // REQUIRED: UI BUTTON SOUNDS (6 methods)
    // ========================================================================

    colorPickerToggle(toRandom) {
        throw new Error('Must implement colorPickerToggle()');
    }

    shapeSelect() {
        throw new Error('Must implement shapeSelect()');
    }

    cutButton() {
        throw new Error('Must implement cutButton()');
    }

    lockButton(isLocking) {
        throw new Error('Must implement lockButton()');
    }

    clearButton() {
        throw new Error('Must implement clearButton()');
    }

    helpButton(isOpening) {
        throw new Error('Must implement helpButton()');
    }

    // ========================================================================
    // REQUIRED: SELECTION & GESTURE SOUNDS (8 methods)
    // ========================================================================

    selectParticle() {
        throw new Error('Must implement selectParticle()');
    }

    deselectParticle() {
        throw new Error('Must implement deselectParticle()');
    }

    marqueeSelect(particleCount) {
        throw new Error('Must implement marqueeSelect()');
    }

    hoverParticle() {
        throw new Error('Must implement hoverParticle()');
    }

    longPressSelect() {
        throw new Error('Must implement longPressSelect()');
    }

    twoFingerTap() {
        throw new Error('Must implement twoFingerTap()');
    }

    threeFingerTap() {
        throw new Error('Must implement threeFingerTap()');
    }

    deleteParticles(count = 1) {
        throw new Error('Must implement deleteParticles()');
    }

    // ========================================================================
    // VOLUME/MUTE CONTROLS (Shared implementation)
    // ========================================================================

    /**
     * Set master volume (0-1)
     * @param {number} value - Volume level between 0 and 1
     */
    setVolume(value) {
        this.volume = constrain(value, 0, 1);
        if (this.masterGain && !this.isMuted) {
            this.masterGain.gain.value = this.volume;
        }
        this.savePreferences();
    }

    /**
     * Toggle mute state
     * @returns {boolean} New mute state
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterGain) {
            this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        }
        this.savePreferences();
        return this.isMuted;
    }

    /**
     * Get current mute state
     * @returns {boolean} True if muted
     */
    getMuted() {
        return this.isMuted;
    }

    /**
     * Get current volume level
     * @returns {number} Volume between 0 and 1
     */
    getVolume() {
        return this.volume;
    }
}

/**
 * OriginalSoundPack - The original Bubbleshop sound effects
 *
 * Uses C major pentatonic scale with smooth synthesized tones.
 * This was the original SoundManager refactored as a sound pack.
 */
class OriginalSoundPack extends BaseSoundPack {
    constructor() {
        super();

        // Pentatonic scale frequencies (C major pentatonic)
        this.scale = {
            C4: 261.63,
            D4: 293.66,
            E4: 329.63,
            G4: 392.00,
            A4: 440.00,
            C5: 523.25,
            D5: 587.33,
            E5: 659.25,
            G5: 783.99,
            A5: 880.00,
            C6: 1046.50
        };

        this.init();
    }

    init() {
        try {
            // Create AudioContext (will be resumed on first user interaction)
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create master gain node
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = this.volume;

            // Load saved preferences
            this.loadPreferences();
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }

    ensureAudioContext() {
        // Resume AudioContext if suspended (autoplay policy)
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    loadPreferences() {
        const savedMute = localStorage.getItem('bubbleshop_muted');
        const savedVolume = localStorage.getItem('bubbleshop_volume');

        if (savedMute !== null) {
            this.isMuted = savedMute === 'true';
        }

        if (savedVolume !== null) {
            this.volume = parseFloat(savedVolume);
            if (this.masterGain) {
                this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
            }
        }
    }

    savePreferences() {
        localStorage.setItem('bubbleshop_muted', this.isMuted);
        localStorage.setItem('bubbleshop_volume', this.volume);
    }

    // ========================================================================
    // CORE INFRASTRUCTURE METHODS
    // ========================================================================

    playTone(frequency, duration, waveType = 'sine', envelope = {}, volume = 0.3) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return null;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const { attack = 0.04, decay = 0.1, sustain = 0.4, release = 0.3 } = envelope;

        // Create oscillator
        const osc = this.audioContext.createOscillator();
        osc.type = waveType;
        osc.frequency.value = frequency;

        // Create gain for envelope
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0;

        // ADSR Envelope
        gainNode.gain.linearRampToValueAtTime(volume, now + attack);
        gainNode.gain.linearRampToValueAtTime(volume * sustain, now + attack + decay);
        gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + duration + release);

        // Connect nodes
        osc.connect(gainNode);
        gainNode.connect(this.masterGain);

        // Start and stop
        osc.start(now);
        osc.stop(now + attack + decay + duration + release);

        // Clean up
        osc.onended = () => {
            this.activeOscillators--;
        };

        return osc;
    }

    playArpeggio(frequencies, stagger = 0.03, waveType = 'sine', envelope = {}, volume = 0.25) {
        frequencies.forEach((freq, index) => {
            setTimeout(() => {
                this.playTone(freq, 0.1, waveType, envelope, volume);
            }, index * stagger * 1000);
        });
    }

    playGlissando(startFreq, endFreq, duration, waveType = 'sine', volume = 0.3) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        osc.type = waveType;
        osc.frequency.value = startFreq;
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        osc.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    playNoise(filterType, lowFreq, highFreq, duration, volume = 0.2) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        // Generate white noise
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = (lowFreq + highFreq) / 2;
        filter.Q.value = 1;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        noise.start(now);

        setTimeout(() => {
            this.activeOscillators--;
        }, duration * 1000);
    }

    // ========================================================================
    // PARTICLE PHYSICS SOUNDS
    // ========================================================================

    particleCreate(count) {
        this.ensureAudioContext();

        // Ascending pentatonic arpeggio
        const notes = [this.scale.C4, this.scale.D4, this.scale.E4, this.scale.G4, this.scale.A4, this.scale.C5, this.scale.D5, this.scale.E5];

        // Limit to 8 notes max even if spawning 100 particles
        const numNotes = Math.min(8, Math.ceil(count / 10));
        const selectedNotes = notes.slice(0, numNotes);

        // Adjust stagger based on count
        const stagger = count > 40 ? 0.03 : 0.02;

        this.playArpeggio(selectedNotes, stagger, 'sine', { attack: 0.04, release: 0.4 }, 0.2);
    }

    particleCollision(velocity, size1, size2) {
        const now = Date.now();

        // Rate limiting
        if (now - this.lastCollisionSound < this.collisionCooldown) {
            return;
        }
        this.lastCollisionSound = now;

        this.ensureAudioContext();

        // Base frequencies
        let freq1 = this.scale.G4;
        let freq2 = this.scale.C5;

        // Velocity-based pitch variation (higher velocity = higher pitch)
        const velocityMultiplier = constrain(map(velocity, 0, 15, 0.9, 1.3), 0.8, 1.5);

        // Size-based pitch variation (larger = lower pitch)
        const avgSize = (size1 + size2) / 2;
        const sizeMultiplier = constrain(map(avgSize / baseSize, 0.75, 1.5, 1.2, 0.8), 0.7, 1.3);

        freq1 *= velocityMultiplier * sizeMultiplier;
        freq2 *= velocityMultiplier * sizeMultiplier;

        // Volume based on velocity
        const vol = constrain(map(velocity, 0, 15, 0.1, 0.4), 0.05, 0.4);

        // Density-based volume reduction
        const densityScale = constrain(map(particles.length, 0, MAX_PARTICLES, 1.0, 0.3), 0.2, 1.0);

        this.playTone(freq1, 0.05, 'sine', { attack: 0.02, release: 0.25 }, vol * densityScale);
        setTimeout(() => {
            this.playTone(freq2, 0.05, 'triangle', { attack: 0.02, release: 0.25 }, vol * densityScale * 0.6);
        }, 20);
    }

    wallBounce(velocity) {
        const now = Date.now();

        if (now - this.lastWallBounceSound < this.wallBounceCooldown) {
            return;
        }
        this.lastWallBounceSound = now;

        this.ensureAudioContext();

        // Low tone with velocity variation
        const freq = this.scale.G4 * 0.5; // G3
        const velocityMultiplier = constrain(map(velocity, 0, 15, 0.8, 1.2), 0.7, 1.3);

        this.playTone(freq * velocityMultiplier, 0.1, 'triangle', { attack: 0.015, release: 0.3 }, 0.2);
    }

    acidConvert() {
        this.ensureAudioContext();
        // Sharp "fizz" sound using bandpass white noise
        this.playNoise('bandpass', 800, 1200, 0.2, 0.15);
    }

    acidCorrosion() {
        // Continuous subtle hiss - called periodically
        // This would need to be managed differently (continuous tone)
        // For now, play very brief hiss
        this.ensureAudioContext();
        this.playNoise('lowpass', 200, 400, 0.1, 0.03);
    }

    particleSplit(fragmentCount) {
        this.ensureAudioContext();

        // Rapid cluster of notes matching fragment count
        const pentatonicPool = [this.scale.C5, this.scale.D5, this.scale.E5, this.scale.G5, this.scale.A5, this.scale.C6];
        const notes = [];

        for (let i = 0; i < fragmentCount; i++) {
            notes.push(pentatonicPool[Math.floor(Math.random() * pentatonicPool.length)]);
        }

        this.playArpeggio(notes, 0.015, 'triangle', { attack: 0.01, release: 0.25 }, 0.2);
    }

    // ========================================================================
    // UI BUTTON SOUNDS
    // ========================================================================

    colorPickerToggle(toRandom) {
        this.ensureAudioContext();

        if (toRandom) {
            // Random mode: ascending C5 → E5
            this.playTone(this.scale.C5, 0.05, 'triangle', { attack: 0.01, release: 0.12 }, 0.25);
            setTimeout(() => {
                this.playTone(this.scale.E5, 0.05, 'triangle', { attack: 0.01, release: 0.12 }, 0.25);
            }, 100);
        } else {
            // Custom mode: descending E5 → C5
            this.playTone(this.scale.E5, 0.05, 'triangle', { attack: 0.01, release: 0.12 }, 0.25);
            setTimeout(() => {
                this.playTone(this.scale.C5, 0.05, 'triangle', { attack: 0.01, release: 0.12 }, 0.25);
            }, 100);
        }
    }

    shapeSelect() {
        this.ensureAudioContext();

        // Cycle through C5 → D5 → E5
        const shapeIndex = shapes.indexOf(currentShape);
        const notes = [this.scale.C5, this.scale.D5, this.scale.E5];
        const freq = notes[shapeIndex % 3];

        this.playTone(freq, 0.06, 'triangle', { attack: 0.015, release: 0.15 }, 0.3);
    }

    cutButton() {
        this.ensureAudioContext();

        // Rapid descending glissando (600 Hz → 200 Hz, 80ms)
        this.playGlissando(600, 200, 0.08, 'triangle', 0.25);
    }

    lockButton(isLocking) {
        this.ensureAudioContext();

        if (isLocking) {
            // Locking: rising octave G4 → G5
            this.playGlissando(this.scale.G4, this.scale.G5, 0.05, 'square', 0.2);
        } else {
            // Unlocking: falling octave G5 → G4
            this.playGlissando(this.scale.G5, this.scale.G4, 0.05, 'square', 0.2);
        }
    }

    clearButton() {
        this.ensureAudioContext();

        // Descending pentatonic scale
        const notes = [this.scale.C5, this.scale.A4, this.scale.G4, this.scale.E4, this.scale.C4];
        this.playArpeggio(notes, 0.06, 'sine', { attack: 0.02, release: 0.2 }, 0.25);
    }

    helpButton(isOpening) {
        this.ensureAudioContext();

        if (isOpening) {
            // Open: ascending perfect fifth C5 → G5
            this.playTone(this.scale.C5, 0.06, 'sine', { attack: 0.02, release: 0.18 }, 0.25);
            setTimeout(() => {
                this.playTone(this.scale.G5, 0.06, 'sine', { attack: 0.02, release: 0.18 }, 0.25);
            }, 80);
        } else {
            // Close: descending perfect fifth G5 → C5
            this.playTone(this.scale.G5, 0.06, 'sine', { attack: 0.02, release: 0.18 }, 0.25);
            setTimeout(() => {
                this.playTone(this.scale.C5, 0.06, 'sine', { attack: 0.02, release: 0.18 }, 0.25);
            }, 80);
        }
    }

    // ========================================================================
    // SELECTION & GESTURE SOUNDS
    // ========================================================================

    selectParticle() {
        this.ensureAudioContext();
        this.playTone(this.scale.E5, 0.06, 'sine', { attack: 0.01, release: 0.08 }, 0.2);
    }

    deselectParticle() {
        this.ensureAudioContext();
        this.playTone(this.scale.C5, 0.06, 'sine', { attack: 0.01, release: 0.08 }, 0.2);
    }

    marqueeSelect(particleCount) {
        this.ensureAudioContext();

        // Play notes from pentatonic scale based on count
        let freq;
        if (particleCount <= 5) freq = this.scale.C5;
        else if (particleCount <= 10) freq = this.scale.D5;
        else if (particleCount <= 20) freq = this.scale.E5;
        else if (particleCount <= 40) freq = this.scale.G5;
        else freq = this.scale.A5;

        this.playTone(freq, 0.05, 'sine', { attack: 0.015, release: 0.15 }, 0.15);
    }

    hoverParticle() {
        const now = Date.now();

        if (now - this.lastHoverSound < this.hoverCooldown) {
            return;
        }
        this.lastHoverSound = now;

        this.ensureAudioContext();
        this.playTone(this.scale.C6, 0.03, 'sine', { attack: 0.01, release: 0.1 }, 0.1);
    }

    longPressSelect() {
        this.ensureAudioContext();

        // Rising glissando C4 → C5 over 500ms
        this.playGlissando(this.scale.C4, this.scale.C5, 0.5, 'sine', 0.2);
    }

    twoFingerTap() {
        this.ensureAudioContext();

        // Descending sweep 800 Hz → 200 Hz
        this.playGlissando(800, 200, 0.3, 'sine', 0.25);
    }

    threeFingerTap() {
        this.ensureAudioContext();

        // Wide descending glissando 1200 Hz → 100 Hz
        this.playGlissando(1200, 100, 0.5, 'triangle', 0.3);
    }

    deleteParticles(count = 1) {
        this.ensureAudioContext();

        // Sucking/vacuum sound - descending sweep with filtered noise
        // Duration and intensity based on particle count
        const duration = Math.min(0.15 + (count * 0.01), 0.4); // 150ms-400ms
        const volume = Math.min(0.15 + (count * 0.005), 0.35); // Scale with count

        // Descending pitch sweep for suction effect
        this.playGlissando(600, 150, duration, 'sine', volume * 0.7);

        // Add filtered noise for texture
        if (this.audioContext && !this.isMuted && this.activeOscillators < this.maxOscillators) {
            this.activeOscillators++;

            const now = this.audioContext.currentTime;
            const bufferSize = this.audioContext.sampleRate * duration;
            const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
            const data = buffer.getChannelData(0);

            // Generate white noise
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = this.audioContext.createBufferSource();
            noise.buffer = buffer;

            // Bandpass filter that sweeps down
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 800;
            filter.frequency.exponentialRampToValueAtTime(200, now + duration);
            filter.Q.value = 2;

            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = volume * 0.4;
            gainNode.gain.linearRampToValueAtTime(0, now + duration);

            noise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.masterGain);

            noise.start(now);

            setTimeout(() => {
                this.activeOscillators--;
            }, duration * 1000);
        }
    }

    // ========================================================================
    // VOLUME & MUTE CONTROLS
    // ========================================================================

    setVolume(value) {
        this.volume = constrain(value, 0, 1);

        if (this.masterGain && !this.isMuted) {
            this.masterGain.gain.value = this.volume;
        }

        this.savePreferences();
    }

    toggleMute() {
        this.isMuted = !this.isMuted;

        if (this.masterGain) {
            this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
        }

        this.savePreferences();
        return this.isMuted;
    }

    getMuted() {
        return this.isMuted;
    }

    getVolume() {
        return this.volume;
    }
}

/**
 * Retro8BitSoundPack - 8-bit video game style sound effects
 *
 * Uses chromatic scale with square/pulse waves for classic chiptune aesthetic.
 * Inspired by NES/Game Boy era sound design with sharp envelopes and short durations.
 */
class Retro8BitSoundPack extends BaseSoundPack {
    constructor() {
        super();

        // Chromatic scale (12-TET) for 8-bit aesthetic
        this.scale = {
            C4: 261.63, Cs4: 277.18, D4: 293.66, Ds4: 311.13,
            E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.00,
            Gs4: 415.30, A4: 440.00, As4: 466.16, B4: 493.88,
            C5: 523.25, Cs5: 554.37, D5: 587.33, Ds5: 622.25,
            E5: 659.25, F5: 698.46, Fs5: 739.99, G5: 783.99,
            Gs5: 830.61, A5: 880.00, As5: 932.33, B5: 987.77,
            C6: 1046.50
        };

        this.init();
    }

    /**
     * Play a square wave tone with configurable duty cycle
     * @param {number} freq - Frequency in Hz
     * @param {number} duration - Duration in seconds
     * @param {number} dutyCycle - Duty cycle (0.5 = 50%, 0.25 = 25%)
     * @param {number} volume - Volume (0-1)
     */
    playSquareWave(freq, duration, dutyCycle = 0.5, volume = 0.3) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;

        // Use square wave for 8-bit sound
        const osc = this.audioContext.createOscillator();
        osc.type = 'square';
        osc.frequency.value = freq;

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0;

        // Sharp attack/release for 8-bit character
        gainNode.gain.linearRampToValueAtTime(volume * this.volume, now + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        osc.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    /**
     * Play arpeggio of square waves
     * @param {Array} frequencies - Array of frequencies
     * @param {number} stagger - Delay between notes in seconds
     */
    playPulseArpeggio(frequencies, stagger = 0.05) {
        frequencies.forEach((freq, i) => {
            setTimeout(() => {
                this.playSquareWave(freq, 0.08, 0.5, 0.25);
            }, i * stagger * 1000);
        });
    }

    // ========================================================================
    // PARTICLE PHYSICS SOUNDS (6 methods)
    // ========================================================================

    particleCreate(count) {
        this.ensureAudioContext();

        // 8-bit ascending chromatic run
        const notes = [this.scale.C4, this.scale.E4, this.scale.G4, this.scale.C5];
        const numNotes = Math.min(4, Math.ceil(count / 15));

        this.playPulseArpeggio(notes.slice(0, numNotes), 0.05);
    }

    particleCollision(velocity, size1, size2) {
        const now = Date.now();
        if (now - this.lastCollisionSound < this.collisionCooldown) return;
        this.lastCollisionSound = now;

        this.ensureAudioContext();

        // Quick "blip" sound - higher velocity = higher pitch
        const baseFreq = this.scale.C5;
        const velocityMultiplier = constrain(map(velocity, 0, 15, 0.8, 1.5), 0.7, 1.7);
        const volume = constrain(map(velocity, 0, 15, 0.1, 0.3), 0.1, 0.3);

        this.playSquareWave(baseFreq * velocityMultiplier, 0.04, 0.25, volume);
    }

    wallBounce(velocity) {
        const now = Date.now();
        if (now - this.lastWallBounceSound < this.wallBounceCooldown) return;
        this.lastWallBounceSound = now;

        this.ensureAudioContext();

        // Low "thud" with quick pitch drop
        this.playSquareWave(this.scale.C4, 0.12, 0.5, 0.25);
    }

    acidConvert() {
        this.ensureAudioContext();

        // Sharp high-pitched beep for acid conversion
        this.playSquareWave(this.scale.C6, 0.15, 0.25, 0.2);
        setTimeout(() => {
            this.playSquareWave(this.scale.G5, 0.15, 0.25, 0.15);
        }, 80);
    }

    acidCorrosion() {
        this.ensureAudioContext();

        // Subtle low frequency pulse
        this.playSquareWave(this.scale.C4, 0.08, 0.5, 0.05);
    }

    particleSplit(fragmentCount) {
        this.ensureAudioContext();

        // Rapid cluster of notes matching fragment count
        const notes = [this.scale.C5, this.scale.E5, this.scale.G5, this.scale.C6];
        const numNotes = Math.min(fragmentCount, 8);

        for (let i = 0; i < numNotes; i++) {
            const freq = notes[Math.floor(Math.random() * notes.length)];
            setTimeout(() => {
                this.playSquareWave(freq, 0.06, 0.25, 0.2);
            }, i * 15);
        }
    }

    // ========================================================================
    // UI BUTTON SOUNDS (6 methods)
    // ========================================================================

    colorPickerToggle(toRandom) {
        this.ensureAudioContext();

        if (toRandom) {
            // Ascending beep for random mode
            this.playSquareWave(this.scale.C5, 0.08, 0.5, 0.25);
            setTimeout(() => {
                this.playSquareWave(this.scale.E5, 0.08, 0.5, 0.25);
            }, 100);
        } else {
            // Descending beep for custom mode
            this.playSquareWave(this.scale.E5, 0.08, 0.5, 0.25);
            setTimeout(() => {
                this.playSquareWave(this.scale.C5, 0.08, 0.5, 0.25);
            }, 100);
        }
    }

    shapeSelect() {
        this.ensureAudioContext();

        // Quick blip that cycles through pitches
        const notes = [this.scale.C5, this.scale.D5, this.scale.E5];
        const freq = notes[Math.floor(Math.random() * notes.length)];
        this.playSquareWave(freq, 0.06, 0.5, 0.25);
    }

    cutButton() {
        this.ensureAudioContext();

        // Descending chromatic scale for "cut"
        const notes = [this.scale.E5, this.scale.D5, this.scale.C5];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playSquareWave(freq, 0.05, 0.5, 0.2);
            }, i * 30);
        });
    }

    lockButton(isLocking) {
        this.ensureAudioContext();

        if (isLocking) {
            // Rising pitch for lock
            this.playSquareWave(this.scale.G4, 0.08, 0.5, 0.2);
            setTimeout(() => {
                this.playSquareWave(this.scale.C5, 0.08, 0.5, 0.2);
            }, 60);
        } else {
            // Falling pitch for unlock
            this.playSquareWave(this.scale.C5, 0.08, 0.5, 0.2);
            setTimeout(() => {
                this.playSquareWave(this.scale.G4, 0.08, 0.5, 0.2);
            }, 60);
        }
    }

    clearButton() {
        this.ensureAudioContext();

        // Descending arpeggio
        const notes = [this.scale.C5, this.scale.A4, this.scale.G4, this.scale.E4, this.scale.C4];
        this.playPulseArpeggio(notes, 0.06);
    }

    helpButton(isOpening) {
        this.ensureAudioContext();

        if (isOpening) {
            // Perfect fifth up
            this.playSquareWave(this.scale.C5, 0.08, 0.5, 0.25);
            setTimeout(() => {
                this.playSquareWave(this.scale.G5, 0.08, 0.5, 0.25);
            }, 80);
        } else {
            // Perfect fifth down
            this.playSquareWave(this.scale.G5, 0.08, 0.5, 0.25);
            setTimeout(() => {
                this.playSquareWave(this.scale.C5, 0.08, 0.5, 0.25);
            }, 80);
        }
    }

    // ========================================================================
    // SELECTION & GESTURE SOUNDS (8 methods)
    // ========================================================================

    selectParticle() {
        this.ensureAudioContext();

        // High pitched blip
        this.playSquareWave(this.scale.E5, 0.06, 0.5, 0.2);
    }

    deselectParticle() {
        this.ensureAudioContext();

        // Lower pitched blip
        this.playSquareWave(this.scale.C5, 0.06, 0.5, 0.2);
    }

    marqueeSelect(particleCount) {
        this.ensureAudioContext();

        // Context-aware pitch based on particle count
        let freq;
        if (particleCount <= 5) freq = this.scale.C5;
        else if (particleCount <= 10) freq = this.scale.D5;
        else if (particleCount <= 20) freq = this.scale.E5;
        else if (particleCount <= 40) freq = this.scale.G5;
        else freq = this.scale.A5;

        this.playSquareWave(freq, 0.08, 0.5, 0.25);
    }

    hoverParticle() {
        const now = Date.now();
        if (now - this.lastHoverSound < this.hoverCooldown) return;
        this.lastHoverSound = now;

        this.ensureAudioContext();

        // Very high, short blip
        this.playSquareWave(this.scale.C6, 0.03, 0.25, 0.1);
    }

    longPressSelect() {
        this.ensureAudioContext();

        // Rising chromatic scale
        const notes = [this.scale.C4, this.scale.E4, this.scale.G4, this.scale.C5];
        this.playPulseArpeggio(notes, 0.12);
    }

    twoFingerTap() {
        this.ensureAudioContext();

        // Quick descending blip
        this.playSquareWave(this.scale.G5, 0.06, 0.25, 0.25);
        setTimeout(() => {
            this.playSquareWave(this.scale.C5, 0.06, 0.25, 0.25);
        }, 50);
    }

    threeFingerTap() {
        this.ensureAudioContext();

        // Wider descending pattern
        const notes = [this.scale.C6, this.scale.G5, this.scale.C5];
        this.playPulseArpeggio(notes, 0.08);
    }

    deleteParticles(count = 1) {
        this.ensureAudioContext();

        // Descending arpeggio - duration based on count
        const numNotes = Math.min(Math.ceil(count / 5), 5);
        const notes = [this.scale.E5, this.scale.D5, this.scale.C5, this.scale.G4, this.scale.C4];

        this.playPulseArpeggio(notes.slice(0, numNotes), 0.05);
    }
}

/**
 * OrchestraSoundPack - Classical orchestra instrumentation
 *
 * Uses traditional C major scale with orchestral synthesis techniques:
 * - Strings: Sawtooth waves with filter sweeps
 * - Brass: Square waves with formant filtering
 * - Woodwinds: Sine waves with subtle noise
 * - Percussion: Noise bursts with tuned resonance
 */
class OrchestraSoundPack extends BaseSoundPack {
    constructor() {
        super();

        // Traditional C major scale (multiple octaves)
        this.scale = {
            C3: 130.81,
            D3: 146.83,
            E3: 164.81,
            F3: 174.61,
            G3: 196.00,
            A3: 220.00,
            B3: 246.94,
            C4: 261.63,
            D4: 293.66,
            E4: 329.63,
            F4: 349.23,
            G4: 392.00,
            A4: 440.00,
            B4: 493.88,
            C5: 523.25,
            D5: 587.33,
            E5: 659.25,
            F5: 698.46,
            G5: 783.99,
            A5: 880.00,
            B5: 987.77,
            C6: 1046.50
        };

        this.init();
    }

    // ========================================================================
    // HELPER METHODS - Orchestral Synthesis
    // ========================================================================

    /**
     * Play string section sound with sawtooth wave and filter sweep
     */
    playStrings(frequency, duration, volume = 0.3) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const attack = 0.08;
        const release = 0.4;

        // Sawtooth oscillator for rich harmonics
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = frequency;

        // Lowpass filter sweep for natural string attack
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.frequency.exponentialRampToValueAtTime(3000, now + attack);
        filter.Q.value = 1;

        // Envelope with slow attack
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0;
        gainNode.gain.linearRampToValueAtTime(volume, now + attack);
        gainNode.gain.linearRampToValueAtTime(volume * 0.6, now + attack + duration);
        gainNode.gain.linearRampToValueAtTime(0, now + attack + duration + release);

        // Connect: osc → filter → gain → master
        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + attack + duration + release);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    /**
     * Play brass stab with square wave and sharp attack
     */
    playBrass(frequency, duration, volume = 0.35) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const attack = 0.02;
        const release = 0.3;

        // Square wave for brass character
        const osc = this.audioContext.createOscillator();
        osc.type = 'square';
        osc.frequency.value = frequency;

        // Slight pitch bend up at start (brass attack characteristic)
        osc.frequency.setValueAtTime(frequency * 1.05, now);
        osc.frequency.exponentialRampToValueAtTime(frequency, now + attack);

        // Formant-like filtering for brass timbre
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1500;
        filter.Q.value = 3;

        // Sharp attack envelope
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0;
        gainNode.gain.linearRampToValueAtTime(volume, now + attack);
        gainNode.gain.linearRampToValueAtTime(volume * 0.5, now + attack + duration);
        gainNode.gain.linearRampToValueAtTime(0, now + attack + duration + release);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + attack + duration + release);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    /**
     * Play woodwind sound with sine wave (pure tone)
     */
    playWoodwind(frequency, duration, volume = 0.25) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const attack = 0.05;
        const release = 0.2;

        // Sine wave for woodwind purity
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency;

        // Gentle envelope
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = 0;
        gainNode.gain.linearRampToValueAtTime(volume, now + attack);
        gainNode.gain.linearRampToValueAtTime(volume * 0.6, now + attack + duration);
        gainNode.gain.linearRampToValueAtTime(0, now + attack + duration + release);

        osc.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + attack + duration + release);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    /**
     * Play pizzicato (plucked string) - short, percussive
     */
    playPizzicato(frequency, volume = 0.3) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const attack = 0.005;
        const decay = 0.15;

        // Sawtooth for string character, but very short
        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = frequency;

        // Very fast attack, quick decay
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + decay);

        osc.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + decay);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    /**
     * Play timpani (orchestral bass drum) with tuned resonance
     */
    playTimpani(frequency, volume = 0.4) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const duration = 0.3;

        // Low sine wave for pitch
        const osc = this.audioContext.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency;

        // Noise for attack
        const bufferSize = this.audioContext.sampleRate * 0.05;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        // Noise filter
        const noiseFilter = this.audioContext.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 200;

        // Gain for oscillator (pitch)
        const oscGain = this.audioContext.createGain();
        oscGain.gain.value = volume;
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        // Gain for noise
        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.value = volume * 0.5;
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(oscGain);
        oscGain.connect(this.masterGain);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration);
        noise.start(now);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    /**
     * Play harp glissando (rapid ascending notes)
     */
    playHarpGlissando(startFreq, endFreq, duration, volume = 0.25) {
        if (!this.audioContext || this.isMuted) {
            return;
        }

        this.ensureAudioContext();

        // Find notes between start and end frequencies
        const scaleNotes = Object.values(this.scale).sort((a, b) => a - b);
        const notes = scaleNotes.filter(f => f >= startFreq && f <= endFreq);

        const noteInterval = (duration * 1000) / notes.length;

        notes.forEach((freq, index) => {
            setTimeout(() => {
                this.playPizzicato(freq, volume * 0.8);
            }, index * noteInterval);
        });
    }

    /**
     * Play string section arpeggio (ascending scale)
     */
    playStringArpeggio(frequencies, stagger = 0.08, volume = 0.25) {
        frequencies.forEach((freq, index) => {
            setTimeout(() => {
                this.playStrings(freq, 0.15, volume);
            }, index * stagger * 1000);
        });
    }

    /**
     * Play wood block sound - sharp, percussive click
     */
    playWoodBlock(frequency, volume = 0.3) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const duration = 0.04;

        // Triangle wave for woody character
        const osc = this.audioContext.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = frequency;

        // Highpass filter for click character
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 800;
        filter.Q.value = 1;

        // Very fast decay
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    /**
     * Play snare drum sound - noise burst with tuned resonance
     */
    playSnareDrum(volume = 0.35) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const duration = 0.15;

        // Create noise for snare rattle
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        // Highpass filter for snare brightness
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        filter.Q.value = 1;

        // Add tonal component (snare shell resonance)
        const osc = this.audioContext.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = 180; // Snare fundamental

        // Noise gain (sharp attack, fast decay)
        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.value = volume;
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        // Tone gain (very subtle)
        const toneGain = this.audioContext.createGain();
        toneGain.gain.value = volume * 0.3;
        toneGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.5);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        osc.connect(toneGain);
        toneGain.connect(this.masterGain);

        noise.start(now);
        osc.start(now);
        osc.stop(now + duration * 0.5);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }

    /**
     * Play cymbal crash - bright noise burst
     */
    playCymbal(volume = 0.3) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const duration = 0.25;

        // Create noise buffer
        const bufferSize = this.audioContext.sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        // Highpass filter for cymbal brightness
        const highpass = this.audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 3000;
        highpass.Q.value = 1;

        // Bandpass for metallic character
        const bandpass = this.audioContext.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.value = 8000;
        bandpass.Q.value = 0.5;

        // Gain envelope - fast attack, medium decay
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        gainNode.gain.linearRampToValueAtTime(volume * 0.6, now + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(highpass);
        highpass.connect(bandpass);
        bandpass.connect(gainNode);
        gainNode.connect(this.masterGain);

        noise.start(now);

        setTimeout(() => {
            this.activeOscillators--;
        }, duration * 1000);
    }

    /**
     * Play triangle (orchestral percussion) - bright metallic ping
     */
    playTriangle(frequency, volume = 0.25) {
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;
        const duration = 0.3;

        // Multiple sine waves for metallic shimmer (inharmonic)
        const frequencies = [frequency, frequency * 2.4, frequency * 3.8, frequency * 5.1];

        frequencies.forEach((freq, index) => {
            const osc = this.audioContext.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gainNode = this.audioContext.createGain();
            const amp = volume / (index + 1); // Higher partials quieter
            gainNode.gain.value = amp;
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

            osc.connect(gainNode);
            gainNode.connect(this.masterGain);

            osc.start(now);
            osc.stop(now + duration);

            if (index === 0) {
                osc.onended = () => {
                    this.activeOscillators--;
                };
            }
        });
    }

    // ========================================================================
    // PARTICLE PHYSICS SOUNDS
    // ========================================================================

    particleCreate(count) {
        this.ensureAudioContext();

        // String section swell - ascending major scale
        const notes = [this.scale.C4, this.scale.E4, this.scale.G4, this.scale.C5, this.scale.E5, this.scale.G5, this.scale.C6];

        const numNotes = Math.min(7, Math.ceil(count / 10));
        const selectedNotes = notes.slice(0, numNotes);

        // Slower, more majestic stagger
        const stagger = count > 40 ? 0.1 : 0.08;

        this.playStringArpeggio(selectedNotes, stagger, 0.2);
    }

    particleCollision(velocity, size1, size2) {
        const now = Date.now();

        if (now - this.lastCollisionSound < this.collisionCooldown) {
            return;
        }
        this.lastCollisionSound = now;

        this.ensureAudioContext();

        // Calculate pitch based on size (larger particles = lower pitch)
        const avgSize = (size1 + size2) / 2;
        const sizeMultiplier = constrain(map(avgSize / baseSize, 0.75, 1.5, 1.3, 0.7), 0.6, 1.4);

        // Volume based on velocity
        const vol = constrain(map(velocity, 0, 15, 0.1, 0.35), 0.05, 0.35);
        const densityScale = constrain(map(particles.length, 0, MAX_PARTICLES, 1.0, 0.3), 0.2, 1.0);

        // Use different percussion instruments based on velocity
        if (velocity > 10) {
            // Very high velocity: Cymbal crash
            this.playCymbal(vol * densityScale * 0.8);
        } else if (velocity > 6) {
            // High velocity: Timpani (kettle drum)
            const velocityMultiplier = constrain(map(velocity, 6, 15, 0.9, 1.2), 0.85, 1.3);
            const freq = this.scale.C3 * sizeMultiplier * velocityMultiplier;
            this.playTimpani(freq, vol * densityScale);
        } else if (velocity > 3) {
            // Medium velocity: Wood block
            const freq = this.scale.G4 * sizeMultiplier;
            this.playWoodBlock(freq, vol * densityScale * 0.9);
        } else {
            // Low velocity: Triangle (bright, delicate)
            const freq = this.scale.C6 * sizeMultiplier;
            this.playTriangle(freq, vol * densityScale * 0.8);
        }
    }

    wallBounce(velocity) {
        const now = Date.now();

        if (now - this.lastWallBounceSound < this.wallBounceCooldown) {
            return;
        }
        this.lastWallBounceSound = now;

        this.ensureAudioContext();

        // Timpani hit - velocity affects pitch slightly
        const baseFreq = this.scale.C3;
        const velocityMultiplier = constrain(map(velocity, 0, 15, 0.9, 1.1), 0.85, 1.15);

        this.playTimpani(baseFreq * velocityMultiplier, 0.25);
    }

    acidConvert() {
        this.ensureAudioContext();
        // Mysterious woodwind flutter descending
        this.playWoodwind(this.scale.A5, 0.05, 0.2);
        setTimeout(() => {
            this.playWoodwind(this.scale.F5, 0.05, 0.18);
        }, 60);
        setTimeout(() => {
            this.playWoodwind(this.scale.D5, 0.08, 0.15);
        }, 120);
    }

    acidCorrosion() {
        this.ensureAudioContext();
        // Very subtle woodwind whisper
        this.playWoodwind(this.scale.E3, 0.1, 0.04);
    }

    particleSplit(fragmentCount) {
        this.ensureAudioContext();

        // Rapid pizzicato cascade
        const majorScalePool = [this.scale.C5, this.scale.D5, this.scale.E5, this.scale.F5, this.scale.G5, this.scale.A5, this.scale.B5, this.scale.C6];
        const notes = [];

        for (let i = 0; i < fragmentCount; i++) {
            notes.push(majorScalePool[Math.floor(Math.random() * majorScalePool.length)]);
        }

        notes.forEach((freq, index) => {
            setTimeout(() => {
                this.playPizzicato(freq, 0.15);
            }, index * 15);
        });
    }

    // ========================================================================
    // UI BUTTON SOUNDS
    // ========================================================================

    colorPickerToggle(toRandom) {
        this.ensureAudioContext();

        if (toRandom) {
            // Harp glissando up
            this.playHarpGlissando(this.scale.C5, this.scale.C6, 0.15, 0.2);
        } else {
            // Harp glissando down
            this.playHarpGlissando(this.scale.C6, this.scale.C5, 0.15, 0.2);
        }
    }

    shapeSelect() {
        this.ensureAudioContext();

        // Woodwind notes cycling through major triad
        const shapeIndex = shapes.indexOf(currentShape);
        const notes = [this.scale.C5, this.scale.E5, this.scale.G5];
        const freq = notes[shapeIndex % 3];

        this.playWoodwind(freq, 0.08, 0.25);
    }

    cutButton() {
        this.ensureAudioContext();

        // Brass section descending stab
        this.playBrass(this.scale.G4, 0.04, 0.25);
        setTimeout(() => {
            this.playBrass(this.scale.E4, 0.04, 0.22);
        }, 50);
        setTimeout(() => {
            this.playBrass(this.scale.C4, 0.06, 0.2);
        }, 100);
    }

    lockButton(isLocking) {
        this.ensureAudioContext();

        if (isLocking) {
            // Brass fanfare ascending
            this.playBrass(this.scale.C4, 0.05, 0.2);
            setTimeout(() => {
                this.playBrass(this.scale.E4, 0.05, 0.22);
            }, 60);
            setTimeout(() => {
                this.playBrass(this.scale.G4, 0.08, 0.25);
            }, 120);
        } else {
            // Brass descending
            this.playBrass(this.scale.G4, 0.05, 0.25);
            setTimeout(() => {
                this.playBrass(this.scale.E4, 0.05, 0.22);
            }, 60);
            setTimeout(() => {
                this.playBrass(this.scale.C4, 0.08, 0.2);
            }, 120);
        }
    }

    clearButton() {
        this.ensureAudioContext();

        // String section descending scale
        const notes = [this.scale.C5, this.scale.B4, this.scale.A4, this.scale.G4, this.scale.F4, this.scale.E4, this.scale.D4, this.scale.C4];
        notes.forEach((freq, index) => {
            setTimeout(() => {
                this.playStrings(freq, 0.08, 0.2);
            }, index * 70);
        });
    }

    helpButton(isOpening) {
        this.ensureAudioContext();

        if (isOpening) {
            // Ascending harp arpeggio
            const notes = [this.scale.C4, this.scale.E4, this.scale.G4, this.scale.C5];
            notes.forEach((freq, index) => {
                setTimeout(() => {
                    this.playPizzicato(freq, 0.25);
                }, index * 40);
            });
        } else {
            // Descending harp arpeggio
            const notes = [this.scale.C5, this.scale.G4, this.scale.E4, this.scale.C4];
            notes.forEach((freq, index) => {
                setTimeout(() => {
                    this.playPizzicato(freq, 0.25);
                }, index * 40);
            });
        }
    }

    // ========================================================================
    // SELECTION & GESTURE SOUNDS
    // ========================================================================

    selectParticle() {
        this.ensureAudioContext();
        // Pizzicato accent
        this.playPizzicato(this.scale.E5, 0.25);
    }

    deselectParticle() {
        this.ensureAudioContext();
        // Softer pizzicato
        this.playPizzicato(this.scale.C5, 0.2);
    }

    marqueeSelect(particleCount) {
        this.ensureAudioContext();

        // Woodwind note based on count
        let freq;
        if (particleCount <= 5) freq = this.scale.C5;
        else if (particleCount <= 10) freq = this.scale.E5;
        else if (particleCount <= 20) freq = this.scale.G5;
        else if (particleCount <= 40) freq = this.scale.C6;
        else freq = this.scale.E6 || this.scale.C6;

        this.playWoodwind(freq, 0.06, 0.18);
    }

    hoverParticle() {
        const now = Date.now();

        if (now - this.lastHoverSound < this.hoverCooldown) {
            return;
        }
        this.lastHoverSound = now;

        this.ensureAudioContext();
        // Delicate pizzicato
        this.playPizzicato(this.scale.C6, 0.12);
    }

    longPressSelect() {
        this.ensureAudioContext();

        // String swell from low to high
        this.playStrings(this.scale.C3, 0.5, 0.15);
        setTimeout(() => {
            this.playStrings(this.scale.G3, 0.4, 0.15);
        }, 100);
        setTimeout(() => {
            this.playStrings(this.scale.C4, 0.3, 0.15);
        }, 200);
        setTimeout(() => {
            this.playStrings(this.scale.E4, 0.2, 0.15);
        }, 300);
    }

    twoFingerTap() {
        this.ensureAudioContext();

        // Quick brass stabs
        this.playBrass(this.scale.G4, 0.05, 0.25);
        setTimeout(() => {
            this.playBrass(this.scale.E4, 0.05, 0.22);
        }, 80);
    }

    threeFingerTap() {
        this.ensureAudioContext();

        // Three brass stabs descending
        this.playBrass(this.scale.C5, 0.05, 0.25);
        setTimeout(() => {
            this.playBrass(this.scale.G4, 0.05, 0.23);
        }, 80);
        setTimeout(() => {
            this.playBrass(this.scale.C4, 0.05, 0.2);
        }, 160);
    }

    deleteParticles(count = 1) {
        this.ensureAudioContext();

        // Descending string glissando with intensity based on count
        const duration = Math.min(0.15 + (count * 0.01), 0.4);
        const volume = Math.min(0.15 + (count * 0.005), 0.3);

        // String section sweep downward
        if (!this.audioContext || this.isMuted || this.activeOscillators >= this.maxOscillators) {
            return;
        }

        this.ensureAudioContext();
        this.activeOscillators++;

        const now = this.audioContext.currentTime;

        const osc = this.audioContext.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 800;
        osc.frequency.exponentialRampToValueAtTime(100, now + duration);

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        filter.frequency.exponentialRampToValueAtTime(200, now + duration);

        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        gainNode.gain.linearRampToValueAtTime(0, now + duration);

        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration);

        osc.onended = () => {
            this.activeOscillators--;
        };
    }
}

/**
 * SoundPackManager - Facade for managing and switching between sound packs
 *
 * Maintains backward compatibility by delegating all sound method calls to the
 * currently active sound pack. Handles pack registration, switching, and state
 * preservation (volume/mute) across pack changes.
 */
class SoundPackManager {
    constructor() {
        this.packs = {};           // Registry: { 'original': OriginalSoundPack, ... }
        this.currentPack = null;    // Active pack instance
        this.currentPackId = 'original';
    }

    /**
     * Register a sound pack class
     * @param {string} id - Unique identifier for the pack
     * @param {class} packClass - Sound pack class (must extend BaseSoundPack)
     */
    registerPack(id, packClass) {
        this.packs[id] = packClass;
    }

    /**
     * Switch to a different sound pack
     * @param {string} packId - ID of the pack to switch to
     */
    switchPack(packId) {
        // Validate pack exists
        if (!this.packs[packId]) {
            console.warn(`Sound pack "${packId}" not found. Using original.`);
            packId = 'original';
        }

        // Preserve volume/mute state from current pack
        const preservedVolume = this.currentPack ? this.currentPack.volume : 0.7;
        const preservedMute = this.currentPack ? this.currentPack.isMuted : false;

        // Instantiate new pack
        this.currentPack = new this.packs[packId]();

        // Apply preserved volume/mute
        this.currentPack.volume = preservedVolume;
        this.currentPack.isMuted = preservedMute;
        if (this.currentPack.masterGain) {
            this.currentPack.masterGain.gain.value = preservedMute ? 0 : preservedVolume;
        }

        this.currentPackId = packId;

        // Save to localStorage
        localStorage.setItem('bubbleshop_soundpack', packId);
    }

    /**
     * Load saved sound pack preference from localStorage
     */
    loadSavedPack() {
        const savedPack = localStorage.getItem('bubbleshop_soundpack') || 'original';
        this.switchPack(savedPack);
    }

    // ========================================================================
    // DELEGATED METHODS - Particle Physics Sounds (6)
    // ========================================================================

    particleCreate(count) {
        if (this.currentPack) this.currentPack.particleCreate(count);
    }

    particleCollision(velocity, size1, size2) {
        if (this.currentPack) this.currentPack.particleCollision(velocity, size1, size2);
    }

    wallBounce(velocity) {
        if (this.currentPack) this.currentPack.wallBounce(velocity);
    }

    acidConvert() {
        if (this.currentPack) this.currentPack.acidConvert();
    }

    acidCorrosion() {
        if (this.currentPack) this.currentPack.acidCorrosion();
    }

    particleSplit(fragmentCount) {
        if (this.currentPack) this.currentPack.particleSplit(fragmentCount);
    }

    // ========================================================================
    // DELEGATED METHODS - UI Button Sounds (6)
    // ========================================================================

    colorPickerToggle(toRandom) {
        if (this.currentPack) this.currentPack.colorPickerToggle(toRandom);
    }

    shapeSelect() {
        if (this.currentPack) this.currentPack.shapeSelect();
    }

    cutButton() {
        if (this.currentPack) this.currentPack.cutButton();
    }

    lockButton(isLocking) {
        if (this.currentPack) this.currentPack.lockButton(isLocking);
    }

    clearButton() {
        if (this.currentPack) this.currentPack.clearButton();
    }

    helpButton(isOpening) {
        if (this.currentPack) this.currentPack.helpButton(isOpening);
    }

    // ========================================================================
    // DELEGATED METHODS - Selection & Gesture Sounds (8)
    // ========================================================================

    selectParticle() {
        if (this.currentPack) this.currentPack.selectParticle();
    }

    deselectParticle() {
        if (this.currentPack) this.currentPack.deselectParticle();
    }

    marqueeSelect(particleCount) {
        if (this.currentPack) this.currentPack.marqueeSelect(particleCount);
    }

    hoverParticle() {
        if (this.currentPack) this.currentPack.hoverParticle();
    }

    longPressSelect() {
        if (this.currentPack) this.currentPack.longPressSelect();
    }

    twoFingerTap() {
        if (this.currentPack) this.currentPack.twoFingerTap();
    }

    threeFingerTap() {
        if (this.currentPack) this.currentPack.threeFingerTap();
    }

    deleteParticles(count = 1) {
        if (this.currentPack) this.currentPack.deleteParticles(count);
    }

    // ========================================================================
    // DELEGATED METHODS - Volume Controls (4)
    // ========================================================================

    setVolume(value) {
        if (this.currentPack) this.currentPack.setVolume(value);
    }

    toggleMute() {
        return this.currentPack ? this.currentPack.toggleMute() : false;
    }

    getMuted() {
        return this.currentPack ? this.currentPack.getMuted() : false;
    }

    getVolume() {
        return this.currentPack ? this.currentPack.getVolume() : 0.7;
    }
}