ALTER TABLE "memberships" ADD COLUMN "intro_days" integer;
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "intro_price_cents" integer;
--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD COLUMN "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD COLUMN "renewal_price_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD COLUMN "intro_ends_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD COLUMN "card_brand" text;
--> statement-breakpoint
ALTER TABLE "membership_subscriptions" ADD COLUMN "card_last4" text;
--> statement-breakpoint
UPDATE "membership_subscriptions" AS s SET "renewal_price_cents" = m."price_cents" FROM "memberships" AS m WHERE m."id" = s."membership_id" AND s."renewal_price_cents" = 0;
--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "renewal_save_offer" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "renewal_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"legal_signoff" text NOT NULL,
	"created_by" text,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renewal_templates_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "renewal_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"subscription_id" text,
	"order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text,
	"platform" text DEFAULT 'web' NOT NULL,
	"app_version" text,
	"disclosure_text" text NOT NULL,
	"disclosure_version" text NOT NULL,
	"template_version" text NOT NULL,
	"checkbox_accepted" boolean NOT NULL,
	"price_cents" integer NOT NULL,
	"renewal_price_cents" integer NOT NULL,
	"term_months" integer NOT NULL,
	"ack_email_id" text,
	"ack_delivery_status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"kind" text NOT NULL,
	"event_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"status" text NOT NULL,
	"email_id" text,
	"delivery_status" text,
	"subject" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"platform" text DEFAULT 'email' NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_notice_once" ON "renewal_notices" USING btree ("subscription_id","kind","event_on");
--> statement-breakpoint
CREATE TABLE "renewal_cancellations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"platform" text DEFAULT 'web' NOT NULL,
	"ip" text,
	"user_agent" text,
	"term_end" timestamp with time zone NOT NULL,
	"email_id" text,
	"delivery_status" text
);
--> statement-breakpoint
CREATE TABLE "membership_price_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"old_price_cents" integer NOT NULL,
	"new_price_cents" integer NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"notice_sent_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_material_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"summary" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"notice_sent_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_price_changes" ADD CONSTRAINT "membership_price_changes_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership_material_changes" ADD CONSTRAINT "membership_material_changes_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
