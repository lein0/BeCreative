CREATE TABLE "access_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"label" text NOT NULL,
	"identifier" text,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_addons" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_options" (
	"id" text PRIMARY KEY NOT NULL,
	"service_id" text NOT NULL,
	"label" text NOT NULL,
	"minutes" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"category_id" text NOT NULL,
	"subcategory_id" text,
	"location_id" text,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"lead_time_hours" integer DEFAULT 2 NOT NULL,
	"cancellation_hours" integer DEFAULT 24 NOT NULL,
	"slot_minutes" integer,
	"capacity" integer DEFAULT 1 NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"waiver_required" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cover_image_url" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "visit_bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"user_id" text,
	"service_id" text NOT NULL,
	"option_id" text,
	"offering_kind" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"addon_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"pack_purchase_id" text,
	"membership_subscription_id" text,
	"waiver_signature_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "waiver_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"waiver_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"signed_name" text NOT NULL,
	"ip" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "vertical" text DEFAULT 'creative' NOT NULL;--> statement-breakpoint
ALTER TABLE "access_slots" ADD CONSTRAINT "access_slots_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_addons" ADD CONSTRAINT "service_addons_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_options" ADD CONSTRAINT "service_options_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_subcategory_id_categories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_bookings" ADD CONSTRAINT "visit_bookings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_bookings" ADD CONSTRAINT "visit_bookings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_bookings" ADD CONSTRAINT "visit_bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_waiver_id_waivers_id_fk" FOREIGN KEY ("waiver_id") REFERENCES "public"."waivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waivers" ADD CONSTRAINT "waivers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_slot_unique" ON "access_slots" USING btree ("service_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "waiver_signature_version" ON "waiver_signatures" USING btree ("teacher_id","user_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "waivers_teacher" ON "waivers" USING btree ("teacher_id");