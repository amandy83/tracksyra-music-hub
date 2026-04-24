import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Text3D, Center } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

/* ----------- Floating Music Note ----------- */
const MusicNote = ({ position, color, scale = 1 }: { position: [number, number, number]; color: string; scale?: number }) => {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.getElapsedTime() * 0.5;
  });

  return (
    <Float speed={2} rotationIntensity={0.6} floatIntensity={1.2}>
      <group ref={ref} position={position} scale={scale}>
        {/* Note head */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.35, 32, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.7} roughness={0.2} />
        </mesh>
        {/* Stem */}
        <mesh position={[0.3, 0.7, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 1.4, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} metalness={0.6} roughness={0.3} />
        </mesh>
        {/* Flag */}
        <mesh position={[0.55, 1.2, 0]} rotation={[0, 0, -0.5]}>
          <boxGeometry args={[0.5, 0.3, 0.05]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.7} roughness={0.2} />
        </mesh>
      </group>
    </Float>
  );
};

/* ----------- Equalizer Bar ----------- */
const EqBar = ({ x, color, offset }: { x: number; color: string; offset: number }) => {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    const h = 0.6 + Math.abs(Math.sin(t * 2 + offset)) * 1.8;
    ref.current.scale.y = h;
    ref.current.position.y = h / 2 - 1.5;
  });

  return (
    <mesh ref={ref} position={[x, -1.5, 0]}>
      <boxGeometry args={[0.25, 1, 0.25]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
    </mesh>
  );
};

/* ----------- Mouse-following group ----------- */
const Scene = () => {
  const groupRef = useRef<THREE.Group>(null);
  const { mouse } = useThree();

  useFrame(() => {
    if (!groupRef.current) return;
    // Smooth follow
    groupRef.current.rotation.y += (mouse.x * 0.4 - groupRef.current.rotation.y) * 0.05;
    groupRef.current.rotation.x += (-mouse.y * 0.3 - groupRef.current.rotation.x) * 0.05;
  });

  const eqBars = useMemo(
    () =>
      Array.from({ length: 9 }).map((_, i) => ({
        x: (i - 4) * 0.4,
        color: i % 2 === 0 ? "#ec4899" : "#a855f7",
        offset: i * 0.5,
      })),
    []
  );

  return (
    <group ref={groupRef}>
      {/* Music notes around the scene */}
      <MusicNote position={[-3, 1.5, -1]} color="#ec4899" scale={0.9} />
      <MusicNote position={[3, 1, 0]} color="#a855f7" scale={1.1} />
      <MusicNote position={[-2, -1.5, 1]} color="#f472b6" scale={0.7} />
      <MusicNote position={[2.5, -1.2, -0.5]} color="#c084fc" scale={0.8} />
      <MusicNote position={[0, 2.5, -2]} color="#ec4899" scale={0.6} />
      <MusicNote position={[-3.5, -0.5, 0.5]} color="#d946ef" scale={0.65} />

      {/* Equalizer in center bottom */}
      <group position={[0, -0.2, 0]}>
        {eqBars.map((b, i) => (
          <EqBar key={i} {...b} />
        ))}
      </group>

      {/* Ambient lights */}
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#ec4899" />
      <pointLight position={[-5, -3, 2]} intensity={1} color="#a855f7" />
      <pointLight position={[0, 0, 6]} intensity={0.8} color="#ffffff" />
    </group>
  );
};

const Music3DScene = () => {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default Music3DScene;
