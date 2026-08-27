export function sanitizeUsername(username: string): string {
  return username.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
}

export function validateUsername(username: string): string | null {
  const clean = username.trim();
  if (!clean) {
    return "Username is required";
  }
  if (clean.length < 3) {
    return "Username must be at least 3 characters long";
  }
  if (clean.length > 30) {
    return "Username must be at most 30 characters long";
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
    return "Username can only contain letters, numbers, underscores, and hyphens";
  }
  return null;
}

export function validateDisplayName(name: string): string | null {
  const clean = name.trim();
  if (!clean) {
    return "Display name is required";
  }
  if (clean.length < 2) {
    return "Display name must be at least 2 characters long";
  }
  if (clean.length > 50) {
    return "Display name cannot exceed 50 characters";
  }
  return null;
}

export function validateEmail(email: string): string | null {
  const clean = email.trim();
  if (!clean) {
    return "Email address is required";
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(clean)) {
    return "Please enter a valid email address";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return "Password is required";
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain both letters and numbers";
  }
  return null;
}

export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (!confirm) {
    return "Please confirm your password";
  }
  if (password !== confirm) {
    return "Passwords do not match";
  }
  return null;
}
