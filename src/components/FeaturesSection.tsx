import { Globe, Zap, Shield, DollarSign, BarChart3, Headphones } from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "Global Distribution",
    description: "Reach millions of listeners on 150+ streaming platforms worldwide including Spotify, Apple Music, and more.",
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Your music goes live within 24-48 hours. No more waiting weeks for your release to be available.",
  },
  {
    icon: Shield,
    title: "Rights Protection",
    description: "We protect your music with Content ID and ensure your rights are respected across all platforms.",
  },
  {
    icon: DollarSign,
    title: "100% Royalties",
    description: "Keep everything you earn. No commission cuts, no hidden fees. Your music, your money.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description: "Track your streams, earnings, and audience demographics with our powerful analytics dashboard.",
  },
  {
    icon: Headphones,
    title: "24/7 Support",
    description: "Our dedicated artist support team is always here to help you succeed in your music journey.",
  },
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/30 to-background" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Everything You Need to
            <span className="gradient-text"> Succeed</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Powerful tools and features designed to help independent artists and labels distribute, 
            promote, and monetize their music globally.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative p-6 rounded-2xl bg-card/50 border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="absolute inset-0 gradient-bg opacity-0 group-hover:opacity-5 rounded-2xl transition-opacity duration-300" />
              
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
