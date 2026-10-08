ALTER TABLE "team_invite" DROP CONSTRAINT "team_invite_project_role_check";--> statement-breakpoint
ALTER TABLE "team_invite" ADD CONSTRAINT "team_invite_project_role_check" CHECK (("team_invite"."project_id" IS NULL AND "team_invite"."project_role" IS NULL)
        OR ("team_invite"."project_id" IS NOT NULL AND "team_invite"."project_role" IN ('owner', 'member', 'client')));