# Bubbleshop Sound Packs

This document describes the modular sound pack system and provides ideas for future sound packs.

## Current Sound Packs

### Original (Default)
**Theme:** Smooth, musical, harmonious
**Scale:** C major pentatonic (C4, D4, E4, G4, A4, C5, D5, E5, G5, A5, C6)
**Synthesis:** Sine/triangle waves with ADSR envelopes
**Character:** Calming, melodic, suitable for creative/meditative use

**Notable Sounds:**
- Particle creation: Ascending pentatonic arpeggio
- Collisions: Gentle two-tone harmony
- Wall bounces: Low resonant tone
- UI interactions: Pleasant musical intervals

### Retro 8-Bit
**Theme:** Classic video game nostalgia (NES/Game Boy era)
**Scale:** Chromatic 12-TET (24 notes C4-C6)
**Synthesis:** Square waves (50% and 25% duty cycle)
**Character:** Sharp, percussive, nostalgic

**Notable Sounds:**
- Particle creation: Quick chromatic blips
- Collisions: Sharp square wave hits (velocity-based pitch)
- Wall bounces: Low "thud" with 50% duty cycle
- UI interactions: Classic video game beeps and boops

---

## Future Sound Pack Ideas

### 1. Ambient/Spacey 🌌

**Theme:** Ethereal, atmospheric, cosmic soundscapes
**Target mood:** Zen, meditative, otherworldly

