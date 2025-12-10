# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bubbleshop** is a vanilla JavaScript interactive particle physics sandbox built with p5.js (rendering) and Matter.js (2D physics engine). Users create, manipulate, and observe colorful particles with realistic physics, sound effects, and special behaviors like acid corrosion.

## Architecture

### Core Technology Stack
- **p5.js 1.4.0** - Canvas rendering, animation loop, input handling
- **Matter.js 0.18.0** - 2D rigid body physics engine
- **Web Audio API** - Synthesized sound effects using pentatonic scale
- **Vanilla JavaScript** - No build process, runs directly in browser

### File Structure
```
bubbleshop/
├── index.html       # HTML structure, toolbar UI, favicon links
├── main.css         # Styling (glass-morphism toolbar, mobile responsive)
├── main.js          # All application logic (~2200+ lines)
└── IMPROVEMENTS.md  # Historical code review and refactoring notes
```

### Main.js Architecture

**Configuration Section (Lines 1-42)**
- 30+ named constants for physics, particle behavior, timing, and thresholds
- All "magic numbers" extracted for easy tuning
- Examples: `MAX_PARTICLES = 1000`, `PHYSICS_GRAVITY = 0.5`, `LONG_PRESS_DURATION = 500`

**State Variables (Lines 43-88)**
- Matter.js objects: `engine`, `world`, `particles`, `boundaries`
- Selection state: `selectedParticles`, `lockedParticles`, `marqueeStartX/Y`
- Keyboard modifiers: `shiftPressed`, `mKeyPressed`, `xKeyPressed`, `vKeyPressed`
- Sound system: `soundManager`, `currentlyHoveredParticle`

**Core Systems:**
1. **Physics System** (`setupPhysics()`, line ~95)
   - Configures Matter.js engine with custom gravity
   - Registers collision event handlers (`handleCollisionStart`, `handleCollisionSound`)
   - Creates boundaries (walls/floor) that resize with window

2. **Particle System** (`PhysicsParticle` class, line ~550)
   - Each particle has: position, velocity, size, color, shape (circle/square/triangle)
   - Special types: regular vs. acid particles
   - Acid particles: slowly shrink over time, corrode other particles on collision
   - Helper: `createPhysicsBody()` generates Matter.js bodies for all 3 shapes

3. **Sound System** (`SoundManager` class, line ~1850)
   - Web Audio API with single AudioContext + master gain node
   - C major pentatonic scale (261.63Hz - 1046.50Hz) for harmonic consistency
   - 36+ sound methods for all interactions (UI buttons, physics events, gestures)
   - Context-aware: pitch/volume varies by particle velocity, size, count
   - Rate limiting prevents audio spam (cooldowns on collision/hover sounds)
   - Velocity thresholds: `MIN_PARTICLE_COLLISION_VELOCITY = 2.0`, `MIN_WALL_COLLISION_VELOCITY = 3.0`
   - Hover tracking: only plays sound on particle entry, not continuous movement

4. **Input System**
   - Mouse: click to create, drag to move, Shift+drag for marquee selection, hover for preview
   - Touch: tap to create, drag to select/move, long-press for selection mode, pinch to zoom spawn count
   - Keyboard modifiers: M (split), X (split), V (acid convert), L (lock), Backspace (delete), Shift (marquee)

5. **Rendering Pipeline** (`draw()` loop, line ~210)
   - p5.js animation loop at 60fps
   - Cached background gradient (performance optimization)
   - Particles rendered with custom shapes + outline for selected
   - Marquee selection box rendered during Shift+drag
   - Particle count updated every 10 frames

### Key Functions & Responsibilities

**Particle Lifecycle:**
- `createParticles(x, y, count)` - Spawn particles at position with initial velocity spread
- `removeParticles(particlesToRemove)` - Clean up particles and their physics bodies
- `splitParticle(particle)` - Split into 4-8 fragments with outward velocity
- `PhysicsParticle.update()` - Sync p5.js display with Matter.js physics body

**Collision Handling:**
- `handleCollisionStart(event)` - Acid particle corrosion logic (event-driven, O(n) not O(n²))
- `handleCollisionSound(event)` - Trigger collision sounds with velocity/size context
- Both handlers called from single Matter.js collision event listener

**Selection & Manipulation:**
- `selectParticlesInRadius(x, y, radius)` - Touch/click selection
- `selectParticlesInBox(x1, y1, x2, y2)` - Marquee selection
- `toggleLockMode()` - Lock/unlock selected particles (freeze physics)
- `toggleCutMode()` - Delete selected particles

