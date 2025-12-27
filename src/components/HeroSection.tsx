import { Button } from "@/components/ui/button";
import { Rocket, Play, ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { gsap } from "@/hooks/useGSAP";
import Interactive3DBackground from "./Interactive3DBackground";

const HeroSection = () => {
  const heroRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const paragraphRef = useRef<HTMLParagraphElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        badgeRef.current,
        { opacity: 0, y: 30, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.8 }
      )
        .fromTo(
          headingRef.current,
          { opacity: 0, y: 50 },
          { opacity: 1, y: 0, duration: 1 },
          "-=0.4"
        )
        .fromTo(
          paragraphRef.current,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.8 },
          "-=0.6"
        )
        .fromTo(
          buttonsRef.current?.children || [],
          { opacity: 0, y: 20, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.15 },
          "-=0.4"
        )
        .fromTo(
          statsRef.current?.children || [],
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.1 },
          "-=0.3"
        );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-20"
    >
      {/* Interactive 3D Background */}
      <Interactive3DBackground />

      <div className="container mx-auto px-4 relative z-20">
        <div className="max-w-4xl mx-auto text-center">
          <div
            ref={badgeRef}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-background/80 backdrop-blur-sm mb-8"
            style={{ opacity: 0 }}
          >
            <Rocket className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              The #1 Music Distribution Platform
            </span>
          </div>

          <h1
            ref={headingRef}
            className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-tight mb-6 text-foreground"
            style={{ opacity: 0 }}
          >
            Distribute Your Music
            <br />
            <span className="gradient-text">To The World</span>
          </h1>

          <p
            ref={paragraphRef}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
            style={{ opacity: 0 }}
          >
            Get your music on Spotify, Apple Music, and 150+ streaming platforms.
            Keep 100% of your royalties with zero hidden fees.
          </p>

          <div
            ref={buttonsRef}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Button variant="hero" size="xl" className="group">
              Start Distributing Free
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button variant="heroOutline" size="xl">
              <Play className="w-5 h-5" />
              Watch Demo
            </Button>
          </div>

          <div
            ref={statsRef}
            className="flex items-center gap-8 sm:gap-12 mt-14 justify-center"
          >
            <div className="text-center" style={{ opacity: 0 }}>
              <div className="text-3xl sm:text-4xl font-bold gradient-text">150+</div>
              <div className="text-sm text-muted-foreground mt-1">Platforms</div>
            </div>
            <div className="w-px h-12 bg-border" style={{ opacity: 0 }} />
            <div className="text-center" style={{ opacity: 0 }}>
              <div className="text-3xl sm:text-4xl font-bold gradient-text">50K+</div>
              <div className="text-sm text-muted-foreground mt-1">Artists</div>
            </div>
            <div className="w-px h-12 bg-border" style={{ opacity: 0 }} />
            <div className="text-center" style={{ opacity: 0 }}>
              <div className="text-3xl sm:text-4xl font-bold gradient-text">100%</div>
              <div className="text-sm text-muted-foreground mt-1">Royalties</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
