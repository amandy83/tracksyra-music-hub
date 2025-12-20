import { Globe, Zap, Shield, DollarSign, BarChart3, Headphones } from "lucide-react";
import { useGSAPStagger } from "@/hooks/useGSAP";

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
  const containerRef = useGSAPStagger();

  return (
    <section id="features" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16 gsap-fade-up">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-foreground">
            Everything You Need to
            <span className="gradient-text"> Succeed</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Powerful tools and features designed to help independent artists and labels distribute, 
            promote, and monetize their music globally.
          </p>
        </div>

        <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="gsap-stagger group relative p-8 rounded-2xl bg-card border border-border hover:border-primary/50 hover:shadow-xl transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-xl gradient-bg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="w-7 h-7 text-primary-foreground" />
              </div>
              
              <h3 className="text-xl font-bold mb-3 text-foreground">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
