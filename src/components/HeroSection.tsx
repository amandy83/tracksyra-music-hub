import { Button } from "@/components/ui/button";
import { Rocket, Play } from "lucide-react";
import logo from "@/assets/tracksyra-logo.png";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background effects */}
      <div className="absolute inset-0 bg-background">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-secondary/10 rounded-full blur-[200px]" />
      </div>

      {/* Stars decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-foreground/30 rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          {/* Left content */}
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/50 backdrop-blur-sm mb-6 animate-fade-in">
              <Rocket className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Launch your music career today</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              Distribute Your
              <br />
              <span className="gradient-text">Sound Worldwide</span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              Get your music on Spotify, Apple Music, and 150+ streaming platforms. 
              Keep 100% of your royalties. No hidden fees.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <Button variant="hero" size="xl">
                <Rocket className="w-5 h-5" />
                Start Distributing
              </Button>
              <Button variant="heroOutline" size="xl">
                <Play className="w-5 h-5" />
                Watch Demo
              </Button>
            </div>

            <div className="flex items-center gap-8 mt-10 justify-center lg:justify-start animate-fade-in" style={{ animationDelay: '0.4s' }}>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">150+</div>
                <div className="text-sm text-muted-foreground">Platforms</div>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">50K+</div>
                <div className="text-sm text-muted-foreground">Artists</div>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">100%</div>
                <div className="text-sm text-muted-foreground">Royalties</div>
              </div>
            </div>
          </div>

          {/* Right content - Logo animation */}
          <div className="flex-1 flex justify-center lg:justify-end">
            <div className="relative">
              <div className="absolute inset-0 gradient-bg rounded-full blur-[100px] opacity-40 animate-pulse" />
              <img
                src={logo}
                alt="TrackSyra"
                className="relative w-80 sm:w-96 lg:w-[500px] h-auto float-animation"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
