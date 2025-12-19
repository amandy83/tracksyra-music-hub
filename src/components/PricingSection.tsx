import { Button } from "@/components/ui/button";
import { Check, Rocket } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "Free",
    description: "Perfect for new artists",
    features: [
      "1 release per year",
      "All major platforms",
      "Basic analytics",
      "Keep 85% royalties",
      "Email support",
    ],
    cta: "Get Started Free",
    popular: false,
  },
  {
    name: "Pro",
    price: "$19.99",
    period: "/year",
    description: "For serious musicians",
    features: [
      "Unlimited releases",
      "150+ platforms",
      "Advanced analytics",
      "Keep 100% royalties",
      "Priority support",
      "Pre-save campaigns",
      "Spotify pitching",
    ],
    cta: "Start Pro",
    popular: true,
  },
  {
    name: "Label",
    price: "$49.99",
    period: "/year",
    description: "For labels & teams",
    features: [
      "Everything in Pro",
      "Unlimited artists",
      "Team collaboration",
      "Custom contracts",
      "Dedicated manager",
      "White-label options",
      "API access",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

const PricingSection = () => {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/20 to-background" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            Simple, Transparent
            <span className="gradient-text"> Pricing</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your needs. No hidden fees, no surprises. 
            Upgrade or downgrade anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative p-8 rounded-2xl border transition-all duration-300 animate-fade-in ${
                plan.popular
                  ? "bg-card border-primary/50 scale-105 shadow-lg shadow-primary/20"
                  : "bg-card/50 border-border hover:border-primary/30"
              }`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full gradient-bg text-sm font-semibold text-primary-foreground">
                  Most Popular
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-4xl font-bold gradient-text">{plan.price}</span>
                  {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                </div>
                <p className="text-muted-foreground mt-2">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full gradient-bg flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-primary-foreground" />
                    </div>
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.popular ? "hero" : "heroOutline"}
                size="lg"
                className="w-full"
              >
                {plan.popular && <Rocket className="w-4 h-4" />}
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
