<script lang="ts">
    import { T } from "@threlte/core";
    import { OrbitControls } from "@threlte/extras";
    import * as THREE from "three";
    import type { PhaseSpacePoint } from "$lib/phaseSpaceEmbedding";

    // Props
    let {
        points = [],
        colorStart = "#ef4444", // red (start - consonant)
        colorEnd = "#3b82f6", // blue (end - vowel attractor)
        showPath = true,
        xrayMode = true, // NEW: X-ray density visualization
        opacity = 0.15, // NEW: Line opacity (0.02-0.3)
    }: {
        points: PhaseSpacePoint[];
        colorStart?: string;
        colorEnd?: string;
        showPath?: boolean;
        xrayMode?: boolean;
        opacity?: number;
    } = $props();

    // Pre-allocate a fixed-size geometry with max capacity
    const MAX_POINTS = 10000;

    // Create geometry once with pre-allocated buffers
    const positions = new Float32Array(MAX_POINTS * 3);
    const colors = new Float32Array(MAX_POINTS * 3);

    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    const colorAttr = new THREE.BufferAttribute(colors, 3);

    positionAttr.setUsage(THREE.DynamicDrawUsage);
    colorAttr.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute("position", positionAttr);
    geometry.setAttribute("color", colorAttr);

    // Create materials for different modes
    const xrayMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false, // Important for additive blending
    });

    const solidMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 1.0,
    });

    // Track if we have valid data
    let hasData = $state(false);

    // Get the current material based on mode
    let currentMaterial = $derived(xrayMode ? xrayMaterial : solidMaterial);

    // Update material opacity when props change
    $effect(() => {
        if (xrayMode) {
            xrayMaterial.opacity = opacity;
        } else {
            solidMaterial.opacity = 1.0;
        }
    });

    // Update geometry buffers when points change
    $effect(() => {
        const numPoints = Math.min(points.length, MAX_POINTS);

        if (numPoints < 2) {
            hasData = false;
            geometry.setDrawRange(0, 0);
            return;
        }

        // Color gradient: Red (start/consonant) → Blue (end/vowel)
        const startColor = new THREE.Color(colorStart);
        const endColor = new THREE.Color(colorEnd);
        const tempColor = new THREE.Color();

        // Fill the pre-allocated buffers
        for (let i = 0; i < numPoints; i++) {
            const p = points[i];
            const idx = i * 3;

            positions[idx] = p.x;
            positions[idx + 1] = p.y;
            positions[idx + 2] = p.z;

            // Time-based color gradient
            const t = i / (numPoints - 1);
            tempColor.lerpColors(startColor, endColor, t);
            colors[idx] = tempColor.r;
            colors[idx + 1] = tempColor.g;
            colors[idx + 2] = tempColor.b;
        }

        positionAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;
        geometry.setDrawRange(0, numPoints);
        geometry.computeBoundingSphere();

        hasData = true;
    });
</script>

<!-- Camera -->
<T.PerspectiveCamera makeDefault position={[3, 2, 3]} fov={50}>
    <OrbitControls
        enableDamping
        dampingFactor={0.05}
        enableZoom={true}
        minDistance={0.5}
        maxDistance={15}
    />
</T.PerspectiveCamera>

<!-- Dark ambient for X-ray mode -->
<T.AmbientLight intensity={xrayMode ? 0.3 : 0.6} />
<T.DirectionalLight intensity={0.5} position={[5, 10, 5]} />

<!-- Grid floor (dimmer in X-ray mode) -->
<T.GridHelper
    args={[
        4,
        20,
        xrayMode ? "#222222" : "#333333",
        xrayMode ? "#181818" : "#222222",
    ]}
    position.y={-1.5}
/>

<!-- Axes helper -->
<T.AxesHelper args={[0.3]} position={[-1.5, -1.5, -1.5]} />

<!-- Phase Space Attractor -->
{#if hasData && showPath}
    <T.Line>
        <T is={geometry} />
        <T is={currentMaterial} />
    </T.Line>
{:else if points.length === 0}
    <!-- Empty state placeholder -->
    <T.Mesh rotation.x={Math.PI / 2}>
        <T.TorusGeometry args={[0.8, 0.2, 32, 100]} />
        <T.MeshStandardMaterial
            color="#333333"
            wireframe={true}
            transparent={true}
            opacity={0.3}
        />
    </T.Mesh>
{/if}
