import { Star, Quote } from "lucide-react";
import { useGSAPStagger } from "@/hooks/useGSAP";

const testimonials = [
  {
    name: "Alex Rivera",
    role: "Independent Artist",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face",
    quote: "TrackSyra helped me reach fans I never knew I had. My streams grew 500% in just 3 months!",
    rating: 5,
  },
  {
    name: "Sarah Chen",
    role: "Singer-Songwriter",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face",
    quote: "The analytics dashboard is incredible. I can see exactly where my listeners are and tailor my releases accordingly.",
    rating: 5,
  },
  {
    name: "Marcus Johnson",
    role: "Producer & DJ",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face",
    quote: "Best distribution service I've used. Fast uploads, great support, and I keep all my royalties.",
    rating: 5,
  },
  {
    name: "Luna Martinez",
    role: "Band Leader",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face",
    quote: "Our band went from local shows to international streams. TrackSyra made it happen.",
    rating: 5,
  },
];

const TestimonialsSection = () => {
  const containerRef = useGSAPStagger();

  return (
    <section id="testimonials" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-foreground">
            Loved by
            <span className="gradient-text"> Artists Worldwide</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join thousands of artists who trust TrackSyra to distribute their music globally.
          </p>
        </div>

        <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="gsap-stagger p-8 rounded-2xl bg-background border border-border hover:shadow-xl transition-all duration-300 relative group"
            >
              <Quote className="absolute top-6 right-6 w-10 h-10 text-primary/10 group-hover:text-primary/20 transition-colors" />
              
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-primary text-primary" />
                ))}
              </div>
              
              <p className="text-foreground mb-6 text-lg">"{testimonial.quote}"</p>
              
              <div className="flex items-center gap-4">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="w-12 h-12 rounded-full object-cover border-2 border-primary/30"
                />
                <div>
                  <div className="font-semibold text-foreground">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
