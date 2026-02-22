import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { loginUser } from "@/lib/auth";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertCircle, Clock, Ban } from "lucide-react";

const loginSchema = z.object({
  phone: z.string().trim().min(7, "Invalid phone number"),
  password: z.string().min(1, "Password is required"),
});

const Login = () => {
  const [form, setForm] = useState({ phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "pending" | "blocked" | "error"; text: string } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const result = loginSchema.safeParse(form);
    if (!result.success) {
      toast({ title: "Validation error", description: result.error.errors[0].message, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await loginUser(form.phone, form.password);
      navigate("/dashboard");
    } catch (err: any) {
      if (err.message === "PENDING") {
        setStatusMessage({ type: "pending", text: "Your account is awaiting admin approval." });
      } else if (err.message === "BLOCKED") {
        setStatusMessage({ type: "blocked", text: "Your account has been blocked." });
      } else {
        setStatusMessage({ type: "error", text: err.message || "Login failed" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome Back" subtitle="Login to your account">
      <form onSubmit={handleSubmit} className="space-y-4">
        {statusMessage && (
          <div
            className={`flex items-start gap-3 p-3 rounded-lg text-sm ${statusMessage.type === "pending"
                ? "bg-warning/10 text-warning"
                : statusMessage.type === "blocked"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-destructive/10 text-destructive"
              }`}
          >
            {statusMessage.type === "pending" ? (
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            ) : statusMessage.type === "blocked" ? (
              <Ban className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

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
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-foreground">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full gradient-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Login
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary hover:underline">Sign Up</Link>
        </p>
      </form>
    </AuthLayout>
  );
};

export default Login;
