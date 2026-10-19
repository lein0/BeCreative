CREATE TABLE "message_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"channel" text NOT NULL,
	"provider" text NOT NULL,
	"to_address" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "short_links" (
	"code" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_suppressions" (
	"phone" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "sms_monthly_cap_cents" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "sms_segment_cost_cents" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "imessage_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_suppressed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "sms_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "marketing_opt_in" boolean DEFAULT false NOT NULL;