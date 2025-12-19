import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import logo from "@/assets/tracksyra-logo.png";

const Header = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="TrackSyra" className="h-10 w-auto" />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
            Features
          </a>
          <a href="#platforms" className="text-muted-foreground hover:text-foreground transition-colors">
            Platforms
          </a>
          <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </a>
          <a href="#testimonials" className="text-muted-foreground hover:text-foreground transition-colors">
            Artists
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
            Login
          </Button>
          <Button variant="gradient" size="sm">
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
