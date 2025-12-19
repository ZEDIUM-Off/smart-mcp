CREATE TABLE "namespace_agents" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"namespace_uuid" uuid NOT NULL,
	"agent_type" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"references" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"denied_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_tool_calls" integer DEFAULT 3 NOT NULL,
	"expose_limit" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "namespace_agents_unique_namespace_type_idx" UNIQUE("namespace_uuid","agent_type")
);
--> statement-breakpoint
ALTER TABLE "namespace_agents" ADD CONSTRAINT "namespace_agents_namespace_uuid_namespaces_uuid_fk" FOREIGN KEY ("namespace_uuid") REFERENCES "public"."namespaces"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "namespace_agents_namespace_uuid_idx" ON "namespace_agents" USING btree ("namespace_uuid");--> statement-breakpoint
CREATE INDEX "namespace_agents_agent_type_idx" ON "namespace_agents" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "namespace_agents_enabled_idx" ON "namespace_agents" USING btree ("enabled");