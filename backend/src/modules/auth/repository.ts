import { eq, and, sql, or, desc } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  users,
  userSessions,
  oauthAccounts,
  passwordResets,
  emailVerifications,
} from "../../db/schema/index.js";
import { SettingsEncryption } from "../../lib/encryption.js";
import { config } from "../../config/index.js";

// Initialize encryption with a passphrase from configuration
const settingsEncryption = new SettingsEncryption(config.SETTINGS_ENCRYPTION_PASSPHRASE);

async function decryptUserSettings(raw: unknown): Promise<Record<string, any>> {
  if (!raw) return {};
  if (typeof raw === "string" && (raw.startsWith("$") || raw.includes(":"))) {
    try {
      return await settingsEncryption.decrypt(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && raw !== null) {
    return raw as Record<string, any>;
  }
  return {};
}

export interface UserRow {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  settings: Record<string, any>;
}

export interface UserWithPasswordRow extends UserRow {
  passwordHash: string;
}

export interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface OAuthAccountRow {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string;
  providerEmail: string | null;
  providerUsername: string | null;
  profileData: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AuthRepository {
  constructor(private readonly db: Db) {}

  async createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    displayName?: string;
    emailVerified?: boolean;
    settings?: Record<string, any>;
  }): Promise<UserRow> {
    // Encrypt settings before storing
    let settingsBlob = "";
    if (input.settings && Object.keys(input.settings).length > 0) {
      const encrypted = await settingsEncryption.encrypt(input.settings);
      settingsBlob = encrypted;
    }

    const [row] = await this.db
      .insert(users)
      .values({
        username: input.username.toLowerCase(),
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName ?? input.username,
        emailVerified: input.emailVerified ?? false,
        settings: settingsBlob,
      })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        emailVerified: users.emailVerified,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      });

    const decryptedSettings = await decryptUserSettings(row.settings);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    };
  }

  async findUserById(id: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        emailVerified: users.emailVerified,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      })
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)));

    if (!row) return null;

    const decryptedSettings = await decryptUserSettings(row.settings);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    };
  }

  async findUserByUsername(username: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        emailVerified: users.emailVerified,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      })
      .from(users)
      .where(eq(users.username, username.toLowerCase()));

    if (!row) return null;

    const decryptedSettings = await decryptUserSettings(row.settings);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    };
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        emailVerified: users.emailVerified,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      })
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    if (!row) return null;

    const decryptedSettings = await decryptUserSettings(row.settings);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    };
  }

  async findUserForAuth(login: string): Promise<UserWithPasswordRow | null> {
    const normalized = login.toLowerCase();
    const [row] = await this.db
      .select()
      .from(users)
      .where(
        and(
          or(eq(users.username, normalized), eq(users.email, normalized)),
          eq(users.isActive, true),
        ),
      );

    if (!row) return null;

    const decryptedSettings = await decryptUserSettings(row.settings);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
      passwordHash: (row as any).passwordHash,
    };
  }

  async findUserWithPasswordById(id: string): Promise<UserWithPasswordRow | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)));

    if (!row) return null;

    const decryptedSettings = await decryptUserSettings(row.settings);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
      passwordHash: (row as any).passwordHash,
    };
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async deleteUserAccount(userId: string): Promise<boolean> {
    const result = await this.db
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return result.length > 0;
  }

  async createSession(data: {
    userId: string;
    tokenHash: string;
    userAgent?: string;
    ipAddress?: string;
    expiresAt: Date;
  }): Promise<SessionRow> {
    const [session] = await this.db
      .insert(userSessions)
      .values({
        userId: data.userId,
        tokenHash: data.tokenHash,
        userAgent: data.userAgent ?? null,
        ipAddress: data.ipAddress ?? null,
        expiresAt: data.expiresAt,
      })
      .returning();

    return session;
  }

  async findSessionWithUser(
    tokenHash: string,
  ): Promise<{ session: SessionRow; user: UserRow } | null> {
    const now = new Date();
    const [row] = await this.db
      .select({
        session: userSessions,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          bio: users.bio,
          emailVerified: users.emailVerified,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          settings: users.settings,
        },
      })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(
        and(
          eq(userSessions.tokenHash, tokenHash),
          eq(users.isActive, true),
          sql`${userSessions.expiresAt} > ${now}`,
        ),
      );

    if (!row) return null;

    const decryptedSettings = await decryptUserSettings(row.user.settings);

    return {
      session: {
        id: row.session.id,
        userId: row.session.userId,
        tokenHash: row.session.tokenHash,
        userAgent: row.session.userAgent,
        ipAddress: row.session.ipAddress,
        expiresAt: row.session.expiresAt,
        createdAt: row.session.createdAt,
        lastSeenAt: row.session.lastSeenAt,
      },
      user: {
        id: row.user.id,
        username: row.user.username,
        email: row.user.email,
        displayName: row.user.displayName,
        avatarUrl: row.user.avatarUrl,
        bio: row.user.bio,
        emailVerified: row.user.emailVerified,
        isActive: row.user.isActive,
        createdAt: row.user.createdAt,
        updatedAt: row.user.updatedAt,
        settings: decryptedSettings,
      },
    };
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(userSessions.id, sessionId));
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db
      .delete(userSessions)
      .where(eq(userSessions.tokenHash, tokenHash));
  }

  async deleteSessionById(sessionId: string, userId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(userSessions)
      .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)))
      .returning({ id: userSessions.id });
    return deleted.length > 0;
  }

  async getUserSessions(userId: string): Promise<SessionRow[]> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(userSessions)
      .where(and(eq(userSessions.userId, userId), sql`${userSessions.expiresAt} > ${now}`))
      .orderBy(desc(userSessions.lastSeenAt));
    return rows;
  }

  async deleteUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    if (exceptSessionId) {
      await this.db
        .delete(userSessions)
        .where(and(eq(userSessions.userId, userId), sql`${userSessions.id} != ${exceptSessionId}`));
    } else {
      await this.db
        .delete(userSessions)
        .where(eq(userSessions.userId, userId));
    }
  }

  async deleteExpiredSessions(): Promise<number> {
    const now = new Date();
    const rows = await this.db
      .delete(userSessions)
      .where(sql`${userSessions.expiresAt} <= ${now}`)
      .returning({ id: userSessions.id });
    return rows.length;
  }

  async updateUserProfile(
    userId: string,
    updates: {
      displayName?: string;
      bio?: string;
      avatarUrl?: string | null;
      settings?: Record<string, any>;
    },
  ): Promise<UserRow | null> {
    let settingsBlob = undefined as string | undefined;
    if (updates.settings && Object.keys(updates.settings).length > 0) {
      const encrypted = await settingsEncryption.encrypt(updates.settings);
      settingsBlob = encrypted;
    }

    const updateData: any = {
      ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
      ...(updates.bio !== undefined ? { bio: updates.bio } : {}),
      ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
      updatedAt: new Date(),
    };

    if (settingsBlob !== undefined) {
      updateData.settings = settingsBlob;
    }

    const [row] = await this.db
      .update(users)
      .set(updateData)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        emailVerified: users.emailVerified,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      });

    if (!row) return null;

    const decryptedSettings = await decryptUserSettings(row.settings);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    };
  }

  async getUserSettings(userId: string): Promise<Record<string, any>> {
    const user = await this.findUserById(userId);
    return user ? user.settings : {};
  }

  async updateUserSettings(
    userId: string,
    settings: Record<string, any>,
  ): Promise<Record<string, any>> {
    const existing = await this.getUserSettings(userId);
    const merged = { ...existing, ...settings };
    const encrypted = await settingsEncryption.encrypt(merged);

    await this.db
      .update(users)
      .set({ settings: encrypted, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return merged;
  }

  // --- OAuth Account Operations ---

  async linkOAuthAccount(data: {
    userId: string;
    provider: string;
    providerUserId: string;
    providerEmail?: string | null;
    providerUsername?: string | null;
    profileData?: Record<string, unknown>;
  }): Promise<OAuthAccountRow> {
    const [row] = await this.db
      .insert(oauthAccounts)
      .values({
        userId: data.userId,
        provider: data.provider,
        providerUserId: data.providerUserId,
        providerEmail: data.providerEmail ?? null,
        providerUsername: data.providerUsername ?? null,
        profileData: data.profileData ?? null,
      })
      .onConflictDoUpdate({
        target: [oauthAccounts.provider, oauthAccounts.providerUserId],
        set: {
          userId: data.userId,
          providerEmail: data.providerEmail ?? null,
          providerUsername: data.providerUsername ?? null,
          profileData: data.profileData ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row as OAuthAccountRow;
  }

  async findOAuthAccount(
    provider: string,
    providerUserId: string,
  ): Promise<OAuthAccountRow | null> {
    const [row] = await this.db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerUserId, providerUserId),
        ),
      );
    return (row as OAuthAccountRow) || null;
  }

  async findOAuthAccountsByUser(userId: string): Promise<OAuthAccountRow[]> {
    const rows = await this.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId));
    return rows as OAuthAccountRow[];
  }

  async findUserByOAuth(
    provider: string,
    providerUserId: string,
  ): Promise<UserRow | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        emailVerified: users.emailVerified,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      })
      .from(oauthAccounts)
      .innerJoin(users, eq(oauthAccounts.userId, users.id))
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerUserId, providerUserId),
          eq(users.isActive, true),
        ),
      );

    if (!row) return null;

    const decryptedSettings = await decryptUserSettings(row.settings);

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      emailVerified: row.emailVerified,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    };
  }

  async deleteOAuthAccount(userId: string, provider: string): Promise<boolean> {
    const rows = await this.db
      .delete(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)))
      .returning({ id: oauthAccounts.id });
    return rows.length > 0;
  }

  // --- Password Reset & Verification Operations ---

  async createPasswordReset(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.insert(passwordResets).values({
      userId,
      tokenHash,
      expiresAt,
    });
  }

  async findValidPasswordReset(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: Date } | null> {
    const now = new Date();
    const [row] = await this.db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          sql`${passwordResets.expiresAt} > ${now}`,
          sql`${passwordResets.usedAt} IS NULL`,
        ),
      );
    return row || null;
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await this.db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.id, id));
  }

  async createEmailVerification(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.insert(emailVerifications).values({
      userId,
      tokenHash,
      expiresAt,
    });
  }

  async findValidEmailVerification(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: Date } | null> {
    const now = new Date();
    const [row] = await this.db
      .select()
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.tokenHash, tokenHash),
          sql`${emailVerifications.expiresAt} > ${now}`,
          sql`${emailVerifications.usedAt} IS NULL`,
        ),
      );
    return row || null;
  }

  async markEmailVerificationUsed(id: string, userId: string): Promise<void> {
    await this.db
      .update(emailVerifications)
      .set({ usedAt: new Date() })
      .where(eq(emailVerifications.id, id));

    await this.db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
