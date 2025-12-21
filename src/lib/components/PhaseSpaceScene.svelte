<script lang="ts">
    import { T, useThrelte } from "@threlte/core";
    import { OrbitControls } from "@threlte/extras";
    import * as THREE from "three";
    import type { PhaseSpacePoint } from "$lib/phaseSpaceEmbedding";

    // Props
    let {
        points = [],
        colorStart = "#3b82f6", // blue
        colorEnd = "#ef4444", // red
        showPath = true,
    }: {
        points: PhaseSpacePoint[];
        colorStart?: string;
        colorEnd?: string;
        showPath?: boolean;
    } = $props();

    // Pre-allocate a fixed-size geometry with max capacity
    // This avoids recreating the geometry on every update
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

    // Track if we have valid data
    let hasData = $state(false);

    // Update geometry buffers when points change (no allocation, just fill)
    $effect(() => {
        const numPoints = Math.min(points.length, MAX_POINTS);

        if (numPoints < 2) {
            hasData = false;
            geometry.setDrawRange(0, 0);
            return;
        }

        // Color calculations
        const startColor = new THREE.Color(colorStart);
        const endColor = new THREE.Color(colorEnd);
        const tempColor = new THREE.Color();

        // Fill the pre-allocated buffers (no new allocations!)
        for (let i = 0; i < numPoints; i++) {
            const p = points[i];
            const idx = i * 3;

            positions[idx] = p.x;
            positions[idx + 1] = p.y;
            positions[idx + 2] = p.z;

            const t = i / (numPoints - 1);
            tempColor.lerpColors(startColor, endColor, t);
            colors[idx] = tempColor.r;
            colors[idx + 1] = tempColor.g;
            colors[idx + 2] = tempColor.b;
        }

        // Tell Three.js the buffers have been updated
        positionAttr.needsUpdate = true;
        colorAttr.needsUpdate = true;

        // Only draw the portion we filled
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
        minDistance={1}
        maxDistance={10}
    />
</T.PerspectiveCamera>

<!-- Lighting -->
<T.AmbientLight intensity={0.6} />
<T.DirectionalLight intensity={0.8} position={[5, 10, 5]} castShadow />

<!-- Grid floor -->
<T.GridHelper args={[4, 20, "#333333", "#222222"]} position.y={-1.5} />

<!-- Axes helper (small, subtle) -->
<T.AxesHelper args={[0.5]} position={[-1.5, -1.5, -1.5]} />

<!-- Phase Space Attractor -->
{#if hasData && showPath}
    <T.Line>
        <T is={geometry} />
        <T.LineBasicMaterial vertexColors={true} />
    </T.Line>
{:else if points.length === 0}
    <!-- Empty state: show a subtle torus as placeholder -->
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
