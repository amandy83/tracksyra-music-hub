import { useEffect, useRef, useState } from "react";
import { gsap } from "@/hooks/useGSAP";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  hue: number;
}

const Interactive3DBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      initParticles();
    };

    const initParticles = () => {
      const numParticles = Math.floor((canvas.width * canvas.height) / 15000);
      particlesRef.current = [];
      
      for (let i = 0; i < numParticles; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 4 + 2,
          speedX: (Math.random() - 0.5) * 0.5,
          speedY: (Math.random() - 0.5) * 0.5,
          opacity: Math.random() * 0.5 + 0.3,
          hue: Math.random() > 0.5 ? 330 : 280, // Pink or purple
        });
      }
    };

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      let clientX, clientY;
      
      if (e instanceof TouchEvent) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      
      mouseRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const animate = () => {
      if (!ctx || !canvas) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw gradient background
      const gradient = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.8
      );
      gradient.addColorStop(0, "hsla(330, 85%, 95%, 0.8)");
      gradient.addColorStop(0.5, "hsla(280, 70%, 97%, 0.5)");
      gradient.addColorStop(1, "hsla(0, 0%, 100%, 0.3)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;
      
      particlesRef.current.forEach((particle, index) => {
        // Mouse interaction - particles are attracted/repelled by mouse
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 200;
        
        if (distance < maxDistance) {
          const force = (maxDistance - distance) / maxDistance;
          const angle = Math.atan2(dy, dx);
          
          // Repel from mouse with smooth easing
          particle.x -= Math.cos(angle) * force * 3;
          particle.y -= Math.sin(angle) * force * 3;
        }

        // Natural floating movement
        particle.x += particle.speedX + Math.sin(Date.now() * 0.001 + index) * 0.3;
        particle.y += particle.speedY + Math.cos(Date.now() * 0.001 + index) * 0.3;

        // Wrap around screen
        if (particle.x < -20) particle.x = canvas.width + 20;
        if (particle.x > canvas.width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = canvas.height + 20;
        if (particle.y > canvas.height + 20) particle.y = -20;

        // Draw particle with glow
        const glowSize = particle.size * 3;
        const glow = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          glowSize
        );
        glow.addColorStop(0, `hsla(${particle.hue}, 85%, 60%, ${particle.opacity})`);
        glow.addColorStop(0.5, `hsla(${particle.hue}, 85%, 60%, ${particle.opacity * 0.3})`);
        glow.addColorStop(1, `hsla(${particle.hue}, 85%, 60%, 0)`);
        
        ctx.beginPath();
        ctx.fillStyle = glow;
        ctx.arc(particle.x, particle.y, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw core
        ctx.beginPath();
        ctx.fillStyle = `hsla(${particle.hue}, 85%, 65%, ${particle.opacity + 0.2})`;
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw connecting lines between nearby particles
      particlesRef.current.forEach((p1, i) => {
        particlesRef.current.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `hsla(330, 85%, 60%, ${(1 - distance / 120) * 0.15})`;
            ctx.lineWidth = 1;
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        });
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleMouseMove);
    
    // Fade in animation
    gsap.to(canvas, { opacity: 1, duration: 1.5 });
    setIsLoaded(true);
    
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0 overflow-hidden">
      {/* Base gradient */}
      <div 
        className="absolute inset-0"
        style={{ 
          background: 'radial-gradient(ellipse at center, hsl(330, 85%, 96%) 0%, hsl(280, 70%, 98%) 40%, hsl(0, 0%, 100%) 80%)' 
        }}
      />
      
      {/* Interactive canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 opacity-0"
        style={{ mixBlendMode: 'multiply' }}
      />

      {/* Floating 3D shapes */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[10%] left-[10%] w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 blur-xl float-animation" style={{ animationDelay: '0s' }} />
        <div className="absolute top-[20%] right-[15%] w-32 h-32 rounded-full bg-gradient-to-br from-accent/15 to-primary/15 blur-2xl float-animation" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-[30%] left-[20%] w-24 h-24 rounded-full bg-gradient-to-br from-primary/25 to-accent/25 blur-xl float-animation" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[40%] right-[25%] w-16 h-16 rounded-full bg-gradient-to-br from-accent/20 to-primary/20 blur-lg float-animation" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-[20%] right-[10%] w-28 h-28 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 blur-2xl float-animation" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Overlay for text readability */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
        style={{ 
          background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.7) 100%)' 
        }}
      />
    </div>
  );
};

export default Interactive3DBackground;
