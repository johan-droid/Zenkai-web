import { pgTable, uuid, varchar, text, boolean, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const providers = pgTable("providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  active: boolean("active").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  isCustomAdapter: boolean("is_custom_adapter").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerEndpoints = pgTable(
  "provider_endpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 64 }).notNull(), // sub, dub, multi
    displayName: varchar("display_name", { length: 128 }).notNull(),
    language: varchar("language", { length: 16 }).notNull().default("sub"), // sub | dub | multi
    accessType: varchar("access_type", { length: 16 }).notNull().default("direct"), // direct | embed | api | redirect
    badge: varchar("badge", { length: 32 }), // Direct HD, Fast Embed
    urlTemplate: text("url_template"), // e.g. https://provider.to/watch/{mal_id}/{episode}
    requiredIdType: varchar("required_id_type", { length: 32 }).notNull().default("anilist"), // mal, anilist, tmdb, archive
    active: boolean("active").notNull().default(true),
    priority: integer("priority").notNull().default(10),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("provider_endpoint_slug_unique").on(table.providerId, table.slug),
  ]
);
