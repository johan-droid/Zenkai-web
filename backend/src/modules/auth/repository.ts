import { eq, and, sql, or } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { users, userSessions } from "../../db/schema/index.js";
import { SettingsEncryption } from "../../lib/encryption";

// Initialize encryption with a passphrase from environment
// In production, rotate this regularly and store in a secrets manager
const settingsEncryption = new SettingsEncryption(
  process.env.SETTINGS_ENCRYPTION_PASSPHRASE ?? "zenkai-default-settings-key-change-me"
);

export interface UserRow {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
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

export class AuthRepository {
  constructor(private readonly db: Db) {}

  async createUser(input: {
    username: string;
    email: string;
    passwordHash: string;
    displayName?: string;
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
        settings: settingsBlob, // Store encrypted blob
      })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      });

    // Decrypt settings if encrypted blob exists
    let decryptedSettings: Record<string, any> = {};
    if (row.settings && typeof row.settings === "string" && row.settings.startsWith("$")) {
      try {
        decryptedSettings = await settingsEncryption.decrypt(row.settings as string);
      } catch {
        decryptedSettings = {};
      }
    } else if (row.settings && typeof row.settings === "object") {
      decryptedSettings = row.settings as Record<string, any>;
    }

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    } as UserRow;
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
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      })
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)));

    if (!row) return null;

    // Decrypt settings if encrypted blob exists
    let decryptedSettings: Record<string, any> = {};
    if (row.settings && typeof row.settings === "string" && row.settings.startsWith("$")) {
      try {
        decryptedSettings = await settingsEncryption.decrypt(row.settings as string);
      } catch {
        decryptedSettings = {};
      }
    } else if (row.settings && typeof row.settings === "object") {
      decryptedSettings = row.settings as Record<string, any>;
    }

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    } as UserRow;
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
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      })
      .from(users)
      .where(eq(users.username, username.toLowerCase()));

    if (!row) return null;

    // Decrypt settings
    let decryptedSettings: Record<string, any> = {};
    if (row.settings && typeof row.settings === "string" && row.settings.startsWith("$")) {
      try {
        decryptedSettings = await settingsEncryption.decrypt(row.settings as string);
      } catch {
        decryptedSettings = {};
      }
    } else if (row.settings && typeof row.settings === "object") {
      decryptedSettings = row.settings as Record<string, any>;
    }

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    } as UserRow;
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
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      })
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    if (!row) return null;

    // Decrypt settings
    let decryptedSettings: Record<string, any> = {};
    if (row.settings && typeof row.settings === "string" && row.settings.startsWith("$")) {
      try {
        decryptedSettings = await settingsEncryption.decrypt(row.settings as string);
      } catch {
        decryptedSettings = {};
      }
    } else if (row.settings && typeof row.settings === "object") {
      decryptedSettings = row.settings as Record<string, any>;
    }

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    } as UserRow;
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

    // Decrypt settings
    let decryptedSettings: Record<string, any> = {};
    if (row.settings && typeof row.settings === "string" && row.settings.startsWith("$")) {
      try {
        decryptedSettings = await settingsEncryption.decrypt(row.settings as string);
      } catch {
        decryptedSettings = {};
      }
    } else if (row.settings && typeof row.settings === "object") {
      decryptedSettings = row.settings as Record<string, any>;
    }

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
      passwordHash: (row as any).passwordHash,
    } as UserWithPasswordRow;
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

    // Decrypt user settings
    let decryptedSettings: Record<string, any> = {};
    if (row.user.settings && typeof row.user.settings === "string" && row.user.settings.startsWith("$")) {
      try {
        decryptedSettings = await settingsEncryption.decrypt(row.user.settings as string);
      } catch {
        decryptedSettings = {};
      }
    } else if (row.user.settings && typeof row.user.settings === "object") {
      decryptedSettings = row.user.settings as Record<string, any>;
    }

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

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db
      .delete(userSessions)
      .where(eq(userSessions.userId, userId));
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
    // Encrypt settings if provided
    let settingsBlob = undefined as string | undefined;
    if (updates.settings && Object.keys(updates.settings).length > 0) {
      const encrypted = await settingsEncryption.encrypt(updates.settings);
      settingsBlob = encrypted;
    }

    const updateData: any = {
      ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
      ...(updates.bio !== undefined ? { bio: updates.bio } : {}),
      ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
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
        isActive: users.isActive,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        settings: users.settings,
      });

    if (!row) return null;

    // Decrypt settings for return
    let decryptedSettings: Record<string, any> = {};
    if (row.settings && typeof row.settings === "string" && row.settings.startsWith("$")) {
      try {
        decryptedSettings = await settingsEncryption.decrypt(row.settings as string);
      } catch {
        decryptedSettings = {};
      }
    } else if (row.settings && typeof row.settings === "object") {
      decryptedSettings = row.settings as Record<string, any>;
    }

    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settings: decryptedSettings,
    } as UserRow;
  }
}