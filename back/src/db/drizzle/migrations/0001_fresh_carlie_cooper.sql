CREATE TABLE IF NOT EXISTS "departments" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commits" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"project_uid" uuid NOT NULL,
	"author_uid" uuid,
	"author_gitlab_username" text NOT NULL,
	"sha" text NOT NULL,
	"message" text NOT NULL,
	"committed_at" timestamp NOT NULL,
	"files_changed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "uq_sha_per_project" UNIQUE("project_uid","sha")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployment_merge_requests" (
	"deployment_uid" uuid NOT NULL,
	"merge_request_uid" uuid NOT NULL,
	CONSTRAINT "uq_deployment_mr" UNIQUE("deployment_uid","merge_request_uid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployments" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"project_uid" uuid NOT NULL,
	"tag" text NOT NULL,
	"commit_sha" text NOT NULL,
	"deployed_at" timestamp NOT NULL,
	"is_failed" boolean DEFAULT false NOT NULL,
	"is_hotfix" boolean DEFAULT false NOT NULL,
	"is_revert" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uq_tag_per_project" UNIQUE("project_uid","tag")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merge_requests" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"project_uid" uuid NOT NULL,
	"author_uid" uuid,
	"author_gitlab_username" text NOT NULL,
	"gitlab_mr_iid" integer NOT NULL,
	"title" text NOT NULL,
	"source_branch" text NOT NULL,
	"target_branch" text NOT NULL,
	"state" text NOT NULL,
	"gitlab_created_at" timestamp NOT NULL,
	"first_review_at" timestamp,
	"approved_at" timestamp,
	"merged_at" timestamp,
	"closed_at" timestamp,
	"lines_added" integer DEFAULT 0 NOT NULL,
	"lines_removed" integer DEFAULT 0 NOT NULL,
	"files_changed_count" integer DEFAULT 0 NOT NULL,
	"has_hotfix_label" boolean DEFAULT false NOT NULL,
	"has_revert_label" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uq_mr_iid_per_project" UNIQUE("project_uid","gitlab_mr_iid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mr_commits" (
	"merge_request_uid" uuid NOT NULL,
	"commit_uid" uuid NOT NULL,
	CONSTRAINT "uq_mr_commit" UNIQUE("merge_request_uid","commit_uid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mr_reviews" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"merge_request_uid" uuid NOT NULL,
	"reviewer_uid" uuid,
	"reviewer_gitlab_username" text NOT NULL,
	"state" text NOT NULL,
	"reviewed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "code_modules" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"project_uid" uuid NOT NULL,
	"name" text NOT NULL,
	"path_pattern" text NOT NULL,
	"description" text,
	CONSTRAINT "uq_module_per_project" UNIQUE("project_uid","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gitlab_connections" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"owner_uid" uuid NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gitlab_raw_payloads" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"project_uid" uuid NOT NULL,
	"payload_type" text NOT NULL,
	"gitlab_id" text,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"processing_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"gitlab_connection_uid" uuid NOT NULL,
	"gitlab_project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"namespace" text,
	"default_branch" text,
	"release_tag_pattern" text DEFAULT 'v*' NOT NULL,
	"hotfix_labels" text[] DEFAULT hotfix,rollback NOT NULL,
	"revert_labels" text[] DEFAULT revert NOT NULL,
	CONSTRAINT "uq_project_per_connection" UNIQUE("gitlab_connection_uid","gitlab_project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_statuses" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"project_uid" uuid NOT NULL,
	"last_sync_at" timestamp,
	"last_commit_sha" text,
	"last_mr_iid" integer,
	"status" text DEFAULT 'idle' NOT NULL,
	"error_message" text,
	CONSTRAINT "sync_statuses_project_uid_unique" UNIQUE("project_uid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_gitlab_identities" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"user_uid" uuid NOT NULL,
	"gitlab_connection_uid" uuid NOT NULL,
	"gitlab_username" text NOT NULL,
	"gitlab_user_id" integer NOT NULL,
	CONSTRAINT "uq_user_per_connection" UNIQUE("user_uid","gitlab_connection_uid"),
	CONSTRAINT "uq_username_per_connection" UNIQUE("gitlab_connection_uid","gitlab_username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "anomaly_signals" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"team_uid" uuid NOT NULL,
	"signal_type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"description" text NOT NULL,
	"details" jsonb,
	"dismissed_at" timestamp,
	"dismissed_by_user_uid" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"user_uid" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"details" jsonb,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics_snapshots" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"metric_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"value" jsonb NOT NULL,
	"calculated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"team_uid" uuid NOT NULL,
	"user_uid" uuid NOT NULL,
	"role" text DEFAULT 'DEVELOPER' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_member_per_team" UNIQUE("team_uid","user_uid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_projects" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"team_uid" uuid NOT NULL,
	"project_uid" uuid NOT NULL,
	CONSTRAINT "uq_team_project" UNIQUE("team_uid","project_uid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date NOT NULL,
	"department_uid" uuid,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
DROP TABLE "files";--> statement-breakpoint
DROP TABLE "images";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_oauth_id_unique";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'DEVELOPER';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department_uid" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commits" ADD CONSTRAINT "commits_project_uid_projects_uid_fk" FOREIGN KEY ("project_uid") REFERENCES "public"."projects"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commits" ADD CONSTRAINT "commits_author_uid_users_uid_fk" FOREIGN KEY ("author_uid") REFERENCES "public"."users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment_merge_requests" ADD CONSTRAINT "deployment_merge_requests_deployment_uid_deployments_uid_fk" FOREIGN KEY ("deployment_uid") REFERENCES "public"."deployments"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment_merge_requests" ADD CONSTRAINT "deployment_merge_requests_merge_request_uid_merge_requests_uid_fk" FOREIGN KEY ("merge_request_uid") REFERENCES "public"."merge_requests"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_uid_projects_uid_fk" FOREIGN KEY ("project_uid") REFERENCES "public"."projects"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_project_uid_projects_uid_fk" FOREIGN KEY ("project_uid") REFERENCES "public"."projects"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_author_uid_users_uid_fk" FOREIGN KEY ("author_uid") REFERENCES "public"."users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mr_commits" ADD CONSTRAINT "mr_commits_merge_request_uid_merge_requests_uid_fk" FOREIGN KEY ("merge_request_uid") REFERENCES "public"."merge_requests"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mr_commits" ADD CONSTRAINT "mr_commits_commit_uid_commits_uid_fk" FOREIGN KEY ("commit_uid") REFERENCES "public"."commits"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mr_reviews" ADD CONSTRAINT "mr_reviews_merge_request_uid_merge_requests_uid_fk" FOREIGN KEY ("merge_request_uid") REFERENCES "public"."merge_requests"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mr_reviews" ADD CONSTRAINT "mr_reviews_reviewer_uid_users_uid_fk" FOREIGN KEY ("reviewer_uid") REFERENCES "public"."users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "code_modules" ADD CONSTRAINT "code_modules_project_uid_projects_uid_fk" FOREIGN KEY ("project_uid") REFERENCES "public"."projects"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gitlab_connections" ADD CONSTRAINT "gitlab_connections_owner_uid_users_uid_fk" FOREIGN KEY ("owner_uid") REFERENCES "public"."users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gitlab_raw_payloads" ADD CONSTRAINT "gitlab_raw_payloads_project_uid_projects_uid_fk" FOREIGN KEY ("project_uid") REFERENCES "public"."projects"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_gitlab_connection_uid_gitlab_connections_uid_fk" FOREIGN KEY ("gitlab_connection_uid") REFERENCES "public"."gitlab_connections"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sync_statuses" ADD CONSTRAINT "sync_statuses_project_uid_projects_uid_fk" FOREIGN KEY ("project_uid") REFERENCES "public"."projects"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_gitlab_identities" ADD CONSTRAINT "user_gitlab_identities_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_gitlab_identities" ADD CONSTRAINT "user_gitlab_identities_gitlab_connection_uid_gitlab_connections_uid_fk" FOREIGN KEY ("gitlab_connection_uid") REFERENCES "public"."gitlab_connections"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "anomaly_signals" ADD CONSTRAINT "anomaly_signals_team_uid_teams_uid_fk" FOREIGN KEY ("team_uid") REFERENCES "public"."teams"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "anomaly_signals" ADD CONSTRAINT "anomaly_signals_dismissed_by_user_uid_users_uid_fk" FOREIGN KEY ("dismissed_by_user_uid") REFERENCES "public"."users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_uid_teams_uid_fk" FOREIGN KEY ("team_uid") REFERENCES "public"."teams"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_uid_users_uid_fk" FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_projects" ADD CONSTRAINT "team_projects_team_uid_teams_uid_fk" FOREIGN KEY ("team_uid") REFERENCES "public"."teams"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_projects" ADD CONSTRAINT "team_projects_project_uid_projects_uid_fk" FOREIGN KEY ("project_uid") REFERENCES "public"."projects"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "teams" ADD CONSTRAINT "teams_department_uid_departments_uid_fk" FOREIGN KEY ("department_uid") REFERENCES "public"."departments"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_department_uid_departments_uid_fk" FOREIGN KEY ("department_uid") REFERENCES "public"."departments"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "oauth_id";