import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export type TelegramMessagePointer = {
  chatId: number;
  messageId: number;
  botId?: "primary" | "secondary";
};

export const paymentReviewRequests = pgTable("payment_review_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewType: varchar("review_type", { length: 16 })
    .notNull()
    .default("payment"),
  email: varchar("email", { length: 254 }),
  paymentId: varchar("payment_id", { length: 128 }),
  pin: varchar("pin", { length: 6 }),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  telegramMessages: jsonb("telegram_messages")
    .$type<TelegramMessagePointer[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
});
