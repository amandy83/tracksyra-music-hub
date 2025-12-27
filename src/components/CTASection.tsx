import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { gsap } from "@/hooks/useGSAP";

const CTASection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(bgRef.current?.children || [], {
        yPercent: -30,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });

      gsap.fromTo(
        contentRef.current,
        { opacity: 0, y: 60, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: contentRef.current,
            start: "top 85%",
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const scrollToContact = () => {
    const contactSection = document.getElementById('contact');
    contactSection?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      ref={sectionRef}
      className="py-16 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, hsl(330, 85%, 60%) 0%, hsl(280, 70%, 55%) 100%)' }}
    >
      <div ref={bgRef} className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-white/10 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 right-1/4 w-56 h-56 bg-white/10 rounded-full blur-[60px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div ref={contentRef} className="max-w-3xl mx-auto text-center" style={{ opacity: 0 }}>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">
            Ready to Share Your Music With the World?
          </h2>
          <p className="text-white/80 mb-8">
            Join 50,000+ artists who trust TrackSyra to distribute their music. 
            Start for free, keep 90% royalties.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="xl" className="bg-white text-primary hover:bg-white/90 group" onClick={scrollToContact}>
              Start Distributing Free
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button size="xl" variant="outline" className="border-white/30 text-white bg-white/10 hover:bg-white/20">
              Talk to Sales
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
