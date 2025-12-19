import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How long does it take for my music to go live?",
    answer: "Your music will be live on major platforms within 24-48 hours after approval. Some stores may take up to 5 business days for the first release.",
  },
  {
    question: "Do I keep 100% of my royalties?",
    answer: "Yes! TrackSyra takes zero commission from your earnings. You keep 100% of what you earn from streams and downloads.",
  },
  {
    question: "Which streaming platforms do you distribute to?",
    answer: "We distribute to over 150+ platforms including Spotify, Apple Music, Amazon Music, YouTube Music, Deezer, Tidal, TikTok, Instagram, and many more.",
  },
  {
    question: "Can I distribute cover songs?",
    answer: "Yes, you can distribute cover songs through our platform. We'll help you obtain the necessary licenses for your covers.",
  },
  {
    question: "How do I get paid?",
    answer: "We offer monthly payouts via PayPal, bank transfer, or other payment methods. You can track your earnings in real-time through our analytics dashboard.",
  },
  {
    question: "Can I schedule my release date?",
    answer: "Absolutely! You can schedule your release up to 12 months in advance. This gives you time to promote your music before it goes live.",
  },
  {
    question: "Do you offer Content ID protection?",
    answer: "Yes, we provide Content ID registration for YouTube, ensuring you get paid when your music is used in videos across the platform.",
  },
  {
    question: "What file formats do you accept?",
    answer: "We accept WAV files (16-bit or 24-bit, 44.1kHz or higher) for the best audio quality. FLAC files are also accepted.",
  },
];

const FAQSection = () => {
  return (
    <section id="faq" className="py-24 bg-secondary/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-foreground">
            Frequently Asked
            <span className="gradient-text"> Questions</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about distributing your music with TrackSyra.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-background border border-border rounded-xl px-6 data-[state=open]:shadow-lg transition-shadow"
              >
                <AccordionTrigger className="text-left text-foreground font-semibold hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
