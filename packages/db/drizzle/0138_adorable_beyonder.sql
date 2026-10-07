ALTER TABLE "project_member" DROP CONSTRAINT "project_member_role_check";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "face_user_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_face_user_id_user_id_fk" FOREIGN KEY ("face_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_role_check" CHECK ("project_member"."role" IN ('owner', 'member', 'client'));