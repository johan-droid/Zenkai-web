import { z } from "zod";
import { AppError } from "../../http/errors.js";
import { AuthRepository, type UserRow, type SessionRow } from "./repository.js";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} from "./crypto.js";

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,32}$/;

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username cannot exceed 32 characters")
    .regex(USERNAME_REGEX, "Username can only contain letters, numbers, underscores, and dashes"),
  email: z.string().email("Invalid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  displayName: z.string().max(64).optional(),
});

export const loginSchema = z.object({
  login: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  displayName: z.string().max(64).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url("Invalid avatar URL").max(1024).optional().nullable(),
});

export interface AuthResult {
  user: UserRow;
  rawToken: string;
  expiresAt: Date;
}

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async register(
    input: unknown,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResult> {
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw AppError.badRequest(issue ? issue.message : "Invalid registration input");
    }

    const { username, email, password, displayName } = parsed.data;

    // Check username uniqueness
    const existingUsername = await this.repo.findUserByUsername(username);
    if (existingUsername) {
      throw AppError.conflict("Username is already taken", { field: "username" });
    }

    // Check email uniqueness
    const existingEmail = await this.repo.findUserByEmail(email);
    if (existingEmail) {
      throw AppError.conflict("Email address is already registered", { field: "email" });
    }

    const passwordHash = hashPassword(password);
    const user = await this.repo.createUser({
      username,
      email,
      passwordHash,
      displayName,
    });

    const { rawToken, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.repo.createSession({
      userId: user.id,
      tokenHash,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
      expiresAt,
    });

    return { user, rawToken, expiresAt };
  }

  async login(
    input: unknown,
    meta?: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthResult> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest("Invalid login request");
    }

    const { login, password } = parsed.data;
    const user = await this.repo.findUserForAuth(login);
    if (!user) {
      throw AppError.unauthorized("Invalid username or password");
    }

    const valid = verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw AppError.unauthorized("Invalid username or password");
    }

    const { rawToken, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.repo.createSession({
      userId: user.id,
      tokenHash,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
      expiresAt,
    });

    // Strip password hash from returned user
    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, rawToken, expiresAt };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashSessionToken(rawToken);
    await this.repo.deleteSession(tokenHash);
  }

  async validateSession(
    rawToken: string,
  ): Promise<{ user: UserRow; session: SessionRow } | null> {
    if (!rawToken || rawToken.length < 32) return null;
    const tokenHash = hashSessionToken(rawToken);
    const result = await this.repo.findSessionWithUser(tokenHash);
    if (!result) return null;

    // Async background update of lastSeenAt (non-blocking)
    void this.repo.touchSession(result.session.id).catch(() => {});

    return result;
  }

  async checkUsername(username: string): Promise<{
    username: string;
    available: boolean;
    reason?: string;
    suggestions: string[];
  }> {
    if (!USERNAME_REGEX.test(username)) {
      return {
        username,
        available: false,
        reason: "Must be 3-32 characters, letters, numbers, hyphens or underscores only",
        suggestions: [],
      };
    }

    const existing = await this.repo.findUserByUsername(username);
    if (!existing) {
      return { username, available: true, suggestions: [] };
    }

    // Auto-generate suggestions
    const rand = Math.floor(100 + Math.random() * 900);
    const suggestions = [
      `${username}_${rand}`,
      `${username}${rand}`,
      `the_${username}`,
    ];

    return {
      username,
      available: false,
      reason: "Username is already taken",
      suggestions,
    };
  }

  async updateProfile(userId: string, input: unknown): Promise<UserRow> {
    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw AppError.badRequest(issue ? issue.message : "Invalid profile update");
    }

    const updated = await this.repo.updateUserProfile(userId, parsed.data);
    if (!updated) {
      throw AppError.notFound("User not found");
    }
    return updated;
  }

  async getUserById(userId: string): Promise<UserRow> {
    const user = await this.repo.findUserById(userId);
    if (!user) {
      throw AppError.notFound("User not found");
    }
    return user;
  }

  async getPublicProfile(username: string): Promise<UserRow> {
    const user = await this.repo.findUserByUsername(username);
    if (!user) {
      throw AppError.notFound(`User @${username} not found`);
    }
    return user;
  }
}
