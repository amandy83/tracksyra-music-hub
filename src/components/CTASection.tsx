import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-24 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(330, 85%, 60%) 0%, hsl(280, 70%, 55%) 100%)' }}>
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-white/10 rounded-full blur-[80px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 text-white">
            Ready to Share Your Music With the World?
          </h2>
          <p className="text-lg text-white/80 mb-10">
            Join 50,000+ artists who trust TrackSyra to distribute their music. 
            Start for free, no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="xl" className="bg-white text-primary hover:bg-white/90 group">
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
