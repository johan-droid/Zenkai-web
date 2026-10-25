import { eq, and, sql, or } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { users, userSessions } from "../../db/schema/index.js";

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
  }): Promise<UserRow> {
    const [row] = await this.db
      .insert(users)
      .values({
        username: input.username.toLowerCase(),
        email: input.email.toLowerCase(),
        passwordHash: input.passwordHash,
        displayName: input.displayName ?? input.username,
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
      });

    return row;
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
      })
      .from(users)
      .where(and(eq(users.id, id), eq(users.isActive, true)));

    return row ?? null;
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
      })
      .from(users)
      .where(eq(users.username, username.toLowerCase()));

    return row ?? null;
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
      })
      .from(users)
      .where(eq(users.email, email.toLowerCase()));

    return row ?? null;
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

    return row ?? null;
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

    return row ?? null;
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

  async updateUserProfile(
    userId: string,
    updates: { displayName?: string; bio?: string; avatarUrl?: string | null },
  ): Promise<UserRow | null> {
    const [row] = await this.db
      .update(users)
      .set({
        ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
        ...(updates.bio !== undefined ? { bio: updates.bio } : {}),
        ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
        updatedAt: new Date(),
      })
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
      });

    return row ?? null;
  }
}
