CREATE TABLE "issue_timer_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "time_goal_minutes" integer;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "time_goal_period" text;--> statement-breakpoint
ALTER TABLE "issue_timer_session" ADD CONSTRAINT "issue_timer_session_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_timer_session" ADD CONSTRAINT "issue_timer_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_timer_session_running_idx" ON "issue_timer_session" USING btree ("user_id","issue_id") WHERE "issue_timer_session"."stopped_at" IS NULL;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_time_goal_check" CHECK (("project"."time_goal_minutes" IS NULL) = ("project"."time_goal_period" IS NULL)
          AND ("project"."time_goal_period" IS NULL OR "project"."time_goal_period" IN ('total', 'weekly'))
          AND ("project"."time_goal_minutes" IS NULL OR "project"."time_goal_minutes" > 0));--> statement-breakpoint
CREATE TRIGGER issue_timer_session_rev AFTER INSERT OR UPDATE OR DELETE ON issue_timer_session
  FOR EACH ROW EXECUTE FUNCTION rev_issue_child('issue_id', 'board');