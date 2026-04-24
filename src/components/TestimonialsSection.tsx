import { Star, Quote } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { gsap } from "@/hooks/useGSAP";

const testimonials = [
  {
    name: "Arjun Mehta",
    role: "Indie Artist · Mumbai",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face",
    quote: "TrackSyra ne meri music ko Spotify aur JioSaavn pe pohchaya. 3 mahine me streams 500% badhe!",
    rating: 5,
  },
  {
    name: "Sarah Chen",
    role: "Singer-Songwriter · Singapore",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face",
    quote: "The analytics dashboard is incredible. I can see exactly where my listeners are and tailor my releases accordingly.",
    rating: 5,
  },
  {
    name: "Marcus Johnson",
    role: "Producer & DJ · London",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face",
    quote: "Best distribution service I've used. Fast uploads, great support, and I keep all my royalties.",
    rating: 5,
  },
  {
    name: "Priya Sharma",
    role: "Playback Singer · Delhi",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face",
    quote: "Bollywood se indie tak — TrackSyra ne meri har release ko global audience tak pohchaya. 90% royalties matlab game changer.",
    rating: 5,
  },
  {
    name: "Karan Singh",
    role: "Punjabi Artist · Chandigarh",
    image: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&h=200&fit=crop&crop=face",
    quote: "Punjabi music ke liye perfect platform. JioSaavn aur YouTube Music pe release process super smooth hai.",
    rating: 5,
  },
  {
    name: "Aisha Khan",
    role: "R&B Vocalist · Bangalore",
    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face",
    quote: "24-hour support and lightning-fast distribution. My EP went live on 150+ platforms within 2 days. Highly recommend!",
    rating: 5,
  },
  {
    name: "Diego Rodriguez",
    role: "Latin Artist · Madrid",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face",
    quote: "Royalty payments are always on time and transparent. Finally a distributor that actually respects artists.",
    rating: 5,
  },
  {
    name: "Riya Kapoor",
    role: "Independent Label Owner · Pune",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=face",
    quote: "Managing 20+ artists has never been easier. The label dashboard is intuitive and powerful. Worth every rupee.",
    rating: 5,
  },
  {
    name: "Tanvir Ahmed",
    role: "Hip-Hop Producer · Hyderabad",
    image: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=200&h=200&fit=crop&crop=face",
    quote: "From upload to live in 24 hours. The pre-save links and playlist pitching feature helped my track hit Editorial playlists.",
    rating: 5,
  },
];

const TestimonialsSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const autoplay = useRef(Autoplay({ delay: 4000, stopOnInteraction: true }));

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1, y: 0, duration: 1, ease: "power3.out",
          scrollTrigger: { trigger: titleRef.current, start: "top 85%" },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="testimonials" className="py-20 bg-secondary/30 overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div ref={titleRef} className="text-center mb-12" style={{ opacity: 0 }}>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-foreground">
            Loved by
            <span className="gradient-text"> Artists Worldwide</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Join thousands of artists who trust TrackSyra to distribute their music globally.
          </p>
        </div>

        <Carousel
          opts={{ align: "start", loop: true }}
          plugins={[autoplay.current]}
          className="max-w-6xl mx-auto"
        >
          <CarouselContent className="-ml-4">
            {testimonials.map((t) => (
              <CarouselItem key={t.name} className="pl-4 md:basis-1/2 lg:basis-1/3">
                <div className="h-full p-6 rounded-2xl bg-background border border-border hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative group">
                  <Quote className="absolute top-5 right-5 w-9 h-9 text-primary/10 group-hover:text-primary/20 transition-colors" />

                  <div className="flex gap-1 mb-3">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                    ))}
                  </div>

                  <p className="text-foreground mb-5 text-sm leading-relaxed min-h-[100px]">"{t.quote}"</p>

                  <div className="flex items-center gap-3 pt-4 border-t border-border">
                    <img
                      src={t.image}
                      alt={`${t.name} testimonial`}
                      loading="lazy"
                      className="w-11 h-11 rounded-full object-cover border-2 border-primary/30"
                    />
                    <div>
                      <div className="font-semibold text-foreground text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden sm:flex -left-4 lg:-left-12" />
          <CarouselNext className="hidden sm:flex -right-4 lg:-right-12" />
        </Carousel>

        <p className="text-center text-xs text-muted-foreground mt-6 sm:hidden">
          Swipe to see more reviews →
        </p>
      </div>
    </section>
  );
};

export default TestimonialsSection;
