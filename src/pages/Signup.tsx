import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { signUp } from "@/lib/auth";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";

const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  phone: z.string().trim().min(7, "Invalid phone number").max(20),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

const Signup = () => {
  const [form, setForm] = useState({ name: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = signupSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      await signUp(form.name, form.phone, form.password);
      setSuccess(true);
    } catch (err: any) {
      toast({ title: "Signup failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout title="Account Created" subtitle="Almost there!">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
          <p className="text-foreground font-medium">Signup successful!</p>
          <p className="text-muted-foreground text-sm">
            Waiting for admin approval. You'll be able to login once your account is approved.
          </p>
          <Link to="/login">
            <Button variant="outline" className="mt-4 w-full border-border text-foreground hover:bg-secondary">
              Back to Login
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create Account" subtitle="Join for free entertainment">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-foreground">Full Name</Label>
          <Input
            id="name"
            placeholder="John Doe"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
          />
          {errors.name && <p className="text-destructive text-xs">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-foreground">Phone Number</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 234 567 890"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
          />
          {errors.phone && <p className="text-destructive text-xs">{errors.phone}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-foreground">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Min. 8 characters"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
          />
          {errors.password && <p className="text-destructive text-xs">{errors.password}</p>}
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full gradient-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign Up
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">Login</Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default Signup;
