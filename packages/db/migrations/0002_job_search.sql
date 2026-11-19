CREATE TABLE "job_search" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"run_at" text NOT NULL,
	"time_zone" text NOT NULL,
	"mode" text NOT NULL,
	"min_score" integer NOT NULL,
	"daily_limit" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_search_company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"search_id" uuid NOT NULL,
	"board" text NOT NULL,
	"token" text NOT NULL,
	"company" text NOT NULL,
	"status" text DEFAULT 'unchecked' NOT NULL,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_search" ADD CONSTRAINT "job_search_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_search_company" ADD CONSTRAINT "job_search_company_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_search_company" ADD CONSTRAINT "job_search_company_search_id_job_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."job_search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_search_user_idx" ON "job_search" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_search_company_board_idx" ON "job_search_company" USING btree ("search_id","board","token");--> statement-breakpoint
CREATE INDEX "job_search_company_user_idx" ON "job_search_company" USING btree ("user_id");