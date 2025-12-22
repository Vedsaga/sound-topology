<script lang="ts">
    import { T } from "@threlte/core";
    import { OrbitControls } from "@threlte/extras";
    import * as THREE from "three";
    import type { PhaseSpacePoint } from "$lib/phaseSpaceEmbedding";

    // Dataset type with transforms
    interface Dataset {
        id: string;
        points: PhaseSpacePoint[];
        color: string;
        xrayMode: boolean;
        opacity: number;
        position: [number, number, number];
        rotation: [number, number, number]; // degrees
        scale: number;
    }

    // Props
    let {
        datasets = [],
    }: {
        datasets: Dataset[];
    } = $props();

    const MAX_POINTS = 10000;

    // Create a geometry/material pair per dataset
    function createDatasetRenderer() {
        const positions = new Float32Array(MAX_POINTS * 3);
        const colors = new Float32Array(MAX_POINTS * 3);

        const geometry = new THREE.BufferGeometry();
        const positionAttr = new THREE.BufferAttribute(positions, 3);
        const colorAttr = new THREE.BufferAttribute(colors, 3);

        positionAttr.setUsage(THREE.DynamicDrawUsage);
        colorAttr.setUsage(THREE.DynamicDrawUsage);

        geometry.setAttribute("position", positionAttr);
        geometry.setAttribute("color", colorAttr);

        return {
            geometry,
            positions,
            colors,
            positionAttr,
            colorAttr,
        };
    }

    // Renderers map keyed by dataset id
    let renderers = $state(
        new Map<string, ReturnType<typeof createDatasetRenderer>>(),
    );

    // Update renderers when datasets change
    $effect(() => {
        // Create renderers for new datasets
        for (const ds of datasets) {
            if (!renderers.has(ds.id)) {
                renderers.set(ds.id, createDatasetRenderer());
            }
        }

        // Update each dataset's geometry
        for (const ds of datasets) {
            const r = renderers.get(ds.id);
            if (!r) continue;

            const numPoints = Math.min(ds.points.length, MAX_POINTS);
            if (numPoints < 2) {
                r.geometry.setDrawRange(0, 0);
                continue;
            }

            const baseColor = new THREE.Color(ds.color);

            for (let i = 0; i < numPoints; i++) {
                const p = ds.points[i];
                const idx = i * 3;

                r.positions[idx] = p.x;
                r.positions[idx + 1] = p.y;
                r.positions[idx + 2] = p.z;

                // Gradient from baseColor (lighter at start, full at end)
                const t = i / (numPoints - 1);
                const shade = 0.4 + 0.6 * t;
                r.colors[idx] = baseColor.r * shade;
                r.colors[idx + 1] = baseColor.g * shade;
                r.colors[idx + 2] = baseColor.b * shade;
            }

            r.positionAttr.needsUpdate = true;
            r.colorAttr.needsUpdate = true;
            r.geometry.setDrawRange(0, numPoints);
            r.geometry.computeBoundingSphere();
        }
    });

    // Create materials (cached per mode)
    function createMaterial(xray: boolean, opacity: number) {
        if (xray) {
            return new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
        }
        return new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
        });
    }

    // Convert degrees to radians
    function degToRad(deg: number): number {
        return deg * (Math.PI / 180);
    }
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

<!-- Lighting -->
<T.AmbientLight intensity={0.3} />
<T.DirectionalLight intensity={0.5} position={[5, 10, 5]} />

<!-- Grid floor -->
<T.GridHelper args={[4, 20, "#222222", "#181818"]} position.y={-1.5} />

<!-- Axes helper -->
<T.AxesHelper args={[0.3]} position={[-1.5, -1.5, -1.5]} />

<!-- Render each dataset with transforms -->
{#each datasets as ds (ds.id)}
    {@const renderer = renderers.get(ds.id)}
    {#if renderer && ds.points.length > 1}
        <T.Group
            position={ds.position}
            rotation={[
                degToRad(ds.rotation[0]),
                degToRad(ds.rotation[1]),
                degToRad(ds.rotation[2]),
            ]}
            scale={ds.scale}
        >
            <T.Line>
                <T is={renderer.geometry} />
                <T is={createMaterial(ds.xrayMode, ds.opacity)} />
            </T.Line>
        </T.Group>
    {/if}
{/each}
