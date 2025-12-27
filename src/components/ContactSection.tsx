import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { gsap } from "@/hooks/useGSAP";
import { Send, Mail, User, MessageSquare, Key } from "lucide-react";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Please enter a valid email address").max(255, "Email must be less than 255 characters"),
  message: z.string().trim().min(1, "Message is required").max(1000, "Message must be less than 1000 characters"),
});

type ContactFormData = z.infer<typeof contactSchema>;

const WEB3FORMS_KEY_STORAGE = "web3forms_access_key";

const ContactSection = () => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accessKey, setAccessKey] = useState(() => localStorage.getItem(WEB3FORMS_KEY_STORAGE) || "");
  const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem(WEB3FORMS_KEY_STORAGE));
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});

  const sectionRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        titleRef.current,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: titleRef.current,
            start: "top 85%",
          },
        }
      );

      gsap.fromTo(
        formRef.current,
        { opacity: 0, y: 40, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: formRef.current,
            start: "top 85%",
          },
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof ContactFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const saveAccessKey = () => {
    if (accessKey.trim()) {
      localStorage.setItem(WEB3FORMS_KEY_STORAGE, accessKey.trim());
      setShowKeyInput(false);
      toast({
        title: "API Key Saved",
        description: "Your Web3Forms access key has been saved.",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accessKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Please enter your Web3Forms access key first.",
        variant: "destructive",
      });
      setShowKeyInput(true);
      return;
    }

    setIsSubmitting(true);

    const result = contactSchema.safeParse(formData);

    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      result.error.errors.forEach((error) => {
        const field = error.path[0] as keyof ContactFormData;
        fieldErrors[field] = error.message;
      });
      setErrors(fieldErrors);
      setIsSubmitting(false);
      toast({
        title: "Validation Error",
        description: "Please check the form and fix the errors.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          access_key: accessKey,
          name: formData.name,
          email: formData.email,
          message: formData.message,
          from_name: "TrackSyra Contact Form",
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Message Sent!",
          description: "Thank you for reaching out. We'll get back to you soon.",
        });
        setFormData({ name: "", email: "", message: "" });
        setErrors({});
      } else {
        throw new Error(data.message || "Failed to send message");
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to send message. Please check your API key and try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section ref={sectionRef} id="contact" className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div ref={titleRef} className="text-center mb-10" style={{ opacity: 0 }}>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3 text-foreground">
            Get in
            <span className="gradient-text"> Touch</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Have questions about distributing your music? We're here to help. Send us a message and our team will get back to you within 24 hours.
          </p>
        </div>

        <div className="max-w-xl mx-auto">
          {/* API Key Input */}
          {showKeyInput && (
            <div className="mb-6 p-4 rounded-xl bg-secondary/50 border border-border">
              <Label className="flex items-center gap-2 text-foreground mb-2">
                <Key className="w-4 h-4 text-primary" />
                Web3Forms Access Key
              </Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Paste your access key here"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={saveAccessKey} variant="outline">
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Get your free key at <a href="https://web3forms.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">web3forms.com</a>
              </p>
            </div>
          )}

          {!showKeyInput && (
            <button
              onClick={() => setShowKeyInput(true)}
              className="text-xs text-muted-foreground hover:text-primary mb-4 flex items-center gap-1"
            >
              <Key className="w-3 h-3" />
              Change API Key
            </button>
          )}

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            className="p-6 rounded-2xl bg-card border border-border shadow-lg"
            style={{ opacity: 0 }}
          >
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2 text-foreground text-sm">
                  <User className="w-4 h-4 text-primary" />
                  Your Name
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={handleChange}
                  className={`h-11 ${errors.name ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  disabled={isSubmitting}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2 text-foreground text-sm">
                  <Mail className="w-4 h-4 text-primary" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={handleChange}
                  className={`h-11 ${errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  disabled={isSubmitting}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message" className="flex items-center gap-2 text-foreground text-sm">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Your Message
                </Label>
                <Textarea
                  id="message"
                  name="message"
                  placeholder="Tell us how we can help you..."
                  value={formData.message}
                  onChange={handleChange}
                  className={`min-h-[120px] resize-none ${errors.message ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  disabled={isSubmitting}
                />
                {errors.message && (
                  <p className="text-xs text-destructive">{errors.message}</p>
                )}
                <p className="text-xs text-muted-foreground text-right">
                  {formData.message.length}/1000
                </p>
              </div>

              <Button
                type="submit"
                variant="hero"
                size="xl"
                className="w-full group"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Sending...
                  </>
                ) : (
                  <>
                    Send Message
                    <Send className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
