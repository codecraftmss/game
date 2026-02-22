import { supabase } from "@/integrations/supabase/client";

export async function signUp(name: string, phone: string, password: string) {
  // Use phone as email for Supabase auth - use a valid email format
  const phoneDigits = phone.replace(/[^0-9]/g, '');
  const email = `user${phoneDigits}@royalstar.com`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, phone },
      emailRedirectTo: undefined,
    },
  });

  if (error) {
    // Provide more helpful error message
    if (error.message.includes('rate limit')) {
      throw new Error('Too many signup attempts. Please wait a few minutes and try again.');
    }
    throw error;
  }

  // Sign out immediately - user must wait for admin approval
  await supabase.auth.signOut();

  return data;
}

export async function loginUser(phone: string, password: string) {
  // Convert phone to email format for Supabase auth
  const phoneDigits = phone.replace(/[^0-9]/g, '');
  const email = `user${phoneDigits}@royalstar.com`;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // Check role
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const isUser = roles?.some((r) => r.role === "user");
  if (!isUser) {
    await supabase.auth.signOut();
    throw new Error("Access denied.");
  }

  // Check status
  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    throw new Error("Profile not found.");
  }

  if (profile.status === "PENDING") {
    await supabase.auth.signOut();
    throw new Error("PENDING");
  }

  if (profile.status === "BLOCKED") {
    await supabase.auth.signOut();
    throw new Error("BLOCKED");
  }

  return data;
}

export async function loginAdmin(email: string, password: string) {
  // Admin login uses email directly - completely separate from user phone-based auth
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const isAdmin = roles?.some((r) => r.role === "admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    throw new Error("Access denied. Admin only.");
  }

  return data;
}

export async function logout() {
  await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function isCurrentUserAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  return roles?.some((r) => r.role === "admin") ?? false;
}
