import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Zap } from "lucide-react";
import DisclaimerBanner from "@/components/DisclaimerBanner";

const Index = () => {
  return (
    <div className="min-h-screen gradient-dark flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      {/* Floating card decorations */}
      <img
        src="/card_king_hearts.png"
        alt="King of Hearts"
        className="absolute top-20 left-10 w-24 h-auto opacity-20 rotate-12 animate-pulse hidden md:block"
      />
      <img
        src="/card_ace_spades.png"
        alt="Ace of Spades"
        className="absolute bottom-20 right-10 w-24 h-auto opacity-20 -rotate-12 animate-pulse hidden md:block"
      />

      <div className="text-center relative animate-slide-up max-w-2xl w-full">
        <div className="mb-6">
          <img src="/card_fan_logo.png" alt="Royal Star" className="w-32 h-auto mx-auto" />
        </div>

        <h1 className="font-display text-5xl md:text-6xl font-extrabold mb-4 leading-tight text-primary">
          Royal <span className="leading-tight">Star</span>
        </h1>
        <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
          Practice your card game skills in a fun, risk-free environment.
        </p>

        <div className="mb-8 max-w-md mx-auto">
          <DisclaimerBanner />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/signup">
            <Button size="lg" className="gradient-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity px-8">
              Get Started
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button size="lg" variant="outline" className="border-border text-foreground hover:bg-secondary px-8">
              Login
            </Button>
          </Link>
        </div>

        <div className="flex items-center justify-center gap-8 mt-12 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span>Safe & Secure</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            <span>Practice Mode</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-8 opacity-70">
          No real money involved • Entertainment only
        </p>
      </div>
    </div>
  );
};

export default Index;
