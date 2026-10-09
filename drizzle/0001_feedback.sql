CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"author_user_id" text NOT NULL,
	"author_role" text NOT NULL,
	"type" text NOT NULL,
	"priority" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"url" text NOT NULL,
	"route" text NOT NULL,
	"selector" text,
	"element_text" text,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"marks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"viewport" jsonb NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"screenshot_key" text,
	"sensitive" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"fix_pr_url" text,
	"fix_notes" text,
	"merged_into_id" text,
	"author_read_at" timestamp with time zone,
	"inbox_read_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"feedback_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_events" (
	"id" text PRIMARY KEY NOT NULL,
	"feedback_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"actor_user_id" text,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_deliveries" ADD CONSTRAINT "feedback_deliveries_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_status" ON "feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feedback_author" ON "feedback" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "feedback_route" ON "feedback" USING btree ("route");--> statement-breakpoint
CREATE INDEX "feedback_events_feedback" ON "feedback_events" USING btree ("feedback_id","created_at");