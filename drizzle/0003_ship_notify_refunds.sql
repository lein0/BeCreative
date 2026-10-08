CREATE TABLE "follows" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"event" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event" text NOT NULL,
	"email" boolean DEFAULT true NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"sms" boolean DEFAULT false NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"cadence" text DEFAULT 'instant' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"order_id" text,
	"policy_version" integer NOT NULL,
	"policy_text" text NOT NULL,
	"ip" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"fee_reversed_cents" integer DEFAULT 0 NOT NULL,
	"transfer_reversed_cents" integer DEFAULT 0 NOT NULL,
	"reason_code" text NOT NULL,
	"actor_user_id" text,
	"stripe_refund_id" text,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"balance_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher_policies" (
	"teacher_id" text PRIMARY KEY NOT NULL,
	"full_refund_hours" integer,
	"credit_only_hours" integer,
	"late_cancel_fee_cents" integer,
	"no_show_fee_cents" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unsubscribe_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "student_full_refund_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "student_credit_only_hours" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "late_cancel_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "no_show_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "credit_requires_opt_in" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "waitlist_claim_hours" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "quiet_hours_start" text DEFAULT '21:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "quiet_hours_end" text DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "dispute_auto_submit" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "dispute_submit_lead_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "dispute_fee_bearer" text DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "disputed_amount_bearer" text DEFAULT 'teacher' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "early_fraud_refund_max_cents" integer DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "statement_descriptor_prefix" text DEFAULT 'BECREATIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "ticket_teacher_sla_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "web_push_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "mailing_address" text DEFAULT 'BeCreative, Los Angeles, CA' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "policy_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "stripe_payouts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "stripe_requirements_due" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "credit_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_unsubscribed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_ledger" ADD CONSTRAINT "refund_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_credits" ADD CONSTRAINT "studio_credits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_credits" ADD CONSTRAINT "studio_credits_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_policies" ADD CONSTRAINT "teacher_policies_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unsubscribe_tokens" ADD CONSTRAINT "unsubscribe_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "follows_user_teacher" ON "follows" USING btree ("user_id","teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency" ON "jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_pref_user_event" ON "notification_preferences" USING btree ("user_id","event");--> statement-breakpoint
CREATE INDEX "notifications_user" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_ledger_idempotency" ON "refund_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "studio_credit_user_teacher" ON "studio_credits" USING btree ("user_id","teacher_id");