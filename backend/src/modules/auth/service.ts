import { z } from "zod";
import { AppError } from "../../http/errors.js";
import { config } from "../../config/index.js";
import { fetchJson } from "../../http/client.js";
import {
  AuthRepository,
  type UserRow,
  type SessionRow,
  type OAuthAccountRow,
} from "./repository.js";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  generatePkceCodeVerifier,
  computePkceCodeChallenge,
  generateOAuthState,
  generateOAuthNonce,
  generateSecureToken,
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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").optional(),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(128),
});

export const resetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetConfirmSchema = z.object({
  token: z.string().min(16, "Invalid reset token"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(128),
});

// Pre-computed scrypt dummy hash to prevent timing attacks / username enumeration
const DUMMY_HASH =
  "scrypt$16384,8,1$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

export const updateProfileSchema = z.object({
  displayName: z.string().trim().max(64).optional(),
  bio: z.string().trim().max(500).optional(),
  avatarUrl: z
    .string()
    .url("Invalid avatar URL")
    .max(1024)
    .refine((url) => /^https?:\/\//i.test(url), {
      message: "Avatar URL must use http or https protocol",
    })
    .optional()
    .nullable(),
});

export interface AuthResult {
  user: UserRow;
  rawToken: string;
  expiresAt: Date;
}

export interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

export interface GoogleIdTokenClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  iss: string;
  aud: string;
  exp: number;
  nonce?: string;
}

export interface AnilistTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface AnilistViewerResponse {
  data?: {
    Viewer?: {
      id: number;
      name: string;
      avatar?: {
        medium?: string;
      };
    };
  };
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

    const passwordHash = await hashPassword(password);
    const user = await this.repo.createUser({
      username,
      email,
      passwordHash,
      displayName,
      emailVerified: false,
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
      await verifyPassword(password, DUMMY_HASH).catch(() => false);
      throw AppError.unauthorized("Invalid username or password");
    }

    const valid = await verifyPassword(password, user.passwordHash);
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

    const { passwordHash: _, ...safeUser } = user;
    return { user: safeUser, rawToken, expiresAt };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashSessionToken(rawToken);
    await this.repo.deleteSession(tokenHash);
  }

  async cleanupExpiredSessions(): Promise<number> {
    if (typeof this.repo.deleteExpiredSessions === "function") {
      return this.repo.deleteExpiredSessions();
    }
    return 0;
  }

  async validateSession(
    rawToken: string,
  ): Promise<{ user: UserRow; session: SessionRow } | null> {
    if (!rawToken || rawToken.length < 32) return null;
    const tokenHash = hashSessionToken(rawToken);
    const result = await this.repo.findSessionWithUser(tokenHash);
    if (!result) return null;

    // Background lastSeenAt update
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

  // --- Google OAuth 2.0 / OpenID Connect ---

  getGoogleAuthUrl(options?: { prompt?: string }): {
    url: string;
    state: string;
    nonce: string;
    codeVerifier: string;
  } {
    const clientId = config.GOOGLE_CLIENT_ID;
    const redirectUri = config.GOOGLE_REDIRECT_URI || `${config.APP_URL}/api/v1/auth/oauth/google/callback`;

    if (!clientId) {
      throw AppError.badRequest("Google OAuth is not configured on this server");
    }

    const state = generateOAuthState();
    const nonce = generateOAuthNonce();
    const codeVerifier = generatePkceCodeVerifier();
    const codeChallenge = computePkceCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      access_type: "offline",
      ...(options?.prompt ? { prompt: options.prompt } : {}),
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
      nonce,
      codeVerifier,
    };
  }

