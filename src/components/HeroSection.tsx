import { Button } from "@/components/ui/button";
import { Rocket, Play, ArrowRight } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-20" style={{ background: 'linear-gradient(180deg, hsl(330, 85%, 97%) 0%, hsl(0, 0%, 100%) 100%)' }}>
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-[120px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 mb-8 animate-fade-in">
            <Rocket className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">The #1 Music Distribution Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-in text-foreground" style={{ animationDelay: '0.1s' }}>
            Distribute Your Music
            <br />
            <span className="gradient-text">To The World</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            Get your music on Spotify, Apple Music, and 150+ streaming platforms. 
            Keep 100% of your royalties with zero hidden fees.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
            <Button variant="hero" size="xl" className="group">
              Start Distributing Free
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button variant="heroOutline" size="xl">
              <Play className="w-5 h-5" />
              Watch Demo
            </Button>
          </div>

          <div className="flex items-center gap-8 sm:gap-12 mt-14 justify-center animate-fade-in" style={{ animationDelay: '0.4s' }}>
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold gradient-text">150+</div>
              <div className="text-sm text-muted-foreground mt-1">Platforms</div>
            </div>
            <div className="w-px h-12 bg-border" />
            <div className="text-center">
              <div className="text-3xl sm:text-4xl font-bold gradient-text">50K+</div>
              <div className="text-sm text-muted-foreground mt-1">Artists</div>
            </div>
            <div className="w-px h-12 bg-border" />
            <div className="text-center">
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
