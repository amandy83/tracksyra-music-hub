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
  return (
    <section id="platforms" className="py-24 bg-secondary/30 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
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
          
          <div className="flex gap-6 animate-scroll overflow-hidden">
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
          <div className="inline-flex items-center gap-4 px-8 py-4 rounded-2xl bg-background border border-border shadow-sm">
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
