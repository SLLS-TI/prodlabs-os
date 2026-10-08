CREATE TABLE "project_timer_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_worklog" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"minutes" integer NOT NULL,
	"spent_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_worklog_minutes_check" CHECK ("project_worklog"."minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_timer_session" ADD CONSTRAINT "project_timer_session_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_timer_session" ADD CONSTRAINT "project_timer_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_worklog" ADD CONSTRAINT "project_worklog_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_worklog" ADD CONSTRAINT "project_worklog_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_timer_session_running_idx" ON "project_timer_session" USING btree ("user_id","project_id") WHERE "project_timer_session"."stopped_at" IS NULL;--> statement-breakpoint
CREATE INDEX "project_worklog_project_idx" ON "project_worklog" USING btree ("project_id","spent_on" DESC NULLS LAST);