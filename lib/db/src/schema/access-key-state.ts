import {
  bigint,
  integer,
  pgTable,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const accessKeyState = pgTable("access_key_state", {
  id: integer("id").primaryKey(),
  key: varchar("key", { length: 32 }).notNull(),
  primaryBotId: bigint("primary_bot_id", { mode: "number" }),
  updateOffset: bigint("update_offset", { mode: "number" }).notNull().default(0),
  secondaryUpdateOffset: bigint("secondary_update_offset", { mode: "number" })
    .notNull()
    .default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
