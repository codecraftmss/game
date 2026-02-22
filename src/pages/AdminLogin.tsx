import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { loginAdmin } from "@/lib/auth";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const AdminLogin = () => {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = loginSchema.safeParse(form);
    if (!result.success) {
      toast({ title: "Validation error", description: result.error.errors[0].message, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await loginAdmin(form.email, form.password);
      navigate("/admin/dashboard");
    } catch (err: any) {
      toast({ title: "Access denied", description: err.message || "Admin login failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Admin Access" subtitle="Authorized personnel only">
      <div className="flex justify-center mb-6">
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-accent" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-foreground">Admin Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="admin@royalstar.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-foreground">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Enter admin password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-primary"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full gradient-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Admin Login
        </Button>
      </form>
    </AuthLayout>
  );
};

export default AdminLogin;
