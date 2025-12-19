CREATE TABLE "namespace_agent_documents" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_uuid" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime" text DEFAULT 'text/plain' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "namespace_agents" DROP CONSTRAINT "namespace_agents_unique_namespace_type_idx";--> statement-breakpoint
ALTER TABLE "namespace_agents" ADD COLUMN "name" text DEFAULT 'Default Ask Agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "namespaces" ADD COLUMN "ask_agent_uuid" uuid;--> statement-breakpoint
ALTER TABLE "namespaces" ADD CONSTRAINT "namespaces_ask_agent_uuid_namespace_agents_uuid_fk" FOREIGN KEY ("ask_agent_uuid") REFERENCES "public"."namespace_agents"("uuid") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "namespaces_ask_agent_uuid_idx" ON "namespaces" USING btree ("ask_agent_uuid");--> statement-breakpoint
ALTER TABLE "namespace_agent_documents" ADD CONSTRAINT "namespace_agent_documents_agent_uuid_namespace_agents_uuid_fk" FOREIGN KEY ("agent_uuid") REFERENCES "public"."namespace_agents"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "namespace_agent_documents_agent_uuid_idx" ON "namespace_agent_documents" USING btree ("agent_uuid");