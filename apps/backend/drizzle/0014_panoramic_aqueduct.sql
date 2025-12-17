CREATE TABLE "package_install_history" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manager" text NOT NULL,
	"package_name" text NOT NULL,
	"command" text NOT NULL,
	"output" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text
);
--> statement-breakpoint
ALTER TABLE "package_install_history" ADD CONSTRAINT "package_install_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;