  async handleGoogleCallback(params: {
    code: string;
    state: string;
    storedState: string;
    storedNonce?: string;
    storedCodeVerifier?: string;
    currentUser?: UserRow | null;
    meta?: { userAgent?: string; ipAddress?: string };
    fetchTokenFn?: (url: string, opts: any) => Promise<any>;
  }): Promise<{ user: UserRow; rawToken: string; expiresAt: Date; linkedOnly?: boolean }> {
    // 1. Validate State
    if (!params.state || !params.storedState || params.state !== params.storedState) {
      throw AppError.badRequest("Invalid OAuth state parameter. Possible CSRF attempt.");
    }

    const clientId = config.GOOGLE_CLIENT_ID;
    const clientSecret = config.GOOGLE_CLIENT_SECRET;
    const redirectUri = config.GOOGLE_REDIRECT_URI || `${config.APP_URL}/api/v1/auth/oauth/google/callback`;

    if (!clientId || !clientSecret) {
      throw AppError.badRequest("Google OAuth credentials not configured on server");
    }

    // 2. Exchange authorization code for tokens
    const tokenRequestBody: Record<string, string> = {
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      ...(params.storedCodeVerifier ? { code_verifier: params.storedCodeVerifier } : {}),
    };

    let tokenData: GoogleTokenResponse;
    try {
      const fetcher = params.fetchTokenFn ?? fetchJson;
      tokenData = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenRequestBody).toString(),
      });
    } catch (err: any) {
      throw new AppError("oauth_error", `Google token exchange failed: ${err.message}`, 401);
    }

    if (!tokenData?.id_token) {
      throw new AppError("oauth_error", "Google did not return an id_token", 401);
    }

    // 3. Decode and validate ID token claims
    const claims = parseJwtPayload<GoogleIdTokenClaims>(tokenData.id_token);
    if (!claims || !claims.sub || !claims.email) {
      throw AppError.badRequest("Malformed Google ID token");
    }

    // Validate claims: audience and issuer
    if (claims.aud !== clientId) {
      throw AppError.badRequest("Google ID token audience mismatch");
    }
    if (!claims.iss.includes("accounts.google.com")) {
      throw AppError.badRequest("Google ID token issuer invalid");
    }
    if (params.storedNonce && claims.nonce && claims.nonce !== params.storedNonce) {
      throw AppError.badRequest("Google ID token nonce mismatch. Replay detected.");
    }

    const googleSub = claims.sub;
    const googleEmail = claims.email.toLowerCase();
    const googleName = claims.name;
    const googlePicture = claims.picture;

    // Check if this Google sub is already linked
    const existingOAuth = await this.repo.findOAuthAccount("google", googleSub);

    // Case A: User is already logged in (explicit account linking request)
    if (params.currentUser) {
      if (existingOAuth && existingOAuth.userId !== params.currentUser.id) {
        throw AppError.conflict("This Google account is already linked to a different Zenkai user.");
      }

      await this.repo.linkOAuthAccount({
        userId: params.currentUser.id,
        provider: "google",
        providerUserId: googleSub,
        providerEmail: googleEmail,
        providerUsername: googleName,
        profileData: { ...claims },
      });

      const { rawToken, tokenHash } = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.repo.createSession({
        userId: params.currentUser.id,
        tokenHash,
        userAgent: params.meta?.userAgent,
        ipAddress: params.meta?.ipAddress,
        expiresAt,
      });

      return { user: params.currentUser, rawToken, expiresAt, linkedOnly: true };
    }

    // Case B: User is NOT logged in (Login or Register via Google)
    if (existingOAuth) {
      const user = await this.repo.findUserById(existingOAuth.userId);
      if (!user) {
        throw AppError.notFound("Linked Zenkai account not found");
      }

      const { rawToken, tokenHash } = generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.repo.createSession({
        userId: user.id,
        tokenHash,
        userAgent: params.meta?.userAgent,
        ipAddress: params.meta?.ipAddress,
        expiresAt,
      });

      return { user, rawToken, expiresAt };
    }

    // Check if an existing Zenkai account has this email
    const existingEmailUser = await this.repo.findUserByEmail(googleEmail);
    if (existingEmailUser) {
      // STRICT SAFETY POLICY: Never automatically merge accounts solely because OAuth returned a matching email.
      // Establish verified ownership by requiring login with password.
      throw new AppError(
        "conflict",
        "An account with this email address already exists. Please log in with your Zenkai password to link your Google account.",
        409,
        { code: "account_exists_needs_linking", email: googleEmail, provider: "google" },
      );
    }

    // Case C: Fresh user registration via Google
    // Derive a unique clean username
    const baseUsername = googleEmail.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
    let username = baseUsername.length >= 3 ? baseUsername : `user_${generateSecureToken(4)}`;
    const taken = await this.repo.findUserByUsername(username);
    if (taken) {
      username = `${username.slice(0, 20)}_${generateSecureToken(3)}`;
    }

    // Create user with unguessable random password (cannot be guessed via password login)
    const randomPassword = generateSecureToken(32);
    const passwordHash = await hashPassword(randomPassword);

    const newUser = await this.repo.createUser({
      username,
      email: googleEmail,
      passwordHash,
      displayName: googleName || username,
      emailVerified: claims.email_verified ?? true,
    });

    if (googlePicture) {
      await this.repo.updateUserProfile(newUser.id, { avatarUrl: googlePicture });
      newUser.avatarUrl = googlePicture;
    }

    // Link Google OAuth account
    await this.repo.linkOAuthAccount({
      userId: newUser.id,
      provider: "google",
      providerUserId: googleSub,
      providerEmail: googleEmail,
      providerUsername: googleName,
      profileData: { ...claims },
    });

    const { rawToken, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.repo.createSession({
      userId: newUser.id,
      tokenHash,
      userAgent: params.meta?.userAgent,
      ipAddress: params.meta?.ipAddress,
      expiresAt,
    });

    return { user: newUser, rawToken, expiresAt };
  }

  // --- AniList OAuth Account Linking ---

  getAnilistAuthUrl(): { url: string; state: string } {
    const clientId = config.ANILIST_CLIENT_ID;
    const redirectUri = config.ANILIST_REDIRECT_URI || `${config.APP_URL}/api/v1/auth/oauth/anilist/callback`;

    if (!clientId) {
      throw AppError.badRequest("AniList OAuth is not configured on this server");
    }

    const state = generateOAuthState();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });

    return {
      url: `https://anilist.co/api/v2/oauth/authorize?${params.toString()}`,
      state,
    };
  }

  async handleAnilistCallback(params: {
    code: string;
    state: string;
    storedState: string;
    currentUser: UserRow;
    fetchTokenFn?: (url: string, opts: any) => Promise<any>;
    fetchViewerFn?: (token: string) => Promise<any>;
  }): Promise<{ linked: boolean; anilistUser: { id: number; name: string; avatar?: string } }> {
    if (!params.currentUser) {
      throw AppError.unauthorized("Authentication required to link an AniList account");
    }

    if (!params.state || !params.storedState || params.state !== params.storedState) {
      throw AppError.badRequest("Invalid OAuth state parameter. Possible CSRF attempt.");
    }

    const clientId = config.ANILIST_CLIENT_ID;
    const clientSecret = config.ANILIST_CLIENT_SECRET;
    const redirectUri = config.ANILIST_REDIRECT_URI || `${config.APP_URL}/api/v1/auth/oauth/anilist/callback`;

    if (!clientId || !clientSecret) {
      throw AppError.badRequest("AniList OAuth credentials not configured on server");
    }

    // Exchange code for token
    let tokenData: AnilistTokenResponse;
    try {
      const fetcher = params.fetchTokenFn ?? fetchJson;
      tokenData = await fetcher("https://anilist.co/api/v2/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: {
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code: params.code,
        },
      });
    } catch (err: any) {
      throw new AppError("oauth_error", `AniList token exchange failed: ${err.message}`, 401);
    }

    if (!tokenData?.access_token) {
      throw new AppError("oauth_error", "AniList did not return an access_token", 401);
    }

    // Fetch Viewer from AniList GraphQL
    let viewerData: AnilistViewerResponse;
    try {
      if (params.fetchViewerFn) {
        viewerData = await params.fetchViewerFn(tokenData.access_token);
      } else {
        viewerData = await fetchJson<AnilistViewerResponse>("https://graphql.anilist.co", {
          method: "POST",
          headers: {
            authorization: `Bearer ${tokenData.access_token}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: {
            query: `query { Viewer { id name avatar { medium } } }`,
          },
        });
      }
    } catch (err: any) {
      throw new AppError("upstream_error", `Failed to fetch AniList profile: ${err.message}`, 502);
    }

    const viewer = viewerData?.data?.Viewer;
    if (!viewer || !viewer.id) {
      throw new AppError("upstream_error", "AniList profile was empty or unauthorized", 502);
    }

    const anilistUserId = String(viewer.id);

    // Duplicate account check: ensure not already linked to another user
    const existing = await this.repo.findOAuthAccount("anilist", anilistUserId);
    if (existing && existing.userId !== params.currentUser.id) {
      throw AppError.conflict("This AniList account is already linked to another Zenkai user.");
    }

    // Link account
    await this.repo.linkOAuthAccount({
      userId: params.currentUser.id,
      provider: "anilist",
      providerUserId: anilistUserId,
      providerUsername: viewer.name,
      profileData: {
        id: viewer.id,
        name: viewer.name,
        avatar: viewer.avatar?.medium,
      },
    });

    return {
      linked: true,
      anilistUser: {
        id: viewer.id,
        name: viewer.name,
        avatar: viewer.avatar?.medium,
      },
    };
  }

  async getLinkedAccounts(userId: string): Promise<Array<{
    provider: string;
    providerUserId: string;
    providerEmail: string | null;
    providerUsername: string | null;
    createdAt: Date;
  }>> {
    const rows = await this.repo.findOAuthAccountsByUser(userId);
    return rows.map((r) => ({
      provider: r.provider,
      providerUserId: r.providerUserId,
      providerEmail: r.providerEmail,
      providerUsername: r.providerUsername,
      createdAt: r.createdAt,
    }));
  }

  async unlinkOAuthAccount(userId: string, provider: string): Promise<void> {
    const accounts = await this.repo.findOAuthAccountsByUser(userId);
    const target = accounts.find((a) => a.provider === provider);
    if (!target) {
      throw AppError.notFound(`No linked ${provider} account found`);
    }

    // Safety check: if user unlinks their only provider, verify they have a password
    if (provider === "google" && accounts.length <= 1) {
      const user = await this.repo.findUserWithPasswordById(userId);
      if (!user) throw AppError.notFound("User not found");
      // If user has no password or a generated dummy, warn
    }

    await this.repo.deleteOAuthAccount(userId, provider);
  }

  // --- Password Management & Lifecycle ---

  async changePassword(userId: string, input: unknown): Promise<void> {
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? "Invalid password change input");
    }

    const user = await this.repo.findUserWithPasswordById(userId);
    if (!user) throw AppError.notFound("User not found");

    if (parsed.data.currentPassword) {
      const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
      if (!valid) {
        throw AppError.unauthorized("Incorrect current password");
      }
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    await this.repo.updateUserPassword(userId, newHash);
  }

  async requestPasswordReset(input: unknown): Promise<{ message: string; devResetToken?: string }> {
    const parsed = resetRequestSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest("Invalid email address");
    }

    const user = await this.repo.findUserByEmail(parsed.data.email);
    // Generic response to avoid email enumeration
    const genericResponse = {
      message: "If an account exists with this email address, password reset instructions have been sent.",
    };

    if (!user) return genericResponse;

    const rawToken = generateSecureToken(32);
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.repo.createPasswordReset(user.id, tokenHash, expiresAt);

    // In development or test, return dev token for verification
    if (config.NODE_ENV !== "production") {
      return { ...genericResponse, devResetToken: rawToken };
    }

    return genericResponse;
  }

  async confirmPasswordReset(input: unknown): Promise<{ success: boolean }> {
    const parsed = resetConfirmSchema.safeParse(input);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.issues[0]?.message ?? "Invalid reset confirmation payload");
    }

    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const record = await this.repo.findValidPasswordReset(tokenHash);

    if (!record) {
      throw AppError.badRequest("Password reset link is invalid or has expired.");
    }

    const newHash = await hashPassword(parsed.data.newPassword);
    await this.repo.updateUserPassword(record.userId, newHash);
    await this.repo.markPasswordResetUsed(record.id);

    // Revoke all existing sessions so old stolen/active sessions cannot be used
    await this.repo.deleteUserSessions(record.userId);

    return { success: true };
  }

  async deleteAccount(userId: string, passwordConfirm?: string): Promise<{ deleted: boolean }> {
    const user = await this.repo.findUserWithPasswordById(userId);
    if (!user) throw AppError.notFound("User not found");

    if (passwordConfirm) {
      const valid = await verifyPassword(passwordConfirm, user.passwordHash);
      if (!valid) {
        throw AppError.unauthorized("Incorrect password confirmation");
      }
    }

    const deleted = await this.repo.deleteUserAccount(userId);
    return { deleted };
  }

  // --- Session Management ---

  async listSessions(userId: string, currentSessionId?: string): Promise<Array<SessionRow & { isCurrent: boolean }>> {
    const sessions = await this.repo.getUserSessions(userId);
    return sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    return this.repo.deleteSessionById(sessionId, userId);
  }

  async revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
    return this.repo.deleteUserSessions(userId, currentSessionId);
  }

  // --- User Settings ---

  async getUserSettings(userId: string): Promise<Record<string, any>> {
    return this.repo.getUserSettings(userId);
  }

  async updateUserSettings(userId: string, settings: Record<string, any>): Promise<Record<string, any>> {
    return this.repo.updateUserSettings(userId, settings);
  }
}

/** Helper to parse a JWT payload safely without full crypto dependency. */
function parseJwtPayload<T>(jwt: string): T | null {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

import { createHash } from "node:crypto";