**Technical Specs:**
- **Scale:** Whole tone scale (C4, D4, E4, F#4, G#4, A#4, C5, D5, E5, F#5, G#5, A#5, C6)
- **Synthesis:**
  - Sine waves with very long attack (0.2-0.5s)
  - Convolution reverb or long delays (3-5s decay)
  - Low-frequency drones (60-120 Hz sub-bass)
- **Effects:**
  - Wide stereo panning for spatial depth
  - Pitch LFO for slight detuning/chorus effect
  - Lowpass filter sweeps

**Sound Design Notes:**
```javascript
// Helper method example
playSpaciousSound(freq, duration, volume = 0.3) {
    // Very slow attack for dreamy quality
    const attack = 0.3;
    const release = 3.0; // Long reverb tail

    // Use multiple detuned oscillators for width
    const detune = [-7, 0, 7]; // cents
    detune.forEach(cents => {
        // Create oscillator with slight detuning
        // Add to ambient pad texture
    });
}

// Example: Particle creation
particleCreate(count) {
    // Slow rising sweep with long sustain
    // Whole tone ascending: C4 → D4 → E4 → F#4
    // 300ms stagger between notes
    // Each note sustains for 2-3 seconds
}
```

**Key Characteristics:**
- Particle creation: Slow rising pads
- Collisions: Soft "shimmer" sounds
- Wall bounces: Deep sub-bass rumble
- UI interactions: Gentle wind-like whooshes

---

### 2. Nature/Organic 🌿

**Theme:** Natural sounds, wood, water, wind
**Target mood:** Earthy, grounded, natural

**Technical Specs:**
- **Scale:** Just intonation / natural harmonic series (C4: 264Hz, E4: 330Hz, G4: 396Hz, C5: 528Hz, etc.)
- **Synthesis:**
  - Pitched noise bursts for water droplets
  - Frequency modulation for bird chirps
  - Filtered pink/brown noise for rustling
  - Karplus-Strong for plucked string/wood sounds
- **Character:** Organic textures with natural pitch variation (±5-10%)

**Sound Design Notes:**
```javascript
// Helper method example
playWaterDroplet(pitch, volume = 0.2) {
    // Short burst of bandpass filtered noise
    // Rapid pitch decay from high to low
    // Use: 800Hz → 200Hz over 50ms
    // Bandpass filter: 1000-3000Hz
    // Random pitch variation ±10%
}

playWoodBlock(pitch, volume = 0.25) {
    // Triangle wave with fast decay
    // Brief burst (30-40ms)
    // Frequency slightly randomized
}

// Example: Particle collision
particleCollision(velocity, size1, size2) {
    // Water droplet sound
    // Higher velocity = higher pitch
    // Add subtle random variation for organic feel
    const pitchVariation = random(0.9, 1.1);
    playWaterDroplet(baseFreq * pitchVariation);
}
```

**Key Characteristics:**
- Particle creation: Rain droplet sequence
- Collisions: Water splashes or wood taps
- Wall bounces: Deep wooden thud
- UI interactions: Bamboo chimes, rustling leaves

**Implementation Priority:** Medium - Requires noise synthesis

---

### 3. Orchestral 🎻

**Theme:** Classical orchestra instrumentation
**Target mood:** Grand, cinematic, elegant

**Technical Specs:**
- **Scale:** Traditional major/minor scales (C major: C, D, E, F, G, A, B, C)
- **Synthesis:**
  - **Strings:** Sawtooth waves with lowpass filter sweep
  - **Brass:** Square waves with formant filtering (peaks at 500Hz, 1500Hz, 2500Hz)
  - **Woodwinds:** Sine + small amount of noise
  - **Percussion:** Short noise bursts with EQ
- **Articulation:** Varying attack times (strings: 0.05s, brass: 0.02s, percussion: 0.001s)

**Sound Design Notes:**
```javascript
// Helper methods
playStringSection(freq, duration, volume = 0.3) {
    // Sawtooth wave base
    // Lowpass filter sweep: 800Hz → 3000Hz over attack
    // Medium attack (0.05-0.1s)
    // Add subtle vibrato (5Hz, ±5 cents)
}

playBrassStab(freq, duration, volume = 0.35) {
    // Square wave base
    // Formant filter for trumpet/horn character
    // Sharp attack (0.02s)
    // Slight pitch bend up at start (+50 cents → 0)
}

playTimpani(pitch, volume = 0.4) {
    // Low frequency (80-150Hz)
    // Noise burst + sine wave
    // Very fast attack, medium decay (0.3s)
}

// Example: Particle creation
particleCreate(count) {
    // Ascending string section swell
    // Major scale: C4 → E4 → G4 → C5
    // Rich harmonics, 0.1s attack per note
}
```

**Key Characteristics:**
- Particle creation: String section swells
- Collisions: Pizzicato strings or brass stabs
- Wall bounces: Timpani hits
- UI interactions: Harp glissandos, woodwind flourishes

**Implementation Priority:** High - Would add sophistication

---

### 4. Sci-Fi 🚀

**Theme:** Futuristic, robotic, space-age
**Target mood:** Technological, alien, mysterious

**Technical Specs:**
- **Scale:** Microtonal or chromatic with unusual intervals
- **Synthesis:**
  - Frequency sweeps for laser effects
  - Ring modulation for metallic tones
  - Bitcrushing for digital artifacts
  - PWM (pulse width modulation) for synth textures
- **Effects:**
  - Pitch quantization (autotune-like for robotic feel)
  - Delay with feedback for echoes in space
  - High-frequency harmonics for energy weapons

**Sound Design Notes:**
```javascript
// Helper methods
playLaserBlast(startFreq, endFreq, duration, volume = 0.3) {
    // Exponential frequency sweep
    // startFreq (2000Hz) → endFreq (200Hz)
    // Triangle wave with bitcrushing
    // Add noise burst at start for "ignition"
}

playRobotBlip(freq, volume = 0.25) {
    // Square wave with PWM
    // Pulse width modulates: 10% → 50% → 10%
    // Sharp attack and release (0.01s each)
    // Optional: pitch quantize to nearest semitone
}

playMetallicResonance(freq, duration, volume = 0.3) {
    // Ring modulator: freq * (freq * 1.618)
    // Creates inharmonic partials
    // Long decay with slight detuning
}

// Example: Particle collision
particleCollision(velocity, size1, size2) {
    // Quick laser "pew" sound
    // Sweep from high to low (1500Hz → 300Hz)
    // Duration: 40ms
    // Velocity affects pitch range
}
```

**Key Characteristics:**
- Particle creation: Computer startup sequence
- Collisions: Laser blasts or metallic pings
- Wall bounces: Shield impact / force field
- UI interactions: Sci-fi interface beeps, holograms

**Implementation Priority:** High - Very distinct from existing packs

---

### 5. Lo-Fi / Chill 🎧

**Theme:** Relaxed, nostalgic, warm analog imperfections
**Target mood:** Chill, study vibes, cozy

**Technical Specs:**
- **Scale:** Jazz-influenced (minor 7th, major 7th chords)
- **Synthesis:**
  - Warm sine/triangle waves
  - Subtle vinyl crackle (filtered noise)
  - Tape saturation (soft clipping)
  - Wow and flutter (subtle pitch/time modulation)
- **Effects:**
  - Lowpass filter (reduce highs for warmth)
  - Bit depth reduction for vintage digital feel
  - Chorus for width

**Sound Design Notes:**
```javascript
// Add analog warmth
addVinylCrackle(volume = 0.03) {
    // Pink noise, highpass filtered (>5kHz)
    // Random amplitude modulation
    // Very quiet, always playing in background
}

playWarmTone(freq, duration, volume = 0.3) {
    // Sine wave base
    // Add subtle pitch wobble (0.5Hz LFO, ±3 cents)
    // Soft attack/release (0.05s)
    // Lowpass filter at 4kHz
}
```

**Key Characteristics:**
- Particle creation: Warm chord progressions
- Collisions: Muted, soft impacts
- Background: Subtle vinyl crackle
- UI interactions: Jazzy piano notes

---

### 6. Industrial / Glitch 🔧

**Theme:** Harsh, mechanical, chaotic
**Target mood:** Intense, aggressive, experimental

**Technical Specs:**
- **Scale:** Atonal / noise-based
- **Synthesis:**
  - Heavy distortion and clipping
  - Granular synthesis (tiny audio grains)
  - Sample rate reduction
  - Extreme bitcrushing
- **Character:** Unpredictable, harsh, noisy

**Sound Design Notes:**
```javascript
playGlitchBurst(duration, volume = 0.3) {
    // Random frequency jumps every 10-20ms
    // Heavy bitcrushing (4-bit)
    // Sample rate reduction (8kHz)
}

playMachineryClank(pitch, volume = 0.35) {
    // Metallic noise burst
    // Multiple inharmonic partials
    // Fast attack, medium decay
}
```

**Key Characteristics:**
- Particle creation: Machinery startup
- Collisions: Metal impacts, glitches
- Wall bounces: Heavy industrial clang
- UI interactions: Digital errors, system alerts

**Implementation Priority:** Low - Niche audience

---

## Implementation Guide

### Step 1: Create Sound Pack Class

```javascript
class YourSoundPack extends BaseSoundPack {
    constructor() {
        super();

        // Define your musical scale/palette
        this.scale = {
            // Your frequency mappings
        };

        // Pack-specific parameters
        this.customParameter = defaultValue;

        this.init();
    }

    // Implement helper synthesis methods
    playYourCustomSound(freq, duration, volume) {
        // Your synthesis code
    }

    // ========================================
    // REQUIRED: Implement all 21 sound methods
    // ========================================

    // Particle Physics (6)
    particleCreate(count) { /* ... */ }
    particleCollision(velocity, size1, size2) { /* ... */ }
    wallBounce(velocity) { /* ... */ }
    acidConvert() { /* ... */ }
    acidCorrosion() { /* ... */ }
    particleSplit(fragmentCount) { /* ... */ }

    // UI Buttons (6)
    colorPickerToggle(toRandom) { /* ... */ }
    shapeSelect() { /* ... */ }
    cutButton() { /* ... */ }
    lockButton(isLocking) { /* ... */ }
    clearButton() { /* ... */ }
    helpButton(isOpening) { /* ... */ }

    // Selection & Gestures (8)
    selectParticle() { /* ... */ }
    deselectParticle() { /* ... */ }
    marqueeSelect(particleCount) { /* ... */ }
    hoverParticle() { /* ... */ }
    longPressSelect() { /* ... */ }
    twoFingerTap() { /* ... */ }
    threeFingerTap() { /* ... */ }
    deleteParticles(count = 1) { /* ... */ }
}
```

### Step 2: Register in setup()

```javascript
// In main.js, setup() function (~line 272)
soundManager.registerPack('yourpack', YourSoundPack);
```

### Step 3: Add to UI

```html
<!-- In index.html, soundPackSelect element (~line 95) -->
<option value="yourpack">Your Pack Name</option>
```

### Step 4: Test

1. Create particles with your pack selected
2. Test all 21 sound methods
3. Verify volume/mute controls work
4. Test pack switching (volume/mute should persist)
5. Reload page (pack selection should persist)

---

## Sound Design Resources

### Web Audio API References
- [MDN Web Audio API Guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [OscillatorNode types](https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode/type): sine, square, sawtooth, triangle
- [BiquadFilterNode](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode): lowpass, highpass, bandpass filters

### Musical Scales
- **Pentatonic:** 5 notes, no semitones (original pack)
- **Chromatic:** All 12 semitones (retro pack)
- **Whole Tone:** 6 notes, whole steps only (dreamy/ambiguous)
- **Just Intonation:** Natural harmonic ratios (organic sounds)
- **Microtonal:** Intervals smaller than semitones (experimental)

### Synthesis Techniques
- **Additive:** Combine sine waves at different frequencies
- **Subtractive:** Filter rich waveforms (sawtooth/square)
- **FM (Frequency Modulation):** Modulate one oscillator with another
- **Granular:** Tiny audio grains rearranged
- **Karplus-Strong:** Plucked string algorithm

### Rate Limiting
Remember to respect the inherited rate limiters:
- `collisionCooldown`: 50ms
- `hoverCooldown`: 200ms
- `wallBounceCooldown`: 100ms

Always check timestamps before playing high-frequency sounds.

---

## Contributing

If you create a new sound pack, consider:
1. Maintaining thematic consistency across all 21 sounds
2. Respecting rate limiting for collision/hover/wall sounds
3. Using appropriate volume levels (0.1-0.4 typical range)
4. Testing with 500+ particles for performance
5. Ensuring sounds work well together (not just individually)

Happy sound designing! 🎵