**UI Integration:**
- `setupControls()` (line ~1197) - Wire all button/slider/keyboard event handlers
- `updateButtonStates()` - Enable/disable buttons based on particle selection state
- Accessibility: all buttons have aria-labels, tooltips, keyboard shortcuts

## Development Workflow

### Running Locally
This is a static web app with no build process. Serve the directory with any HTTP server:

```bash
# Python 3
python3 -m http.server 5501

# Node.js (http-server)
npx http-server -p 5501

# VS Code Live Server extension
# Right-click index.html > "Open with Live Server"
```

Access at `http://localhost:5501/`

### No Build/Test Commands
- No package.json, no dependencies to install
- No test suite currently implemented
- Libraries loaded from CDN (p5.js, Matter.js)

### Testing Approach
Manual testing required (see IMPROVEMENTS.md lines 124-135):
1. Particle creation and physics behavior
2. Acid particle collision and shrinking
3. Selection modes (mouse, touch, marquee)
4. All keyboard shortcuts (L, C, X, V, ?, Backspace, Esc)
5. Toolbar buttons functionality
6. Touch gestures on mobile (long-press, pinch, two/three-finger taps)
7. Sound effects for all interactions
8. Screen reader accessibility
9. Performance with high particle counts (500-1000)
10. Window resize behavior

## Code Conventions

### Constants Over Magic Numbers
Always define constants at the top of main.js rather than hardcoding values. Example:
```javascript
// Good
const ACID_STRENGTH = 0.1;
particle.size *= (1 - ACID_STRENGTH);

// Bad
particle.size *= 0.9;
```

### JSDoc Comments
All major functions have JSDoc with `@param` and `@returns`. Maintain this when adding new functions.

### Helper Functions
Use `createPhysicsBody(shape, x, y, size, options)` instead of duplicating Matter.js body creation code.

### Collision Detection
Use Matter.js event-driven collision handlers, NOT nested loops checking all particles against each other (performance disaster).

### Sound Design Philosophy
- All sounds use C major pentatonic scale for harmonic consistency
- Use ADSR envelopes (attack/release) for smooth, non-jarring sounds
- Rate limit sounds to prevent audio spam
- Context-aware parameters: larger particles = lower pitch, faster velocity = louder

### Accessibility
- Add `aria-label` to all interactive elements
- Update `aria-disabled` dynamically
- Include keyboard shortcuts in tooltips
- Use semantic HTML where possible

## Important Implementation Details

### Physics Body Shape Creation
The `createPhysicsBody()` helper handles all three shapes:
- **Circle**: `Matter.Bodies.circle()`
- **Square**: `Matter.Bodies.rectangle()` with chamfer
- **Triangle**: `Matter.Bodies.polygon(x, y, 3, size)` with custom vertices for equilateral triangle

### Acid Particle Behavior
- Created with V + Click modifier
- Shrinks continuously at `ACID_DECAY_RATE` per interval
- On collision with regular particles: reduces their size by `ACID_STRENGTH`
- Visual: rendered with alpha channel and special hue
- Physics: handled in `handleCollisionStart()` via Matter.js collision events

### Selection State Management
- `selectedParticles[]` - particles with selection outline
- `lockedParticles[]` - particles with static physics bodies (frozen)
- Selection affects button states: Cut/Lock enabled only when `selectedParticles.length > 0`
- Clear button enabled only when `particles.length > 0`

### Sound Rate Limiting Strategy
- Collision sounds: 50ms cooldown, prioritize highest velocity
- Hover sounds: only trigger on particle entry (tracked via `currentlyHoveredParticle`)
- Wall bounces: 100ms cooldown
- Max 30 simultaneous oscillators, max 10 active collision sounds

### Mobile Touch Handling
- Single tap: create particles
- Long press (500ms): enter selection mode
- Drag in selection mode: select particles in radius
- Two-finger tap: delete particles in radius (with snip sound)
- Three-finger tap: delete particles in radius (with snip sound)
- Pinch: adjust spawn count (10-100 range)

## Performance Considerations

- **Particle limit**: Hard cap at `MAX_PARTICLES = 1000`
- **Background caching**: Gradient pre-rendered to off-screen buffer
- **Collision optimization**: Event-driven (not O(n²) loops)
- **Sound throttling**: Rate limiters on high-frequency events
- **Particle count updates**: Only every 10 frames, not every frame

## Git Workflow

Standard git workflow. Recent commits show descriptive messages with Co-Authored-By Claude.

## Browser Compatibility

- Chrome, Firefox, Safari (desktop)
- iOS Safari, Android Chrome (mobile with touch support)
- Requires Web Audio API support
- Responsive design with mobile-specific CSS breakpoints (@media queries)
