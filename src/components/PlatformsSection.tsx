import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "@/hooks/useGSAP";

const platforms = [
  { name: "Spotify", color: "#1DB954" },
  { name: "Apple Music", color: "#FA2D48" },
  { name: "YouTube Music", color: "#FF0000" },
  { name: "Amazon Music", color: "#FF9900" },
  { name: "Deezer", color: "#00C7F2" },
  { name: "Tidal", color: "#000000" },
  { name: "SoundCloud", color: "#FF5500" },
  { name: "Pandora", color: "#005483" },
  { name: "iHeartRadio", color: "#C6002B" },
  { name: "TikTok", color: "#EE1D52" },
  { name: "Instagram", color: "#E4405F" },
  { name: "Facebook", color: "#1877F2" },
];

const PlatformsSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Title animation
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: titleRef.current,
            start: "top 85%",
          },
        }
      );

      // Platform cards stagger
      gsap.fromTo(
        scrollRef.current,
        { opacity: 0, x: -100 },
        {
          opacity: 1,
          x: 0,
          duration: 1.2,
          ease: "power2.out",
          scrollTrigger: {
            trigger: scrollRef.current,
            start: "top 85%",
          },
        }
      );

      // Counter animation
      gsap.fromTo(
        countRef.current,
        { opacity: 0, scale: 0.8 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.8,
          ease: "back.out(1.7)",
          scrollTrigger: {
            trigger: countRef.current,
            start: "top 90%",
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="platforms" className="py-24 bg-secondary/30 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div ref={titleRef} className="text-center mb-16" style={{ opacity: 0 }}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-foreground">
            Your Music on
            <span className="gradient-text"> Every Platform</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We distribute your music to 150+ streaming platforms and digital stores worldwide. 
            Reach your fans wherever they listen.
          </p>
        </div>

        {/* Scrolling platforms */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-secondary/30 to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-secondary/30 to-transparent z-10" />
          
          <div ref={scrollRef} className="flex gap-6 animate-scroll overflow-hidden" style={{ opacity: 0 }}>
            {[...platforms, ...platforms].map((platform, index) => (
              <div
                key={`${platform.name}-${index}`}
                className="flex-shrink-0 px-8 py-4 rounded-xl bg-background border border-border hover:border-primary/50 transition-all duration-300 hover:scale-105 shadow-sm"
              >
                <span className="text-lg font-semibold whitespace-nowrap text-foreground">{platform.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Platform count */}
        <div className="mt-16 text-center">
          <div
            ref={countRef}
            className="inline-flex items-center gap-4 px-8 py-4 rounded-2xl bg-background border border-border shadow-sm"
            style={{ opacity: 0 }}
          >
            <span className="text-4xl font-bold gradient-text">150+</span>
            <span className="text-muted-foreground">Streaming Platforms & Digital Stores</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scroll {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
        .animate-scroll:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
};

export default PlatformsSection;
