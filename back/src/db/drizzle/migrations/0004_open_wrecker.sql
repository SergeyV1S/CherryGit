CREATE TABLE IF NOT EXISTS "gitlab_available_projects" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"gitlab_connection_uid" uuid NOT NULL,
	"gitlab_project_id" integer NOT NULL,
	"name" text NOT NULL,
	"namespace" text,
	"description" text,
	"default_branch" text,
	"visibility" text,
	"web_url" text,
	"last_activity_at" timestamp,
	"connected_project_uid" uuid,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_available_project_per_connection" UNIQUE("gitlab_connection_uid","gitlab_project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gitlab_users" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"gitlab_connection_uid" uuid NOT NULL,
	"gitlab_user_id" integer NOT NULL,
	"gitlab_username" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"state" text,
	"web_url" text,
	"mapped_user_uid" uuid,
	"is_provisioned" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_gitlab_user_per_connection" UNIQUE("gitlab_connection_uid","gitlab_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_gitlab_users" (
	"uid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"project_uid" uuid NOT NULL,
	"gitlab_user_uid" uuid NOT NULL,
	"access_level" integer DEFAULT 30 NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_project_gitlab_user" UNIQUE("project_uid","gitlab_user_uid")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provisioned_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_temp_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gitlab_available_projects" ADD CONSTRAINT "gitlab_available_projects_gitlab_connection_uid_gitlab_connections_uid_fk" FOREIGN KEY ("gitlab_connection_uid") REFERENCES "public"."gitlab_connections"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gitlab_users" ADD CONSTRAINT "gitlab_users_gitlab_connection_uid_gitlab_connections_uid_fk" FOREIGN KEY ("gitlab_connection_uid") REFERENCES "public"."gitlab_connections"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_gitlab_users" ADD CONSTRAINT "project_gitlab_users_project_uid_projects_uid_fk" FOREIGN KEY ("project_uid") REFERENCES "public"."projects"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_gitlab_users" ADD CONSTRAINT "project_gitlab_users_gitlab_user_uid_gitlab_users_uid_fk" FOREIGN KEY ("gitlab_user_uid") REFERENCES "public"."gitlab_users"("uid") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
