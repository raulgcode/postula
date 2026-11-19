CREATE TABLE "job_posting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"board" text NOT NULL,
	"token" text NOT NULL,
	"external_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"company" text NOT NULL,
	"location" text NOT NULL,
	"workplace" text NOT NULL,
	"url" text NOT NULL,
	"apply_url" text,
	"description" text NOT NULL,
	"published_at" timestamp with time zone,
	"salary" jsonb,
	"department" text,
	"employment_type" text,
	"duplicate_of_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "search_posting" (
	"search_id" uuid NOT NULL,
	"posting_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_posting_search_id_posting_id_pk" PRIMARY KEY("search_id","posting_id")
);
--> statement-breakpoint
CREATE TABLE "search_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"search_id" uuid NOT NULL,
	"via" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"scheduled_for" text,
	"found" integer DEFAULT 0 NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"closed" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_posting" ADD CONSTRAINT "job_posting_duplicate_of_id_job_posting_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."job_posting"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_posting" ADD CONSTRAINT "search_posting_search_id_job_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."job_search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_posting" ADD CONSTRAINT "search_posting_posting_id_job_posting_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."job_posting"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_posting" ADD CONSTRAINT "search_posting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_run" ADD CONSTRAINT "search_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_run" ADD CONSTRAINT "search_run_search_id_job_search_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."job_search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_posting_board_idx" ON "job_posting" USING btree ("user_id","board","token","external_id");--> statement-breakpoint
CREATE INDEX "job_posting_fingerprint_idx" ON "job_posting" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "search_posting_user_idx" ON "search_posting" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "search_run_day_idx" ON "search_run" USING btree ("search_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "search_run_search_idx" ON "search_run" USING btree ("search_id","started_at");