CREATE TABLE "slack_digest_run" (
	"project_id" integer NOT NULL,
	"slot" text NOT NULL,
	"run_date" date NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_digest_run_project_id_slot_run_date_pk" PRIMARY KEY("project_id","slot","run_date"),
	CONSTRAINT "slack_digest_run_slot_check" CHECK ("slack_digest_run"."slot" IN ('morning', 'evening'))
);
--> statement-breakpoint
ALTER TABLE "notification_delivery" DROP CONSTRAINT "notification_delivery_channel_check";--> statement-breakpoint
ALTER TABLE "slack_digest_run" ADD CONSTRAINT "slack_digest_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery" ADD CONSTRAINT "notification_delivery_channel_check" CHECK ("notification_delivery"."channel" IN ('email', 'telegram', 'slack'));